/**
 * services/organizationsPageBroadcast.ts
 *
 * WebSocket emission helpers for the Organizations Page feature.
 *
 * Call these from any mutation endpoint (controllers, jobs, etc.) after
 * a change that affects what the Organizations Page shows.
 *
 * The frontend listens for:
 *   'organizations:updated'       → invalidate organizations list cache
 *   'activities:updated'          → invalidate recent activities cache
 *   'upcoming-events:updated'     → invalidate upcoming events cache
 *
 * Scoping rules (mirrors the REST endpoint scoping):
 *   - Global users (SDAO, Academic Director, Faculty) always notified
 *   - Dean of the org's college notified
 *   - Program Chair of the org's program(s) notified
 *   - Adviser of the org notified
 *   - Active members of the org notified
 *   - ALL students notified if event visibility = 'public'
 *   - Only member students notified if event visibility = 'organization'
 *
 * Room identity: user's EMAIL (Azure preferred_username) — NOT user_id.
 * This matches the pattern established in websocketService.ts.
 */

import { prisma } from '../config/db';
import { broadcastToUser, broadcastToPage, broadcastGlobal } from './websocketService';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collect all emails that should be notified about changes to a given org.
 * Mirrors the logic in dashboardModel.getAffectedEmails().
 */
async function getAffectedEmailsForOrg(orgId: number): Promise<Set<string>> {
  const affected = new Set<string>();

  const [globalUsers, org, orgCourses, activeMembers] = await Promise.all([
    // Academic Director, SDAO, Faculty — always notified (global viewers)
    prisma.tbl_user.findMany({
      where: {
        tbl_role: { role_name: { in: ['Academic Director', 'SDAO', 'Faculty'] } },
        status: 'Active',
      },
      select: { email: true },
    }),

    // The organization with adviser email
    prisma.tbl_organization.findUnique({
      where: { organization_id: orgId },
      include: {
        tbl_user_tbl_organization_adviser_idTotbl_user: { select: { email: true } },
      },
    }),

    // Programs linked to this org
    prisma.tbl_organization_course.findMany({
      where: { organization_id: orgId },
      include: { tbl_program: true },
    }),

    // Active members
    prisma.tbl_organization_members.findMany({
      where: { organization_id: orgId, status: 'Active' },
      include: { tbl_user: { select: { email: true } } },
      distinct: ['user_id'],
    }),
  ]);

  // Global users
  globalUsers.forEach((u) => affected.add(u.email));

  // Adviser
  const adviserEmail = org?.tbl_user_tbl_organization_adviser_idTotbl_user?.email;
  if (adviserEmail) affected.add(adviserEmail);

  // Active members
  activeMembers.forEach((m) => affected.add(m.tbl_user.email));

  // Program Chairs + Deans (second-level lookup)
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

  return affected;
}

// ---------------------------------------------------------------------------
// Public broadcast functions
// ---------------------------------------------------------------------------

/**
 * Emit 'organizations:updated' to all users affected by a change in the given org.
 *
 * Call this when:
 *   - A new organization is created
 *   - An organization's status changes (e.g. accreditation approved / rejected)
 *   - An organization is archived
 *
 * @param orgId  The organization_id that changed
 */
export async function broadcastOrganizationsUpdated(orgId: number): Promise<void> {
  try {
    const emails = await getAffectedEmailsForOrg(orgId);
    for (const email of emails) {
      broadcastToUser(email, 'organizations:updated', {});
    }
    console.log(
      `[OrgPageBroadcast] organizations:updated → ${emails.size} users (orgId=${orgId})`
    );
  } catch (err) {
    console.error('[OrgPageBroadcast] broadcastOrganizationsUpdated error:', err);
  }
}

/**
 * Emit 'activities:updated' to all users affected by a recent-activity change.
 *
 * Call this when:
 *   - A membership application is submitted / approved / rejected
 *   - An event proposal is submitted / approved / rejected
 *   - A member joins or leaves an organization
 *   - An officer position changes
 *   - An organization's status changes
 *
 * @param orgId  The organization_id where the activity occurred
 */
export async function broadcastActivitiesUpdated(orgId: number): Promise<void> {
  try {
    const emails = await getAffectedEmailsForOrg(orgId);
    for (const email of emails) {
      broadcastToUser(email, 'activities:updated', {});
    }
    console.log(
      `[OrgPageBroadcast] activities:updated → ${emails.size} users (orgId=${orgId})`
    );
  } catch (err) {
    console.error('[OrgPageBroadcast] broadcastActivitiesUpdated error:', err);
  }
}

/**
 * Emit 'upcoming-events:updated' to all users who should see a newly approved event.
 *
 * Call this when:
 *   - An event proposal is approved (the event is now upcoming)
 *   - An approved event is updated or cancelled
 *
 * @param orgId       The organization_id that owns the event
 * @param visibility  'public' → notify ALL students; 'organization' → notify only member students
 */
/**
 * Broadcast 'application-period:updated' to ALL authenticated sockets.
 *
 * This is global (not scoped to a page room) because multiple pages depend
 * on active-period data:
 *   - /organizations page (period overview + requirement assignment)
 *   - /starting-page   (Advisers applying for a new org)
 *
 * Call this after any period or requirement mutation.
 */
export async function broadcastApplicationPeriodUpdated(): Promise<void> {
  try {
    broadcastGlobal('application-period:updated', {});
    console.log('[OrgPageBroadcast] application-period:updated → all authenticated sockets');
  } catch (err) {
    console.error('[OrgPageBroadcast] broadcastApplicationPeriodUpdated error:', err);
  }
}

export async function broadcastUpcomingEventsUpdated(
  orgId: number,
  visibility: 'public' | 'organization' = 'organization'
): Promise<void> {
  try {
    const affected = await getAffectedEmailsForOrg(orgId);

    if (visibility === 'public') {
      // Public event: also notify ALL active students
      const allStudents = await prisma.tbl_user.findMany({
        where: {
          tbl_role: { role_name: 'Student' },
          status: 'Active',
        },
        select: { email: true },
      });
      allStudents.forEach((s) => affected.add(s.email));
    }

    for (const email of affected) {
      broadcastToUser(email, 'upcoming-events:updated', {});
    }
    console.log(
      `[OrgPageBroadcast] upcoming-events:updated → ${affected.size} users (orgId=${orgId}, visibility=${visibility})`
    );
  } catch (err) {
    console.error('[OrgPageBroadcast] broadcastUpcomingEventsUpdated error:', err);
  }
}
