/**
 * web/routes/dashboard.ts
 *
 * Routes for the dashboard feature.
 *
 * Mounted at /api/web in server.ts.
 * Full path: GET /api/web/dashboard/stats
 */

import { Router } from 'express';
import { validateAzureJWT } from '../../middlewares/middleWare';
import { getStats } from '../controllers/dashboardController';

const router = Router();

/**
 * GET /api/web/dashboard/stats
 *
 * Returns scoped statistics for the authenticated user.
 * The scope (global / college / program / organization) is determined
 * server-side from the user's role in the DB — the frontend does no filtering.
 *
 * Responses:
 *   200  { role, scope, stats }
 *   401  Token missing or invalid
 *   404  User not found in DB
 *   500  Internal server error
 */
router.get('/dashboard/stats', validateAzureJWT, getStats);

export default router;
