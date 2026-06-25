/**
 * web/models/organizationsPageModel.ts
 *
 * Prisma-based queries for the Organizations Page endpoints:
 *   GET /api/web/organizations
 *   GET /api/web/organizations/recent-activities
 *   GET /api/web/organizations/upcoming-events
 *
 * Auth identity: tbl_user.email (Azure preferred_username).
 * All scope resolution is done server-side — the frontend receives only
 * what the user is allowed to see.
 *
 * Role → Scope mapping:
 *   Academic Director | SDAO | Faculty  → global  (no filter)
 *   Dean                                → college (orgs under his college(s))
 *   Program Chair                       → program (orgs under his program(s))
 *   Adviser                             → orgs they advise
 *   Student                             → orgs they are members of
 *     ↳ President of org               → sees ALL activity of that org
 *     ↳ Regular member                 → sees only their own activity
 *
 * Event visibility mapping (uses existing tbl_event.is_open_to field):
 *   'Open_to_all' | 'NU_Students_only' → 'public'
 *   'Members_only'                      → 'organization'
 */

import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLOBAL_ROLES = ['Academic Director', 'SDAO', 'Faculty'] as const;
type GlobalRole = (typeof GLOBAL_ROLES)[number];

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface UserRecord {
  user_id: string;
  role_name: string;
  program_id: number | null;
  program_name: string | null;
  college_id: number | null;
  college_name: string | null;
}

interface OrgScope {
  type: 'global' | 'college' | 'program' | 'organization';
  label: string;
}

interface ResolvedScope {
  scope: OrgScope;
  /** null = global (no filter);  number[] = only these org IDs */
  orgIds: number[] | null;
}

// ---------------------------------------------------------------------------
// Public return types
// ---------------------------------------------------------------------------

export interface OrganizationItem {
  id: number;
  version_id: number;
  name: string;
  slug: string | null;
  acronym: string | null;
  college: string | null;
  program: string | null;
  status: 'active' | 'pending' | 'inactive';
  memberCount: number;
  adviserName: string;
  logoUrl: string;
  category: string;
  versionCreatedAt: string | null; // ISO 8601 — when the current version was created
  org_role: 'executive' | 'committee' | 'member' | null;
  user_member_type: 'Executive' | 'Committee' | 'Member' | null;
}

export interface OrganizationsListResult {
  scope: { type: string; label: string };
  organizations: OrganizationItem[];
  total: number;
}

export interface ActivityItem {
  id: string; // composite key, e.g. "membership_app_123"
  type:
    | 'application_submitted'
    | 'application_approved'
    | 'application_rejected'
    | 'event_proposal_submitted'
    | 'event_proposal_approved'
    | 'event_proposal_rejected'
    | 'member_joined'
    | 'member_left'
    | 'org_status_changed'
    | 'officer_changed';
  organizationId: number;
  organizationName: string;
  description: string;
  performedBy: string;
  timestamp: string; // ISO 8601
}

export interface ActivitiesResult {
  activities: ActivityItem[];
  total: number;
  page: number;
  limit: number;
}

export interface UpcomingEventScheduleSlot {
  date: string;          // "YYYY-MM-DD"
  start_time: string;    // "HH:mm:ss"
  end_time: string;      // "HH:mm:ss"
  venue_ids: number[];
  venues: { id: number; name: string }[];
}

export interface UpcomingEventItem {
  id: number;
  event_id: number;
  title: string;
  status: string;
  image: string | null;
  organization_id: number | null;
  organization_version_id: number | null;
  organization_name: string | null;
  organization_logo: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;   // epoch-prefix ISO of first slot (fallback)
  end_time: string | null;     // epoch-prefix ISO of first slot (fallback)
  venue: string | null;
  venue_type: string | null;
  type: string | null;
  fee: number | null;
  is_open_to: string | null;
  location: string | null;
  visibility: 'public' | 'organization';
  schedules: UpcomingEventScheduleSlot[];
}

