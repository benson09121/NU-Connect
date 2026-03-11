/**
 * web/controllers/permissionController.ts
 *
 * Thin request handlers for the permission system (V2).
 *
 * Refactored from permissionController.js → TypeScript with proper types.
 */

import { Request, Response } from 'express';
import {
  getPermissionBundle,
  getSystemPermissions,
  can,
} from '../../services/permissionService';
import { getPendingApplication } from '../models/createOrgModel';

// ---------------------------------------------------------------------------
// GET /api/web/me/permissions
// Returns the full permission bundle for the currently authenticated user.
// Works with both authMiddleware (JWT) and validateAzureJWT.
// ---------------------------------------------------------------------------
export async function getMyPermissions(req: Request, res: Response) {
  try {
    // Use email as userId — matches tbl_user.user_id / tbl_user.email in Prisma
    // validateAzureJWT sets req.user.email = verified.preferred_username
    const userId = req.user?.email;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const [bundle, pendingApp] = await Promise.all([
      getPermissionBundle(userId),
      getPendingApplication(userId),
    ]);
    const hasWebAccess = bundle.allResolved.includes('WEB_ACCESS');

    res.status(200).json({
      ...bundle,
      hasWebAccess,
      pendingApplication: pendingApp,
    });
  } catch (err) {
    console.error('[permissionController] getMyPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/me/can/:permission?orgId=1
// Quick permission check – returns { allowed: bool }
// ---------------------------------------------------------------------------
export async function checkPermission(req: Request, res: Response) {
  try {
    const userId = req.user?.email;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { permission } = req.params;
    const orgId = req.query.orgId ? Number(req.query.orgId) : null;

    const allowed = await can(userId, permission as string, orgId);
    res.status(200).json({ allowed, permission, orgId });
  } catch (err) {
    console.error('[permissionController] checkPermission error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/system/permissions
// Lists every permission that exists in the system (admin use, cached).
// ---------------------------------------------------------------------------
export async function listSystemPermissions(req: Request, res: Response) {
  try {
    const permissions = await getSystemPermissions();
    res.status(200).json(permissions);
  } catch (err) {
    console.error('[permissionController] listSystemPermissions error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}
