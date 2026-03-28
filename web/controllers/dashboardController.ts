/**
 * web/controllers/dashboardController.ts
 *
 * Handles GET /api/web/dashboard/stats
 *
 * Auth: Bearer token via validateAzureJWT middleware (Azure AD JWKS).
 * The user is ALWAYS identified by req.user.email (Azure preferred_username).
 * All model calls use email as the primary identifier — never user_id.
 */

import { Request, Response } from 'express';
import { getDashboardStats } from '../models/dashboardModel';

export async function getStats(req: Request, res: Response): Promise<void> {
  const email = req.user?.email;
  console.log(`[Dashboard] getStats requested by: ${email}`);
  if (!email) {
    res.status(401).json({ error: 'Unauthorized — no authenticated user' });
    return;
  }

  try {
    const stats = await getDashboardStats(email);
    res.status(200).json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === 'USER_NOT_FOUND') {
      res.status(404).json({ error: 'User not found in the system' });
      return;
    }

    console.error('[Dashboard] getStats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export default { getStats };
