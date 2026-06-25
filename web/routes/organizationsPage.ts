/**
 * web/routes/organizationsPage.ts
 *
 * Routes for the Organizations Page feature (V2).
 *
 * Mounted at /api/web in server.ts.
 *
 * Route groups:
 *   1. Global Requirements Pool      → /organizations/requirements/...
 *   2. Application Periods            → /organizations/application-periods/...
 *   3. Period–Requirement Assignments → /organizations/application-periods/:periodId/requirements/...
 *   4. Org Page Data                  → /organizations/...
 *   5. Create Organization Flow       → /organizations/applications/..., /programs, etc.
 *
 * Express matches routes top-to-bottom — more specific paths MUST be registered
 * before wildcard params to prevent shadowing.
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';

// Org page controllers
import {
  listOrganizations,
  listRecentActivities,
  listUpcomingEvents,
  serveOrgLogo,
  changeAdviser,
  getOrgBySlugHandler,
  getOrgDashboardHandler,
  getOrgApplicationsHandler,
  getOrgEventSubmissionsHandler,
  getOrgRenewalStatusHandler,
  listArchivedOrganizations,
  archiveOrganizationHandler,
  restoreOrganizationHandler,
} from '../controllers/organizationsPageController';

// Application period controllers
import {
  getActive,
  listAll,
  create,
  edit,
  terminate,
} from '../controllers/applicationPeriodController';

// Global requirements pool controllers
import {
  list as listGlobalRequirements,
  create as createGlobalRequirement,
  edit as editGlobalRequirement,
  remove as removeGlobalRequirement,
  downloadTemplate as downloadGlobalTemplate,
} from '../controllers/globalRequirementController';

// Period–requirement assignment controllers
import {
  listAssigned,
  assignRequirement,
  unassign,
} from '../controllers/periodRequirementAssignmentController';

// Create Organization flow controllers
import {
  submitApp,
  checkName,
  checkEmails,
  listPrograms,
  listExecutiveRanks,
  getApplication,
  getOrgDetails,
  getAppLogo,
  getAppRequirement,
} from '../controllers/createOrgController';

// Approval system controller (for applications list endpoint)
import { getApplicationsList } from '../controllers/approvalController';

// Document generation controller
import { getDocumentStatus, downloadDocument } from '../controllers/documentController';

const router = Router();

// =========================================================================
// 1. Global Requirements Pool  —  /organizations/requirements/...
// =========================================================================

// template download MUST be before /:requirementId to avoid shadowing
router.get('/organizations/requirements/:requirementId/template', validateAzureJWT, downloadGlobalTemplate);
router.get('/organizations/requirements', validateAzureJWT, listGlobalRequirements);
router.post('/organizations/requirements', validateAzureJWT, createGlobalRequirement);
router.patch('/organizations/requirements/:requirementId', validateAzureJWT, editGlobalRequirement);
router.delete('/organizations/requirements/:requirementId', validateAzureJWT, removeGlobalRequirement);

// =========================================================================
// 2. Application Periods  —  /organizations/application-periods/...
// =========================================================================

router.get('/organizations/application-periods/active', validateAzureJWT, getActive);
router.get('/organizations/application-periods', validateAzureJWT, listAll);
router.post('/organizations/application-periods', validateAzureJWT, create);
// terminate MUST be before /:periodId to avoid shadowing
router.patch('/organizations/application-periods/:periodId/terminate', validateAzureJWT, terminate);
router.patch('/organizations/application-periods/:periodId', validateAzureJWT, edit);

// =========================================================================
// 3. Period–Requirement Assignments
//    /organizations/application-periods/:periodId/requirements/...
// =========================================================================

router.get(
  '/organizations/application-periods/:periodId/requirements',
  validateAzureJWT,
  listAssigned
);
router.post(
  '/organizations/application-periods/:periodId/requirements',
  validateAzureJWT,
  assignRequirement
);
router.delete(
  '/organizations/application-periods/:periodId/requirements/:requirementId',
  validateAzureJWT,
  unassign
);

// =========================================================================
// 4. Organizations Page Data
// =========================================================================

router.get('/organizations/recent-activities', validateAzureJWT, listRecentActivities);
router.get('/organizations/upcoming-events', validateAzureJWT, listUpcomingEvents);
router.get('/organizations/archived', validateAzureJWT, listArchivedOrganizations);
router.get('/organizations', validateAzureJWT, listOrganizations);

// Archive / Restore Organization
router.post('/archive-organization', validateAzureJWT, archiveOrganizationHandler);
router.post('/restore-organization', validateAzureJWT, restoreOrganizationHandler);

// =========================================================================
// 5. Create Organization Flow
//    MUST come after specific sub-paths (/requirements, /application-periods)
//    but BEFORE the generic wildcard /:orgId routes below.
// =========================================================================

// Check name uniqueness
router.get('/organizations/check-name', validateAzureJWT, checkName);

// Validate executive emails
router.post('/organizations/check-emails', validateAzureJWT, checkEmails);

// Executive rank hierarchy
router.get('/organizations/executive-ranks', validateAzureJWT, listExecutiveRanks);

// Application-level routes (logo MUST be before :applicationId to avoid shadowing)
router.get('/organizations/applications/:applicationId/logo', validateAzureJWT, getAppLogo);
router.get('/organizations/applications/:applicationId/requirements/:requirementFile', validateAzureJWT, getAppRequirement);
router.get('/organizations/applications/:applicationId/document-status', validateAzureJWT, getDocumentStatus);
router.get('/organizations/applications/:applicationId/download-document', validateAzureJWT, downloadDocument);

// Application form status — stub (document generation not yet migrated)
router.get('/application-form-status/:applicationId', validateAzureJWT, (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'NOT_IMPLEMENTED',
    message: 'Document generation is not yet available in the new system.',
  });
});

// Applications list — NEW: for Organizations page "Applications" tab (MUST be before :applicationId)
router.get('/organizations/applications', validateAzureJWT, getApplicationsList);

router.get('/organizations/applications/:applicationId', validateAzureJWT, getApplication);
router.post('/organizations/applications', validateAzureJWT, submitApp);

// Org details for renewal (uses :organizationId param — MUST be after all /organizations/<literal> routes)
router.get('/organizations/by-slug/:slug', validateAzureJWT, getOrgBySlugHandler);
router.get('/organizations/:organizationId/details', validateAzureJWT, getOrgDetails);

// Change adviser mid-year
router.patch('/organizations/:orgId/adviser', validateAzureJWT, changeAdviser);

// Programs (colleges + academic programs) — mounted at /organizations/programs
router.get('/organizations/programs', validateAzureJWT, listPrograms);

// Org detail REST endpoints — must live before the generic logo route
router.get('/organizations/:orgId/dashboard',          validateAzureJWT, getOrgDashboardHandler);
router.get('/organizations/:orgId/applications',       validateAzureJWT, getOrgApplicationsHandler);
router.get('/organizations/:orgId/event-submissions',  validateAzureJWT, getOrgEventSubmissionsHandler);
router.get('/organizations/:orgId/renewal-status',     validateAzureJWT, getOrgRenewalStatusHandler);

// Org logo (generic — keep last among :orgId routes)
router.get('/organizations/:orgId/logo', validateAzureJWT, serveOrgLogo);

export default router;
