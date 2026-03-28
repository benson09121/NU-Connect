import { Router } from 'express';
import { hasPermission, validateAzureJWT } from '../../middlewares/middleWare';
import {
  getActivitiesHandler,
  getLeaderboardsByCategoryHandler,
  getLeaderboardsHandler,
  getMemberEngagementHandler,
  getOrganizationAnalyticsHandler,
  getOrganizationFinanceHandler,
} from '../controllers/analyticsController';

const router = Router();

const VIEW_ANALYTICS = 'VIEW_ANALYTICS';

router.get('/analytics/leaderboards', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getLeaderboardsHandler);
router.get('/analytics/leaderboards-by-category', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getLeaderboardsByCategoryHandler);
router.get('/analytics/activities', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getActivitiesHandler);
router.get('/analytics/organizations', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getOrganizationAnalyticsHandler);
router.get('/analytics/finance', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getOrganizationFinanceHandler);
router.get('/analytics/member_engagement', validateAzureJWT, hasPermission(VIEW_ANALYTICS), getMemberEngagementHandler);

export default router;
