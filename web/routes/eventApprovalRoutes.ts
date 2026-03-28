/**
 * web/routes/eventApprovalRoutes.ts
 *
 * Routes for the Event Approval API.
 *
 * All routes require a valid Azure JWT (validateAzureJWT).
 *
 * Static paths (/requirement, /publication-image) are declared BEFORE the
 * parameterised path (/:eventApplicationId/details) so Express does not
 * accidentally treat "requirement" or "publication-image" as an :eventApplicationId.
 *
 *   GET  /event-applications/requirement                             → getRequirementFile
 *   GET  /event-applications/publication-image                      → getPublicationImage
 *   GET  /event-applications/:eventApplicationId/details            → getEventApplicationDetails
 *   PUT  /event-applications/:event_application_id/approve/:approval_id → approveEventApplicationStep
 *   PUT  /event-applications/:event_application_id/reject/:approval_id  → rejectEventApplicationStep
 *   GET  /get-events-applications-approvals                         → getEventsApplicationsApprovals
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import * as ctrl from '../controllers/eventApprovalController';

const router = Router();

// Static paths first — must precede /:eventApplicationId
router.get('/event-applications/requirement', validateAzureJWT, ctrl.getRequirementFile);
router.get('/event-applications/publication-image', validateAzureJWT, ctrl.getPublicationImage);

// Application details (proposedEventId in path as eventApplicationId)
router.get(
  '/event-applications/:eventApplicationId/details',
  validateAzureJWT,
  ctrl.getEventApplicationDetails,
);

// Approve / reject a single step
router.put(
  '/event-applications/:event_application_id/approve/:approval_id',
  validateAzureJWT,
  ctrl.approveEventApplicationStep,
);
router.put(
  '/event-applications/:event_application_id/reject/:approval_id',
  validateAzureJWT,
  ctrl.rejectEventApplicationStep,
); 

// Approval timeline — used by realtime channel event_approval_timeline_${event_application_id}
router.get(
  '/get-events-applications-approvals',
  validateAzureJWT,
  ctrl.getEventsApplicationsApprovals,
);

export default router;
