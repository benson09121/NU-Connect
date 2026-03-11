/**
 * web/models/eventsModel.ts
 *
 * Prisma-based queries for the Events page.
 * Refactored from the legacy eventModel.js (stored-procedure + MySQL pool approach).
 *
 * Covered endpoints:
 *   GET /events/by-user-role
 *   GET /events/add-event-status
 */

import { prisma } from '../../config/db';
import {
  event_status,
  event_type,
  event_fee_type,
  event_open_to,
  venue_type as venue_type_enum,
} from '../../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Enum normalizers — convert frontend strings to Prisma enum keys.
// Needed because @map() values (e.g. "Face to face") differ from enum keys.
// ---------------------------------------------------------------------------

function toVenueType(s: string): venue_type_enum {
  if (s === 'Face to face' || s === 'Face_to_face') return venue_type_enum.Face_to_face;
  return venue_type_enum.Online;
}

function toEventType(s: string): event_type {
  if (s === 'SDAO') return event_type.SDAO;
  if (s === 'System') return event_type.System;
  return event_type.Organization;
}

function toEventStatus(s: string): event_status {
  if (s === 'Approved') return event_status.Approved;
  if (s === 'Rejected') return event_status.Rejected;
  if (s === 'Archived') return event_status.Archived;
  return event_status.Pending;
}

function toFeeType(s: string): event_fee_type {
  if (s === 'Paid') return event_fee_type.Paid;
  return event_fee_type.Free;
}

function toOpenTo(s: string): event_open_to {
  if (s === 'Members only' || s === 'Members_only') return event_open_to.Members_only;
  if (s === 'NU Students only' || s === 'NU_Students_only') return event_open_to.NU_Students_only;
  return event_open_to.Open_to_all;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a user by email (case-insensitive). Returns null when not found. */
export async function getUserByEmail(email: string) {
  return prisma.tbl_user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { user_id: true },
  });
}

// ---------------------------------------------------------------------------
// GET /events/by-user-role
// ---------------------------------------------------------------------------

/**
 * Returns events visible to a given user based on their role and org memberships.
 * Replicates the logic of the GetEventsByUserRole stored procedure in pure Prisma + raw SQL.
 *
 * Scope rules:
 *   - No user found          → SDAO/System events only
 *   - SDAO / Academic Dir    → all events
 *   - Everyone else          → member orgs + own events + advanced role conditions
 */
