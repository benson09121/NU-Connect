import { prisma } from '../../config/db';

type ScopeMode = 'global' | 'role-scoped' | 'organization_id';

export interface ScopeDiagnostics {
  roleName: string;
  scopeMode: ScopeMode;
  resolvedOrganizationIds: number[];
}

export interface OrganizationAnalyticsRow {
  organization_id: number;
  organization_name: string;
  status: string;
  category: string;
}

export interface LeaderboardRow {
  organization_id: number;
  organization_name: string;
  total_points: number;
  rank: number;
  category: string;
}

export interface ActivityTrendPoint {
  event_id: number;
  attended: number;
}

export interface ActivitiesRow {
  organization_id: number;
  organization_name: string;
  completed_events: number;
  upcoming_events: number;
  attendance_trend: ActivityTrendPoint[];
}

export interface FinanceRow {
  organization_id: number;
  organization_name: string;
  income_this_month: number;
  expense_this_month: number;
}

export interface MemberEngagementRow {
  organization_id: number;
  organization_name: string;
  registered_members: number;
  active_members: number;
}

class UserScopeNotFoundError extends Error {
  code = 'UNAUTHORIZED';
  constructor(message = 'Authenticated user was not found in scope resolver') {
    super(message);
    this.name = 'UserScopeNotFoundError';
  }
}

