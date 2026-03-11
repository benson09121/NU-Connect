const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const middleware = require('../../middlewares/middleWare');

// /events/by-user-role is now handled by the TypeScript eventsRoutes.ts
// router.get(
//   '/events/by-user-role',
//   middleware.validateAzureJWT,
//   eventController.getEventsByUserRole
// );

// /event-applications is now handled by the TypeScript eventsRoutes.ts
// router.post('/event-applications', middleware.validateAzureJWT, middleware.hasPermission("CREATE_EVENT"),eventController.createEventApplication);
router.get('/event-applications/:id/details', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventApplicationDetails);
router.get('/event-applications/requirement', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventApplicationRequirement);
router.get('/get-events-applications-approvals', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventApprovalTimeline);
router.put('/event-applications/:event_application_id/approve/:approval_id', middleware.validateAzureJWT,
middleware.hasPermission("MANAGE_APPLICATIONS"), eventController.approveEventApplication);
router.put('/event-applications/:event_application_id/reject/:approval_id', middleware.validateAzureJWT,middleware.hasPermission("MANAGE_APPLICATIONS"), eventController.rejectEventApplication);
router.post(
  '/event-applications/post-event-requirement',
  (req, res, next) => {
    console.log('Incoming post-event requirement request:', {
      body: req.body,
      files: req.files,
      file: req.file
    });
    next();
  },
  middleware.validateAzureJWT,
  middleware.hasPermission("SUBMIT_REQUIREMENTS"),
  eventController.uploadOrUpdatePostEventRequirement
);

router.put(
  '/event-requirements/submissions/:submission_id/mark-viewed',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVENT"),
  eventController.markEventRequirementAsViewed
);

router.put(
  '/event-requirements/submissions/:submission_id/approve',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REQUIREMENTS"),
  eventController.approvePostEventRequirement
);

router.put(
  '/event-requirements/submissions/:submission_id/reject',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REQUIREMENTS"),
  eventController.rejectPostEventRequirement
);

router.get('/events/certificate-template', eventController.getCert);
router.get('/events/sample-certificate', middleware.validateAzureJWT, middleware.hasPermission("UPDATE_EVALUATION"), eventController.getSampleCertificate);

router.post('/events', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.addEvent);
// /events-SDAO is now handled by the TypeScript eventsRoutes.ts
// router.post(
//   '/events-SDAO',
//   middleware.validateAzureJWT,
//   middleware.hasPermission("CREATE_SDAO_EVENT"),
//   eventController.createEvent
// );
router.get('/events/getEventPublicationImage', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventPublicationImage);
router.get('/events', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEvents);
router.get('/events/feedback', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventEvaluationResponsesByGroup);
// /events/check-event-title is now handled by the TypeScript eventsRoutes.ts
// router.get('/events/check-event-title', middleware.validateAzureJWT, middleware.hasPermission(["CREATE_EVENT", "CREATE_SDAO_EVENT"]), eventController.checkEventTitle);
router.get('/events/evaluation-questions', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getAllEvaluationQuestions);
// /events/add-event-status is now handled by the TypeScript eventsRoutes.ts
// router.get('/events/add-event-status', middleware.validateAzureJWT, eventController.getaddEventStatus);
// /event-requirements is now handled by the TypeScript eventsRoutes.ts
// router.get('/event-requirements', middleware.validateAzureJWT, middleware.hasPermission(["CREATE_EVENT","CREATE_SDAO_EVENT"]),eventController.getEventRequirements);
router.post('/event-requirements/save', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), eventController.saveEventRequirements);
router.post('/events/addcertificate', middleware.validateAzureJWT, middleware.hasPermission("UPDATE_EVALUATION"), eventController.addCertificate);
router.delete('/certificate/:event_id', middleware.validateAzureJWT, middleware.hasPermission("UPDATE_EVALUATION"), eventController.deleteCertificate);
// /events/specific is now handled by the TypeScript eventsRoutes.ts
// router.get('/events/specific', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventById);
router.get('/events/attendees', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getAttendeesbyEventId);
router.get('/events/:id/stats', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventStats);


router.get(
  '/events/:id/evaluation-config',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVALUATION"),
  eventController.getEventEvaluationConfig
);
router.get(
  '/events/evaluation-feedback-period',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVALUATION"),
  eventController.getEventEvaluationFeedbackPeriod
);
router.put(
  '/events/:id/evaluation-config',
  middleware.validateAzureJWT,
  middleware.hasPermission("UPDATE_EVALUATION"),
  eventController.updateEventEvaluationConfig
);
router.get('/events/status/:status', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventsByStatus);
router.put('/events/:id', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.updateEvent);
router.delete('/events/:id', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.deleteEvent);

router.put(
  '/events/:event_id/attendees/:user_id/approve/:approver_email',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REGISTRATION"),
  eventController.approvePaidEventRegistration
);
// /events/check-schedule-conflict is now handled by the TypeScript eventsRoutes.ts
// router.post('/events/check-schedule-conflict', middleware.validateAzureJWT, middleware.hasPermission(["CREATE_EVENT", "CREATE_SDAO_EVENT"]), eventController.checkScheduleConflict);
router.put(
  '/events/:event_id/attendees/:user_id/reject/:approver_email',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REGISTRATION"),
  eventController.rejectPaidEventRegistration
);

// All blocked-period routes are now handled by the TypeScript eventsRoutes.ts
// router.post('/blocked-periods', ...)
// router.put('/blocked-periods/:id', ...)
// router.put('/blocked-periods/:id/archive', ...)
// router.put('/blocked-periods/:id/unarchive', ...)
// router.delete('/blocked-periods/:id', ...)

// GET /blocked-periods is now handled by the TypeScript eventsRoutes.ts
// router.get(
//   '/blocked-periods',
//   middleware.validateAzureJWT,
//   middleware.hasPermission("VIEW_EVENT"),
//   eventController.getBlockedPeriodsByStatus
// );

// Get all blocked periods
router.get(
  '/blocked-periods/all',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVENT"),
  eventController.getAllBlockedPeriods
);

router.get(
  '/event-applications/publication-image',
  middleware.validateAzureJWT,
  middleware.hasPermission("VIEW_EVENT"),
  eventController.getEventApplicationPublicationImage
);

router.put(
  '/events/:id/sdao-update',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_SDAO_EVENT"),
  eventController.updateEventSDAO
);

router.post(
  '/events/sdao-archive',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_SDAO_EVENT"),
  eventController.archiveEvent
);

router.post(
  '/events/sdao-unarchive',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_SDAO_EVENT"),
  eventController.unarchiveEvent
);

router.delete(
  '/events/:id/sdao-delete',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_SDAO_EVENT"),
  eventController.deleteEventSDAO
);

module.exports = router;