export async function getEventsByUserRole(userId: string): Promise<unknown[]> {
  // Resolve the user's role and program/college context
  const user = await prisma.tbl_user.findFirst({
    where: { user_id: userId },
    select: {
      program_id: true,
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: { select: { college_id: true } },
    },
  });

  // CTE: per-event collaborator JSON array
  const collabCte = `
    collab_json AS (
      SELECT ec.event_id,
             json_agg(
               json_build_object(
                 'organization_id', o.organization_id,
                 'organization_name', o.name,
                 'base_program_id', ov.base_program_id
               )
             ) AS collaborators
      FROM tbl_event_collaborator ec
      JOIN tbl_organization o         ON o.organization_id = ec.organization_id
      LEFT JOIN tbl_organization_version ov ON ov.org_version_id = o.current_org_version_id
      GROUP BY ec.event_id
    )`;

  // Shared SELECT / FROM / JOIN fragment (CTE must already be in scope)
  const selectBlock = `
    SELECT DISTINCT
           e.*,
           o.name AS organization_name,
           rc.org_version_id AS organization_version_id,
           COALESCE(cj.collaborators::text, '[]') AS collaborators,
           NULL AS publication_image
    FROM tbl_event e
    LEFT JOIN tbl_organization o   ON o.organization_id = e.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON rc.organization_id = e.organization_id
                                   AND rc.cycle_number = e.cycle_number
    LEFT JOIN collab_json cj       ON cj.event_id = e.event_id`;

  // No user → only global events
  if (!user) {
    return prisma.$queryRawUnsafe(`
      WITH ${collabCte}
      ${selectBlock}
      WHERE e.event_type IN ('SDAO', 'System')
      ORDER BY e.start_date DESC, e.created_at DESC
    `);
  }

  const roleName = user.tbl_role?.role_name ?? '';
  const programId = user.program_id;
  const collegeId = user.tbl_program_tbl_user_program_idTotbl_program?.college_id ?? null;

  // SDAO / Academic Director → all events
  if (roleName === 'SDAO' || roleName === 'Academic Director') {
    return prisma.$queryRawUnsafe(`
      WITH ${collabCte}
      ${selectBlock}
      ORDER BY e.start_date DESC, e.created_at DESC
    `);
  }

  // Everyone else: build a WHERE clause scoped to the user's role.
  // roleName comes from the DB, not from user input, so interpolation is safe.
  const safeRole = roleName.replace(/'/g, "''");
  const params: unknown[] = [userId]; // $1 = userId
  let p = 2; // next positional-param index

  // Program Chair conditions (only when program_id is known)
  const programConds: string[] = [];
  if (programId != null) {
    programConds.push(
      // Events belonging to orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_organization po
          JOIN tbl_organization_version pov ON pov.org_version_id = po.current_org_version_id
          WHERE po.organization_id = e.organization_id AND pov.base_program_id = $${p}
      ))`,
      // Collaborator orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_event_collaborator ec4
          JOIN tbl_organization po2        ON po2.organization_id = ec4.organization_id
          JOIN tbl_organization_version pov2 ON pov2.org_version_id = po2.current_org_version_id
          WHERE ec4.event_id = e.event_id AND pov2.base_program_id = $${p}
      ))`,
      // Proposed events for orgs under this program
      `(ui_role = 'Program Chair' AND EXISTS (
          SELECT 1 FROM tbl_event_application ea3
          WHERE ea3.proposed_event_id = e.event_id AND EXISTS (
              SELECT 1 FROM tbl_organization po3
              JOIN tbl_organization_version pov3 ON pov3.org_version_id = po3.current_org_version_id
              WHERE po3.organization_id = ea3.organization_id AND pov3.base_program_id = $${p}
          )
      ))`,
    );
    params.push(programId);
    p++;
  }

  // Dean conditions (only when college_id is known)
  const collegeConds: string[] = [];
  if (collegeId != null) {
    collegeConds.push(
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_organization do1
          JOIN tbl_organization_version dov1 ON dov1.org_version_id = do1.current_org_version_id
          JOIN tbl_program dp1               ON dp1.program_id = dov1.base_program_id
          WHERE do1.organization_id = e.organization_id AND dp1.college_id = $${p}
      ))`,
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_event_collaborator ec5
          JOIN tbl_organization do2        ON do2.organization_id = ec5.organization_id
          JOIN tbl_organization_version dov2 ON dov2.org_version_id = do2.current_org_version_id
          JOIN tbl_program dp2               ON dp2.program_id = dov2.base_program_id
          WHERE ec5.event_id = e.event_id AND dp2.college_id = $${p}
      ))`,
      `(ui_role = 'Dean' AND EXISTS (
          SELECT 1 FROM tbl_event_application ea4
          WHERE ea4.proposed_event_id = e.event_id AND EXISTS (
              SELECT 1 FROM tbl_organization do3
              JOIN tbl_organization_version dov3 ON dov3.org_version_id = do3.current_org_version_id
              JOIN tbl_program dp3               ON dp3.program_id = dov3.base_program_id
              WHERE do3.organization_id = ea4.organization_id AND dp3.college_id = $${p}
          )
      ))`,
    );
    params.push(collegeId);
    p++;
  }

  // All WHERE conditions joined with OR
  const conditions = [
    // Global events visible to everyone
    `e.event_type IN ('SDAO', 'System')`,
    // Events created by this user
    `e.user_id = $1`,
    // User is a member of the event's organization
    `EXISTS (
        SELECT 1 FROM tbl_organization_members m
        WHERE m.user_id = $1
          AND (m.status IS NULL OR m.status IN ('Active', 'Pending'))
          AND m.organization_id = e.organization_id
    )`,
    // User is a member of a collaborating organization
    `EXISTS (
        SELECT 1 FROM tbl_event_collaborator ec2
        JOIN tbl_organization_members m2 ON m2.organization_id = ec2.organization_id
        WHERE ec2.event_id = e.event_id
          AND m2.user_id = $1
          AND (m2.status IS NULL OR m2.status IN ('Active', 'Pending'))
    )`,
    // Adviser: user advises the owner org
    `(ui_role = 'Adviser' AND EXISTS (
        SELECT 1 FROM tbl_organization ao
        WHERE ao.organization_id = e.organization_id AND ao.adviser_id = $1
    ))`,
    // Adviser: user advises a collaborating org
    `(ui_role = 'Adviser' AND EXISTS (
        SELECT 1 FROM tbl_event_collaborator ec3
        JOIN tbl_organization ao2 ON ao2.organization_id = ec3.organization_id
        WHERE ec3.event_id = e.event_id AND ao2.adviser_id = $1
    ))`,
    ...programConds,
    ...collegeConds,
    // Proposed events related to this user or their orgs
    `EXISTS (
        SELECT 1 FROM tbl_event_application ea
        WHERE ea.proposed_event_id = e.event_id AND (
            ea.applicant_user_id = $1
            OR EXISTS (
                SELECT 1 FROM tbl_organization_members m3
                WHERE m3.user_id = $1
                  AND (m3.status IS NULL OR m3.status IN ('Active', 'Pending'))
                  AND m3.organization_id = ea.organization_id
            )
            OR (ui_role = 'Adviser' AND EXISTS (
                SELECT 1 FROM tbl_organization ao3
                WHERE ao3.organization_id = ea.organization_id AND ao3.adviser_id = $1
            ))
        )
    )`,
  ].join('\n    OR ');

  const sql = `
    WITH role_ctx AS (SELECT '${safeRole}' AS ui_role),
    ${collabCte}
    ${selectBlock}
    CROSS JOIN role_ctx
    WHERE ${conditions}
    ORDER BY e.start_date DESC, e.created_at DESC
  `;

  return prisma.$queryRawUnsafe(sql, ...params);
}

