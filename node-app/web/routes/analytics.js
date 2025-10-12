const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const middleware = require('../../middlewares/middleWare');


router.get('/analytics/leaderboards', middleware.validateAzureJWT, analyticsController.getLeaderboards);
router.get('/analytics/leaderboards-by-category', middleware.validateAzureJWT, analyticsController.getLeaderboardsByCategory);
router.get('/analytics/activities', middleware.validateAzureJWT, analyticsController.getActivities);
router.get('/analytics/organizations', middleware.validateAzureJWT, analyticsController.getOrganizationAnalytics);
router.get('/analytics/finance', middleware.validateAzureJWT, analyticsController.getOrganizationFinance);
router.get('/analytics/member_engagement', middleware.validateAzureJWT, analyticsController.getMemberEngagement);
module.exports = router;
