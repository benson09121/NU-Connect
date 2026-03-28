/**
 * web/routes/eventsRoutes.ts
 *
 * TypeScript routes for incrementally-refactored Events endpoints.
 * These routes take precedence over the legacy events.js file because
 * they are mounted first in server.ts.
 *
 * Currently covers:
 *   GET    /events/by-user-role                           — role-scoped event list
 *   GET    /blocked-periods                               — calendar blocked periods (status filter)
 *   POST   /blocked-periods                               — create blocked period
 *   PUT    /blocked-periods/:id                           — update blocked period
 *   PUT    /blocked-periods/:id/archive                   — archive blocked period
 *   PUT    /blocked-periods/:id/unarchive                 — unarchive blocked period
 *   DELETE /blocked-periods/:id                           — delete blocked period
 *   GET    /events/add-event-status                       — check if org can propose a new event
 *   GET    /events/specific                               — single event with embedded attendees + stats
 *   GET    /event-requirement-submissions-by-organization — post-event req submissions by org
 *   GET    /event-applications/:eventApplicationId/post-event-requirements — post-event req submissions by event app
 *   POST   /event-applications/post-event-requirement     — upload/update post-event requirement (ID-based)
 *   GET    /requirement-event-template/:requirementId     — download requirement template by immutable ID
 *   PUT    /event-requirements/submissions/:submissionId/approve — SDAO review approve
 *   PUT    /event-requirements/submissions/:submissionId/reject  — SDAO review reject
 *   GET    /event-requirements/submissions/pending              — SDAO inbox/work queue
 *
 * All other event routes remain in web/routes/events.js until migrated.
 */

import { Router } from 'express';
import { validateAzureJWT, hasPermission, hasAnyPermission } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/eventsController';

const router = Router();

// GET /api/web/events/by-user-role
router.get('/events/by-user-role', validateAzureJWT, ctrl.getEventsByUserRole);

// GET /api/web/blocked-periods?status=unarchived
router.get('/blocked-periods', validateAzureJWT, ctrl.getBlockedPeriods);

// POST /api/web/blocked-periods
router.post('/blocked-periods', validateAzureJWT, hasPermission('MANAGE_REQUIREMENTS'), ctrl.createBlockedPeriod);

// PUT /api/web/blocked-periods/:id
router.put('/blocked-periods/:id', validateAzureJWT, hasPermission('MANAGE_REQUIREMENTS'), ctrl.updateBlockedPeriod);

// PUT /api/web/blocked-periods/:id/archive
router.put('/blocked-periods/:id/archive', validateAzureJWT, hasPermission('MANAGE_REQUIREMENTS'), ctrl.archiveBlockedPeriod);

// PUT /api/web/blocked-periods/:id/unarchive
router.put('/blocked-periods/:id/unarchive', validateAzureJWT, hasPermission('MANAGE_REQUIREMENTS'), ctrl.unarchiveBlockedPeriod);

// DELETE /api/web/blocked-periods/:id
router.delete('/blocked-periods/:id', validateAzureJWT, hasPermission('MANAGE_REQUIREMENTS'), ctrl.deleteBlockedPeriod);

// GET /api/web/events/add-event-status?org_id=5
router.get('/events/add-event-status', validateAzureJWT, ctrl.getAddEventStatus);

// GET /api/web/events/specific?event_id=2
router.get('/events/specific', validateAzureJWT, ctrl.getEventById);

// GET /api/web/event-requirement-submissions-by-organization?organization_id=1
router.get(
  '/event-requirement-submissions-by-organization',
  validateAzureJWT,
  ctrl.getPostEventSubmissionsByOrg,
);

// GET /api/web/event-applications/:eventApplicationId/post-event-requirements
router.get(
  '/event-applications/:eventApplicationId/post-event-requirements',
  validateAzureJWT,
  ctrl.getPostEventSubmissionsByEventApplication,
);

// POST /api/web/event-applications/post-event-requirement
router.post(
  '/event-applications/post-event-requirement',
  validateAzureJWT,
  hasPermission('SUBMIT_REQUIREMENTS'),
  ctrl.uploadOrUpdatePostEventRequirement,
);

router.put(
  '/event-requirements/submissions/:submissionId/approve',
  validateAzureJWT,
  hasPermission('MANAGE_REQUIREMENTS'),
  ctrl.approvePostEventRequirement,
);

router.put(
  '/event-requirements/submissions/:submissionId/reject',
  validateAzureJWT,
  hasPermission('MANAGE_REQUIREMENTS'),
  ctrl.rejectPostEventRequirement,
);