export class ForbiddenScopeError extends Error {
  code = 'FORBIDDEN';
  constructor(message = 'organization_id is outside your access scope') {
    super(message);
    this.name = 'ForbiddenScopeError';
  }
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCategory(category: unknown): string {
  if (!category) return 'unknown';
  if (category === 'Co_Curricular_Organization') return 'co_curricular';
  if (category === 'Extra_Curricular_Organization') return 'extra_curricular';
  return String(category).toLowerCase();
}

function normalizeOrgStatus(status: unknown): string {
  return status ? String(status).toLowerCase() : 'unknown';
}

async function getUserScope(userId: string): Promise<{ roleName: string; isSdao: boolean; organizationIds: number[] }> {
  const user = await prisma.tbl_user.findUnique({
    where: { user_id: userId },
    include: { tbl_role: { select: { role_name: true } } },
  });

  if (!user) {
    throw new UserScopeNotFoundError();
  }

  const roleName = user.tbl_role?.role_name ?? 'Unknown';
  const isSdao = roleName === 'SDAO';
  if (isSdao) {
    return { roleName, isSdao: true, organizationIds: [] };
  }

  const scopedIds = new Set<number>();

  const memberships = await prisma.tbl_organization_members.findMany({
    where: { user_id: userId, status: 'Active' },
    select: { organization_id: true },
    distinct: ['organization_id'],
  });
  memberships.forEach((m) => scopedIds.add(m.organization_id));

  if (roleName === 'Adviser') {
    const advised = await prisma.tbl_organization.findMany({
      where: { adviser_id: userId },
      select: { organization_id: true },
    });
    advised.forEach((o) => scopedIds.add(o.organization_id));
  }

  if (roleName === 'Program Chair' && user.program_id) {
    const orgCourses = await prisma.tbl_organization_course.findMany({
      where: { program_id: user.program_id },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });
    orgCourses.forEach((oc) => scopedIds.add(oc.organization_id));
  }

  if (roleName === 'Dean') {
    const deanRows = await prisma.tbl_college_dean.findMany({
      where: { dean_user_id: userId, is_active: true },
      select: { college_id: true },
      distinct: ['college_id'],
    });

    const collegeIds = deanRows.map((d) => d.college_id);
    if (collegeIds.length > 0) {
      const orgCourses = await prisma.tbl_organization_course.findMany({
        where: {
          tbl_program: {
            college_id: { in: collegeIds },
          },
        },
        select: { organization_id: true },
        distinct: ['organization_id'],
      });
      orgCourses.forEach((oc) => scopedIds.add(oc.organization_id));
    }
  }

  return { roleName, isSdao: false, organizationIds: Array.from(scopedIds) };
}

export async function resolveScopeDiagnostics(userId: string, organizationId: number | null): Promise<ScopeDiagnostics> {
  const scope = await getUserScope(userId);

  if (scope.isSdao) {
    if (organizationId) {
      return {
        roleName: scope.roleName || 'SDAO',
        scopeMode: 'organization_id',
        resolvedOrganizationIds: [organizationId],
      };
    }

    const orgs = await prisma.tbl_organization.findMany({
      select: { organization_id: true },
    });

    return {
      roleName: scope.roleName || 'SDAO',
      scopeMode: 'global',
      resolvedOrganizationIds: orgs.map((o) => o.organization_id),
    };
  }

  if (organizationId) {
    if (!scope.organizationIds.includes(organizationId)) {
      throw new ForbiddenScopeError('organization_id is outside your access scope');
    }
    return {
      roleName: scope.roleName,
      scopeMode: 'organization_id',
      resolvedOrganizationIds: [organizationId],
    };
  }

  return {
    roleName: scope.roleName,
    scopeMode: 'role-scoped',
    resolvedOrganizationIds: scope.organizationIds,
  };
}

async function getVisibleOrganizations(userId: string, organizationId: number | null, preResolvedOrgIds: number[] | null = null): Promise<OrganizationAnalyticsRow[]> {
  const orgIds = Array.isArray(preResolvedOrgIds)
    ? preResolvedOrgIds
    : (await resolveScopeDiagnostics(userId, organizationId)).resolvedOrganizationIds;

  if (orgIds.length === 0) return [];

  const orgs = await prisma.tbl_organization.findMany({
    where: { organization_id: { in: orgIds } },
    select: {
      organization_id: true,
      name: true,
      status: true,
      tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
        select: { category: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return orgs.map((org) => ({
    organization_id: org.organization_id,
    organization_name: org.name,
    status: normalizeOrgStatus(org.status),
    category: normalizeCategory(
      org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version?.category,
    ),
  }));
}

export async function getLeaderboards(userId: string, organizationId: number | null, preResolvedOrgIds: number[] | null = null): Promise<LeaderboardRow[]> {
  const organizations = await getVisibleOrganizations(userId, organizationId, preResolvedOrgIds);
  if (organizations.length === 0) return [];

  const orgIds = organizations.map((o) => o.organization_id);
  const eventGroups = await prisma.tbl_event.groupBy({
    by: ['organization_id'],
    where: {
      organization_id: { in: orgIds },
      status: 'Approved',
    },
    _count: { event_id: true },
  });

  const pointsByOrg = new Map<number | null, number>(
    eventGroups.map((row) => [row.organization_id, row._count.event_id]),
  );

  const withPoints: LeaderboardRow[] = organizations.map((org) => ({
    organization_id: org.organization_id,
    organization_name: org.organization_name,
    total_points: toNumber(pointsByOrg.get(org.organization_id) ?? 0),
    rank: 0,
    category: org.category,
  }));

  withPoints.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    return a.organization_name.localeCompare(b.organization_name);
  });

  let lastPoints: number | null = null;
  let currentRank = 0;
  for (let i = 0; i < withPoints.length; i += 1) {
    if (withPoints[i].total_points !== lastPoints) {
      currentRank = i + 1;
      lastPoints = withPoints[i].total_points;
    }
    withPoints[i].rank = currentRank;
  }

  return withPoints.map((row) => ({
    ...row,
    organization_id: toNumber(row.organization_id),
    total_points: toNumber(row.total_points),
    rank: toNumber(row.rank),
  }));
}

export async function getLeaderboardsByCategory(
  userId: string,
  organizationId: number | null,
  preResolvedOrgIds: number[] | null = null,
): Promise<{ coCurricular: LeaderboardRow[]; extraCurricular: LeaderboardRow[] }> {
  const rows = await getLeaderboards(userId, organizationId, preResolvedOrgIds);
  return {
    coCurricular: rows.filter((row) => row.category === 'co_curricular'),
    extraCurricular: rows.filter((row) => row.category === 'extra_curricular'),
  };
}

export async function getOrganizationAnalytics(
  userId: string,
  organizationId: number | null,
  preResolvedOrgIds: number[] | null = null,
): Promise<OrganizationAnalyticsRow[]> {
  return getVisibleOrganizations(userId, organizationId, preResolvedOrgIds);
}

export async function getActivities(
  userId: string,
  organizationId: number | null,
  preResolvedOrgIds: number[] | null = null,
): Promise<ActivitiesRow[]> {
  const organizations = await getVisibleOrganizations(userId, organizationId, preResolvedOrgIds);
  if (organizations.length === 0) return [];

  const now = new Date();
  return Promise.all(
    organizations.map(async (org) => {
      const [completedCount, upcomingCount, recentEvents] = await Promise.all([
        prisma.tbl_event.count({
          where: {
            organization_id: org.organization_id,
            status: 'Approved',
            end_date: { lt: now },
          },
        }),
        prisma.tbl_event.count({
          where: {
            organization_id: org.organization_id,
            status: 'Approved',
            start_date: { gt: now },
          },
        }),
        prisma.tbl_event.findMany({
          where: {
            organization_id: org.organization_id,
            status: 'Approved',
          },
          select: {
            event_id: true,
            start_date: true,
            _count: {
              select: {
                tbl_event_attendance: {
                  where: { status: 'Attended' },
                },
              },
            },
          },
          orderBy: { start_date: 'desc' },
          take: 5,
        }),
      ]);

      const attendanceTrend = recentEvents
        .sort((a, b) => a.start_date.getTime() - b.start_date.getTime())
        .map((event) => ({
          event_id: toNumber(event.event_id),
          attended: toNumber(event._count.tbl_event_attendance),
        }));

      return {
        organization_id: toNumber(org.organization_id),
        organization_name: org.organization_name,
        completed_events: toNumber(completedCount),
        upcoming_events: toNumber(upcomingCount),
        attendance_trend: attendanceTrend,
      };
    }),
  );
}

export async function getOrganizationFinance(
  userId: string,
  organizationId: number | null,
  preResolvedOrgIds: number[] | null = null,
): Promise<FinanceRow[]> {
  const organizations = await getVisibleOrganizations(userId, organizationId, preResolvedOrgIds);
  if (organizations.length === 0) return [];

  const orgIds = organizations.map((o) => o.organization_id);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const transactions = await prisma.tbl_transaction.findMany({
    where: {
      status: 'Completed',
      transaction_date: {
        gte: start,
        lt: end,
      },
      tbl_organization_version: {
        organization_id: { in: orgIds },
      },
    },
    select: {
      amount: true,
      tbl_transaction_type: {
        select: { code: true },
      },
      tbl_organization_version: {
        select: { organization_id: true },
      },
    },
  });

  const byOrg = new Map<number, FinanceRow>();
  for (const org of organizations) {
    byOrg.set(org.organization_id, {
      organization_id: toNumber(org.organization_id),
      organization_name: org.organization_name,
      income_this_month: 0,
      expense_this_month: 0,
    });
  }

  for (const tx of transactions) {
    const orgId = tx.tbl_organization_version?.organization_id;
    if (!orgId || !byOrg.has(orgId)) continue;

    const row = byOrg.get(orgId)!;
    const amount = toNumber(tx.amount);
    const typeCode = String(tx.tbl_transaction_type?.code || '').toUpperCase();
    if (typeCode === 'INCOME') row.income_this_month += amount;
    if (typeCode === 'EXPENSE') row.expense_this_month += amount;
  }

  return Array.from(byOrg.values()).map((row) => ({
    ...row,
    organization_id: toNumber(row.organization_id),
    income_this_month: toNumber(row.income_this_month),
    expense_this_month: toNumber(row.expense_this_month),
  }));
}

export async function getMemberEngagement(
  userId: string,
  organizationId: number | null,
  preResolvedOrgIds: number[] | null = null,
): Promise<MemberEngagementRow[]> {
  const organizations = await getVisibleOrganizations(userId, organizationId, preResolvedOrgIds);
  if (organizations.length === 0) return [];

  const orgIds = organizations.map((o) => o.organization_id);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [registeredGroups, attendedRows] = await Promise.all([
    prisma.tbl_organization_members.groupBy({
      by: ['organization_id'],
      where: {
        organization_id: { in: orgIds },
        status: 'Active',
      },
      _count: { member_id: true },
    }),
    prisma.tbl_event_attendance.findMany({
      where: {
        status: 'Attended',
        time_in: { gte: ninetyDaysAgo },
        tbl_event: {
          organization_id: { in: orgIds },
        },
      },
      select: {
        user_id: true,
        tbl_event: {
          select: { organization_id: true },
        },
      },
    }),
  ]);

  const registeredByOrg = new Map<number, number>(
    registeredGroups.map((group) => [group.organization_id, group._count.member_id]),
  );

  const activeUsersByOrg = new Map<number, Set<string>>();
  for (const row of attendedRows) {
    const orgId = row.tbl_event?.organization_id;
    if (!orgId) continue;

    if (!activeUsersByOrg.has(orgId)) {
      activeUsersByOrg.set(orgId, new Set<string>());
    }
    activeUsersByOrg.get(orgId)!.add(row.user_id);
  }

  return organizations.map((org) => ({
    organization_id: toNumber(org.organization_id),
    organization_name: org.organization_name,
    registered_members: toNumber(registeredByOrg.get(org.organization_id) || 0),
    active_members: toNumber(activeUsersByOrg.get(org.organization_id)?.size || 0),
  }));
}
