/**
 * web/models/applicationPeriodModel.ts
 *
 * Prisma-based queries for the Application Periods endpoints:
 *
 *   GET   /api/web/organizations/application-periods           → list all periods
 *   GET   /api/web/organizations/application-periods/active    → get active period (includes assigned requirements)
 *   POST  /api/web/organizations/application-periods           → create period
 *   PATCH /api/web/organizations/application-periods/:id       → edit period
 *   PATCH /api/web/organizations/application-periods/:id/terminate → terminate period
 *
 * Table: tbl_application_period (renamed from tbl_period in V2).
 */

import { prisma } from '../../config/db';
import { resolveUser } from './organizationsPageModel';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface RequirementSummary {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: string;
  file_path: string | null;
}

export interface ApplicationPeriodResponse {
  period_id: number;
  start_date: string;        // "YYYY-MM-DD"
  end_date: string;          // "YYYY-MM-DD"
  start_time: string;        // "HH:mm:ss"
  end_time: string;          // "HH:mm:ss"
  is_active: boolean;
  created_at: string;        // ISO-8601
  applicationsCount: number;
  orgsCount: number;
  approvedCount: number;
  rejectedCount: number;
  requirements?: RequirementSummary[];
}

export interface ApplicationPeriodsListResponse {
  periods: ApplicationPeriodResponse[];
  total: number;
}

export interface CreatePeriodInput {
  start_date: string;   // "YYYY-MM-DD"
  end_date: string;     // "YYYY-MM-DD"
  start_time?: string;  // "HH:mm"
  end_time?: string;    // "HH:mm"
  is_active?: boolean;
}

export interface UpdatePeriodInput {
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Format a Prisma @db.Time field to "HH:mm:ss".
 * Prisma returns Time columns as Date objects anchored to 1970-01-01.
 */
function toTimeString(d: Date): string {
  return d.toISOString().split('T')[1].split('.')[0]; // "HH:mm:ss"
}

/**
 * Parse an "HH:mm" or "HH:mm:ss" string to a 1970-01-01 Date (for @db.Time).
 */
function parseTime(t: string): Date {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  return new Date(Date.UTC(1970, 0, 1, h, m, s));
}

function dayAfter(d: Date): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Given a raw tbl_application_period row, attach derived counts and return
 * the full ApplicationPeriodResponse. Counts run in parallel.
 */
async function withCounts(period: {
  period_id: number;
  start_date: Date;
  end_date: Date;
  start_time: Date;
  end_time: Date;
  is_active: boolean | null;
  created_at: Date | null;
}, includeRequirements = false): Promise<ApplicationPeriodResponse> {
  const endExclusive = dayAfter(period.end_date);

  const queries: Promise<any>[] = [
    prisma.tbl_application.count({
      where: { period_id: period.period_id },
    }),
    prisma.tbl_organization.count({
      where: {
        tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
          created_at: {
            gte: period.start_date,
            lt: endExclusive,
          },
        },
      },
    }),
    prisma.tbl_application.count({
      where: { period_id: period.period_id, status: 'Approved' },
    }),
    prisma.tbl_application.count({
      where: { period_id: period.period_id, status: 'Rejected' },
    }),
  ];

  if (includeRequirements) {
    queries.push(
      prisma.tbl_application_period_requirement.findMany({
        where: { period_id: period.period_id },
        include: {
          tbl_application_requirement: {
            select: {
              requirement_id: true,
              requirement_name: true,
              is_applicable_to: true,
              file_path: true,
            },
          },
        },
      })
    );
  }

  const results = await Promise.all(queries);
  const applicationsCount = results[0] as number;
  const orgsCount = results[1] as number;
  const approvedCount = results[2] as number;
  const rejectedCount = results[3] as number;

  // requirements may shift to index 4 when includeRequirements is true
  const requirementsResult = includeRequirements ? results[4] : undefined;

  const response: ApplicationPeriodResponse = {
    period_id: period.period_id,
    start_date: toDateString(period.start_date),
    end_date: toDateString(period.end_date),
    start_time: toTimeString(period.start_time),
    end_time: toTimeString(period.end_time),
    is_active: period.is_active ?? true,
    created_at: (period.created_at ?? new Date()).toISOString(),
    applicationsCount,
    orgsCount,
    approvedCount,
    rejectedCount,
  };

