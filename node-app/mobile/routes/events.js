const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');
const middleware = require('../../middlewares/middleWare');


router.get('/events', middleware.authMiddleware, eventsController.getEvents);
router.get('/events/upcoming', middleware.authMiddleware, eventsController.getUpcomingEvents);
router.get('/events/tickets', middleware.authMiddleware, eventsController.getTickets);
router.get('/events/getCertificate', middleware.authMiddleware, eventsController.getEventCertificate);
router.get('/events/getAllCertificates', middleware.authMiddleware, eventsController.getAllEventCertificates);
router.get('/events/:eventId', middleware.authMiddleware, eventsController.sseEventAttendees);
router.get('/events/:eventId/user/:userEmail', middleware.authMiddleware, eventsController.getSpecificEvent);
router.get('/events/evaluation/:eventId', middleware.authMiddleware, eventsController.getEvaluation);
router.post('/events/evaluation/submit', middleware.authMiddleware, eventsController.submitEvaluation);
router.post('/events', middleware.authMiddleware, eventsController.createEvent);
router.post('/events/scan', middleware.authMiddleware, eventsController.scanTicket);
router.post('/events/register', middleware.authMiddleware, eventsController.registerEvent);
router.post('/events/generateCertificate', middleware.authMiddleware, eventsController.addGeneratedCertificate);
router.put('/events/archive', middleware.authMiddleware, eventsController.archiveEvent);
// Ensure all referenced methods exist in eventsController

module.exports = router;