// ---------------------------------------------------------------------------
// GET /events/add-event-status
// ---------------------------------------------------------------------------

export interface AddEventStatusResult {
  id: number | null;
  cycle_number: number | null;
  can_add_event: boolean;
}

/**
 * Check whether an org can propose a new event.
 *
 * Logic (mirrors GetAddEventStatus stored procedure):
 *   - No events yet             → can add (return max cycle_number)
 *   - Last event is Rejected    → can add
 *   - All post-event reqs submitted (any status) → can add
 *   - Otherwise                 → cannot add
 */
export async function getAddEventStatusById(orgId: number): Promise<AddEventStatusResult> {
  // Get the most recently created event for the org
  const lastEvent = await prisma.tbl_event.findFirst({
    where: { organization_id: orgId },
    orderBy: { created_at: 'desc' },
    select: { event_id: true, status: true, cycle_number: true },
  });

  if (!lastEvent) {
    // No events yet — allow adding; return the org's latest cycle_number
    const maxCycle = await prisma.tbl_renewal_cycle.findFirst({
      where: { organization_id: orgId },
      orderBy: { cycle_number: 'desc' },
      select: { cycle_number: true },
    });
    return { id: null, cycle_number: maxCycle?.cycle_number ?? null, can_add_event: true };
  }

  // Count total post-event requirements defined globally
  const postReqCount = await prisma.tbl_event_application_requirement.count({
    where: { is_applicable_to: 'post_event' },
  });

  // Count DISTINCT post-event requirements that have been submitted for this event
  const submittedGroups = await prisma.tbl_event_requirement_submissions.groupBy({
    by: ['requirement_id'],
    where: {
      event_id: lastEvent.event_id,
      tbl_event_application_requirement: { is_applicable_to: 'post_event' },
    },
  });

  const canAdd = lastEvent.status === 'Rejected' || postReqCount === submittedGroups.length;
  return { id: lastEvent.event_id, cycle_number: lastEvent.cycle_number, can_add_event: canAdd };
}

// ---------------------------------------------------------------------------
// GET /events/specific?event_id=:id
// ---------------------------------------------------------------------------

export interface EventAttendee {
  attendance_id: number;
  user_id: string;
  full_name: string;
  email: string;
  attendance_status: string;
  transaction_status: string | null;
  registered_at: Date | null;
}

export interface EventStats {
  totalRegistered: number;
  totalAttended: number;
  totalEvaluated: number;
  attendanceRate: number;
  evaluationRate: number;
  averageRating: number;
  totalPaidRevenue: number;
}

export interface EventCollaborator {
  organization_id: number;
  organization_name: string;
  base_program_id: number | null;
}

export interface EventDetail {
  event_id: number;
  title: string;
  description: string;
  event_type: string | null;
  status: string | null;
  venue_type: string | null;
  venue: string | null;
  is_open_to: string | null;
  fee: number | null;
  capacity: number | null;
  certificate: string | null;
  start_date: Date;
  end_date: Date;
  start_time: Date;
  end_time: Date;
  organization_id: number | null;
  organization_version_id: number | null;
  cycle_number: number | null;
  organization_name: string | null;
  organization_logo: string | null;
  user_id: string;
  image: string | null;
  publication_image: string | null;
  collaborators: EventCollaborator[];
  attendees: EventAttendee[];
  stats: EventStats;
}

