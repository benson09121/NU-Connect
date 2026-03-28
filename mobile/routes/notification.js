const express = require('express');
const router = express.Router();
const notificationController = require('../../mobile/controllers/notificationController');
const { validateAzureJWTMobile } = require('../../middlewares/middleWare');


router.get('/notifications', validateAzureJWTMobile, notificationController.getNotifications);
router.get('/notifications/mark-read', validateAzureJWTMobile, notificationController.markNotificationsAsRead);
router.post('/notifications/mark-read', validateAzureJWTMobile, notificationController.markNotificationsAsRead);
router.post('/notifications/:id/mark-read', validateAzureJWTMobile, notificationController.markSingleNotificationAsRead);
router.get('/notifications/new-count', validateAzureJWTMobile, notificationController.getNewNotifications);
module.exports = router;
