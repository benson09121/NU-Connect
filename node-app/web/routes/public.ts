/**
 * web/routes/public.ts
 *
 * Unauthenticated public routes — no Azure JWT required.
 * Mounted at /api/web/public in server.ts.
 *
 * All routes are gated by publicAuthMiddleware (x-api-key / subscription key / static bearer).
 */

import { Router } from 'express';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const publicAuthMiddleware = require('../../middlewares/publicAuthMiddleware');
import {
  handleGetPrograms,
  handleGetRoles,
  handleGetAccounts,
  handleGetPendingApplications,
  handleAddUserApplication,
} from '../controllers/publicController';

const router = Router();

// Apply public API key check to every route in this file
router.use(publicAuthMiddleware);

/**
 * GET /api/web/public/programs
 * Programs grouped by college — used to populate the program dropdown on /register.
 */
router.get('/programs', handleGetPrograms);

/**
 * GET /api/web/public/roles
 * All available roles — used to populate the role dropdown on /register.
 */
router.get('/roles', handleGetRoles);

/**
 * GET /api/web/public/accounts
 * Emails of all active users — used to detect duplicate accounts before registration.
 */
router.get('/accounts', handleGetAccounts);

/**
 * GET /api/web/public/pending-users-applications
 * All user applications (email + status) — frontend blocks re-apply unless status === 'rejected'.
 */
router.get('/pending-users-applications', handleGetPendingApplications);

/**
 * POST /api/web/public/user-application
 * Submit a new NUConnect access application.
 * Body: { email, role, program_id, reason }
 */
router.post('/user-application', handleAddUserApplication);

export default router;
