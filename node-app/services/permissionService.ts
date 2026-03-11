/**
 * services/permissionService.ts
 *
 * Cache-aware permission layer.
 *
 * Flow:
 *  1. Check Valkey cache  →  return cached bundle if present
 *  2. Miss → query DB via permissionModel.getAllUserPermissions()
 *  3. Store result in Valkey with TTL  →  return bundle
 *
 * Cache key:   permissions:{userId}
 * Cache TTL:   PERMISSION_CACHE_TTL_SECONDS (default 5 min)
 *              Reduce if permissions change frequently; increase for performance.
 *
 * Invalidation:
 *  Call `invalidatePermissionCache(userId)` whenever:
 *  - A user's role changes
 *  - Org memberships are updated
 *  - Member overrides are added/removed
 *  - Committee memberships change
 */

import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import { getCache, setCache, deleteCache } from '../config/valkey';
import {
  getAllUserPermissions,
  getAllSystemPermissions,
  PermissionBundle,
  SystemPermission,
} from '../web/models/permissionModel';

const PERMISSION_CACHE_TTL = parseInt(process.env.PERMISSION_CACHE_TTL_SECONDS || '300', 10);

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Get the full permission bundle for a user, from cache or DB.
 */
export async function getPermissionBundle(userId: string): Promise<PermissionBundle> {
  const cacheKey = `permissions:${userId}`;

  // 1. Try cache — cast to PermissionBundle since we control what we store
  const cached = await getCache(cacheKey) as PermissionBundle | null;
  if (cached) return cached;

  // 2. DB fallback
  const bundle = await getAllUserPermissions(userId);

  // 3. Store in Valkey
  await setCache(cacheKey, bundle, PERMISSION_CACHE_TTL);

  return bundle;
}

/**
 * Warm the cache for a user (useful right after login).
 */
export async function warmPermissionCache(userId: string): Promise<PermissionBundle> {
  return getPermissionBundle(userId);
}

/**
 * Invalidate cached permissions for a user.
 */
export async function invalidatePermissionCache(userId: string): Promise<void> {
  await deleteCache(`permissions:${userId}`);
  console.log(`[PermissionService] Cache invalidated for user: ${userId}`);
}

// ---------------------------------------------------------------------------
// Permission check helpers (use these in middleware / WS handlers)
// ---------------------------------------------------------------------------

/**
 * Does the user have the given permission (optional org context)?
 * Returns true if the permission is in globalPermissions OR in the org's resolved list.
 */
export async function can(
  userId: string,
  permissionName: string,
  organizationId: number | null = null
): Promise<boolean> {
  const bundle = await getPermissionBundle(userId);

  if (bundle.globalPermissions.includes(permissionName)) return true;

  if (organizationId !== null) {
    const orgEntry = bundle.organizations[String(organizationId)];
    if (orgEntry?.resolved?.includes(permissionName)) return true;

    // Committee-level within that org
    const orgCommittees = bundle.committeePermissions[String(organizationId)] ?? {};
    for (const perms of Object.values(orgCommittees)) {
      if (perms.includes(permissionName)) return true;
    }
  } else {
    // Any org context
    for (const orgEntry of Object.values(bundle.organizations)) {
      if (orgEntry.resolved?.includes(permissionName)) return true;
    }
  }

  return false;
}

/**
 * Check multiple permissions at once (all must be satisfied).
 */
export async function canAll(
  userId: string,
  permissionNames: string[],
  organizationId: number | null = null
): Promise<boolean> {
  const checks = await Promise.all(permissionNames.map((p) => can(userId, p, organizationId)));
  return checks.every(Boolean);
}

/**
 * Check multiple permissions (any one is enough).
 */
export async function canAny(
  userId: string,
  permissionNames: string[],
  organizationId: number | null = null
): Promise<boolean> {
  const checks = await Promise.all(permissionNames.map((p) => can(userId, p, organizationId)));
  return checks.some(Boolean);
}

// ---------------------------------------------------------------------------
// Express middleware factory
// ---------------------------------------------------------------------------

// Extend Express Request to include user fields set by auth middleware
interface AuthenticatedRequest extends Request {
  user?: { user_id: string };
  userId?: string;
}

type OrgIdResolver = (req: AuthenticatedRequest) => number | null;

/**
 * Express middleware that requires a specific permission.
 * Assumes `req.user.user_id` is set by auth middleware.
 *
 * Usage:
 *   router.get('/secret', requirePermission('manage_analytics'), handler)
 *   router.get('/org/:orgId/members', requirePermission('view_org_members', req => Number(req.params.orgId)), handler)
 */
export function requirePermission(
  permissionName: string,
  orgIdResolver: OrgIdResolver | null = null
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.user_id ?? req.userId;
      if (!userId) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
      }

      const orgId = orgIdResolver ? orgIdResolver(req) : null;
      const allowed = await can(userId, permissionName, orgId);

      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden',
          required: permissionName,
        });
        return;
      }

      next();
    } catch (err) {
      console.error('[PermissionService] requirePermission error:', err);
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// System permissions list (cached)
// ---------------------------------------------------------------------------

const SYSTEM_PERMISSIONS_CACHE_KEY = 'system:permissions';
const SYSTEM_PERMISSIONS_TTL = 3600; // 1 hour – rarely changes

/**
 * Get all system permissions from cache or DB.
 */
export async function getSystemPermissions(): Promise<SystemPermission[]> {
  const cached = await getCache(SYSTEM_PERMISSIONS_CACHE_KEY) as SystemPermission[] | null;
  if (cached) return cached;

  const permissions = await getAllSystemPermissions();
  await setCache(SYSTEM_PERMISSIONS_CACHE_KEY, permissions, SYSTEM_PERMISSIONS_TTL);
  return permissions;
}