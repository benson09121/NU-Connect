/**
 * web/controllers/orgHubController.ts
 *
 * Handlers for:
 *   GET  /organizations/:orgId/hub          — full org hub snapshot
 *   POST /add-executive-member
 *   PUT  /update-executive-member
 *   POST /archive-executive-member
 *   POST /create-committee
 *   PUT  /update-committee
 *   POST /archive-committee
 *   POST /add-committee-member
 *   PUT  /update-committee-member
 *   POST /archive-committee-member
 *   POST /archive-organization-member
 *   POST /approve-membership-application
 *   POST /reject-membership-application
 *
 * All mutation handlers emit a Socket.IO event to the org-detail room
 * (rooms.orgDetail(orgId)) after a successful write.
 */

import { Request, Response } from 'express';
import { broadcastToOrgDetail } from '../../services/websocketService';
import * as model from '../models/orgHubModel';

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Emit to org-detail room with a standard payload. */
function broadcastOrg(
  orgId: number,
  orgVersionId: number,
  event: string
): void {
  broadcastToOrgDetail(orgId, event, { org_id: orgId, org_version_id: orgVersionId });
  broadcastToOrgDetail(orgId, 'org:hub:updated', { org_id: orgId, org_version_id: orgVersionId });
}

/** Return the caller's email from the middleware-attached user. */
function callerEmail(req: Request): string {
  return (req.user?.email as string | undefined) ?? 'system';
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/hub?org_version_id=Y
// ---------------------------------------------------------------------------

export async function getOrgHub(req: Request, res: Response): Promise<void> {
  try {
    const orgId = parseInt(req.params.orgId as string, 10);
    const orgVersionId = parseInt(req.query.org_version_id as string, 10);

    if (isNaN(orgId) || isNaN(orgVersionId)) {
      res.status(400).json({ success: false, error: 'Invalid orgId or org_version_id.' });
      return;
    }

    let cycleNumber: number;
    try {
      cycleNumber = await model.getCycleNumber(orgId, orgVersionId);
    } catch {
      res.status(404).json({
        success: false,
        error: 'No renewal cycle found for this organization version.',
      });
      return;
    }

    const [
      officers,
      members,
      committees,
      committeeMembers,
      pendingMembers,
      archivedMembers,
      leaveApplications,
      termPayments,
    ] = await Promise.all([
      model.getOfficers(orgVersionId),
      model.getMembers(orgVersionId),
      model.getCommittees(orgId, cycleNumber),
      model.getCommitteeMembers(orgId, cycleNumber),
      model.getPendingApplications(orgId, cycleNumber),
      model.getArchivedMembers(orgId, cycleNumber),
      model.getLeaveApplications(orgId, cycleNumber),
      model.getTermPayments(orgId, orgVersionId),
    ]);

    res.json({
      officers,
      members,
      committees,
      committeeMembers,
      pendingMembers,
      archivedMembers,
      leaveApplications,
      termPayments,
    });
  } catch (err) {
    console.error('[getOrgHub] error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// ===========================================================================
// Executive Officers
// ===========================================================================

// POST /add-executive-member
// Body: { email, program_name, role_title, rank_level, action_by_email, orgId, orgVersionId }
export async function addExecutiveMember(req: Request, res: Response): Promise<void> {
  try {
    const {
      email,
      role_title,
      rank_level,
      orgId,
      orgVersionId,
    }: {
      email: string;
      role_title: string;
      rank_level: number;
      orgId: number;
      orgVersionId: number;
    } = req.body;

    if (!email || !role_title || rank_level == null || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    const user = await model.getUserByEmail(email);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const rank = await model.getRankByLevel(Number(rank_level));
    if (!rank) {
      res.status(404).json({ success: false, error: 'Rank level not found.' });
      return;
    }

    let cycleNumber: number;
    try {
      cycleNumber = await model.getCycleNumber(Number(orgId), Number(orgVersionId));
    } catch {
      res.status(404).json({ success: false, error: 'Cycle not found.' });
      return;
    }

    const result = await model.addExecutiveMember({
      userId: user.user_id,
      orgId: Number(orgId),
      orgVersionId: Number(orgVersionId),
      cycleNumber,
      roleTitle: role_title,
      rankId: rank.rank_id,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'officer:created');
    res.status(201).json({ success: true, member_id: result.member_id });
  } catch (err) {
    console.error('[addExecutiveMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// PUT /update-executive-member
// Body: { email, role_title, rank_level, action_by_email, orgId, orgVersionId }
export async function updateExecutiveMember(req: Request, res: Response): Promise<void> {
  try {
    const {
      email,
      role_title,
      rank_level,
      orgId,
      orgVersionId,
    }: {
      email: string;
      role_title: string;
      rank_level: number;
      orgId: number;
      orgVersionId: number;
    } = req.body;

    if (!email || !role_title || rank_level == null || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    const user = await model.getUserByEmail(email);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const rank = await model.getRankByLevel(Number(rank_level));
    if (!rank) {
      res.status(404).json({ success: false, error: 'Rank level not found.' });
      return;
    }

    let cycleNumber: number;
    try {
      cycleNumber = await model.getCycleNumber(Number(orgId), Number(orgVersionId));
    } catch {
      res.status(404).json({ success: false, error: 'Cycle not found.' });
      return;
    }

    // Find the member record for this user in this org version
    const { prisma } = await import('../../config/db');
    const member = await prisma.tbl_organization_members.findFirst({
      where: {
        user_id: user.user_id,
        org_version_id: Number(orgVersionId),
        member_type: 'Executive',
      },
      select: { member_id: true },
    });

    if (!member) {
      res.status(404).json({ success: false, error: 'Executive member not found.' });
      return;
    }

    await model.updateExecutiveMember({
      memberId: member.member_id,
      orgId: Number(orgId),
      orgVersionId: Number(orgVersionId),
      cycleNumber,
      roleTitle: role_title,
      rankId: rank.rank_id,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'officer:updated');
    res.json({ success: true });
  } catch (err) {
    console.error('[updateExecutiveMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// POST /archive-executive-member
// Body: { member_id, reason, action_by_email, orgId, orgVersionId }
export async function archiveExecutiveMember(req: Request, res: Response): Promise<void> {
  try {
    const { member_id, orgId, orgVersionId } = req.body as {
      member_id: number;
      orgId: number;
      orgVersionId: number;
    };

    if (!member_id || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.archiveExecutiveMember({
      memberId: Number(member_id),
      archivedBy: callerEmail(req),
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'officer:archived');
    res.json({ success: true });
  } catch (err: unknown) {
    if ((err as Error).message === 'MEMBER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Member not found.' });
      return;
    }
    console.error('[archiveExecutiveMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// ===========================================================================
// Committees
// ===========================================================================

// POST /create-committee
// Body: { committee_name, description, orgId, orgVersionId }
export async function createCommittee(req: Request, res: Response): Promise<void> {
  try {
    const { committee_name, description, orgId, orgVersionId } = req.body as {
      committee_name: string;
      description?: string;
      orgId: number;
      orgVersionId: number;
    };

    if (!committee_name || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    let cycleNumber: number;
    try {
      cycleNumber = await model.getCycleNumber(Number(orgId), Number(orgVersionId));
    } catch {
      res.status(404).json({ success: false, error: 'Cycle not found.' });
      return;
    }

    const result = await model.createCommittee({
      orgId: Number(orgId),
      cycleNumber,
      name: committee_name,
      description,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee:created');
    res.status(201).json({ success: true, committee_id: result.committee_id });
  } catch (err) {
    console.error('[createCommittee]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// PUT /update-committee
// Body: { committee_id, committee_name, description, orgId, orgVersionId }
export async function updateCommittee(req: Request, res: Response): Promise<void> {
  try {
    const { committee_id, committee_name, description, orgId, orgVersionId } =
      req.body as {
        committee_id: number;
        committee_name: string;
        description?: string;
        orgId: number;
        orgVersionId: number;
      };

    if (!committee_id || !committee_name || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.updateCommittee({
      committeeId: Number(committee_id),
      name: committee_name,
      description,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee:updated');
    res.json({ success: true });
  } catch (err) {
    console.error('[updateCommittee]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// POST /archive-committee
// Body: { committee_id, reason, archived_by_email, orgId, orgVersionId }
export async function archiveCommittee(req: Request, res: Response): Promise<void> {
  try {
    const { committee_id, reason, orgId, orgVersionId } = req.body as {
      committee_id: number;
      reason?: string;
      orgId: number;
      orgVersionId: number;
    };

    if (!committee_id || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.archiveCommittee({
      committeeId: Number(committee_id),
      archivedBy: callerEmail(req),
      reason,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee:archived');
    res.json({ success: true });
  } catch (err: unknown) {
    if ((err as Error).message === 'COMMITTEE_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Committee not found.' });
      return;
    }
    console.error('[archiveCommittee]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// ===========================================================================
// Committee Members
// ===========================================================================

// POST /add-committee-member
// Body: { email, committee_id, role_in_committee, orgId, orgVersionId }
export async function addCommitteeMember(req: Request, res: Response): Promise<void> {
  try {
    const { email, committee_id, role_in_committee, orgId, orgVersionId } =
      req.body as {
        email: string;
        committee_id: number;
        role_in_committee: string;
        orgId: number;
        orgVersionId: number;
      };

    if (!email || !committee_id || !role_in_committee || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    const user = await model.getUserByEmail(email);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const result = await model.addCommitteeMember({
      userId: user.user_id,
      committeeId: Number(committee_id),
      roleInCommittee: role_in_committee,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee_member:created');
    res
      .status(201)
      .json({ success: true, committee_member_id: result.committee_member_id });
  } catch (err) {
    console.error('[addCommitteeMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// PUT /update-committee-member
// Body: { committee_member_id, committee_id, role_in_committee, orgId, orgVersionId }
export async function updateCommitteeMember(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      committee_member_id,
      committee_id,
      role_in_committee,
      orgId,
      orgVersionId,
    } = req.body as {
      committee_member_id: number;
      committee_id: number;
      role_in_committee: string;
      orgId: number;
      orgVersionId: number;
    };

    if (
      !committee_member_id ||
      !committee_id ||
      !role_in_committee ||
      !orgId ||
      !orgVersionId
    ) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.updateCommitteeMember({
      committeeMemberId: Number(committee_member_id),
      newCommitteeId: Number(committee_id),
      roleInCommittee: role_in_committee,
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee_member:updated');
    res.json({ success: true });
  } catch (err) {
    console.error('[updateCommitteeMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// POST /archive-committee-member
// Body: { committee_member_id, reason, orgId, orgVersionId }
export async function archiveCommitteeMember(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { committee_member_id, orgId, orgVersionId } = req.body as {
      committee_member_id: number;
      orgId: number;
      orgVersionId: number;
    };

    if (!committee_member_id || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.archiveCommitteeMember(Number(committee_member_id));

    broadcastOrg(Number(orgId), Number(orgVersionId), 'committee_member:archived');
    res.json({ success: true });
  } catch (err) {
    console.error('[archiveCommitteeMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// ===========================================================================
// Regular Members
// ===========================================================================

// POST /restore-organization-member
// Body: { member_id, orgId, orgVersionId }  (member_id = archived_id from tbl_archived_organization_members)
export async function restoreOrganizationMember(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { member_id, orgId, orgVersionId } = req.body as {
      member_id: number;
      orgId: number;
      orgVersionId: number;
    };

    if (!member_id || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.restoreOrganizationMember({
      archivedId: Number(member_id),
      orgVersionId: Number(orgVersionId),
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'member:restored');
    res.json({ success: true, message: 'Member restored successfully.' });
  } catch (err: unknown) {
    if ((err as Error).message === 'MEMBER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Member not found or not in archived state.' });
      return;
    }
    console.error('[restoreOrganizationMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// POST /archive-organization-member
// Body: { member_id, reason, reasonKey, note, orgId, orgVersionId }
export async function archiveOrganizationMember(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { member_id, orgId, orgVersionId } = req.body as {
      member_id: number;
      orgId: number;
      orgVersionId: number;
    };

    if (!member_id || !orgId || !orgVersionId) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.archiveOrganizationMember({
      memberId: Number(member_id),
      archivedBy: callerEmail(req),
    });

    broadcastOrg(Number(orgId), Number(orgVersionId), 'member:archived');
    res.json({ success: true });
  } catch (err: unknown) {
    if ((err as Error).message === 'MEMBER_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Member not found.' });
      return;
    }
    console.error('[archiveOrganizationMember]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// ===========================================================================
// Membership Applications
// ===========================================================================

// POST /approve-membership-application
// Body: { application_id, remarks, organization_id, organization_version_id }
export async function approveMembershipApplication(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      application_id,
      remarks,
      organization_id,
      organization_version_id,
    } = req.body as {
      application_id: number;
      remarks?: string;
      organization_id: number;
      organization_version_id: number;
    };

    if (!application_id || !organization_id || !organization_version_id) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    const orgId = Number(organization_id);
    const orgVersionId = Number(organization_version_id);

    let cycleNumber: number;
    try {
      cycleNumber = await model.getCycleNumber(orgId, orgVersionId);
    } catch {
      res.status(404).json({ success: false, error: 'Cycle not found.' });
      return;
    }

    await model.approveMembershipApplication({
      applicationId: Number(application_id),
      orgId,
      orgVersionId,
      cycleNumber,
      remarks,
      reviewedBy: callerEmail(req),
    });

    broadcastOrg(orgId, orgVersionId, 'member:created');
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg === 'APPLICATION_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Application not found.' });
      return;
    }
    if (msg === 'APPLICATION_NOT_PENDING') {
      res.status(409).json({ success: false, error: 'Application is not pending.' });
      return;
    }
    console.error('[approveMembershipApplication]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

// POST /reject-membership-application
// Body: { application_id, remarks, email, organization_id, organization_version_id }
export async function rejectMembershipApplication(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { application_id, remarks, organization_id, organization_version_id } =
      req.body as {
        application_id: number;
        remarks?: string;
        email?: string;
        organization_id: number;
        organization_version_id: number;
      };

    if (!application_id || !organization_id || !organization_version_id) {
      res.status(400).json({ success: false, error: 'Missing required fields.' });
      return;
    }

    await model.rejectMembershipApplication({
      applicationId: Number(application_id),
      remarks,
      reviewedBy: callerEmail(req),
    });

    broadcastOrg(
      Number(organization_id),
      Number(organization_version_id),
      'member:updated'
    );
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    if (msg === 'APPLICATION_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Application not found.' });
      return;
    }
    if (msg === 'APPLICATION_NOT_PENDING') {
      res.status(409).json({ success: false, error: 'Application is not pending.' });
      return;
    }
    console.error('[rejectMembershipApplication]', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}
