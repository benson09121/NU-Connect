const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const middleware = require('../../middlewares/middleWare');

router.post('/event-applications', middleware.validateAzureJWT, middleware.hasPermission("CREATE_EVENT"),eventController.createEventApplication);
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

router.post('/events', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.addEvent);
router.post(
  '/events-SDAO',
  middleware.validateAzureJWT,
  middleware.hasPermission("CREATE_EVENT"),
  eventController.createEvent
);
router.get('/events', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEvents);
router.get('/events/evaluation-questions', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getAllEvaluationQuestions);
router.get('/events/add-event-status', middleware.validateAzureJWT, eventController.getaddEventStatus);
router.get('/event-requirements', middleware.validateAzureJWT, middleware.hasPermission("CREATE_EVENT"),eventController.getEventRequirements);
router.post('/event-requirements/save', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_REQUIREMENTS"), eventController.saveEventRequirements);
router.post('/events/addcertificate', middleware.validateAzureJWT, middleware.hasPermission("UPDATE_EVALUATION"), eventController.addCertificate);
router.get('/events/specific', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventById);
router.get('/events/attendees', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getAttendeesbyEventId);
router.get('/events/:id/stats', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventStats);
router.get('/events/sample-certificate', middleware.validateAzureJWT, middleware.hasPermission("UPDATE_EVALUATION"), eventController.getSampleCertificate);
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

router.get('/events/feedback', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventEvaluationResponsesByGroup);
router.get('/events/status/:status', middleware.validateAzureJWT, middleware.hasPermission("VIEW_EVENT"), eventController.getEventsByStatus);
router.put('/events/:id', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.updateEvent);
router.delete('/events/:id', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_EVENTS"), eventController.deleteEvent);

router.put(
  '/events/:event_id/attendees/:user_id/approve/:approver_email',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REGISTRATION"),
  eventController.approvePaidEventRegistration
);

router.put(
  '/events/:event_id/attendees/:user_id/reject/:approver_email',
  middleware.validateAzureJWT,
  middleware.hasPermission("MANAGE_REGISTRATION"),
  eventController.rejectPaidEventRegistration
);

module.exports = router;