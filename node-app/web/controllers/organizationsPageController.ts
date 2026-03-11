/**
 * web/controllers/organizationsPageController.ts
 *
 * Handles the three Organizations Page endpoints:
 *
 *   GET /api/web/organizations                        → list of orgs scoped to user
 *   GET /api/web/organizations/recent-activities      → recent activity feed
 *   GET /api/web/organizations/upcoming-events        → upcoming approved events
 *
 * Auth: Bearer token via validateAzureJWT middleware (Azure AD JWKS).
 * The user is ALWAYS identified by req.user.email (Azure preferred_username).
 * ALL scoping/filtering is done in the model — the frontend receives only
 * what it is allowed to see.
 *
 * WebSocket emissions are handled by organizationsPageBroadcast.ts which is
 * called from mutation endpoints (e.g. when an org status changes, a membership
 * is approved, or an event is approved).
 */

import { Request, Response } from 'express';
import {
  getOrganizationsList,
  getRecentActivities,
  getUpcomingEvents,
  getOrgLogoPath,
  updateAdviser,
  getOrgBySlug,
  getOrgDashboard,
  getOrgApplications,
  getOrgEventSubmissions,
  getOrgRenewalStatus,
  getArchivedOrganizations,
  archiveOrganization,
  restoreOrganization,
} from '../models/organizationsPageModel';
import { storage } from '../../config/storage';
import { notify, logActivity } from '../../services/notificationAndLogService';
import { invalidatePermissionCache } from '../../services/permissionService';
import { broadcastToPage, broadcastToOrgDetail } from '../../services/websocketService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEmail(req: Request): string | undefined {
  return req.user?.email;
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[OrganizationsPage] ${context} error:`, err);

  if (message === 'USER_NOT_FOUND') {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'User not found in the system',
    });
    return;
  }

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  });
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations
// ---------------------------------------------------------------------------

/**
 * Returns the list of organizations scoped to the authenticated user's role.
 *
 * Roles → what they see:
 *   Academic Director | SDAO | Faculty  → ALL organizations
 *   Dean                                → organizations under their college(s)
 *   Program Chair                       → organizations under their program(s)
 *   Adviser                             → organizations they are assigned to
 *   Student                             → organizations they are members of
 */
export async function listOrganizations(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);

  if (!email) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token invalid or expired',
    });
    return;
  }

  try {
    const result = await getOrganizationsList(email);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listOrganizations');
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/recent-activities
// ---------------------------------------------------------------------------

/**
 * Returns recent activity feed scoped to the authenticated user's role.
 *
 * Query params:
 *   ?page=1   (default: 1)
 *   ?limit=10 (default: 10)
 *
 * Student scoping:
 *   - Student is president of org → sees ALL activity for that org
 *   - Student is regular member   → sees only their own activity
 */
export async function listRecentActivities(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);

  if (!email) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token invalid or expired',
    });
    return;
  }

  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10) || 10));

  try {
    const result = await getRecentActivities(email, page, limit);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listRecentActivities');
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/upcoming-events
// ---------------------------------------------------------------------------

/**
 * Returns upcoming approved events scoped to the authenticated user's role.
 *
 * Only events where:
 *   - status = 'Approved'
 *   - start_date >= NOW()
 *   - ordered by start_date ASC (soonest first)
 *
 * Student scoping:
 *   - public events (Open_to_all | NU_Students_only) → always visible
 *   - Members_only events → visible only if student is a member of that org
 */
export async function listUpcomingEvents(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);

  if (!email) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Token invalid or expired',
    });
    return;
  }

  try {
    const result = await getUpcomingEvents(email);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listUpcomingEvents');
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/:orgId/logo
// ---------------------------------------------------------------------------

/**
 * Serves the organisation logo.
 * Auth-protected — same validateAzureJWT as the other /api/web/ routes.
 *
 * Delegates all file resolution to the StorageAdapter (config/storage.ts).
 * The active adapter is selected via the STORAGE_PROVIDER env var:
 *
 *   STORAGE_PROVIDER=local      → streams file from local disk via res.sendFile()
 *   STORAGE_PROVIDER=azure-blob → 302 redirect to a short-lived Azure Blob SAS URL
 *   STORAGE_PROVIDER=s3         → 302 redirect to a short-lived S3 pre-signed URL
 *
 * To switch storage backends: set STORAGE_PROVIDER and implement the adapter
 * in config/storage.ts. No changes needed here.
 */
export async function serveOrgLogo(req: Request, res: Response): Promise<void> {
  const orgId = parseInt(String(req.params.orgId), 10);

  if (isNaN(orgId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid organization ID' });
    return;
  }

  try {
    const logoInfo = await getOrgLogoPath(orgId);

    if (!logoInfo) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Logo not found' });
      return;
    }

    const { versionId, logoPath } = logoInfo;
    const filename = logoPath.split('/').pop() ?? logoPath;

    // Relative path — the storage adapter decides where this actually lives
    const relativePath = `organizations/${orgId}/${versionId}/logo/${filename}`;

    let file;
    try {
      file = await storage.resolve(relativePath);
    } catch {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Logo file not found in storage' });
      return;
    }

    if (file.type === 'local') {
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.sendFile(file.absolutePath);
    } else {
      // Azure Blob, S3, MinIO — redirect to the pre-signed/SAS URL
      res.redirect(302, file.url);
    }
  } catch (err) {
    handleError(res, err, 'serveOrgLogo');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/web/organizations/:orgId/adviser
// ---------------------------------------------------------------------------

/**
 * Change the adviser assigned to an organisation.
 *
 * Body: { adviser_id: string }   — the new adviser's tbl_user.user_id
 *
 * Side effects:
 *   - Invalidates permission caches for old + new adviser
 *   - Sends notification to both old and new adviser
 *   - Logs the activity
 *   - Broadcasts to the organisations page so the list refreshes
 */
export async function changeAdviser(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);
  if (!email) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    return;
  }

  const orgId = parseInt(String(req.params.orgId), 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid organization ID' });
    return;
  }

  const { adviser_id } = req.body ?? {};
  if (!adviser_id || typeof adviser_id !== 'string') {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'adviser_id (string) is required in the request body',
    });
    return;
  }

  try {
    const result = await updateAdviser(orgId, adviser_id);

    // ── Cache invalidation ─────────────────────────────────────────────────
    // Both old and new adviser need fresh permission bundles
    if (result.old_adviser) {
      await invalidatePermissionCache(result.old_adviser.user_id);
    }
    await invalidatePermissionCache(result.new_adviser.user_id);

    // ── Resolve acting user for logging ────────────────────────────────────
    const { prisma } = await import('../../config/db');
    const actingUser = await prisma.tbl_user.findFirst({
      where: { email },
      select: { user_id: true, f_name: true, l_name: true },
    });
    const actingUserId = actingUser?.user_id ?? email;
    const actingName = actingUser
      ? `${actingUser.f_name ?? ''} ${actingUser.l_name ?? ''}`.trim() || email
      : email;

    // ── Notify NEW adviser ─────────────────────────────────────────────────
    await notify({
      recipientIds: [result.new_adviser.user_id],
      sender: { id: actingUserId, name: actingName },
      title: `Adviser Assignment: "${result.organization_name}"`,
      message: `You have been assigned as the adviser of "${result.organization_name}".`,
      type: 'adviser_assigned',
      entityType: 'organization',
      entityId: result.organization_id,
    });

    // ── Notify OLD adviser ─────────────────────────────────────────────────
    if (result.old_adviser) {
      await notify({
        recipientIds: [result.old_adviser.user_id],
        sender: { id: actingUserId, name: actingName },
        title: `Adviser Unassigned: "${result.organization_name}"`,
        message: `You have been unassigned as the adviser of "${result.organization_name}". ${result.new_adviser.full_name} is now the new adviser.`,
        type: 'adviser_unassigned',
        entityType: 'organization',
        entityId: result.organization_id,
      });
    }

    // ── Activity log ───────────────────────────────────────────────────────
    await logActivity({
      userId: actingUserId,
      userEmail: email,
      fullName: actingName,
      action: `Adviser for "${result.organization_name}" changed from ${result.old_adviser?.full_name ?? 'none'} to ${result.new_adviser.full_name}`,
      actionType: 'adviser_changed',
      entityType: 'organization',
      entityId: result.organization_id,
    });

    // ── Broadcast to organisations page ────────────────────────────────────
    broadcastToPage('organizations', 'organization:adviser-changed', {
      organization_id: result.organization_id,
      new_adviser: result.new_adviser,
      old_adviser: result.old_adviser,
    });

    // ── Broadcast to org-detail room ──────────────────────────────────────
    broadcastToOrgDetail(result.organization_id, 'org:updated', {
      org_id: result.organization_id,
      change: 'adviser_changed',
    });

    res.status(200).json({
      success: true,
      message: `Adviser updated to ${result.new_adviser.full_name}`,
      data: {
        organization_id: result.organization_id,
        organization_name: result.organization_name,
        old_adviser: result.old_adviser,
        new_adviser: result.new_adviser,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === 'ORGANIZATION_NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found' });
      return;
    }
    if (message === 'ADVISER_USER_NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Adviser user not found' });
      return;
    }
    if (message === 'USER_IS_NOT_ADVISER') {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'The specified user does not have the Adviser role' });
      return;
    }
    if (message === 'SAME_ADVISER') {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'This user is already the adviser of this organization' });
      return;
    }

    handleError(res, err, 'changeAdviser');
  }
}

export default { listOrganizations, listRecentActivities, listUpcomingEvents, serveOrgLogo, changeAdviser };

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/dashboard
// ---------------------------------------------------------------------------

export async function getOrgDashboardHandler(req: Request, res: Response): Promise<void> {
  const orgId = parseInt(req.params.orgId as string, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'orgId must be a number' });
    return;
  }
  try {
    const data = await getOrgDashboard(orgId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handleError(res, err, 'getOrgDashboard');
  }
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/applications
// ---------------------------------------------------------------------------

export async function getOrgApplicationsHandler(req: Request, res: Response): Promise<void> {
  const orgId = parseInt(req.params.orgId as string, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'orgId must be a number' });
    return;
  }
  try {
    const applications = await getOrgApplications(orgId);
    res.status(200).json({ success: true, data: applications });
  } catch (err) {
    handleError(res, err, 'getOrgApplications');
  }
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/event-submissions
// ---------------------------------------------------------------------------

export async function getOrgEventSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const orgId = parseInt(req.params.orgId as string, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'orgId must be a number' });
    return;
  }
  try {
    const submissions = await getOrgEventSubmissions(orgId);
    res.status(200).json({ success: true, data: submissions });
  } catch (err) {
    handleError(res, err, 'getOrgEventSubmissions');
  }
}

// ---------------------------------------------------------------------------
// GET /organizations/:orgId/renewal-status
// ---------------------------------------------------------------------------

export async function getOrgRenewalStatusHandler(req: Request, res: Response): Promise<void> {
  const orgId = parseInt(req.params.orgId as string, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'orgId must be a number' });
    return;
  }
  try {
    const data = await getOrgRenewalStatus(orgId);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    handleError(res, err, 'getOrgRenewalStatus');
  }
}

// ---------------------------------------------------------------------------
// GET /organizations/archived
// ---------------------------------------------------------------------------

export async function listArchivedOrganizations(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);
  if (!email) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    return;
  }
  try {
    const result = await getArchivedOrganizations(email);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listArchivedOrganizations');
  }
}

// ---------------------------------------------------------------------------
// POST /archive-organization
// ---------------------------------------------------------------------------

export async function archiveOrganizationHandler(req: Request, res: Response): Promise<void> {
  const { organization_id, reason } = req.body as { organization_id?: number; reason?: string };

  if (!organization_id || !reason) {
    res.status(400).json({ success: false, error: 'Missing required fields: organization_id and reason' });
    return;
  }

  const archivedBy = (req.user as any)?.user_id;
  if (!archivedBy) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    await archiveOrganization({ organizationId: Number(organization_id), reason, archivedBy });

    const { broadcastGlobal } = await import('../../services/websocketService');
    broadcastGlobal('organization:archived', { organization_id });

    const actingName = `${(req.user as any)?.f_name ?? ''} ${(req.user as any)?.l_name ?? ''}`.trim() || (req.user as any)?.email;
    logActivity({
      userId: archivedBy,
      userEmail: (req.user as any)?.email ?? '',
      fullName: actingName,
      action: `Archived organization ID ${organization_id}: ${reason}`,
      actionType: 'organization_archived',
      entityType: 'organization',
      entityId: Number(organization_id),
      organizationId: Number(organization_id),
    });

    res.status(200).json({ success: true, message: 'Organization archived successfully.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'ORG_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Organization not found.' });
      return;
    }
    if (message === 'ORG_ALREADY_ARCHIVED') {
      res.status(404).json({ success: false, error: 'Organization is already archived.' });
      return;
    }
    handleError(res, err, 'archiveOrganization');
  }
}

// ---------------------------------------------------------------------------
// POST /restore-organization
// ---------------------------------------------------------------------------

export async function restoreOrganizationHandler(req: Request, res: Response): Promise<void> {
  const { organization_id } = req.body as { organization_id?: number };

  if (!organization_id) {
    res.status(400).json({ success: false, error: 'Missing required field: organization_id' });
    return;
  }

  const restoredBy = (req.user as any)?.user_id;
  if (!restoredBy) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    await restoreOrganization({ organizationId: Number(organization_id) });

    const { broadcastGlobal } = await import('../../services/websocketService');
    broadcastGlobal('organization:restored', { organization_id });

    const actingName = `${(req.user as any)?.f_name ?? ''} ${(req.user as any)?.l_name ?? ''}`.trim() || (req.user as any)?.email;
    logActivity({
      userId: restoredBy,
      userEmail: (req.user as any)?.email ?? '',
      fullName: actingName,
      action: `Restored organization ID ${organization_id}`,
      actionType: 'organization_restored',
      entityType: 'organization',
      entityId: Number(organization_id),
      organizationId: Number(organization_id),
    });

    res.status(200).json({ success: true, message: 'Organization restored successfully.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'ORG_NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Organization not found.' });
      return;
    }
    if (message === 'ORG_NOT_ARCHIVED') {
      res.status(404).json({ success: false, error: 'Organization is not in an archived state.' });
      return;
    }
    handleError(res, err, 'restoreOrganization');
  }
}

// ---------------------------------------------------------------------------
// GET /organizations/by-slug/:slug
// ---------------------------------------------------------------------------

export async function getOrgBySlugHandler(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;

  if (!slug || typeof slug !== 'string') {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'slug is required' });
    return;
  }

  try {
    const org = await getOrgBySlug(slug);

    if (!org) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: `No organization found with slug "${slug}"`,
      });
      return;
    }

    res.status(200).json(org);
  } catch (err) {
    handleError(res, err, 'getOrgBySlug');
  }
}