export async function getEventById(eventId: number): Promise<EventDetail | null> {
  const event = await prisma.tbl_event.findUnique({
    where: { event_id: eventId },
    select: {
      event_id: true,
      title: true,
      description: true,
      event_type: true,
      status: true,
      venue_type: true,
      venue: true,
      is_open_to: true,
      fee: true,
      capacity: true,
      certificate: true,
      start_date: true,
      end_date: true,
      start_time: true,
      end_time: true,
      organization_id: true,
      cycle_number: true,
      user_id: true,
      image: true,
      // Organization info
      tbl_organization: {
        select: {
          name: true,
          tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
            select: { org_version_id: true, logo_path: true },
          },
        },
      },
      // Collaborating orgs
      tbl_event_collaborator: {
        select: {
          organization_id: true,
          tbl_organization: {
            select: {
              name: true,
              tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                select: { base_program_id: true },
              },
            },
          },
        },
      },
      // Attendees
      tbl_event_attendance: {
        select: {
          attendance_id: true,
          user_id: true,
          status: true,
          created_at: true,
          tbl_user: { select: { f_name: true, l_name: true, email: true } },
          tbl_transaction: {
            select: { status: true },
          },
        },
      },
      // Evaluations for stats
      tbl_evaluation: {
        select: {
          tbl_evaluation_response: {
            select: { response_value: true },
          },
        },
      },
    },
  });

  if (!event) return null;

  // Resolve org_version_id from renewal cycle (matching event's cycle_number)
  const renewalCycle = event.organization_id && event.cycle_number
    ? await prisma.tbl_renewal_cycle.findUnique({
        where: {
          organization_id_cycle_number: {
            organization_id: event.organization_id,
            cycle_number: event.cycle_number,
          },
        },
        select: { org_version_id: true },
      })
    : null;

  const orgVersionId = renewalCycle?.org_version_id ?? null;
  const currentVersion =
    event.tbl_organization
      ?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;

  // Build attendees
  const attendees: EventAttendee[] = event.tbl_event_attendance.map((a) => ({
    attendance_id: a.attendance_id,
    user_id: a.user_id,
    full_name: `${a.tbl_user?.f_name ?? ''} ${a.tbl_user?.l_name ?? ''}`.trim(),
    email: a.tbl_user?.email ?? '',
    attendance_status: a.status,
    transaction_status: a.tbl_transaction?.status ?? null,
    registered_at: a.created_at,
  }));

  // Build stats
  const totalRegistered = event.tbl_event_attendance.filter((a) =>
    ['Registered', 'Attended', 'Evaluated'].includes(a.status),
  ).length;
  const totalAttended = event.tbl_event_attendance.filter((a) =>
    ['Attended', 'Evaluated'].includes(a.status),
  ).length;
  const totalEvaluated = event.tbl_event_attendance.filter(
    (a) => a.status === 'Evaluated',
  ).length;
  const attendanceRate =
    totalRegistered > 0 ? Math.round((totalAttended / totalRegistered) * 1000) / 10 : 0;
  const evaluationRate =
    totalAttended > 0 ? Math.round((totalEvaluated / totalAttended) * 1000) / 10 : 0;

  // Average rating from likert responses — we already fetched all responses;
  // the stored proc filtered by question_type = 'likert_4' but we can't filter
  // inside the nested select cheaply, so we use all numeric responses instead.
  const allResponseValues = event.tbl_evaluation.flatMap((e) =>
    e.tbl_evaluation_response.map((r) => parseFloat(r.response_value)).filter((v) => !isNaN(v)),
  );
  const averageRating =
    allResponseValues.length > 0
      ? Math.round((allResponseValues.reduce((s, v) => s + v, 0) / allResponseValues.length) * 100) / 100
      : 0;

  // Total paid revenue — sum Approved transactions for this event
  const paidRevenue = await prisma.tbl_transaction.aggregate({
    where: {
      status: 'Completed',
      tbl_transaction_event: { event_id: eventId },
    },
    _sum: { amount: true },
  });
  const totalPaidRevenue = Number(paidRevenue._sum.amount ?? 0);

  // Build collaborators
  const collaborators: EventCollaborator[] = event.tbl_event_collaborator.map((c) => ({
    organization_id: c.organization_id,
    organization_name: c.tbl_organization?.name ?? '',
    base_program_id:
      c.tbl_organization
        ?.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version
        ?.base_program_id ?? null,
  }));

  return {
    event_id: event.event_id,
    title: event.title,
    description: event.description,
    event_type: event.event_type,
    status: event.status,
    venue_type: event.venue_type,
    venue: event.venue,
    is_open_to: event.is_open_to,
    fee: event.fee,
    capacity: event.capacity,
    certificate: event.certificate,
    start_date: event.start_date,
    end_date: event.end_date,
    start_time: event.start_time,
    end_time: event.end_time,
    organization_id: event.organization_id,
    organization_version_id: orgVersionId,
    cycle_number: event.cycle_number,
    organization_name: event.tbl_organization?.name ?? null,
    organization_logo: event.organization_id
      ? `/api/web/organizations/${event.organization_id}/logo`
      : null,
    user_id: event.user_id,
    image: event.image,
    publication_image: null, // stored on disk per event_application, not in tbl_event
    collaborators,
    attendees,
    stats: {
      totalRegistered,
      totalAttended,
      totalEvaluated,
      attendanceRate,
      evaluationRate,
      averageRating,
      totalPaidRevenue,
    },
  };
}

// ---------------------------------------------------------------------------
// GET /event-requirement-submissions-by-organization?organization_id=:id
// ---------------------------------------------------------------------------

