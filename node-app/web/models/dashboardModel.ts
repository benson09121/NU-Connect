/**
 * web/models/dashboardModel.ts
 *
 * Prisma-based queries for GET /api/web/dashboard/stats.
 *
 * IMPORTANT: The user is ALWAYS identified by their email (Azure preferred_username).
 *   - Public API:  getDashboardStats(email)   — cache key: dashboard:stats:{email}
 *   - Internally:  email → DB lookup via tbl_user.email (unique)
 *                  tbl_user.user_id (PK) is used ONLY for FK sub-queries
 *                  (adviser_id, tbl_organization_members.user_id, etc.)
 *
 * Role → Scope → Filter logic:
 *
 *  Academic Director | SDAO | Faculty  →  global   (no filter)
 *  Dean                                →  college  (orgs whose programs belong to dean's college)
 *  Program Chair                       →  program  (orgs linked to their program)
 *  Adviser                             →  organization (orgs they advise)
 *  Student                             →  organization (orgs they are members of)
 *
 * Caching: Valkey, TTL = 60 s, key = dashboard:stats:{email}
 */

import { prisma } from '../../config/db';
import { getCache, setCache, deleteCache } from '../../config/valkey';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_SECONDS = 60;

const GLOBAL_ROLES = ['Academic Director', 'SDAO', 'Faculty'] as const;

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type ScopeType = 'global' | 'college' | 'program' | 'organization';

export interface DashboardScope {
  type: ScopeType;
  /** Human-readable label, e.g. "College of Engineering" */
  label: string;
  /** IDs being scoped to — empty array means all */
  ids: number[];
}

export interface CountStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface OrganizationStats {
  total: number;
  pending: number;
  active: number;
}

export interface UpcomingEventStats {
  total: number;
  thisWeek: number;
  thisMonth: number;
}