router.get(
  '/event-requirements/submissions/pending',
  validateAzureJWT,
  hasPermission('MANAGE_REQUIREMENTS'),
  ctrl.getPendingPostEventSubmissions,
);

// GET /api/web/event-requirements  — open to any authenticated user
router.get('/event-requirements', validateAzureJWT, ctrl.getEventRequirements);

// POST /api/web/requirements/batch-update-event  (multipart/form-data)
// Per-operation permission checks (CREATE_EVENT_REQUIREMENT / UPDATE_EVENT_REQUIREMENT /
// ARCHIVE_EVENT_REQUIREMENT) are enforced inside the controller.
router.post('/requirements/batch-update-event', validateAzureJWT, ctrl.batchUpdateEventRequirements);

// GET /api/web/requirement-event-template?template_name=requirements/file.pdf
router.get('/requirement-event-template', validateAzureJWT, ctrl.getEventRequirementTemplate);

// GET /api/web/requirement-event-template/:requirementId
router.get('/requirement-event-template/:requirementId', validateAzureJWT, ctrl.getEventRequirementTemplateById);

// GET /api/web/requirement-event-template-by-id?requirement_id=:requirementId
router.get('/requirement-event-template-by-id', validateAzureJWT, ctrl.getEventRequirementTemplateById);

// ---------------------------------------------------------------------------
// Create Event — new TypeScript endpoints (replaces legacy JS equivalents)
// ---------------------------------------------------------------------------

// GET /api/web/all-organizations
router.get('/all-organizations', validateAzureJWT, ctrl.getAllOrganizations);

// GET /api/web/user-organizations
router.get('/user-organizations', validateAzureJWT, ctrl.getUserOrganizations);

// GET /api/web/events/check-event-title?event_title=...
router.get('/events/check-event-title', validateAzureJWT, hasPermission(['CREATE_EVENT', 'CREATE_SDAO_EVENT']), ctrl.checkEventTitle);

// POST /api/web/events/check-schedule-conflict
router.post('/events/check-schedule-conflict', validateAzureJWT, hasAnyPermission(['CREATE_EVENT', 'CREATE_SDAO_EVENT']), ctrl.checkScheduleConflict);

// POST /api/web/events-SDAO  — create SDAO event (multipart/form-data)
router.post('/events-SDAO', validateAzureJWT, hasPermission('CREATE_SDAO_EVENT'), ctrl.createSDAOEvent);

// POST /api/web/event-applications  — student org event application (multipart/form-data)
router.post('/event-applications', validateAzureJWT, hasPermission('CREATE_EVENT'), ctrl.createEventApplication);

// GET /api/web/requirements/template?template_name=...  (alias for requirement-event-template)
router.get('/requirements/template', validateAzureJWT, ctrl.getRequirementTemplate);

// ---------------------------------------------------------------------------
// Event Feedback / Certificate — TypeScript endpoints
// ---------------------------------------------------------------------------

// GET /api/web/events/evaluation-questions
router.get('/events/evaluation-questions', validateAzureJWT, hasPermission('VIEW_EVALUATION'), ctrl.getAllEvaluationQuestions);

// GET /api/web/events/:id/evaluation-config
router.get('/events/:id/evaluation-config', validateAzureJWT, hasPermission('VIEW_EVALUATION'), ctrl.getEventEvaluationConfig);

// PUT /api/web/events/:id/evaluation-config
router.put('/events/:id/evaluation-config', validateAzureJWT, hasPermission('UPDATE_EVALUATION'), ctrl.updateEventEvaluationConfig);

// POST /api/web/events/addcertificate
router.post('/events/addcertificate', validateAzureJWT, hasPermission('UPDATE_EVALUATION'), ctrl.addCertificate);

// GET /api/web/events/certificate-template?event_id=:id
router.get('/events/certificate-template', validateAzureJWT, hasPermission('VIEW_EVALUATION'), ctrl.getCertificateTemplate);

// GET /api/web/events/sample-certificate?event_id=:id
router.get('/events/sample-certificate', validateAzureJWT, hasPermission('VIEW_EVALUATION'), ctrl.getSampleCertificate);

// GET /api/web/events/feedback/responses?event_id=:id
router.get('/events/feedback/responses', validateAzureJWT, hasPermission('VIEW_EVALUATION'), ctrl.getEventFeedbackResponses);

// DELETE /api/web/certificate/:eventId
router.delete('/certificate/:eventId', validateAzureJWT, hasPermission('UPDATE_EVALUATION'), ctrl.deleteCertificate);

export default router;