  if (requirementsResult) {
    response.requirements = (requirementsResult as any[]).map((link) => ({
      requirement_id: link.tbl_application_requirement.requirement_id,
      requirement_name: link.tbl_application_requirement.requirement_name,
      is_applicable_to: link.tbl_application_requirement.is_applicable_to ?? 'new',
      file_path: link.tbl_application_requirement.file_path,
    }));
  }

  return response;
}

const periodSelect = {
  period_id: true,
  start_date: true,
  end_date: true,
  start_time: true,
  end_time: true,
  is_active: true,
  created_at: true,
} as const;

// ---------------------------------------------------------------------------
// Model functions
// ---------------------------------------------------------------------------

/**
 * Returns the currently active application period, with counts AND assigned requirements.
 * Returns null if no active period exists → controller sends 404.
 */
export async function getActivePeriod(): Promise<ApplicationPeriodResponse | null> {
  const period = await prisma.tbl_application_period.findFirst({
    where: { is_active: true },
    orderBy: { start_date: 'desc' },
    select: periodSelect,
  });

  if (!period) return null;
  return withCounts(period, true); // include requirements
}

/**
 * Returns ALL application periods ordered by start_date DESC, with counts.
 */
export async function getAllPeriods(): Promise<ApplicationPeriodsListResponse> {
  const periods = await prisma.tbl_application_period.findMany({
    orderBy: { start_date: 'desc' },
    select: periodSelect,
  });

  const withCountsAll = await Promise.all(periods.map((p) => withCounts(p)));

  return {
    periods: withCountsAll,
    total: withCountsAll.length,
  };
}

/**
 * Creates a new application period.
 */
export async function createPeriod(
  email: string,
  input: CreatePeriodInput
): Promise<ApplicationPeriodResponse> {
  const user = await resolveUser(email);

  const startDate = new Date(input.start_date);
  const endDate = new Date(input.end_date);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('INVALID_DATES');
  }
  if (endDate < startDate) {
    throw new Error('END_BEFORE_START');
  }

  const startTime = input.start_time ? parseTime(input.start_time) : new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  const endTime = input.end_time ? parseTime(input.end_time) : new Date(Date.UTC(1970, 0, 1, 23, 59, 59));

  const created = await prisma.tbl_application_period.create({
    data: {
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      is_active: input.is_active !== undefined ? input.is_active : true,
      created_by: user.user_id,
    },
    select: periodSelect,
  });

  return withCounts(created);
}

/**
 * Updates an existing period (partial update).
 */
export async function updatePeriod(
  periodId: number,
  input: UpdatePeriodInput
): Promise<ApplicationPeriodResponse> {
  const existing = await prisma.tbl_application_period.findUnique({
    where: { period_id: periodId },
    select: { period_id: true, start_date: true, end_date: true },
  });

  if (!existing) throw new Error('PERIOD_NOT_FOUND');

  const newStart = input.start_date ? new Date(input.start_date) : existing.start_date;
  const newEnd = input.end_date ? new Date(input.end_date) : existing.end_date;

  if (newEnd < newStart) throw new Error('END_BEFORE_START');

  const data: Record<string, any> = { updated_at: new Date() };
  if (input.start_date) data.start_date = newStart;
  if (input.end_date) data.end_date = newEnd;
  if (input.start_time) data.start_time = parseTime(input.start_time);
  if (input.end_time) data.end_time = parseTime(input.end_time);
  if (input.is_active !== undefined) data.is_active = input.is_active;

  const updated = await prisma.tbl_application_period.update({
    where: { period_id: periodId },
    data,
    select: periodSelect,
  });

  return withCounts(updated);
}

/**
 * Terminates a period by setting is_active = false.
 */
export async function terminatePeriod(
  periodId: number
): Promise<{ period_id: number; is_active: false }> {
  const existing = await prisma.tbl_application_period.findUnique({
    where: { period_id: periodId },
    select: { period_id: true },
  });

  if (!existing) throw new Error('PERIOD_NOT_FOUND');

  await prisma.tbl_application_period.update({
    where: { period_id: periodId },
    data: {
      is_active: false,
      updated_at: new Date(),
    },
  });

  return { period_id: periodId, is_active: false };
}
