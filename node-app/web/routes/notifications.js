const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const middleware = require('../../middlewares/middleWare');

router.get('/notifications',
    middleware.validateAzureJWT,
    notificationController.getNotifications
);

router.put('/notifications/:id/read',
    middleware.validateAzureJWT,
    notificationController.markNotificationRead
);

module.exports = router;