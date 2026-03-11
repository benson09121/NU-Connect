/**
 * web/routes/log.ts
 *
 * Routes for the Activity Log system.
 *
 * Mounted at /api/web/logs in server.ts.
 *
 * All routes require Azure AD JWT authentication.
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import {
  getLogs,
  getRecentLogs,
  getLogStats,
} from '../controllers/logController';

const router = Router();

// =====================================================================
// LOG ROUTES
// =====================================================================

/**
 * @route   GET /api/web/logs
 * @desc    Get activity logs (role-scoped, paginated)
 * @query   page, limit, action_type, user_id, organization_id, start_date, end_date, search
 */
router.get('/', validateAzureJWT, getLogs);

/**
 * @route   GET /api/web/logs/recent
 * @desc    Get recent logs for Dashboard widget
 * @query   limit (default 10)
 */
router.get('/recent', validateAzureJWT, getRecentLogs);

/**
 * @route   GET /api/web/logs/stats
 * @desc    Get activity stats for Dashboard summary cards
 */
router.get('/stats', validateAzureJWT, getLogStats);

export default router;
