/**
 * web/routes/orgHub.ts
 *
 * Routes for the Organization Hub page (/org/:orgId) and all supporting
 * mutations (officers, committees, committee members, members, applications).
 *
 * All routes require Azure JWT authentication.
 * Add org-scoped permission middleware per endpoint as needed.
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/orgHubController';

const router = Router();

const requireAuth = validateAzureJWT;

// ---------------------------------------------------------------------------
// Hub snapshot
// ---------------------------------------------------------------------------

// GET /api/web/organizations/:orgId/hub?org_version_id=Y
router.get(
  '/organizations/:orgId/hub',
  requireAuth,
  ctrl.getOrgHub
);

// ---------------------------------------------------------------------------
// Executive Officers
// ---------------------------------------------------------------------------

// POST /api/web/add-executive-member
router.post('/add-executive-member', requireAuth, ctrl.addExecutiveMember);

// PUT  /api/web/update-executive-member
router.put('/update-executive-member', requireAuth, ctrl.updateExecutiveMember);

// POST /api/web/archive-executive-member
router.post('/archive-executive-member', requireAuth, ctrl.archiveExecutiveMember);

// ---------------------------------------------------------------------------
// Committees
// ---------------------------------------------------------------------------

// POST /api/web/create-committee
router.post('/create-committee', requireAuth, ctrl.createCommittee);

// PUT  /api/web/update-committee
router.put('/update-committee', requireAuth, ctrl.updateCommittee);

// POST /api/web/archive-committee
router.post('/archive-committee', requireAuth, ctrl.archiveCommittee);

// ---------------------------------------------------------------------------
// Committee Members
// ---------------------------------------------------------------------------

// POST /api/web/add-committee-member
router.post('/add-committee-member', requireAuth, ctrl.addCommitteeMember);

// PUT  /api/web/update-committee-member
router.put('/update-committee-member', requireAuth, ctrl.updateCommitteeMember);

// POST /api/web/archive-committee-member
router.post('/archive-committee-member', requireAuth, ctrl.archiveCommitteeMember);

// ---------------------------------------------------------------------------
// Regular Members
// ---------------------------------------------------------------------------

// POST /api/web/archive-organization-member
router.post(
  '/archive-organization-member',
  requireAuth,
  ctrl.archiveOrganizationMember
);

// POST /api/web/restore-organization-member
router.post(
  '/restore-organization-member',
  requireAuth,
  ctrl.restoreOrganizationMember
);

// ---------------------------------------------------------------------------
// Membership Applications
// ---------------------------------------------------------------------------

// POST /api/web/approve-membership-application
router.post(
  '/approve-membership-application',
  requireAuth,
  ctrl.approveMembershipApplication
);

// POST /api/web/reject-membership-application
router.post(
  '/reject-membership-application',
  requireAuth,
  ctrl.rejectMembershipApplication
);

export default router;