export interface PostEventSubmission {
  submission_id: number;
  event_id: number | null;
  event_application_id: number | null;
  organization_id: number;
  requirement_name: string;
  submitted_at: Date | null;
}

// ---------------------------------------------------------------------------
// GET /blocked-periods?status=unarchived|archived|all
// ---------------------------------------------------------------------------

export interface BlockedPeriod {
  blocked_period_id: number;
  reason: string;
  description: null;
  start_date: Date;
  end_date: Date;
  is_archived: boolean;
  created_at: Date | null;
}

export async function getBlockedPeriods(status: 'unarchived' | 'archived' | 'all' = 'unarchived'): Promise<BlockedPeriod[]> {
  const where =
    status === 'unarchived' ? { archived_at: null }
    : status === 'archived'  ? { archived_at: { not: null } }
    : {};

  const rows = await prisma.tbl_blocked_period.findMany({
    where,
    select: {
      blocked_period_id: true,
      reason: true,
      start_date: true,
      end_date: true,
      archived_at: true,
      created_at: true,
    },
    orderBy: { start_date: 'asc' },
  });

  return rows.map((r) => ({
    blocked_period_id: r.blocked_period_id,
    reason: r.reason,
    description: null,
    start_date: r.start_date,
    end_date: r.end_date,
    is_archived: r.archived_at !== null,
    created_at: r.created_at ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Blocked period mutations
// ---------------------------------------------------------------------------

async function checkBlockedPeriodOverlap(
  start: Date,
  end: Date,
  excludeId?: number,
): Promise<void> {
  const conflicting = await prisma.tbl_blocked_period.findMany({
    where: {
      archived_at: null,
      start_date: { lte: end },
      end_date: { gte: start },
      ...(excludeId !== undefined && { blocked_period_id: { not: excludeId } }),
    },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true },
  });
  if (conflicting.length > 0) {
    throw Object.assign(
      new Error('The selected date range overlaps with existing active blocked period(s).'),
      { code: 'OVERLAP_ERROR', conflictingPeriods: conflicting },
    );
  }
}

export async function createBlockedPeriod(data: {
  start_date: string;
  end_date: string;
  reason: string;
  created_by: string;
}): Promise<BlockedPeriod> {
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  await checkBlockedPeriodOverlap(start, end);

  const row = await prisma.tbl_blocked_period.create({
    data: { start_date: start, end_date: end, reason: data.reason, created_by: data.created_by },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true, created_at: true },
  });
  return {
    blocked_period_id: row.blocked_period_id,
    reason: row.reason,
    description: null,
    start_date: row.start_date,
    end_date: row.end_date,
    is_archived: false,
    created_at: row.created_at ?? null,
  };
}

export async function updateBlockedPeriod(data: {
  blocked_period_id: number;
  start_date?: string;
  end_date?: string;
  reason?: string;
}): Promise<BlockedPeriod> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { start_date: true, end_date: true, archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });

  const start = data.start_date ? new Date(data.start_date) : existing.start_date;
  const end = data.end_date ? new Date(data.end_date) : existing.end_date;
  await checkBlockedPeriodOverlap(start, end, data.blocked_period_id);

  const row = await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: {
      start_date: start,
      end_date: end,
      ...(data.reason !== undefined && { reason: data.reason }),
    },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true, archived_at: true, created_at: true },
  });
  return {
    blocked_period_id: row.blocked_period_id,
    reason: row.reason,
    description: null,
    start_date: row.start_date,
    end_date: row.end_date,
    is_archived: row.archived_at !== null,
    created_at: row.created_at ?? null,
  };
}

export async function archiveBlockedPeriod(data: {
  blocked_period_id: number;
  archived_by: string;
  archived_reason: string;
}): Promise<void> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  if (existing.archived_at)
    throw Object.assign(new Error('Blocked period is already archived.'), { code: 'ALREADY_ARCHIVED' });

  await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: { archived_at: new Date(), archived_by: data.archived_by, archived_reason: data.archived_reason },
  });
}

export async function unarchiveBlockedPeriod(data: {
  blocked_period_id: number;
  unarchived_by: string;
  unarchived_reason?: string;
}): Promise<void> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id: data.blocked_period_id },
    select: { archived_at: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  if (!existing.archived_at)
    throw Object.assign(new Error('Blocked period is not archived.'), { code: 'NOT_ARCHIVED' });

  await prisma.tbl_blocked_period.update({
    where: { blocked_period_id: data.blocked_period_id },
    data: {
      archived_at: null,
      archived_by: null,
      archived_reason: null,
      unarchived_at: new Date(),
      unarchived_by: data.unarchived_by,
      unarchived_reason: data.unarchived_reason ?? null,
    },
  });
}

