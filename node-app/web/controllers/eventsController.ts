/**
 * web/controllers/eventsController.ts
 *
 * TypeScript handlers for refactored Events endpoints:
 *   GET  /events/by-user-role
 *   GET  /blocked-periods
 *   POST /blocked-periods
 *   PUT  /blocked-periods/:id
 *   PUT  /blocked-periods/:id/archive
 *   PUT  /blocked-periods/:id/unarchive
 *   DELETE /blocked-periods/:id
 *   GET  /events/add-event-status
 *   GET  /events/specific
 *   GET  /event-requirement-submissions-by-organization
 *
 * All other event endpoints remain in the legacy eventController.js
 * until they are incrementally migrated.
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { UploadedFile } from 'express-fileupload';
import * as model from '../models/eventsModel';
import { broadcastToPage } from '../../services/websocketService';
import { storage } from '../../config/storage';
import { userHasPermission } from '../models/permissionModel';
import { logActivity } from '../../services/notificationAndLogService';

// ---------------------------------------------------------------------------
// GET /events/by-user-role?user_email=...  (or ?user_id=...)
// ---------------------------------------------------------------------------

export async function getEventsByUserRole(req: Request, res: Response): Promise<void> {
  try {
    // Identity always comes from the validated JWT — never from query params.
    const userId = req.user?.user_id;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const events = await model.getEventsByUserRole(userId);
    res.status(200).json(events);
  } catch (error: any) {
    console.error('[getEventsByUserRole] Error:', error);
    res.status(500).json({
      error: error.message ?? 'An error occurred while fetching events by user role.',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /blocked-periods?status=unarchived|archived|all
// ---------------------------------------------------------------------------

export async function getBlockedPeriods(req: Request, res: Response): Promise<void> {
  try {
    const raw = req.query.status as string | undefined;
    const status: 'unarchived' | 'archived' | 'all' =
      raw === 'archived' || raw === 'all' ? raw : 'unarchived';

    const periods = await model.getBlockedPeriods(status);
    res.status(200).json(periods);
  } catch (error: any) {
    console.error('[getBlockedPeriods] Error:', error);
    res.status(500).json({ error: error.message ?? 'Failed to fetch blocked periods.' });
  }
}

// ---------------------------------------------------------------------------
// GET /events/add-event-status?org_id=5
// ---------------------------------------------------------------------------

export async function getAddEventStatus(req: Request, res: Response): Promise<void> {
  const orgIdRaw = req.query.org_id as string | undefined;

  if (!orgIdRaw) {
    res.status(400).json({ error: 'org_id is required.' });
    return;
  }

  const orgId = parseInt(orgIdRaw, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'org_id must be a numeric value.' });
    return;
  }

  try {
    const status = await model.getAddEventStatusById(orgId);
    res.status(200).json(status);
  } catch (error: any) {
    res.status(500).json({
      error: error.message ?? 'An error occurred while fetching add event status.',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /events/specific?event_id=:id
// ---------------------------------------------------------------------------

export async function getEventById(req: Request, res: Response): Promise<void> {
  const eventIdRaw = req.query.event_id as string | undefined;

  if (!eventIdRaw) {
    res.status(400).json({ success: false, error: 'event_id is required.' });
    return;
  }

  const eventId = parseInt(eventIdRaw, 10);
  if (isNaN(eventId)) {
    res.status(400).json({ success: false, error: 'event_id must be numeric.' });
    return;
  }

  try {
    const event = await model.getEventById(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    res.status(200).json(event);
  } catch (error: any) {
    console.error('[getEventById] Error:', error);
    res.status(500).json({
      error: error.message ?? 'An error occurred while fetching the event.',
    });
  }
}

// ---------------------------------------------------------------------------
// GET /event-requirement-submissions-by-organization?organization_id=:id
// ---------------------------------------------------------------------------

export async function getPostEventSubmissionsByOrg(req: Request, res: Response): Promise<void> {
  const orgIdRaw = req.query.organization_id as string | undefined;

  if (!orgIdRaw) {
    res.status(400).json({ error: 'organization_id is required.' });
    return;
  }

  const orgId = parseInt(orgIdRaw, 10);
  if (isNaN(orgId)) {
    res.status(400).json({ error: 'organization_id must be numeric.' });
    return;
  }

  try {
    const submissions = await model.getPostEventSubmissionsByOrg(orgId);
    res.status(200).json(submissions);
  } catch (error: any) {
    console.error('[getPostEventSubmissionsByOrg] Error:', error);
    res.status(500).json({
      error: error.message ?? 'An error occurred while fetching post-event submissions.',
    });
  }
}

// ---------------------------------------------------------------------------
// Blocked period mutations
// ---------------------------------------------------------------------------

function getFullName(req: Request): string {
  const fn = req.user?.first_name ?? req.user?.f_name ?? '';
  const ln = req.user?.last_name ?? req.user?.l_name ?? '';
  return `${fn} ${ln}`.trim() || (req.user?.email ?? 'Unknown');
}

function parsePeriodId(req: Request, res: Response): number | null {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ success: false, error: 'Invalid blocked_period_id.' });
    return null;
  }
  return id;
}

function handleBlockedPeriodError(res: Response, error: any, context: string): void {
  const code = error?.code;
  if (code === 'NOT_FOUND') {
    res.status(404).json({ success: false, error: 'BLOCKED_PERIOD_NOT_FOUND', message: error.message });
  } else if (code === 'OVERLAP_ERROR') {
    res.status(409).json({
      message: error.message,
      conflictingPeriods: error?.conflictingPeriods ?? [],
    });
  } else if (code === 'ALREADY_ARCHIVED' || code === 'NOT_ARCHIVED') {
    res.status(409).json({ success: false, error: code, message: error.message });
  } else {
    console.error(`[${context}] Error:`, error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error.message ?? 'Unexpected error.' });
  }
}

export async function createBlockedPeriod(req: Request, res: Response): Promise<void> {
  const created_by = req.user?.user_id;
  if (!created_by) { res.status(401).json({ message: 'Unauthorized.' }); return; }

  const { start_date, end_date, reason } = req.body;
  if (!start_date || !end_date || !reason) {
    res.status(400).json({ success: false, error: 'MISSING_REQUIRED_FIELDS', message: 'start_date, end_date, and reason are required.' });
    return;
  }
  if (new Date(start_date) > new Date(end_date)) {
    res.status(400).json({ success: false, error: 'INVALID_DATE_RANGE', message: 'start_date cannot be later than end_date.' });
    return;
  }

  try {
    const period = await model.createBlockedPeriod({ start_date, end_date, reason, created_by });
    try { broadcastToPage('events', 'blocked-period:created', {}); } catch (_) {}
    try {
      await logActivity({
        userId: created_by,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Created blocked period "${reason}" (${start_date} – ${end_date})`,
        actionType: 'blocked_period_created',
        entityType: 'blocked_period',
        entityId: period.blocked_period_id,
      });
    } catch (_) {}
    res.status(201).json({ message: 'Blocked period created.', blocked_period: period });
  } catch (error: any) {
    handleBlockedPeriodError(res, error, 'createBlockedPeriod');
  }
}

export async function updateBlockedPeriod(req: Request, res: Response): Promise<void> {
  const id = parsePeriodId(req, res);
  if (id === null) return;

  const userId = req.user?.user_id ?? '';
  const { start_date, end_date, reason } = req.body;
  try {
    const period = await model.updateBlockedPeriod({ blocked_period_id: id, start_date, end_date, reason });
    try { broadcastToPage('events', 'blocked-period:updated', { blocked_period_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Updated blocked period "${period.reason}" (${start_date ?? period.start_date} – ${end_date ?? period.end_date})`,
        actionType: 'blocked_period_updated',
        entityType: 'blocked_period',
        entityId: id,
      });
    } catch (_) {}
    res.status(200).json({ message: 'Blocked period updated.', blocked_period: period });
  } catch (error: any) {
    handleBlockedPeriodError(res, error, 'updateBlockedPeriod');
  }
}

export async function archiveBlockedPeriod(req: Request, res: Response): Promise<void> {
  const id = parsePeriodId(req, res);
  if (id === null) return;

  const archived_by = req.user?.user_id;
  if (!archived_by) { res.status(401).json({ message: 'Unauthorized.' }); return; }

  const { archived_reason } = req.body;
  if (!archived_reason) {
    res.status(400).json({ success: false, message: 'archived_reason is required.' });
    return;
  }

  try {
    await model.archiveBlockedPeriod({ blocked_period_id: id, archived_by, archived_reason });
    try { broadcastToPage('events', 'blocked-period:archived', { blocked_period_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId: archived_by,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Archived blocked period #${id} — reason: "${archived_reason}"`,
        actionType: 'blocked_period_archived',
        entityType: 'blocked_period',
        entityId: id,
      });
    } catch (_) {}
    res.status(200).json({ message: 'Blocked period archived.' });
  } catch (error: any) {
    handleBlockedPeriodError(res, error, 'archiveBlockedPeriod');
  }
}

export async function unarchiveBlockedPeriod(req: Request, res: Response): Promise<void> {
  const id = parsePeriodId(req, res);
  if (id === null) return;

  const unarchived_by = req.user?.user_id;
  if (!unarchived_by) { res.status(401).json({ message: 'Unauthorized.' }); return; }

  const { unarchived_reason } = req.body;
  try {
    await model.unarchiveBlockedPeriod({ blocked_period_id: id, unarchived_by, unarchived_reason });
    try { broadcastToPage('events', 'blocked-period:unarchived', { blocked_period_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId: unarchived_by,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Unarchived blocked period #${id}`,
        actionType: 'blocked_period_unarchived',
        entityType: 'blocked_period',
        entityId: id,
      });
    } catch (_) {}
    res.status(200).json({ message: 'Blocked period unarchived.' });
  } catch (error: any) {
    handleBlockedPeriodError(res, error, 'unarchiveBlockedPeriod');
  }
}

export async function deleteBlockedPeriod(req: Request, res: Response): Promise<void> {
  const id = parsePeriodId(req, res);
  if (id === null) return;

  const userId = req.user?.user_id ?? '';
  try {
    const deleted = await model.deleteBlockedPeriod(id);
    try { broadcastToPage('events', 'blocked-period:deleted', { blocked_period_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Deleted blocked period "${deleted.reason}" (${deleted.start_date.toISOString().slice(0, 10)} – ${deleted.end_date.toISOString().slice(0, 10)})`,
        actionType: 'blocked_period_deleted',
        entityType: 'blocked_period',
        entityId: id,
      });
    } catch (_) {}
    res.status(200).json({ message: 'Blocked period deleted.' });
  } catch (error: any) {
    handleBlockedPeriodError(res, error, 'deleteBlockedPeriod');
  }
}

// ---------------------------------------------------------------------------
// Event Requirements helpers
// ---------------------------------------------------------------------------

const ALLOWED_REQ_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt'];

function absoluteRequirementsDir(): string {
  const base =
    process.env.STORAGE_BASE_PATH ??
    path.resolve(__dirname, '..', '..', 'nuconnect-files');
  return path.join(base, 'requirements');
}

function relativeRequirementPath(filename: string): string {
  return `requirements/${filename}`;
}

function saveRequirementFile(file: UploadedFile): { filename: string } | { error: string } {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_REQ_EXTENSIONS.includes(ext)) {
    return { error: `Invalid file type. Allowed: ${ALLOWED_REQ_EXTENSIONS.join(', ')}` };
  }
  const dir = absoluteRequirementsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const filename = `requirement-${Date.now()}-${base}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.data);
  return { filename };
}

function removeRequirementFile(filename: string): void {
  try {
    const filePath = path.join(absoluteRequirementsDir(), filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[EventRequirements] Could not delete file:', filename, e);
  }
}

// ---------------------------------------------------------------------------
// GET /event-requirements
// ---------------------------------------------------------------------------

export async function getEventRequirements(req: Request, res: Response): Promise<void> {
  try {
    const requirements = await model.getEventRequirements();
    res.json(requirements);
  } catch (err) {
    console.error('[EventRequirements] getEventRequirements error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// POST /requirements/batch-update-event
// ---------------------------------------------------------------------------

export async function batchUpdateEventRequirements(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.user_id;

    // Parse JSON arrays from body
    let addItems: Array<{ requirement_name: string; is_applicable_to: string }> = [];
    let updateItems: Array<{ requirement_id: number; requirement_name: string; is_applicable_to: string }> = [];
    let deleteItems: Array<{ requirement_id: number }> = [];

    try {
      if (req.body.add)    addItems    = typeof req.body.add    === 'string' ? JSON.parse(req.body.add)    : req.body.add;
      if (req.body.update) updateItems = typeof req.body.update === 'string' ? JSON.parse(req.body.update) : req.body.update;
      if (req.body.delete) deleteItems = typeof req.body.delete === 'string' ? JSON.parse(req.body.delete) : req.body.delete;
    } catch {
      res.status(400).json({ error: 'INVALID_BODY', message: 'add/update/delete must be valid JSON arrays' });
      return;
    }

    // Per-operation permission checks
    if (addItems.length > 0 && !(await userHasPermission(userId, 'CREATE_EVENT_REQUIREMENT'))) {
      res.status(403).json({ error: 'Access denied', required: ['CREATE_EVENT_REQUIREMENT'] });
      return;
    }
    if (updateItems.length > 0 && !(await userHasPermission(userId, 'UPDATE_EVENT_REQUIREMENT'))) {
      res.status(403).json({ error: 'Access denied', required: ['UPDATE_EVENT_REQUIREMENT'] });
      return;
    }
    if (deleteItems.length > 0 && !(await userHasPermission(userId, 'ARCHIVE_EVENT_REQUIREMENT'))) {
      res.status(403).json({ error: 'Access denied', required: ['ARCHIVE_EVENT_REQUIREMENT'] });
      return;
    }

    const added: number[]   = [];
    const updated: number[] = [];
    const archived: number[] = [];

    // ADD loop
    for (let i = 0; i < addItems.length; i++) {
      const item = addItems[i];
      const file = req.files?.[`add_file_${i}`] as UploadedFile | undefined;

      let filePath: string | null = null;
      if (file) {
        const result = saveRequirementFile(file);
        if ('error' in result) {
          res.status(400).json({ error: 'INVALID_FILE', message: result.error });
          return;
        }
        filePath = relativeRequirementPath(result.filename);
      }

      const id = await model.createEventRequirement({
        requirement_name: item.requirement_name,
        is_applicable_to: model.parseApplicableTo(item.is_applicable_to),
        file_path: filePath,
        created_by: userId,
      });
      added.push(id);
    }

    // UPDATE loop
    for (let i = 0; i < updateItems.length; i++) {
      const item = updateItems[i];
      const file = req.files?.[`update_file_${i}`] as UploadedFile | undefined;

      const existing = await model.getEventRequirementById(item.requirement_id);
      if (!existing) continue;

      let newFilePath: string | null | undefined = undefined; // undefined = no change
      if (file) {
        const result = saveRequirementFile(file);
        if ('error' in result) {
          res.status(400).json({ error: 'INVALID_FILE', message: result.error });
          return;
        }
        // Delete old file from disk if replacing
        if (existing.file_path) removeRequirementFile(path.basename(existing.file_path));
        newFilePath = relativeRequirementPath(result.filename);
      }

      await model.updateEventRequirement({
        requirement_id: item.requirement_id,
        requirement_name: item.requirement_name,
        is_applicable_to: model.parseApplicableTo(item.is_applicable_to),
        file_path: newFilePath,
      });
      updated.push(item.requirement_id);
    }

    // ARCHIVE (delete) loop
    for (const item of deleteItems) {
      await model.archiveEventRequirement(item.requirement_id);
      archived.push(item.requirement_id);
    }

    // Broadcast real-time updates
    if (added.length   > 0) { try { broadcastToPage('event-requirements', 'event-requirement:created', {}); } catch (_) {} }
    if (updated.length > 0) { try { broadcastToPage('event-requirements', 'event-requirement:updated', {}); } catch (_) {} }
    if (archived.length > 0) { try { broadcastToPage('event-requirements', 'event-requirement:deleted', {}); } catch (_) {} }

    res.json({
      success: true,
      message: `Processed: ${added.length} added, ${updated.length} updated, ${archived.length} archived.`,
      results: { added, updated, archived },
    });
  } catch (err) {
    console.error('[EventRequirements] batchUpdateEventRequirements error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  }
}

// ---------------------------------------------------------------------------
// GET /requirement-event-template?template_name=requirements/file.pdf
// ---------------------------------------------------------------------------

export async function getEventRequirementTemplate(req: Request, res: Response): Promise<void> {
  const rawName = String(req.query.template_name ?? '').trim();
  if (!rawName) {
    res.status(400).json({ error: 'MISSING_PARAM', message: 'template_name query param is required' });
    return;
  }

  // Strip any directory component to prevent path traversal
  const basename = path.basename(rawName);
  const relativePath = `requirements/${basename}`;

  try {
    let file;
    try {
      file = await storage.resolve(relativePath);
    } catch {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Template file not found' });
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);

    if (file.type === 'local') {
      res.sendFile(file.absolutePath);
    } else {
      res.redirect(302, file.url);
    }
  } catch (err) {
    console.error('[EventRequirements] getEventRequirementTemplate error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
  }
}

// ---------------------------------------------------------------------------
// Create Event — new endpoints
// ---------------------------------------------------------------------------

// GET /all-organizations
export async function getAllOrganizations(req: Request, res: Response): Promise<void> {
  try {
    const orgs = await model.getAllOrganizations();
    res.status(200).json(orgs);
  } catch (err: any) {
    console.error('[getAllOrganizations] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// GET /user-organizations
export async function getUserOrganizations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const organizations = await model.getUserOrganizations(userId);
    res.status(200).json({ organizations, timestamp: Date.now() });
  } catch (err: any) {
    console.error('[getUserOrganizations] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// GET /events/check-event-title?event_title=...
export async function checkEventTitle(req: Request, res: Response): Promise<void> {
  try {
    const event_title = String(req.query.event_title ?? '').trim();
    if (!event_title) {
      res.status(400).json({ message: 'event_title is required.' });
      return;
    }
    const matches = await model.checkEventTitleExists(event_title);
    res.status(200).json({
      taken: matches.length > 0,
      matches: matches.map((m) => ({ status: m.status })),
    });
  } catch (err: any) {
    console.error('[checkEventTitle] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// POST /events/check-schedule-conflict
export async function checkScheduleConflict(req: Request, res: Response): Promise<void> {
  try {
    const { venue_type, venue_ids: rawVenueIds, start_date, end_date, start_time, end_time } = req.body;

    if (!venue_type || !start_date || !end_date || !start_time || !end_time) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'venue_type, start_date, end_date, start_time, and end_time are required.' });
      return;
    }

    const isFaceToFace = venue_type === 'Face to face' || venue_type === 'Face_to_face';

    let venue_ids: number[] | null = null;
    if (isFaceToFace) {
      if (!rawVenueIds || (Array.isArray(rawVenueIds) && rawVenueIds.length === 0)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: 'venue_ids is required for Face to face events.' });
        return;
      }
      try {
        const parsed = typeof rawVenueIds === 'string' ? JSON.parse(rawVenueIds) : rawVenueIds;
        venue_ids = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(Number) : null;
      } catch { venue_ids = null; }
    }

    const conflicts = await model.checkScheduleConflictPrisma({
      venue_ids,
      start_date: String(start_date),
      end_date: String(end_date),
      start_time: String(start_time),
      end_time: String(end_time),
    });

    res.status(200).json({
      conflict: conflicts.length > 0,
      conflicts,
    });
  } catch (err: any) {
    console.error('[checkScheduleConflict] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// POST /events-SDAO — create SDAO event (multipart/form-data)
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function getEventsStorageDir(): string {
  const base =
    process.env.STORAGE_BASE_PATH ??
    path.resolve(__dirname, '..', '..', 'nuconnect-files');
  return path.join(base, 'events');
}

export async function createSDAOEvent(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const body = req.body;

    // Resolve user_id: favour JWT, fall back to user_id/user_email field (email → lookup)
    let resolvedUserId = userId;
    const bodyUserId = body.user_id as string | undefined;
    if (bodyUserId && bodyUserId.includes('@')) {
      const u = await model.getUserByEmail(bodyUserId);
      if (!u) { res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found for the provided email.' }); return; }
      resolvedUserId = u.user_id;
    }

    // Required fields
    const { title, description, venue_type, start_date, start_time, end_time } = body;
    if (!title || !description || !venue_type || !start_date || !start_time || !end_time) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title, description, venue_type, start_date, start_time, and end_time are required.' });
      return;
    }

    // Collaborators
    let collaborators: number[] | null = null;
    if (body.collaborators) {
      try {
        const raw = typeof body.collaborators === 'string' ? JSON.parse(body.collaborators) : body.collaborators;
        collaborators = Array.isArray(raw) && raw.length > 0 ? raw.map(Number) : null;
      } catch { collaborators = null; }
    }

    // Venue IDs (face-to-face multi-venue)
    let venue_ids: number[] | null = null;
    if ((venue_type === 'Face to face' || venue_type === 'Face_to_face') && body.venue_ids) {
      try {
        const raw = typeof body.venue_ids === 'string' ? JSON.parse(body.venue_ids) : body.venue_ids;
        venue_ids = Array.isArray(raw) && raw.length > 0 ? raw.map(Number) : null;
      } catch { venue_ids = null; }
    }

    // Handle image upload
    let imagePath: string | null = null;
    const imageFile = req.files?.image as UploadedFile | undefined;
    if (imageFile) {
      const ext = path.extname(imageFile.name).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: `Invalid image type. Allowed: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}` });
        return;
      }
      const base = path.basename(imageFile.name, ext).replace(/[^a-zA-Z0-9_\-.]/g, '_').substring(0, 60);
      const filename = `event-${Date.now()}-${base}${ext}`;
      // Save to a temp dir; will be moved after we have the event_id
      const tempDir = path.join(getEventsStorageDir(), 'SDAO', 'tmp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(path.join(tempDir, filename), imageFile.data);
      imagePath = filename;
    }

    // Pre-check: blocked periods + conflicts
    const conflicts = await model.checkScheduleConflictPrisma({
      venue_ids,
      start_date: String(start_date),
      end_date: body.end_date ? String(body.end_date) : String(start_date),
      start_time: String(start_time),
      end_time: String(end_time),
    });

    if (conflicts.length > 0) {
      const firstConflict = conflicts[0];
      const conflictErrorMap: Record<string, string> = {
        blocked_period: 'BLOCKED_PERIOD_CONFLICT',
        schedule_conflict: 'SCHEDULE_CONFLICT',
        duplicate_event: 'DUPLICATE_EVENT',
      };
      res.status(409).json({
        error: conflictErrorMap[firstConflict.conflict_type] ?? 'CONFLICT',
        message: firstConflict.conflict_message,
        conflicts,
      });
      return;
    }

    const event = await model.createEventRecord({
      user_id: resolvedUserId,
      title: String(title),
      description: String(description),
      venue_type: String(venue_type),
      venue: body.venue ? String(body.venue) : null,
      start_date: String(start_date),
      end_date: body.end_date ? String(body.end_date) : String(start_date),
      start_time: String(start_time),
      end_time: String(end_time),
      organization_id: null,
      cycle_number: null,
      event_type: 'SDAO',
      status: 'Approved',
      type: body.type ? String(body.type) : 'Free',
      is_open_to: body.is_open_to ? String(body.is_open_to) : 'Open_to_all',
      fee: body.fee !== '' && body.fee != null ? Number(body.fee) : null,
      capacity: body.capacity !== '' && body.capacity != null ? Number(body.capacity) : null,
      image: imagePath,
      collaborators,
      venue_ids,
    });

    // Move image from temp to final location (events/SDAO/{event_id}/publication_images/)
    if (imageFile && imagePath) {
      const tempPath = path.join(getEventsStorageDir(), 'SDAO', 'tmp', imagePath);
      const destDir = path.join(getEventsStorageDir(), 'SDAO', String(event.event_id), 'publication_images');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      if (fs.existsSync(tempPath)) {
        try {
          fs.copyFileSync(tempPath, path.join(destDir, imagePath));
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.warn('[createSDAOEvent] Could not move image:', e);
        }
      }
    }

    // Real-time broadcast
    try { broadcastToPage('events', 'event:created', { event_id: event.event_id }); } catch (_) {}

    // Log activity
    try {
      await logActivity({
        userId: resolvedUserId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Created SDAO event "${event.title}"`,
        actionType: 'sdao_event_created',
        entityType: 'event',
        entityId: event.event_id,
      });
    } catch (_) {}

    res.status(201).json({
      event_id: event.event_id,
      title: event.title,
      status: event.status,
    });
  } catch (err: any) {
    console.error('[createSDAOEvent] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// POST /event-applications — student org event application (multipart/form-data)
// ---------------------------------------------------------------------------

export async function createEventApplication(req: Request, res: Response): Promise<void> {
  try {
    const jwtUserId = req.user?.user_id;
    if (!jwtUserId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    // Parse JSON fields
    let eventBody: Record<string, any>;
    let requirements: Array<{ requirement_id: number; file_path?: string | null }> = [];

    try {
      eventBody = typeof req.body.event === 'string' ? JSON.parse(req.body.event) : (req.body.event ?? {});
    } catch {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'event field must be valid JSON.' });
      return;
    }

    try {
      if (req.body.requirements) {
        requirements = typeof req.body.requirements === 'string'
          ? JSON.parse(req.body.requirements)
          : req.body.requirements;
      }
    } catch {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'requirements field must be valid JSON array.' });
      return;
    }

    // Resolve applicant user_id from JWT
    let applicantUserId = jwtUserId;
    if (req.body.user_email) {
      const u = await model.getUserByEmail(String(req.body.user_email));
      if (!u) { res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found for the provided email.' }); return; }
      applicantUserId = u.user_id;
    }

    // Resolve organization_id & cycle_number
    let organization_id: number | null = eventBody.organization_id ? Number(eventBody.organization_id) : null;
    let cycle_number: number | null = eventBody.cycle_number ? Number(eventBody.cycle_number) : null;

    if (!organization_id || !cycle_number) {
      const membership = await model.getOrganizationMembership(applicantUserId);
      if (membership) {
        if (!organization_id) organization_id = membership.organization_id;
        if (!cycle_number) cycle_number = membership.cycle_number;
      }
    }

    if (!organization_id) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'organization_id is required in the event payload or user must be an active org member.' });
      return;
    }

    if (!cycle_number) {
      const cycle = await model.getCurrentCycleForOrganization(organization_id);
      if (!cycle) { res.status(400).json({ error: 'VALIDATION_ERROR', message: `No active cycle found for organization ${organization_id}.` }); return; }
      cycle_number = cycle.cycle_number;
    }

    // Required event fields
    const { title, description, venue_type, start_date, start_time, end_time } = eventBody;
    if (!title || !description || !venue_type || !start_date || !start_time || !end_time) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'title, description, venue_type, start_date, start_time, and end_time are required inside the event payload.' });
      return;
    }

    // Collaborators
    let collaborators: number[] | null = null;
    if (eventBody.collaborators || req.body.collaborators) {
      try {
        const raw = eventBody.collaborators ?? req.body.collaborators;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        collaborators = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(Number) : null;
      } catch { collaborators = null; }
    }

    // Venue IDs (face-to-face multi-venue)
    let appVenueIds: number[] | null = null;
    const appVenueType = eventBody.venue_type;
    if ((appVenueType === 'Face to face' || appVenueType === 'Face_to_face') && (eventBody.venue_ids ?? req.body.venue_ids)) {
      try {
        const raw = eventBody.venue_ids ?? req.body.venue_ids;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        appVenueIds = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(Number) : null;
      } catch { appVenueIds = null; }
    }

    // Handle publication image
    const publicationImage = req.files?.publicationImage as UploadedFile | undefined;
    let publicationImageFilename: string | null = null;

    // Determine destination dir (we need event_id first; save to temp)
    const tempDir = path.join(getEventsStorageDir(), 'tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    if (publicationImage) {
      publicationImageFilename = publicationImage.name || 'publication_image.png';
      fs.writeFileSync(path.join(tempDir, publicationImageFilename), publicationImage.data);
    }

    // Process requirement files (save to temp too)
    const requirementFilesMap: Record<number, UploadedFile> = {};
    for (const reqItem of requirements) {
      const fileKey = `requirement_${reqItem.requirement_id}`;
      const rf = req.files?.[fileKey] as UploadedFile | undefined;
      if (rf) requirementFilesMap[reqItem.requirement_id] = rf;
    }

    const resolvedRequirements = requirements.map((reqItem) => {
      const file = requirementFilesMap[reqItem.requirement_id];
      if (file) {
        const filename = `requirement-${Date.now()}-${file.name}`;
        return { requirement_id: reqItem.requirement_id, file_path: filename };
      }
      return { requirement_id: reqItem.requirement_id, file_path: reqItem.file_path ?? null };
    });

    // Create DB records
    const dbResult = await model.createEventApplicationRecord({
      organization_id,
      cycle_number,
      applicant_user_id: applicantUserId,
      event: {
        user_id: applicantUserId,
        title: String(title),
        description: String(description),
        venue_type: String(venue_type),
        venue: eventBody.venue ? String(eventBody.venue) : null,
        start_date: String(start_date),
        end_date: eventBody.end_date ? String(eventBody.end_date) : String(start_date),
        start_time: String(start_time),
        end_time: String(end_time),
        type: eventBody.type ? String(eventBody.type) : 'Free',
        is_open_to: eventBody.is_open_to ? String(eventBody.is_open_to) : 'Open_to_all',
        fee: eventBody.fee !== '' && eventBody.fee != null ? Number(eventBody.fee) : null,
        capacity: eventBody.capacity !== '' && eventBody.capacity != null ? Number(eventBody.capacity) : null,
        image: publicationImageFilename,
        venue_ids: appVenueIds,
      },
      requirements: resolvedRequirements,
      collaborators,
    });

    // Move files to their final locations
    const eventDir = path.join(
      getEventsStorageDir(),
      String(dbResult.organization_id),
      'events',
      String(dbResult.event_id),
    );
    const reqDir = path.join(eventDir, 'requirements');
    if (!fs.existsSync(reqDir)) fs.mkdirSync(reqDir, { recursive: true });

    if (publicationImage && publicationImageFilename) {
      const pubDir = path.join(eventDir, 'publication_images');
      if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
      const tmpSrc = path.join(tempDir, publicationImageFilename);
      if (fs.existsSync(tmpSrc)) {
        try {
          fs.copyFileSync(tmpSrc, path.join(pubDir, publicationImageFilename));
          fs.unlinkSync(tmpSrc);
        } catch (e) { console.warn('[createEventApplication] Could not move pub image:', e); }
      }
    }

    for (const reqItem of resolvedRequirements) {
      const file = requirementFilesMap[reqItem.requirement_id];
      if (file && reqItem.file_path) {
        fs.writeFileSync(path.join(reqDir, reqItem.file_path), file.data);
      }
    }

    // Real-time broadcast
    try { broadcastToPage('events', 'event:created', { event_id: dbResult.event_id }); } catch (_) {}

    // Log activity
    try {
      await logActivity({
        userId: applicantUserId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Submitted event application "${title}" for organization #${organization_id}`,
        actionType: 'event_application_created',
        entityType: 'event_application',
        entityId: dbResult.event_application_id,
      });
    } catch (_) {}

    res.status(201).json({
      application_id: dbResult.event_application_id,
      status: dbResult.status,
    });
  } catch (err: any) {
    console.error('[createEventApplication] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// GET /requirements/template?template_name=...
// Alias for getEventRequirementTemplate (same behaviour, different path)
export { getEventRequirementTemplate as getRequirementTemplate };
