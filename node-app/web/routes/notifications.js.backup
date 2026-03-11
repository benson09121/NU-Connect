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

// Create notification endpoint (for admin use)
router.post('/notifications',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.createNotification
);

// Test notification endpoint
router.post('/notifications/test',
    middleware.validateAzureJWT,
    notificationController.testNotification
);

// Specialized notification endpoints for system events
router.post('/notifications/application-period-created',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.notifyApplicationPeriodCreated
);

router.post('/notifications/application-period-updated',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.notifyApplicationPeriodUpdated
);

router.post('/notifications/approval-process-initiated',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.notifyApprovalProcessInitiated
);

router.post('/notifications/new-organization-application',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.notifyNewOrganizationApplication
);

router.post('/notifications/new-event-proposal',
    middleware.validateAzureJWT,
    middleware.hasPermission("MANAGE_APPLICATIONS"),
    notificationController.notifyNewEventProposal
);

module.exports = router;