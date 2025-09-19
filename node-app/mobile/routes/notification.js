const express = require('express');
const router = express.Router();
const notificationController = require('../../mobile/controllers/notificationController');
const middleware = require('../../middlewares/middleWare');


router.get('/notifications', middleware.authMiddleware, notificationController.getNotifications);
router.get('/notifications/mark-read', middleware.authMiddleware, notificationController.markNotificationsAsRead);
router.get('/notifications/new-count', middleware.authMiddleware, notificationController.getNewNotifications);
module.exports = router;
