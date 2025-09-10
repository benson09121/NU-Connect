const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const middleware = require('../../middlewares/middleWare');

router.get('/logs', middleware.validateAzureJWT, middleware.hasPermission("VIEW_LOGS"), logController.getLogs);

router.get(
    '/org-relevant-logs',
    middleware.validateAzureJWT,
    middleware.hasPermission("VIEW_LOGS"),
    logController.getOrgRelevantLogs
);

// system counts endpoint
router.get('/system-counts', middleware.validateAzureJWT, middleware.hasPermission("VIEW_LOGS"), logController.getSystemCounts);

// new: create log (used by admin flows or services)
router.post('/logs', middleware.validateAzureJWT, middleware.hasPermission("MANAGE_LOGS"), logController.createLog);

module.exports = router;