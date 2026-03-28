/**
 * web/models/logModel.ts
 *
 * Prisma-based queries for the Activity Log system.
 *
 * Table: tbl_logs
 *
 * Role-scoped visibility:
 *   SDAO / Admin / Academic Director  → all logs
 *   Dean                              → own + their college's orgs
 *   Program Chair                     → own + their program's orgs
 *   Adviser                           → own + their advised org
 *   Student / Faculty                 → own only
 */

import { prisma } from '../../config/db';
import { getPermissionBundle } from '../../services/permissionService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogData {
  user_id: string;
  user_email: string;
  full_name: string;
  action: string;
  action_type: string;
  entity_type?: string | null;
  entity_id?: number | null;
  organization_id?: number | null;
  redirect_url?: string | null;
  meta_data?: any;
}

export interface LogItem {
  log_id: number;
  user_id: string;
  user_email: string;
  full_name: string;
  action: string;
  action_type: string;
  entity_type: string | null;
  entity_id: number | null;
  organization_id: number | null;
  meta_data: any;
  redirect_url: string | null;
  created_at: Date | null;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LogStats {
  total_logs_today: number;
  total_logs_this_week: number;
  applications_submitted_today: number;
  approvals_completed_today: number;
  active_users_today: number;
}

export interface UserLogStats {
  my_actions_today: number;
  my_actions_this_week: number;
}

// ---------------------------------------------------------------------------
// Role names that see ALL logs
// ---------------------------------------------------------------------------

const ADMIN_ROLES = ['SDAO', 'Academic Director', 'Admin'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if the user has an admin-level role (sees all logs).
 */
export async function isAdminRole(userId: string): Promise<boolean> {
  const bundle = await getPermissionBundle(userId);
  return ADMIN_ROLES.includes(bundle.role.name ?? '');
}

/**
 * Resolve the app user_id from what the controller passes (email).
 * tbl_logs.user_id stores app user_id (e.g. 'sdao-staff-002'), not emails.
 */
async function resolveAppUserId(emailOrId: string): Promise<string> {
  const user = await prisma.tbl_user.findFirst({
    where: { OR: [{ email: emailOrId }, { user_id: emailOrId }] },
    select: { user_id: true },
  });
  return user?.user_id ?? emailOrId;
}

/**
 * Build the visibility where-clause based on user's role.
 * Returns a Prisma WHERE object scoped to what the user can see.
 */
async function buildVisibilityFilter(userId: string): Promise<any> {
  const bundle = await getPermissionBundle(userId);
  const roleName = bundle.role.name ?? '';
  // Resolve app user_id for WHERE clauses (tbl_logs.user_id stores app ids)
  const appUserId = bundle.userId;

  // SDAO / Admin / Academic Director → all logs
  if (ADMIN_ROLES.includes(roleName)) {
    return {};
  }

  // Dean → own + logs for organizations in their college
  if (roleName === 'Dean') {
    // Find the college this dean manages
    const deanCollege = await prisma.tbl_college_dean.findFirst({
      where: { dean_user_id: appUserId },
      select: { college_id: true },
    });

    if (deanCollege) {
      // Get all program IDs in this college
      const programs = await prisma.tbl_program.findMany({
        where: { college_id: deanCollege.college_id, status: 'Active' },
        select: { program_id: true },
      });
      const programIds = programs.map((p) => p.program_id);

      // Get all org IDs with a base program in those programs
      const orgs = await prisma.tbl_application.findMany({
        where: { base_program_id: { in: programIds } },
        select: { organization_id: true },
        distinct: ['organization_id'],
      });
      const orgIds = orgs
        .map((o) => o.organization_id)
        .filter((id): id is number => id !== null);

      return {
        OR: [
          { user_id: appUserId },
          { organization_id: { in: orgIds } },
        ],
      };
    }
  }

  // Program Chair → own + logs for orgs in their program
  if (roleName === 'Program Chair') {
    if (bundle.program_id) {
      const orgs = await prisma.tbl_application.findMany({
        where: { base_program_id: bundle.program_id },
        select: { organization_id: true },
        distinct: ['organization_id'],
      });
      const orgIds = orgs
        .map((o) => o.organization_id)
        .filter((id): id is number => id !== null);

      return {
        OR: [
          { user_id: appUserId },
          { organization_id: { in: orgIds } },
        ],
      };
    }
  }

  // Adviser → own + their advised org
  if (roleName === 'Adviser') {
    const advisedOrgs = await prisma.tbl_organization.findMany({
      where: { adviser_id: appUserId },
      select: { organization_id: true },
    });
    const orgIds = advisedOrgs.map((o) => o.organization_id);

    return {
      OR: [
        { user_id: appUserId },
        { organization_id: { in: orgIds } },
      ],
    };
  }

  // Student / Faculty / others → own + orgs where they hold Rank 1 (President)
  // Check if user is Rank 1 in any org → they see that org's logs
  const rank1Memberships = await prisma.tbl_organization_members.findMany({
    where: {
      user_id: appUserId,
      status: 'Active',
      tbl_executive_role: {
        tbl_executive_rank: { rank_level: 1 },
      },
    },
    select: { organization_id: true },
  });

  if (rank1Memberships.length > 0) {
    const orgIds = rank1Memberships.map((m) => m.organization_id);
    return {
      OR: [
        { user_id: appUserId },
        { organization_id: { in: orgIds } },
      ],
    };
  }

  return { user_id: appUserId };
}

// ---------------------------------------------------------------------------
// 1. Create a log entry
// ---------------------------------------------------------------------------

export async function createLog(data: LogData): Promise<LogItem> {
  const log = await prisma.tbl_logs.create({
    data: {
      user_id: data.user_id,
      user_email: data.user_email,
      full_name: data.full_name,
      action: data.action,
      action_type: data.action_type,
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      organization_id: data.organization_id ?? null,
      redirect_url: data.redirect_url ?? null,
      meta_data: data.meta_data ?? undefined,
    },
  });

  return {
    log_id: log.log_id,
    user_id: log.user_id,
    user_email: log.user_email,
    full_name: log.full_name,
    action: log.action,
    action_type: log.action_type,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    organization_id: log.organization_id,
    meta_data: log.meta_data,
    redirect_url: log.redirect_url,
    created_at: log.created_at,
  };
}

// ---------------------------------------------------------------------------
// 2. Get paginated logs (role-scoped)
// ---------------------------------------------------------------------------

export async function getLogs(
  userId: string,
  options: {
    page?: number;
    limit?: number;
    action_type?: string;
    user_id?: string;
    organization_id?: number;
    start_date?: string;
    end_date?: string;
    search?: string;
  } = {},
): Promise<PaginatedResult<LogItem>> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const skip = (page - 1) * limit;

  // Start with visibility filter
  const visibilityFilter = await buildVisibilityFilter(userId);

  // Build additional filters
  const additionalFilters: any[] = [];

  if (options.action_type) {
    additionalFilters.push({ action_type: options.action_type });
  }

  // user_id filter only allowed for admins
  if (options.user_id) {
    const adminRole = await isAdminRole(userId);
    if (adminRole) {
      additionalFilters.push({ user_id: options.user_id });
    }
  }

  if (options.organization_id) {
    additionalFilters.push({ organization_id: options.organization_id });
  }

  if (options.start_date) {
    additionalFilters.push({ created_at: { gte: new Date(options.start_date) } });
  }

  if (options.end_date) {
    additionalFilters.push({ created_at: { lte: new Date(options.end_date) } });
  }

  if (options.search) {
    additionalFilters.push({
      action: { contains: options.search, mode: 'insensitive' },
    });
  }

  const where: any = {
    AND: [visibilityFilter, ...additionalFilters],
  };

  const [logs, total] = await Promise.all([
    prisma.tbl_logs.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.tbl_logs.count({ where }),
  ]);

  const data: LogItem[] = logs.map((l) => ({
    log_id: l.log_id,
    user_id: l.user_id,
    user_email: l.user_email,
    full_name: l.full_name,
    action: l.action,
    action_type: l.action_type,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    organization_id: l.organization_id,
    meta_data: l.meta_data,
    redirect_url: l.redirect_url,
    created_at: l.created_at,
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Get recent logs (for Dashboard widget)
// ---------------------------------------------------------------------------

export async function getRecentLogs(
  userId: string,
  limit: number = 10,
): Promise<LogItem[]> {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const visibilityFilter = await buildVisibilityFilter(userId);

  const logs = await prisma.tbl_logs.findMany({
    where: visibilityFilter,
    orderBy: { created_at: 'desc' },
    take: safeLimit,
  });

  return logs.map((l) => ({
    log_id: l.log_id,
    user_id: l.user_id,
    user_email: l.user_email,
    full_name: l.full_name,
    action: l.action,
    action_type: l.action_type,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    organization_id: l.organization_id,
    meta_data: l.meta_data,
    redirect_url: l.redirect_url,
    created_at: l.created_at,
  }));
}

// ---------------------------------------------------------------------------
// 4. Get log stats
// ---------------------------------------------------------------------------

export async function getLogStats(userId: string): Promise<LogStats | UserLogStats> {
  const admin = await isAdminRole(userId);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)

  if (admin) {
    const [
      totalToday,
      totalWeek,
      appsToday,
      approvalsToday,
      activeUsersToday,
    ] = await Promise.all([
      prisma.tbl_logs.count({
        where: { created_at: { gte: todayStart } },
      }),
      prisma.tbl_logs.count({
        where: { created_at: { gte: weekStart } },
      }),
      prisma.tbl_logs.count({
        where: {
          created_at: { gte: todayStart },
          action_type: { in: ['application_submit', 'application_resubmit'] },
        },
      }),
      prisma.tbl_logs.count({
        where: {
          created_at: { gte: todayStart },
          action_type: { in: ['approval_approve'] },
        },
      }),
      prisma.tbl_logs.groupBy({
        by: ['user_id'],
        where: { created_at: { gte: todayStart } },
      }).then((groups) => groups.length),
    ]);

    return {
      total_logs_today: totalToday,
      total_logs_this_week: totalWeek,
      applications_submitted_today: appsToday,
      approvals_completed_today: approvalsToday,
      active_users_today: activeUsersToday,
    } as LogStats;
  }

  // Non-admin: own stats only
  const appUserId = await resolveAppUserId(userId);
  const [myToday, myWeek] = await Promise.all([
    prisma.tbl_logs.count({
      where: { user_id: appUserId, created_at: { gte: todayStart } },
    }),
    prisma.tbl_logs.count({
      where: { user_id: appUserId, created_at: { gte: weekStart } },
    }),
  ]);

  return {
    my_actions_today: myToday,
    my_actions_this_week: myWeek,
  } as UserLogStats;
}