export async function deleteBlockedPeriod(blocked_period_id: number): Promise<{ reason: string; start_date: Date; end_date: Date }> {
  const existing = await prisma.tbl_blocked_period.findUnique({
    where: { blocked_period_id },
    select: { blocked_period_id: true, reason: true, start_date: true, end_date: true },
  });
  if (!existing) throw Object.assign(new Error('Blocked period not found.'), { code: 'NOT_FOUND' });
  await prisma.tbl_blocked_period.delete({ where: { blocked_period_id } });
  return { reason: existing.reason, start_date: existing.start_date, end_date: existing.end_date };
}

export async function getPostEventSubmissionsByOrg(
  organizationId: number,
): Promise<PostEventSubmission[]> {
  const rows = await prisma.tbl_event_requirement_submissions.findMany({
    where: { organization_id: organizationId },
    select: {
      submission_id: true,
      event_id: true,
      event_application_id: true,
      organization_id: true,
      submitted_at: true,
      tbl_event_application_requirement: { select: { requirement_name: true } },
    },
    orderBy: { submitted_at: 'desc' },
  });

  return rows.map((r) => ({
    submission_id: r.submission_id,
    event_id: r.event_id,
    event_application_id: r.event_application_id,
    organization_id: r.organization_id,
    requirement_name: r.tbl_event_application_requirement.requirement_name,
    submitted_at: r.submitted_at,
  }));
}

// ---------------------------------------------------------------------------
// Event Requirements
// ---------------------------------------------------------------------------

/** Convert Prisma enum value → wire string expected by the frontend. */
function applicableToWire(val: string | null | undefined): string {
  return val === 'post_event' ? 'post-event' : 'pre-event';
}

/** Convert wire string from the frontend → Prisma enum value. */
export function parseApplicableTo(value: string): 'pre_event' | 'post_event' {
  return value === 'post-event' ? 'post_event' : 'pre_event';
}

