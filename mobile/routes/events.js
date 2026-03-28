const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');
const {
	validateAzureJWTMobile,
	requireMobileStudentWriteAccess,
} = require('../../middlewares/middleWare');


router.get('/events', validateAzureJWTMobile, eventsController.getEvents);
router.get('/events/upcoming', validateAzureJWTMobile, eventsController.getUpcomingEvents);
router.get('/events/tickets', validateAzureJWTMobile, eventsController.getTickets);
router.get('/events/getCertificate', validateAzureJWTMobile, eventsController.getEventCertificate);
router.get('/events/getAllCertificates', validateAzureJWTMobile, eventsController.getAllEventCertificates);
// router.get('/events/:eventId', middleware.authMiddleware, eventsController.sseEventAttendees);
router.get('/events/specific', validateAzureJWTMobile, eventsController.getSpecificEvent);
router.get('/events/:id', validateAzureJWTMobile, eventsController.getSpecificEvent);
router.get('/events/evaluation/:eventId', validateAzureJWTMobile, eventsController.getEvaluation);
router.post('/events/evaluation/submit', validateAzureJWTMobile, requireMobileStudentWriteAccess, eventsController.submitEvaluation);
router.post('/events/scan', validateAzureJWTMobile, requireMobileStudentWriteAccess, eventsController.scanTicket);
router.post('/events/register', validateAzureJWTMobile, requireMobileStudentWriteAccess, eventsController.registerEvent);
router.post('/events/unregister', validateAzureJWTMobile, requireMobileStudentWriteAccess, eventsController.unregisterEvent);
router.post('/events/generateCertificate', validateAzureJWTMobile, requireMobileStudentWriteAccess, eventsController.addGeneratedCertificate);
router.get('/events/publication-image', eventsController.getEventPublicationImage);
router.get('/events/qrpermission', validateAzureJWTMobile, eventsController.getQRPermission);
module.exports = router;