export interface DashboardStats {
  role: string;
  scope: DashboardScope;
  stats: {
    organizations: OrganizationStats;
    applications: CountStats;
    eventProposals: CountStats;
    upcomingEvents: UpcomingEventStats;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the user's role scope and the list of org IDs to filter by.
 * Returns `null` for orgIds if the user has global access (no filter).
 *
 * @param dbUserId  tbl_user.user_id (PK) — used for FK lookups (adviser_id, member user_id)
 */
async function resolveScope(
  dbUserId: string,
  roleName: string,
  programId: number | null,
  collegeId: number | null,
  collegeName: string | null,
  programName: string | null,
  programDbId: number | null,
): Promise<{ scope: DashboardScope; orgIds: number[] | null }> {

  // ── Global roles ────────────────────────────────────────────────────────
  if (GLOBAL_ROLES.includes(roleName as (typeof GLOBAL_ROLES)[number])) {
    return {
      scope: { type: 'global', label: 'All Records', ids: [] },
      orgIds: null,
    };
  }

  // ── Dean → college scope ────────────────────────────────────────────────
  if (roleName === 'Dean') {
    if (!collegeId) {
      // Dean without a program assignment → fallback to global
      return {
        scope: { type: 'global', label: 'All Records', ids: [] },
        orgIds: null,
      };
    }

    const orgCourses = await prisma.tbl_organization_course.findMany({
      where: { tbl_program: { college_id: collegeId } },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });

    const orgIds = orgCourses.map((oc) => oc.organization_id);
    return {
      scope: {
        type: 'college',
        label: collegeName ?? `College ${collegeId}`,
        ids: [collegeId],
      },
      orgIds,
    };
  }

  // ── Program Chair → program scope ───────────────────────────────────────
  if (roleName === 'Program Chair') {
    if (!programId) {
      return {
        scope: { type: 'global', label: 'All Records', ids: [] },
        orgIds: null,
      };
    }

    const orgCourses = await prisma.tbl_organization_course.findMany({
      where: { program_id: programId },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });

    const orgIds = orgCourses.map((oc) => oc.organization_id);
    return {
      scope: {
        type: 'program',
        label: programName ?? `Program ${programId}`,
        ids: [programId],
      },
      orgIds,
    };
  }

  // ── Adviser → organization scope ────────────────────────────────────────
  if (roleName === 'Adviser') {
    const orgs = await prisma.tbl_organization.findMany({
      where: { adviser_id: dbUserId },
      select: { organization_id: true, name: true },
    });
    const orgIds = orgs.map((o) => o.organization_id);
    const label = buildOrgLabel(orgs.map((o) => o.name));
    return {
      scope: { type: 'organization', label, ids: orgIds },
      orgIds,
    };
  }

  // ── Student → organization scope ────────────────────────────────────────
  if (roleName === 'Student') {
    const memberships = await prisma.tbl_organization_members.findMany({
      where: { user_id: dbUserId },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });
    const memberOrgIds = memberships.map((m) => m.organization_id);

    const orgs = await prisma.tbl_organization.findMany({
      where: { organization_id: { in: memberOrgIds } },
      select: { organization_id: true, name: true },
    });
    const label = buildOrgLabel(orgs.map((o) => o.name));
    return {
      scope: { type: 'organization', label, ids: memberOrgIds },
      orgIds: memberOrgIds,
    };
  }

  // Default fallback
  return {
    scope: { type: 'global', label: 'All Records', ids: [] },
    orgIds: null,
  };
}

function buildOrgLabel(names: string[]): string {
  if (names.length === 0) return 'No Organizations';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} + ${names.length - 3} more`;
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

/**
 * Fetch scoped dashboard statistics for the given user.
 *
 * @param email  req.user.email from the Azure JWT (tbl_user.email, unique)
 * Results are cached in Valkey for 60 seconds under dashboard:stats:{email}.
 */
export async function getDashboardStats(email: string): Promise<DashboardStats> {
  const cacheKey = `dashboard:stats:${email}`;

  // ── Cache hit ─────────────────────────────────────────────────────────────
  const cached = await getCache<DashboardStats>(cacheKey);
  if (cached) return cached;

  // ── Fetch user + role + program info (look up by email) ──────────────────
  const user = await prisma.tbl_user.findUnique({
    where: { email },
    include: {
      tbl_role: true,
      tbl_program_tbl_user_program_idTotbl_program: {
        include: { tbl_college: true },
      },
    },
  });

  if (!user) throw new Error('USER_NOT_FOUND');

  const roleName = user.tbl_role.role_name ?? 'Student';
  const program = user.tbl_program_tbl_user_program_idTotbl_program;
  const college = program?.tbl_college ?? null;

  // ── Resolve role scope (pass DB PK for FK sub-queries) ───────────────────
  const { scope, orgIds } = await resolveScope(
    user.user_id,  // tbl_user.user_id (PK) — needed for adviser_id / member FK lookups
    roleName,
    program?.program_id ?? null,
    college?.college_id ?? null,
    college?.name ?? null,
    program?.name ?? null,
    program?.program_id ?? null,
  );

  // ── Build Prisma where filters ────────────────────────────────────────────
  const orgFilter = orgIds !== null ? { organization_id: { in: orgIds } } : {};

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ── Parallel DB queries ───────────────────────────────────────────────────
  const [
    orgGroups,
    appGroups,
    eventProposalGroups,
    upcomingTotal,
    upcomingWeek,
    upcomingMonth,
  ] = await Promise.all([
    // Organization counts grouped by status
    prisma.tbl_organization.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { organization_id: true },
    }),

    // Membership application counts grouped by status
    prisma.tbl_membership_application.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { application_id: true },
    }),

    // Event proposal (tbl_event_application) counts grouped by status
    prisma.tbl_event_application.groupBy({
      by: ['status'],
      where: orgFilter,
      _count: { event_application_id: true },
    }),

    // Upcoming events — total (start_date >= today, status = Approved)
    prisma.tbl_event.count({
      where: {
        ...orgFilter,
        start_date: { gte: now },
        status: 'Approved',
      },
    }),

    // Upcoming events — this week (next 7 days)
    prisma.tbl_event.count({
      where: {
        ...orgFilter,
        start_date: { gte: now, lte: weekFromNow },
        status: 'Approved',
      },
    }),

    // Upcoming events — this month (next 30 days)
    prisma.tbl_event.count({
      where: {
        ...orgFilter,
        start_date: { gte: now, lte: monthFromNow },
        status: 'Approved',
      },
    }),
  ]);

  // ── Aggregate organization stats ──────────────────────────────────────────
  const orgTotal = orgGroups.reduce((sum, g) => sum + g._count.organization_id, 0);
  const orgPending = orgGroups
    .filter((g) => g.status === 'Pending' || g.status === 'Renewal')
    .reduce((sum, g) => sum + g._count.organization_id, 0);
  const orgActive = orgGroups
    .filter((g) => g.status === 'Approved')
    .reduce((sum, g) => sum + g._count.organization_id, 0);

  // ── Aggregate membership application stats ────────────────────────────────
  const appTotal = appGroups.reduce((sum, g) => sum + g._count.application_id, 0);
  const appPending = appGroups
    .filter((g) => g.status === 'Pending')
    .reduce((sum, g) => sum + g._count.application_id, 0);
  const appApproved = appGroups
    .filter((g) => g.status === 'Approved')
    .reduce((sum, g) => sum + g._count.application_id, 0);
  const appRejected = appGroups
    .filter((g) => g.status === 'Rejected')
    .reduce((sum, g) => sum + g._count.application_id, 0);

  // ── Aggregate event proposal stats ───────────────────────────────────────
  const epTotal = eventProposalGroups.reduce((sum, g) => sum + g._count.event_application_id, 0);
  // Revision is counted as pending (still needs action)
  const epPending = eventProposalGroups
    .filter((g) => g.status === 'Pending' || g.status === 'Revision')
    .reduce((sum, g) => sum + g._count.event_application_id, 0);
  const epApproved = eventProposalGroups
    .filter((g) => g.status === 'Approved')
    .reduce((sum, g) => sum + g._count.event_application_id, 0);
  const epRejected = eventProposalGroups
    .filter((g) => g.status === 'Rejected')
    .reduce((sum, g) => sum + g._count.event_application_id, 0);

  // ── Assemble result ───────────────────────────────────────────────────────
  const result: DashboardStats = {
    role: roleName,
    scope,
    stats: {
      organizations: {
        total: orgTotal,
        pending: orgPending,
        active: orgActive,
      },
      applications: {
        total: appTotal,
        pending: appPending,
        approved: appApproved,
        rejected: appRejected,
      },
      eventProposals: {
        total: epTotal,
        pending: epPending,
        approved: epApproved,
        rejected: epRejected,
      },
      upcomingEvents: {
        total: upcomingTotal,
        thisWeek: upcomingWeek,
        thisMonth: upcomingMonth,
      },
    },
  };

  // ── Cache and return ──────────────────────────────────────────────────────
  await setCache(cacheKey, result, CACHE_TTL_SECONDS);
  return result;
}

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

/**
 * Delete the dashboard stats cache for a specific user.
 * @param email  tbl_user.email — must match the key used in getDashboardStats
 */
export async function invalidateDashboardCacheForEmail(email: string): Promise<void> {
  await deleteCache(`dashboard:stats:${email}`);
}

// ---------------------------------------------------------------------------
// Affected-user resolver (used by dashboardBroadcastService)
// ---------------------------------------------------------------------------

/**
 * Given an organization ID involved in a mutation, return all user EMAILS
 * that should receive a `dashboard:stats:updated` WebSocket event.
 *
 * Returns emails because:
 *  - Cache keys are dashboard:stats:{email}
 *  - broadcastToUser() is called with email (Azure preferred_username)
 *
 * Includes:
 *  - All SDAO / Academic Director / Faculty (global viewers)
 *  - The adviser of the org
 *  - Active members of the org
 *  - Program Chair(s) of programs linked to the org
 *  - Dean(s) of colleges that contain those programs
 */
export async function getAffectedEmails(orgId: number): Promise<string[]> {
  const [globalUsers, org, orgCourses, members] = await Promise.all([
    // Global role users
    prisma.tbl_user.findMany({
      where: {
        tbl_role: { role_name: { in: ['Academic Director', 'SDAO', 'Faculty'] } },
        status: 'Active',
      },
      select: { email: true },
    }),

    // The organization itself — include adviser relation to get their email
    prisma.tbl_organization.findUnique({
      where: { organization_id: orgId },
      include: {
        tbl_user_tbl_organization_adviser_idTotbl_user: { select: { email: true } },
      },
    }),

    // Programs linked to this org (via org_course)
    prisma.tbl_organization_course.findMany({
      where: { organization_id: orgId },
      include: { tbl_program: true },
    }),

    // Active members — join tbl_user to get email
    prisma.tbl_organization_members.findMany({
      where: { organization_id: orgId, status: 'Active' },
      include: { tbl_user: { select: { email: true } } },
      distinct: ['user_id'],
    }),
  ]);

  const affected = new Set<string>();

  // Global users
  globalUsers.forEach((u) => affected.add(u.email));

  // Adviser email (via joined relation)
  const adviserEmail = org?.tbl_user_tbl_organization_adviser_idTotbl_user?.email;
  if (adviserEmail) affected.add(adviserEmail);

  // Members
  members.forEach((m) => affected.add(m.tbl_user.email));

  // Program Chairs + Deans (require a second level of lookup)
  if (orgCourses.length > 0) {
    const programIds = [...new Set(orgCourses.map((oc) => oc.program_id))];
    const collegeIds = [...new Set(orgCourses.map((oc) => oc.tbl_program.college_id))];

    const [programChairs, deans] = await Promise.all([
      prisma.tbl_user.findMany({
        where: {
          tbl_role: { role_name: 'Program Chair' },
          program_id: { in: programIds },
          status: 'Active',
        },
        select: { email: true },
      }),
      prisma.tbl_user.findMany({
        where: {
          tbl_role: { role_name: 'Dean' },
          tbl_program_tbl_user_program_idTotbl_program: {
            college_id: { in: collegeIds },
          },
          status: 'Active',
        },
        select: { email: true },
      }),
    ]);

    programChairs.forEach((u) => affected.add(u.email));
    deans.forEach((u) => affected.add(u.email));
  }

  return [...affected];
}