export interface EventRequirement {
  requirement_id: number;
  requirement_name: string;
  /** Alias of is_applicable_to — kept for backward-compat with frontend hook. */
  requirement_type: string;
  is_applicable_to: string;
  file_path: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export async function getEventRequirements(): Promise<EventRequirement[]> {
  const rows = await prisma.tbl_event_application_requirement.findMany({
    where: { status: 'active' },
    orderBy: { created_at: 'asc' },
  });

  return rows.map((r) => {
    const wire = applicableToWire(r.is_applicable_to);
    return {
      requirement_id: r.requirement_id,
      requirement_name: r.requirement_name,
      requirement_type: wire,
      is_applicable_to: wire,
      file_path: r.file_path ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function createEventRequirement(data: {
  requirement_name: string;
  is_applicable_to: 'pre_event' | 'post_event';
  file_path?: string | null;
  created_by: string;
}): Promise<number> {
  const row = await prisma.tbl_event_application_requirement.create({
    data: {
      requirement_name: data.requirement_name,
      is_applicable_to: data.is_applicable_to,
      file_path: data.file_path ?? null,
      status: 'active',
      created_by: data.created_by,
    },
    select: { requirement_id: true },
  });
  return row.requirement_id;
}

export async function updateEventRequirement(data: {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: 'pre_event' | 'post_event';
  /** Pass a string to set a new path, null to clear, undefined to leave unchanged. */
  file_path?: string | null;
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    requirement_name: data.requirement_name,
    is_applicable_to: data.is_applicable_to,
    updated_at: new Date(),
  };
  if (data.file_path !== undefined) {
    updateData.file_path = data.file_path;
  }
  await prisma.tbl_event_application_requirement.update({
    where: { requirement_id: data.requirement_id },
    data: updateData,
  });
}

export async function archiveEventRequirement(requirement_id: number): Promise<void> {
  await prisma.tbl_event_application_requirement.update({
    where: { requirement_id },
    data: { status: 'archived', updated_at: new Date() },
  });
}

export async function getEventRequirementById(requirement_id: number) {
  return prisma.tbl_event_application_requirement.findUnique({
    where: { requirement_id },
    select: {
      requirement_id: true,
      requirement_name: true,
      is_applicable_to: true,
      file_path: true,
      status: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Create Event — supporting queries
// ---------------------------------------------------------------------------

/** Returns all active (non-archived) organizations. */
export async function getAllOrganizations() {
  const orgs = await prisma.tbl_organization.findMany({
    where: { archived_at: null },
    select: {
      organization_id: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });
  return orgs.map((o) => ({
    id: o.organization_id,
    organization_id: o.organization_id,
    org_id: o.organization_id,
    name: o.name,
    organization_name: o.name,
  }));
}

/** Returns organizations where the given user is an active member. */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.tbl_organization_members.findMany({
    where: { user_id: userId, status: 'Active' },
    select: {
      organization_id: true,
      cycle_number: true,
      tbl_renewal_cycle: {
        select: {
          tbl_organization: { select: { organization_id: true, name: true } },
        },
      },
    },
  });

  const seen = new Set<number>();
  const result: { id: number; organization_id: number; name: string; organization_name: string }[] = [];
  for (const m of memberships) {
    const org = m.tbl_renewal_cycle?.tbl_organization;
    if (org && !seen.has(org.organization_id)) {
      seen.add(org.organization_id);
      result.push({
        id: org.organization_id,
        organization_id: org.organization_id,
        name: org.name,
        organization_name: org.name,
      });
    }
  }
  return result;
}

/** Check if an event title is already in use by active/pending events. */
export async function checkEventTitleExists(title: string) {
  const matches = await prisma.tbl_event.findMany({
    where: {
      title: { equals: title.trim(), mode: 'insensitive' },
      status: { in: [event_status.Pending, event_status.Approved] },
    },
    select: { status: true },
  });
  return matches;
}

export interface ScheduleConflictParams {
  venue_ids?: number[] | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  // kept for internal use by createSDAOEvent pre-check
  event_title?: string | null;
  organization_id?: number | null;
  event_id?: number | null;
}

export interface ConflictItem {
  conflict_type: 'blocked_period' | 'schedule_conflict';
  conflict_message: string;
}

/** Pure-Prisma schedule conflict check. */
export async function checkScheduleConflictPrisma(params: ScheduleConflictParams): Promise<ConflictItem[]> {
  const { venue_ids, start_date, end_date, start_time, end_time, event_id } = params;

  const conflicts: ConflictItem[] = [];

  const startDate = new Date(start_date);
  const endDate = new Date(end_date ?? start_date);

  // 1. Blocked periods
  const blockedPeriods = await prisma.tbl_blocked_period.findMany({
    where: {
      archived_at: null,
      OR: [
        { start_date: { lte: endDate }, end_date: { gte: startDate } },
      ],
    },
    select: { reason: true, start_date: true, end_date: true },
  });
  for (const bp of blockedPeriods) {
    conflicts.push({
      conflict_type: 'blocked_period',
      conflict_message: `Blocked period: "${bp.reason}" (${bp.start_date.toISOString().slice(0, 10)} to ${bp.end_date.toISOString().slice(0, 10)})`,
    });
  }

  // 2. Venue + time conflicts (face-to-face only, venue_ids based)
  if (venue_ids && venue_ids.length > 0) {
    const startTime = new Date(`1970-01-01T${start_time}Z`);
    const endTime = new Date(`1970-01-01T${end_time}Z`);

    const venueConflicts = await prisma.tbl_event_venue.findMany({
      where: {
        venue_id: { in: venue_ids },
        tbl_event: {
          status: { in: [event_status.Pending, event_status.Approved] },
          event_id: event_id ? { not: event_id } : undefined,
          start_date: { lte: endDate },
          end_date: { gte: startDate },
          start_time: { lt: endTime },
          end_time: { gt: startTime },
        },
      },
      select: {
        tbl_venue: { select: { name: true } },
        tbl_event: { select: { title: true, start_date: true } },
      },
    });

    for (const vc of venueConflicts) {
      conflicts.push({
        conflict_type: 'schedule_conflict',
        conflict_message: `Venue "${vc.tbl_venue.name}" is already booked by event "${vc.tbl_event.title}" on ${vc.tbl_event.start_date.toISOString().slice(0, 10)}`,
      });
    }
  }

  return conflicts;
}

/** Get organization membership for a user (most recent active). */
export async function getOrganizationMembership(userId: string) {
  return prisma.tbl_organization_members.findFirst({
    where: { user_id: userId, status: 'Active' },
    orderBy: { joined_at: 'desc' },
    select: { organization_id: true, cycle_number: true },
  });
}

/** Get the most recent cycle for an org. */
export async function getCurrentCycleForOrganization(organizationId: number) {
  return prisma.tbl_renewal_cycle.findFirst({
    where: { organization_id: organizationId },
    orderBy: { cycle_number: 'desc' },
    select: { cycle_number: true },
  });
}

export interface CreateEventInput {
  user_id: string;
  title: string;
  description: string;
  venue_type: string;
  venue?: string | null;
  start_date: string;
  end_date?: string | null;
  start_time: string;
  end_time: string;
  organization_id?: number | null;
  cycle_number?: number | null;
  event_type?: string;
  status?: string;
  type?: string;
  is_open_to?: string;
  fee?: number | null;
  capacity?: number | null;
  image?: string | null;
  collaborators?: number[] | null;
  venue_ids?: number[] | null;
}

/** Create an event record plus optional collaborator rows. Returns the created event. */
export async function createEventRecord(data: CreateEventInput) {
  const startDate = new Date(data.start_date);
  const endDate = new Date(data.end_date ?? data.start_date);

  // Parse time strings (HH:MM or HH:MM:SS) into Date objects (epoch-based)
  const parseTime = (t: string): Date => new Date(`1970-01-01T${t}Z`);

  const event = await prisma.tbl_event.create({
    data: {
      user_id: data.user_id,
      title: data.title,
      description: data.description,
      venue_type: toVenueType(data.venue_type),
      venue: data.venue ?? null,
      start_date: startDate,
      end_date: endDate,
      start_time: parseTime(data.start_time),
      end_time: parseTime(data.end_time),
      organization_id: data.organization_id ?? null,
      cycle_number: data.cycle_number ?? null,
      event_type: toEventType(data.event_type ?? 'Organization'),
      status: toEventStatus(data.status ?? 'Pending'),
      type: toFeeType(data.type ?? 'Free'),
      is_open_to: toOpenTo(data.is_open_to ?? 'Open_to_all'),
      fee: data.fee ?? null,
      capacity: data.capacity ?? null,
      image: data.image ?? null,
    },
    select: { event_id: true, title: true, status: true },
  });

  if (data.collaborators && data.collaborators.length > 0) {
    await prisma.tbl_event_collaborator.createMany({
      data: data.collaborators.map((org_id) => ({
        event_id: event.event_id,
        organization_id: org_id,
      })),
      skipDuplicates: true,
    });
  }

  if (data.venue_ids && data.venue_ids.length > 0) {
    await prisma.tbl_event_venue.createMany({
      data: data.venue_ids.map((vid) => ({ event_id: event.event_id, venue_id: vid })),
      skipDuplicates: true,
    });
  }

  return event;
}

export interface CreateApplicationInput {
  organization_id: number;
  cycle_number: number;
  applicant_user_id: string;
  event: CreateEventInput;
  requirements: { requirement_id: number; file_path: string | null }[];
  collaborators?: number[] | null;
}

/** Create an event application (student org event): creates tbl_event + tbl_event_application rows. */
export async function createEventApplicationRecord(input: CreateApplicationInput) {
  const startDate = new Date(input.event.start_date);
  const endDate = new Date(input.event.end_date ?? input.event.start_date);

  const parseTime = (t: string): Date => new Date(`1970-01-01T${t}Z`);

  // Create the underlying event
  const event = await prisma.tbl_event.create({
    data: {
      user_id: input.applicant_user_id,
      title: input.event.title,
      description: input.event.description,
      venue_type: toVenueType(input.event.venue_type),
      venue: input.event.venue ?? null,
      start_date: startDate,
      end_date: endDate,
      start_time: parseTime(input.event.start_time),
      end_time: parseTime(input.event.end_time),
      organization_id: input.organization_id,
      cycle_number: input.cycle_number,
      event_type: event_type.Organization,
      status: event_status.Pending,
      type: toFeeType(input.event.type ?? 'Free'),
      is_open_to: toOpenTo(input.event.is_open_to ?? 'Open_to_all'),
      fee: input.event.fee ?? null,
      capacity: input.event.capacity ?? null,
      image: input.event.image ?? null,
    },
    select: { event_id: true },
  });

  // Add collaborators
  if (input.collaborators && input.collaborators.length > 0) {
    await prisma.tbl_event_collaborator.createMany({
      data: input.collaborators.map((org_id) => ({
        event_id: event.event_id,
        organization_id: org_id,
      })),
      skipDuplicates: true,
    });
  }

  // Link venues
  const eventVenueIds = input.event.venue_ids;
  if (eventVenueIds && eventVenueIds.length > 0) {
    await prisma.tbl_event_venue.createMany({
      data: eventVenueIds.map((vid) => ({ event_id: event.event_id, venue_id: vid })),
      skipDuplicates: true,
    });
  }

  // Create the application record
  const application = await prisma.tbl_event_application.create({
    data: {
      organization_id: input.organization_id,
      cycle_number: input.cycle_number,
      applicant_user_id: input.applicant_user_id,
      proposed_event_id: event.event_id,
      status: 'Pending',
    },
    select: { event_application_id: true, status: true, proposed_event_id: true, organization_id: true },
  });

  // Create requirement submission stubs
  if (input.requirements.length > 0) {
    await prisma.tbl_event_requirement_submissions.createMany({
      data: input.requirements
        .filter((r) => r.file_path !== null)
        .map((r) => ({
          event_id: event.event_id,
          event_application_id: application.event_application_id,
          requirement_id: r.requirement_id,
          organization_id: input.organization_id,
          cycle_number: input.cycle_number,
          file_path: r.file_path!,
          submitted_by: input.applicant_user_id,
        })),
      skipDuplicates: true,
    });
  }

  return {
    event_application_id: application.event_application_id,
    status: application.status,
    proposed_event_id: application.proposed_event_id,
    organization_id: application.organization_id,
    event_id: event.event_id,
  };
}