export interface UpcomingEventsResult {
  events: UpcomingEventItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Step 1 — Resolve user from email
// ---------------------------------------------------------------------------

export async function resolveUser(email: string): Promise<UserRecord> {
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

  const program = user.tbl_program_tbl_user_program_idTotbl_program;
  const college = program?.tbl_college ?? null;

  return {
    user_id: user.user_id,
    role_name: user.tbl_role.role_name ?? 'Student',
    program_id: program?.program_id ?? null,
    program_name: program?.name ?? null,
    college_id: college?.college_id ?? null,
    college_name: college?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Step 2 — Resolve org-ID scope for the user
// ---------------------------------------------------------------------------

async function resolveScope(user: UserRecord): Promise<ResolvedScope> {
  const { user_id, role_name, program_id, program_name, college_id, college_name } = user;

  // ── Global roles: see everything ────────────────────────────────────────
  if (GLOBAL_ROLES.includes(role_name as GlobalRole)) {
    return {
      scope: { type: 'global', label: 'All Organizations' },
      orgIds: null,
    };
  }

  // ── Dean → scoped to college ────────────────────────────────────────────
  if (role_name === 'Dean') {
    if (!college_id) {
      return { scope: { type: 'global', label: 'All Organizations' }, orgIds: null };
    }

    const orgCourses = await prisma.tbl_organization_course.findMany({
      where: { tbl_program: { college_id } },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });

    return {
      scope: {
        type: 'college',
        label: college_name ?? `College ${college_id}`,
      },
      orgIds: orgCourses.map((oc) => oc.organization_id),
    };
  }

  // ── Program Chair → scoped to program ──────────────────────────────────
  if (role_name === 'Program Chair') {
    if (!program_id) {
      return { scope: { type: 'global', label: 'All Organizations' }, orgIds: null };
    }

    const orgCourses = await prisma.tbl_organization_course.findMany({
      where: { program_id },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });

    return {
      scope: {
        type: 'program',
        label: program_name ?? `Program ${program_id}`,
      },
      orgIds: orgCourses.map((oc) => oc.organization_id),
    };
  }

  // ── Adviser → scoped to assigned orgs ──────────────────────────────────
  if (role_name === 'Adviser') {
    const orgs = await prisma.tbl_organization.findMany({
      where: { adviser_id: user_id },
      select: { organization_id: true, name: true },
    });

    return {
      scope: {
        type: 'organization',
        label: buildOrgLabel(orgs.map((o) => o.name)),
      },
      orgIds: orgs.map((o) => o.organization_id),
    };
  }

  // ── Student → scoped to member orgs ────────────────────────────────────
  if (role_name === 'Student') {
    const memberships = await prisma.tbl_organization_members.findMany({
      where: { user_id, status: 'Active' },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });

    const orgIds = memberships.map((m) => m.organization_id);
    const orgs = await prisma.tbl_organization.findMany({
      where: { organization_id: { in: orgIds } },
      select: { name: true },
    });

    return {
      scope: {
        type: 'organization',
        label: buildOrgLabel(orgs.map((o) => o.name)),
      },
      orgIds,
    };
  }

  // Fallback
  return { scope: { type: 'global', label: 'All Organizations' }, orgIds: null };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOrgLabel(names: string[]): string {
  if (names.length === 0) return 'No Organizations';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} + ${names.length - 3} more`;
}

function mapOrgStatus(
  status: string | null | undefined
): 'active' | 'pending' | 'inactive' {
  switch (status) {
    case 'Approved':
      return 'active';
    case 'Pending':
    case 'Renewal':
      return 'pending';
    case 'Rejected':
    case 'Archived':
    default:
      return 'inactive';
  }
}

function mapVisibility(isOpenTo: string | null | undefined): 'public' | 'organization' {
  return isOpenTo === 'Members_only' ? 'organization' : 'public';
}

function mapOrgCategory(category: string | null | undefined): string {
  switch (category) {
    case 'Co_Curricular_Organization':
      return 'Co-Curricular Organization';
    case 'Extra_Curricular_Organization':
      return 'Extra Curricular Organization';
    default:
      return category ?? 'Co-Curricular Organization';
  }
}

// ---------------------------------------------------------------------------
// Endpoint 1 — Organizations List
// ---------------------------------------------------------------------------

export async function getOrganizationsList(email: string): Promise<OrganizationsListResult> {
  const user = await resolveUser(email);
  const { scope, orgIds } = await resolveScope(user);

  const whereFilter = orgIds !== null 
    ? { organization_id: { in: orgIds }, status: { not: 'Archived' as const } } 
    : { status: { not: 'Archived' as const } };

  // Fetch orgs with adviser and course/program/college info
  const orgs = await prisma.tbl_organization.findMany({
    where: whereFilter,
    include: {
      // Adviser full name
      tbl_user_tbl_organization_adviser_idTotbl_user: {
        select: { f_name: true, l_name: true },
      },
      // Current version → category + created_at
      tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
        select: { category: true, created_at: true },
      },
      // Programs → college (take first for display)
      tbl_organization_course: {
        include: {
          tbl_program: {
            include: { tbl_college: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Active member count — tbl_organization_members is nested under
  // tbl_renewal_cycle, so we use a grouped count query instead
  const fetchedOrgIds = orgs.map((o) => o.organization_id);
  const memberCounts = await prisma.tbl_organization_members.groupBy({
    by: ['organization_id'],
    where: {
      organization_id: { in: fetchedOrgIds },
      status: 'Active',
    },
    _count: { member_id: true },
  });
  const memberCountMap = new Map(
    memberCounts.map((mc) => [mc.organization_id, mc._count.member_id])
  );

  // For students, build a per-org role map (executive > committee > member)
  const orgRoleMap = new Map<number, 'executive' | 'committee' | 'member'>();
  if (user.role_name === 'Student') {
    // Executive memberships: tbl_organization_members with an executive_role_id set
    const execMemberships = await prisma.tbl_organization_members.findMany({
      where: {
        user_id: user.user_id,
        status: 'Active',
        organization_id: { in: fetchedOrgIds },
        executive_role_id: { not: null },
      },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });
    for (const m of execMemberships) orgRoleMap.set(m.organization_id, 'executive');

    // Committee memberships (only if not already marked executive)
    const committeeMemberships = await prisma.tbl_committee_members.findMany({
      where: {
        user_id: user.user_id,
        tbl_committee: { organization_id: { in: fetchedOrgIds } },
      },
      select: { tbl_committee: { select: { organization_id: true } } },
    });
    for (const cm of committeeMemberships) {
      const orgId = cm.tbl_committee.organization_id;
      if (!orgRoleMap.has(orgId)) orgRoleMap.set(orgId, 'committee');
    }

    // Any remaining active memberships are plain members
    for (const orgId of fetchedOrgIds) {
      if (!orgRoleMap.has(orgId)) orgRoleMap.set(orgId, 'member');
    }
  }

  const organizations: OrganizationItem[] = orgs.map((org) => {
    const adviser = org.tbl_user_tbl_organization_adviser_idTotbl_user;
    const adviserName =
      adviser?.f_name && adviser?.l_name
        ? `${adviser.l_name}, ${adviser.f_name}`
        : adviser?.f_name ?? adviser?.l_name ?? 'Not Assigned';

    const currentVersion =
      org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
    const category = mapOrgCategory(currentVersion?.category?.toString());
    const versionCreatedAt = currentVersion?.created_at?.toISOString() ?? null;
    const firstCourse = org.tbl_organization_course[0];
    const collegeName = firstCourse?.tbl_program?.tbl_college?.abbreviation ?? null;
    const programName = firstCourse?.tbl_program?.name ?? null;

    // Derive acronym from org name uppercase initials as fallback
    const rawAcronym = org.name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .toUpperCase();

    return {
      id: org.organization_id,
      version_id: org.current_org_version_id,
      name: org.name,
      slug: org.slug ?? null,
      acronym: rawAcronym || null,
      college: collegeName,
      program: programName,
      status: mapOrgStatus(org.status?.toString()),
      memberCount: memberCountMap.get(org.organization_id) ?? 0,
      adviserName,
      logoUrl: `/organizations/${org.organization_id}/logo`,
      category,
      versionCreatedAt,
      org_role: orgRoleMap.get(org.organization_id) ?? null,
      user_member_type: (() => {
        const r = orgRoleMap.get(org.organization_id);
        if (r === 'executive') return 'Executive';
        if (r === 'committee') return 'Committee';
        if (r === 'member') return 'Member';
        return null;
      })(),
    };
  });

  return {
    scope: { type: scope.type, label: scope.label },
    organizations,
    total: organizations.length,
  };
}

// ---------------------------------------------------------------------------
// Endpoint 2 — Recent Activities
// ---------------------------------------------------------------------------

export async function getRecentActivities(
  email: string,
  page: number,
  limit: number
): Promise<ActivitiesResult> {
  const user = await resolveUser(email);
  const { scope, orgIds } = await resolveScope(user);

  // For students, also check which orgs they are president of
  let presidentOrgIds: number[] = [];
  let isStudent = user.role_name === 'Student';

  if (isStudent && orgIds && orgIds.length > 0) {
    const presidentCycles = await prisma.tbl_renewal_cycle.findMany({
      where: {
        organization_id: { in: orgIds },
        president_id: user.user_id,
      },
      select: { organization_id: true },
      distinct: ['organization_id'],
    });
    presidentOrgIds = presidentCycles.map((c) => c.organization_id);
  }

  // Build the org filter clause for non-student queries
  const orgWhereClause = orgIds !== null ? { organization_id: { in: orgIds } } : {};

  // Fetch org name map for activity descriptions
  const orgFilter = orgIds !== null ? { organization_id: { in: orgIds } } : {};
  const orgList = await prisma.tbl_organization.findMany({
    where: orgFilter,
    select: { organization_id: true, name: true },
  });
  const orgNameMap = new Map(orgList.map((o) => [o.organization_id, o.name]));

  const activities: ActivityItem[] = [];

  // ── 1. Membership applications ──────────────────────────────────────────
  let membershipApps;

  if (isStudent && orgIds !== null) {
    // For student: if president → all apps in that org; else → only their own apps
    const allApps = await prisma.tbl_membership_application.findMany({
      where: { organization_id: { in: orgIds } },
      include: {
        tbl_user_tbl_membership_application_user_idTotbl_user: {
          select: { f_name: true, l_name: true },
        },
        tbl_user_tbl_membership_application_reviewed_byTotbl_user: {
          select: { f_name: true, l_name: true },
        },
      },
      orderBy: [{ reviewed_at: 'desc' }, { applied_at: 'desc' }],
    });

    // Filter: president sees all of their org; regular member sees only their own
    membershipApps = allApps.filter((app) => {
      const isPresident = presidentOrgIds.includes(app.organization_id);
      return isPresident || app.user_id === user.user_id;
    });
  } else {
    membershipApps = await prisma.tbl_membership_application.findMany({
      where: orgWhereClause,
      include: {
        tbl_user_tbl_membership_application_user_idTotbl_user: {
          select: { f_name: true, l_name: true },
        },
        tbl_user_tbl_membership_application_reviewed_byTotbl_user: {
          select: { f_name: true, l_name: true },
        },
      },
      orderBy: [{ reviewed_at: 'desc' }, { applied_at: 'desc' }],
    });
  }

  for (const app of membershipApps) {
    const applicant = app.tbl_user_tbl_membership_application_user_idTotbl_user;
    const reviewer = app.tbl_user_tbl_membership_application_reviewed_byTotbl_user;
    const applicantName = applicant
      ? `${applicant.l_name ?? ''}, ${applicant.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'Unknown';
    const reviewerName = reviewer
      ? `${reviewer.l_name ?? ''}, ${reviewer.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'System';
    const orgName = orgNameMap.get(app.organization_id) ?? `Org #${app.organization_id}`;

    // Submitted activity
    activities.push({
      id: `membership_app_${app.application_id}_submitted`,
      type: 'application_submitted',
      organizationId: app.organization_id,
      organizationName: orgName,
      description: `${applicantName}'s membership application was submitted.`,
      performedBy: applicantName,
      timestamp: (app.applied_at ?? new Date()).toISOString(),
    });

    // Status change activity
    if (app.status === 'Approved' && app.reviewed_at) {
      activities.push({
        id: `membership_app_${app.application_id}_approved`,
        type: 'application_approved',
        organizationId: app.organization_id,
        organizationName: orgName,
        description: `${applicantName}'s membership application was approved.`,
        performedBy: reviewerName,
        timestamp: app.reviewed_at.toISOString(),
      });
    } else if (app.status === 'Rejected' && app.reviewed_at) {
      activities.push({
        id: `membership_app_${app.application_id}_rejected`,
        type: 'application_rejected',
        organizationId: app.organization_id,
        organizationName: orgName,
        description: `${applicantName}'s membership application was rejected.`,
        performedBy: reviewerName,
        timestamp: app.reviewed_at.toISOString(),
      });
    }
  }

  // ── 2. Event applications (proposals) ───────────────────────────────────
  let eventApps;

  if (isStudent && orgIds !== null) {
    const allEventApps = await prisma.tbl_event_application.findMany({
      where: { organization_id: { in: orgIds } },
      include: {
        tbl_user: { select: { f_name: true, l_name: true } },
        tbl_event: { select: { title: true } },
        tbl_event_approval_process: {
          orderBy: { approved_at: 'desc' },
          take: 1,
          include: { tbl_user: { select: { f_name: true, l_name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    eventApps = allEventApps.filter((ea) => {
      const isPresident = presidentOrgIds.includes(ea.organization_id);
      return isPresident || ea.applicant_user_id === user.user_id;
    });
  } else {
    eventApps = await prisma.tbl_event_application.findMany({
      where: orgIds !== null ? { organization_id: { in: orgIds } } : {},
      include: {
        tbl_user: { select: { f_name: true, l_name: true } },
        tbl_event: { select: { title: true } },
        tbl_event_approval_process: {
          orderBy: { approved_at: 'desc' },
          take: 1,
          include: { tbl_user: { select: { f_name: true, l_name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  for (const ea of eventApps) {
    const proposer = ea.tbl_user;
    const proposerName = proposer
      ? `${proposer.l_name ?? ''}, ${proposer.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'Unknown';
    const eventTitle = ea.tbl_event?.title ?? 'an event';
    const orgName = orgNameMap.get(ea.organization_id) ?? `Org #${ea.organization_id}`;
    const lastApproval = ea.tbl_event_approval_process[0];
    const approverName = lastApproval?.tbl_user
      ? `${lastApproval.tbl_user.l_name ?? ''}, ${lastApproval.tbl_user.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'System';

    // Submitted
    activities.push({
      id: `event_app_${ea.event_application_id}_submitted`,
      type: 'event_proposal_submitted',
      organizationId: ea.organization_id,
      organizationName: orgName,
      description: `${proposerName} submitted an event proposal for "${eventTitle}".`,
      performedBy: proposerName,
      timestamp: (ea.created_at ?? new Date()).toISOString(),
    });

    if (ea.status === 'Approved' && lastApproval?.approved_at) {
      activities.push({
        id: `event_app_${ea.event_application_id}_approved`,
        type: 'event_proposal_approved',
        organizationId: ea.organization_id,
        organizationName: orgName,
        description: `The event proposal for "${eventTitle}" was approved.`,
        performedBy: approverName,
        timestamp: lastApproval.approved_at.toISOString(),
      });
    } else if (ea.status === 'Rejected' && lastApproval?.approved_at) {
      activities.push({
        id: `event_app_${ea.event_application_id}_rejected`,
        type: 'event_proposal_rejected',
        organizationId: ea.organization_id,
        organizationName: orgName,
        description: `The event proposal for "${eventTitle}" was rejected.`,
        performedBy: approverName,
        timestamp: lastApproval.approved_at.toISOString(),
      });
    }
  }

  // ── 3. Member joins ──────────────────────────────────────────────────────
  let memberJoins;

  if (isStudent && orgIds !== null) {
    const allJoins = await prisma.tbl_organization_members.findMany({
      where: { organization_id: { in: orgIds } },
      include: { tbl_user: { select: { f_name: true, l_name: true } } },
      orderBy: { joined_at: 'desc' },
    });

    memberJoins = allJoins.filter((m) => {
      const isPresident = presidentOrgIds.includes(m.organization_id);
      return isPresident || m.user_id === user.user_id;
    });
  } else {
    memberJoins = await prisma.tbl_organization_members.findMany({
      where: orgIds !== null ? { organization_id: { in: orgIds } } : {},
      include: { tbl_user: { select: { f_name: true, l_name: true } } },
      orderBy: { joined_at: 'desc' },
    });
  }

  for (const m of memberJoins) {
    if (!m.joined_at) continue;
    const memberName = m.tbl_user
      ? `${m.tbl_user.l_name ?? ''}, ${m.tbl_user.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'Unknown';
    const orgName = orgNameMap.get(m.organization_id) ?? `Org #${m.organization_id}`;

    activities.push({
      id: `member_joined_${m.member_id}`,
      type: 'member_joined',
      organizationId: m.organization_id,
      organizationName: orgName,
      description: `${memberName} joined ${orgName}.`,
      performedBy: memberName,
      timestamp: m.joined_at.toISOString(),
    });
  }

  // ── 4. Member leaves ─────────────────────────────────────────────────────
  let leaveApps;

  if (isStudent && orgIds !== null) {
    const allLeaves = await prisma.tbl_membership_leave_application.findMany({
      where: { organization_id: { in: orgIds }, status: 'Approved' },
      include: {
        tbl_user_tbl_membership_leave_application_user_idTotbl_user: {
          select: { f_name: true, l_name: true },
        },
      },
      orderBy: { reviewed_at: 'desc' },
    });

    leaveApps = allLeaves.filter((la) => {
      const isPresident = presidentOrgIds.includes(la.organization_id);
      return isPresident || la.user_id === user.user_id;
    });
  } else {
    leaveApps = await prisma.tbl_membership_leave_application.findMany({
      where: orgIds !== null
        ? { organization_id: { in: orgIds }, status: 'Approved' }
        : { status: 'Approved' },
      include: {
        tbl_user_tbl_membership_leave_application_user_idTotbl_user: {
          select: { f_name: true, l_name: true },
        },
      },
      orderBy: { reviewed_at: 'desc' },
    });
  }

  for (const la of leaveApps) {
    if (!la.reviewed_at) continue;
    const leavingUser = la.tbl_user_tbl_membership_leave_application_user_idTotbl_user;
    const userName = leavingUser
      ? `${leavingUser.l_name ?? ''}, ${leavingUser.f_name ?? ''}`.trim().replace(/^,\s*/, '')
      : 'Unknown';
    const orgName = orgNameMap.get(la.organization_id) ?? `Org #${la.organization_id}`;

    activities.push({
      id: `member_left_${la.leave_application_id}`,
      type: 'member_left',
      organizationId: la.organization_id,
      organizationName: orgName,
      description: `${userName} left ${orgName}.`,
      performedBy: userName,
      timestamp: la.reviewed_at.toISOString(),
    });
  }

  // ── Sort by timestamp DESC, paginate ─────────────────────────────────────
  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const total = activities.length;
  const offset = (page - 1) * limit;
  const paginated = activities.slice(offset, offset + limit);

  return { activities: paginated, total, page, limit };
}

// ---------------------------------------------------------------------------
// Endpoint 3 — Upcoming Events
// ---------------------------------------------------------------------------

export async function getUpcomingEvents(email: string): Promise<UpcomingEventsResult> {
  const user = await resolveUser(email);
  const { orgIds } = await resolveScope(user);

  const now = new Date();

  // Base filter: approved + in the future
  const baseWhere = {
    start_date: { gte: now },
    status: 'Approved' as const,
  };

  let events;

  const scheduleInclude = {
    tbl_event_schedule: {
      include: {
        tbl_event_schedule_venue: {
          include: { tbl_venue: { select: { venue_id: true, name: true } } },
        },
      },
      orderBy: [{ date: 'asc' as const }, { start_time: 'asc' as const }],
    },
  };

  const orgInclude = {
    tbl_organization: {
      select: {
        name: true,
        current_org_version_id: true,
      },
    },
  };

  if (user.role_name === 'Student') {
    // Students see: public events OR org-specific events if they're a member
    const studentOrgIds = orgIds ?? [];

    events = await prisma.tbl_event.findMany({
      where: {
        ...baseWhere,
        OR: [
          // Public: Open_to_all or NU_Students_only
          { is_open_to: { in: ['Open_to_all', 'NU_Students_only'] } },
          // Org-specific: Members_only AND student is a member of that org
          {
            is_open_to: 'Members_only',
            organization_id: { in: studentOrgIds },
          },
        ],
      },
      include: { ...scheduleInclude, ...orgInclude },
      orderBy: { start_date: 'asc' },
    });
  } else if (orgIds !== null) {
    // Scoped roles (Dean, Program Chair, Adviser)
    events = await prisma.tbl_event.findMany({
      where: {
        ...baseWhere,
        organization_id: { in: orgIds },
      },
      include: { ...scheduleInclude, ...orgInclude },
      orderBy: { start_date: 'asc' },
    });
  } else {
    // Global roles (Academic Director, SDAO, Faculty) — see all
    events = await prisma.tbl_event.findMany({
      where: baseWhere,
      include: { ...scheduleInclude, ...orgInclude },
      orderBy: { start_date: 'asc' },
    });
  }

  const mapped: UpcomingEventItem[] = events.map((ev) => {
    const slots = ev.tbl_event_schedule;
    const firstSlot = slots[0] ?? null;

    const schedules: UpcomingEventScheduleSlot[] = slots.map((s) => {
      const venueLinks = s.tbl_event_schedule_venue;
      return {
        date: s.date.toISOString().slice(0, 10),
        start_time: s.start_time instanceof Date
          ? `${String(s.start_time.getUTCHours()).padStart(2, '0')}:${String(s.start_time.getUTCMinutes()).padStart(2, '0')}:${String(s.start_time.getUTCSeconds()).padStart(2, '0')}`
          : String(s.start_time),
        end_time: s.end_time instanceof Date
          ? `${String(s.end_time.getUTCHours()).padStart(2, '0')}:${String(s.end_time.getUTCMinutes()).padStart(2, '0')}:${String(s.end_time.getUTCSeconds()).padStart(2, '0')}`
          : String(s.end_time),
        venue_ids: venueLinks.map((v) => v.tbl_venue.venue_id),
        venues: venueLinks.map((v) => ({ id: v.tbl_venue.venue_id, name: v.tbl_venue.name })),
      };
    });

    return {
      id: ev.event_id,
      event_id: ev.event_id,
      title: ev.title,
      status: ev.status?.toString() ?? 'Approved',
      image: ev.image ?? null,
      organization_id: ev.organization_id ?? null,
      organization_version_id: ev.tbl_organization?.current_org_version_id ?? null,
      organization_name: ev.tbl_organization?.name ?? null,
      organization_logo: ev.organization_id ? `/api/web/organizations/${ev.organization_id}/logo` : null,
      start_date: ev.start_date.toISOString(),
      end_date: ev.end_date.toISOString(),
      start_time: firstSlot ? firstSlot.start_time.toISOString() : null,
      end_time: firstSlot ? firstSlot.end_time.toISOString() : null,
      venue: ev.venue ?? null,
      venue_type: ev.venue_type?.toString() ?? null,
      type: ev.type?.toString() ?? null,
      fee: ev.fee ?? null,
      is_open_to: ev.is_open_to?.toString() ?? null,
      location: ev.venue ?? null,
      visibility: mapVisibility(ev.is_open_to?.toString()),
      schedules,
    };
  });

  return { events: mapped, total: mapped.length };
}

// ---------------------------------------------------------------------------
// Logo — GET /api/web/organizations/:orgId/logo
// ---------------------------------------------------------------------------

export interface OrgLogoInfo {
  versionId: number;
  logoPath: string;
}

/**
 * Fetches the current logo path for an organisation.
 * Reads from tbl_organization_version via current_org_version_id.
 * Returns null if the org does not exist or has no logo.
 */
export async function getOrgLogoPath(orgId: number): Promise<OrgLogoInfo | null> {
  const org = await prisma.tbl_organization.findUnique({
    where: { organization_id: orgId },
    select: {
      current_org_version_id: true,
      tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
        select: { logo_path: true },
      },
    },
  });

  if (!org) return null;

  const version =
    org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
  const logoPath = version?.logo_path ?? null;

  if (!logoPath) return null;

  return { versionId: org.current_org_version_id, logoPath };
}

// ---------------------------------------------------------------------------
// Update Adviser
// ---------------------------------------------------------------------------

export interface UpdateAdviserResult {
  organization_id: number;
  organization_name: string;
  old_adviser: { user_id: string; email: string; full_name: string } | null;
  new_adviser: { user_id: string; email: string; full_name: string };
}

/**
 * Change the adviser assigned to an organisation.
 *
 * Validates:
 *   1. Organisation exists
 *   2. New adviser user exists and has the 'Adviser' role
 *   3. New adviser is different from the current adviser
 *
 * Returns old + new adviser info for cache invalidation & notifications.
 */
export async function updateAdviser(
  organizationId: number,
  newAdviserUserId: string,
): Promise<UpdateAdviserResult> {
  // 1. Validate the organisation exists
  const org = await prisma.tbl_organization.findUnique({
    where: { organization_id: organizationId },
    select: {
      organization_id: true,
      name: true,
      adviser_id: true,
      tbl_user_tbl_organization_adviser_idTotbl_user: {
        select: { user_id: true, email: true, f_name: true, l_name: true },
      },
    },
  });

  if (!org) throw new Error('ORGANIZATION_NOT_FOUND');

  // 2. Validate the new adviser
  const newAdviser = await prisma.tbl_user.findUnique({
    where: { user_id: newAdviserUserId },
    select: {
      user_id: true,
      email: true,
      f_name: true,
      l_name: true,
      tbl_role: { select: { role_name: true } },
    },
  });

  if (!newAdviser) throw new Error('ADVISER_USER_NOT_FOUND');
  if (newAdviser.tbl_role.role_name !== 'Adviser') {
    throw new Error('USER_IS_NOT_ADVISER');
  }

  // 3. Cannot reassign to the same adviser
  if (org.adviser_id === newAdviserUserId) {
    throw new Error('SAME_ADVISER');
  }

  // 4. Build old adviser info
  const oldAdviserUser = org.tbl_user_tbl_organization_adviser_idTotbl_user;
  const oldAdviser = oldAdviserUser
    ? {
        user_id: oldAdviserUser.user_id,
        email: oldAdviserUser.email,
        full_name: `${oldAdviserUser.f_name ?? ''} ${oldAdviserUser.l_name ?? ''}`.trim(),
      }
    : null;

  // 5. Update the organisation
  await prisma.tbl_organization.update({
    where: { organization_id: organizationId },
    data: { adviser_id: newAdviserUserId },
  });

  return {
    organization_id: organizationId,
    organization_name: org.name,
    old_adviser: oldAdviser,
    new_adviser: {
      user_id: newAdviser.user_id,
      email: newAdviser.email,
      full_name: `${newAdviser.f_name ?? ''} ${newAdviser.l_name ?? ''}`.trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Get org by slug — for direct URL access / bookmark / page refresh
// ---------------------------------------------------------------------------

export async function getOrgBySlug(slug: string): Promise<{
  org_id: number;
  org_version_id: number | null;
  org_name: string;
  slug: string;
  organization_status: string;
} | null> {
  const numericId = /^\d+$/.test(slug) ? parseInt(slug, 10) : undefined;

  const org = await prisma.tbl_organization.findFirst({
    where: {
      OR: [
        { slug },
        ...(numericId ? [{ organization_id: numericId }] : [])
      ]
    },
    select: {
      organization_id: true,
      name: true,
      slug: true,
      status: true,
      current_org_version_id: true,
    },
  });

  if (!org) return null;

  return {
    org_id: org.organization_id,
    org_version_id: org.current_org_version_id ?? null,
    org_name: org.name ?? '',
    slug: org.slug ?? slug,
    organization_status: org.status ?? 'pending',
  };
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/dashboard
// ---------------------------------------------------------------------------

export async function getOrgDashboard(orgId: number): Promise<{
  total_members: number;
  total_post_event_requirements_submitted: number;
  total_approved_events: number;
  total_upcoming_events: number;
  total_event_applications: number;
  total_org_applications: number;
}> {
  const now = new Date();

  // Find the latest renewal cycle for this org
  const latestCycle = await prisma.tbl_renewal_cycle.findFirst({
    where: { organization_id: orgId },
    orderBy: { cycle_number: 'desc' },
    select: { cycle_number: true },
  });
  const cycleNumber = latestCycle?.cycle_number ?? 0;

  const [
    total_members,
    total_approved_events,
    total_upcoming_events,
    total_event_applications,
    total_org_applications,
    postEventSubmissions,
  ] = await Promise.all([
    prisma.tbl_organization_members.count({
      where: { organization_id: orgId, cycle_number: cycleNumber, status: 'Active' },
    }),
    prisma.tbl_event.count({
      where: { organization_id: orgId, status: 'Approved' },
    }),
    prisma.tbl_event.count({
      where: { organization_id: orgId, status: 'Approved', start_date: { gte: now } },
    }),
    prisma.tbl_event_application.count({
      where: { organization_id: orgId, cycle_number: cycleNumber },
    }),
    prisma.tbl_application.count({
      where: { organization_id: orgId },
    }),
    prisma.tbl_event_requirement_submissions.findMany({
      where: { organization_id: orgId },
      select: { event_id: true, file_path: true, tbl_event_application_requirement: { select: { is_applicable_to: true } } },
    }),
  ]);

  // Count distinct events with >=1 post-event submission that has a file
  const postEventEventIds = new Set(
    postEventSubmissions
      .filter(
        (s) =>
          s.tbl_event_application_requirement.is_applicable_to === 'post_event' &&
          s.file_path != null &&
          s.event_id != null,
      )
      .map((s) => s.event_id!),
  );

  return {
    total_members,
    total_post_event_requirements_submitted: postEventEventIds.size,
    total_approved_events,
    total_upcoming_events,
    total_event_applications,
    total_org_applications,
  };
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/applications
// ---------------------------------------------------------------------------

export async function getOrgApplications(orgId: number): Promise<any[]> {
  const applications = await prisma.tbl_application.findMany({
    where: { organization_id: orgId },
    orderBy: { created_at: 'desc' },
    include: {
      tbl_user_tbl_application_applicant_user_idTotbl_user: {
        select: { f_name: true, l_name: true, email: true },
      },
    },
  });

  return applications.map((a) => ({
    application_id: a.application_id,
    submitted_org_name: a.submitted_org_name,
    application_type: a.application_type,
    status: a.status,
    created_at: a.created_at?.toISOString() ?? null,
    applicant_first_name: a.tbl_user_tbl_application_applicant_user_idTotbl_user.f_name ?? '',
    applicant_last_name:  a.tbl_user_tbl_application_applicant_user_idTotbl_user.l_name ?? '',
    applicant_email:      a.tbl_user_tbl_application_applicant_user_idTotbl_user.email,
    cycle_number: a.cycle_number,
    period_id: a.period_id,
    application_period_id: a.period_id,
    app_period_id: a.period_id,
  }));
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/event-submissions
// ---------------------------------------------------------------------------

export async function getOrgEventSubmissions(orgId: number): Promise<any[]> {
  const submissions = await prisma.tbl_event_requirement_submissions.findMany({
    where: { organization_id: orgId },
    select: {
      event_id: true,
      file_path: true,
      tbl_event_application_requirement: { select: { is_applicable_to: true } },
    },
  });

  return submissions.map((s) => ({
    event_id: s.event_id,
    is_applicable_to: s.tbl_event_application_requirement.is_applicable_to ?? 'pre_event',
    file_path: s.file_path ?? null,
  }));
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/renewal-status
// ---------------------------------------------------------------------------

export async function getOrgRenewalStatus(orgId: number): Promise<{
  result: {
    current_org_version_id: number | null;
    show_renewal: boolean;
    pending_application: boolean;
    already_renewed: boolean;
    latest_application_id: number | null;
    latest_application_status: string | null;
    recently_approved: boolean;
  };
}> {
  const [org, latestApp, activePeriod] = await Promise.all([
    prisma.tbl_organization.findUnique({
      where: { organization_id: orgId },
      select: { current_org_version_id: true, status: true },
    }),
    prisma.tbl_application.findFirst({
      where: { organization_id: orgId, application_type: 'renewal' },
      orderBy: { created_at: 'desc' },
      select: { application_id: true, status: true, period_id: true, updated_at: true },
    }),
    prisma.tbl_application_period.findFirst({
      where: { is_active: true },
      select: { period_id: true },
    }),
  ]);

  const isApprovedOrg = org?.status === 'Approved';
  const pendingApplication =
    latestApp?.status === 'Pending' && latestApp?.period_id === activePeriod?.period_id;
  const alreadyRenewed =
    latestApp?.status === 'Approved' && latestApp?.period_id === activePeriod?.period_id;
  const recentlyApproved =
    alreadyRenewed && latestApp?.updated_at != null
      ? Date.now() - new Date(latestApp.updated_at).getTime() < 7 * 24 * 60 * 60 * 1000
      : false;
  const showRenewal = isApprovedOrg && !pendingApplication && !alreadyRenewed && activePeriod != null;

  return {
    result: {
      current_org_version_id: org?.current_org_version_id ?? null,
      show_renewal: showRenewal,
      pending_application: pendingApplication,
      already_renewed: alreadyRenewed,
      latest_application_id: latestApp?.application_id ?? null,
      latest_application_status: latestApp?.status ?? null,
      recently_approved: recentlyApproved,
    },
  };
}

// ---------------------------------------------------------------------------
// Archive / Restore Organization
// ---------------------------------------------------------------------------

export async function getArchivedOrganizations(email: string) {
  const user = await resolveUser(email);
  const { orgIds } = await resolveScope(user);

  const whereFilter = orgIds !== null ? { organization_id: { in: orgIds } } : {};

  const orgs = await prisma.tbl_organization.findMany({
    where: { ...whereFilter, status: 'Archived' },
    include: {
      tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
        select: { category: true },
      },
      tbl_organization_course: {
        include: { tbl_program: true },
      },
    },
    orderBy: { archived_at: 'desc' },
  });

  const organizations = orgs.map((org) => {
    const currentVersion =
      org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
    const firstCourse = org.tbl_organization_course[0];
    const programName = firstCourse?.tbl_program?.name ?? null;
    const category = currentVersion?.category?.toString() ?? null;

    return {
      id: org.organization_id,
      organization_id: org.organization_id,
      organization_name: org.name,
      slug: org.slug ?? null,
      program_name: programName,
      category,
      current_org_version_id: org.current_org_version_id,
      archived_at: org.archived_at?.toISOString() ?? null,
      archived_reason: org.archived_reason ?? null,
    };
  });

  return { organizations, total: organizations.length };
}

export async function archiveOrganization(params: {
  organizationId: number;
  reason: string;
  archivedBy: string;
}) {
  const { organizationId, reason, archivedBy } = params;

  const org = await prisma.tbl_organization.findUnique({
    where: { organization_id: organizationId },
    select: { status: true },
  });

  if (!org) throw new Error('ORG_NOT_FOUND');
  if (org.status === 'Archived') throw new Error('ORG_ALREADY_ARCHIVED');

  await prisma.tbl_organization.update({
    where: { organization_id: organizationId },
    data: {
      status: 'Archived',
      archived_at: new Date(),
      archived_by: archivedBy,
      archived_reason: reason,
    },
  });
}

export async function restoreOrganization(params: {
  organizationId: number;
}) {
  const { organizationId } = params;

  const org = await prisma.tbl_organization.findUnique({
    where: { organization_id: organizationId },
    select: { status: true },
  });

  if (!org) throw new Error('ORG_NOT_FOUND');
  if (org.status !== 'Archived') throw new Error('ORG_NOT_ARCHIVED');

  await prisma.tbl_organization.update({
    where: { organization_id: organizationId },
    data: {
      status: 'Approved',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    },
  });
}
