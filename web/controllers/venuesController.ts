/**
 * web/controllers/venuesController.ts
 *
 * Express handlers for the Venue management API:
 *   GET    /venues                       — list all venues, optionally with availability
 *   GET    /venues/with-availability     — dedicated availability endpoint (plain array, required params)
 *   POST   /venues                       — create a new venue  (MANAGE_VENUES)
 *   PUT    /venues/:id                   — update name/desc/capacity  (MANAGE_VENUES)
 *   PUT    /venues/:id/archive           — soft-delete  (MANAGE_VENUES)
 *   PUT    /venues/:id/unarchive         — restore  (MANAGE_VENUES)
 */

import { Request, Response } from 'express';
import * as model from '../models/venuesModel';
import { broadcastToPage } from '../../services/websocketService';
import { logActivity } from '../../services/notificationAndLogService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFullName(req: Request): string {
  const u = req.user as any;
  if (!u) return '';
  return [u.f_name, u.l_name].filter(Boolean).join(' ') || u.email || '';
}

// ---------------------------------------------------------------------------
// GET /venues
// ---------------------------------------------------------------------------

/**
 * Returns all active venues.
 * When start_date / start_time / end_time are supplied as query params,
 * each venue also gets `is_available` and `occupied_by` fields so that
 * the frontend can show "(Occupied)" for taken rooms.
 */
export async function getVenues(req: Request, res: Response): Promise<void> {
  try {
    const { start_date, end_date, start_time, end_time, exclude_event_id } = req.query;

    const hasTimeFilter = start_date && start_time && end_time;

    if (hasTimeFilter) {
      const venues = await model.getVenuesWithAvailability(
        String(start_date),
        end_date ? String(end_date) : String(start_date),
        String(start_time),
        String(end_time),
        exclude_event_id ? Number(exclude_event_id) : null,
      );
      res.status(200).json({ venues });
    } else {
      const venues = await model.getAllVenues();
      res.status(200).json({ venues });
    }
  } catch (err: any) {
    console.error('[getVenues] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// GET /venues/with-availability
// ---------------------------------------------------------------------------

/**
 * Dedicated availability endpoint used by the per-slot venue picker.
 * Returns a plain array (not wrapped in { venues }) of all Active venues
 * annotated with is_available and occupied_by[].
 *
 * All four query params are required:
 *   start_date  YYYY-MM-DD
 *   end_date    YYYY-MM-DD
 *   start_time  HH:mm:ss
 *   end_time    HH:mm:ss
 */
export async function getVenuesAvailability(req: Request, res: Response): Promise<void> {
  try {
    const { start_date, end_date, start_time, end_time } = req.query;

    if (!start_date || !end_date || !start_time || !end_time) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'start_date, end_date, start_time, and end_time are required.',
      });
      return;
    }

    const venues = await model.getVenuesWithAvailability(
      String(start_date),
      String(end_date),
      String(start_time),
      String(end_time),
      null,
    );

    // Only surface Active venues (archived_at already filtered in the model)
    const active = venues.filter((v) => v.status === 'Active');
    res.status(200).json(active);
  } catch (err: any) {
    console.error('[getVenuesAvailability] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// POST /venues
// ---------------------------------------------------------------------------

export async function createVenue(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const { name, description, capacity } = req.body;

    if (!name || String(name).trim().length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name is required.' });
      return;
    }

    const venue = await model.createVenue({
      name: String(name).trim(),
      description: description ? String(description) : null,
      capacity: capacity != null && capacity !== '' ? Number(capacity) : null,
      created_by: userId,
    });

    try { broadcastToPage('venues', 'venue:created', { venue_id: venue.venue_id }); } catch (_) {}

    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Created venue "${venue.name}"`,
        actionType: 'venue_created',
        entityType: 'venue',
        entityId: venue.venue_id,
      });
    } catch (_) {}

    res.status(201).json({ venue });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'DUPLICATE_NAME', message: `A venue named "${req.body.name}" already exists.` });
      return;
    }
    console.error('[createVenue] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// PUT /venues/:id
// ---------------------------------------------------------------------------

export async function updateVenue(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const venue_id = Number(req.params.id);
    if (isNaN(venue_id)) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid venue id.' }); return; }

    const { name, description, capacity } = req.body;

    const venue = await model.updateVenue({
      venue_id,
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? (description ? String(description) : null) : undefined,
      capacity: capacity !== undefined ? (capacity !== '' && capacity != null ? Number(capacity) : null) : undefined,
    });

    try { broadcastToPage('venues', 'venue:updated', { venue_id }); } catch (_) {}

    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Updated venue "${venue.name}"`,
        actionType: 'venue_updated',
        entityType: 'venue',
        entityId: venue.venue_id,
      });
    } catch (_) {}

    res.status(200).json({ venue });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') { res.status(404).json({ error: 'NOT_FOUND', message: err.message }); return; }
    if (err.code === 'ARCHIVED') { res.status(409).json({ error: 'ARCHIVED', message: err.message }); return; }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'DUPLICATE_NAME', message: `A venue with that name already exists.` });
      return;
    }
    console.error('[updateVenue] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// PUT /venues/:id/archive
// ---------------------------------------------------------------------------

export async function archiveVenue(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const venue_id = Number(req.params.id);
    if (isNaN(venue_id)) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid venue id.' }); return; }

    const { reason } = req.body;
    if (!reason || String(reason).trim().length === 0) {
      res.status(400).json({ error: 'VALIDATION_ERROR', message: 'reason is required when archiving a venue.' });
      return;
    }

    const venue = await model.archiveVenue({
      venue_id,
      archived_by: userId,
      archived_reason: String(reason).trim(),
    });

    try { broadcastToPage('venues', 'venue:archived', { venue_id }); } catch (_) {}

    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Archived venue "${venue.name}"`,
        actionType: 'venue_archived',
        entityType: 'venue',
        entityId: venue.venue_id,
      });
    } catch (_) {}

    res.status(200).json({ venue_id: venue.venue_id, archived: true });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') { res.status(404).json({ error: 'NOT_FOUND', message: err.message }); return; }
    if (err.code === 'ALREADY_ARCHIVED') { res.status(409).json({ error: 'ALREADY_ARCHIVED', message: err.message }); return; }
    console.error('[archiveVenue] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}

// ---------------------------------------------------------------------------
// PUT /venues/:id/unarchive
// ---------------------------------------------------------------------------

export async function unarchiveVenue(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.user_id;
    if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

    const venue_id = Number(req.params.id);
    if (isNaN(venue_id)) { res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid venue id.' }); return; }

    const venue = await model.unarchiveVenue(venue_id);

    try { broadcastToPage('venues', 'venue:unarchived', { venue_id }); } catch (_) {}

    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Unarchived venue "${venue.name}"`,
        actionType: 'venue_unarchived',
        entityType: 'venue',
        entityId: venue.venue_id,
      });
    } catch (_) {}

    res.status(200).json({ venue_id: venue.venue_id, archived: false });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') { res.status(404).json({ error: 'NOT_FOUND', message: err.message }); return; }
    if (err.code === 'NOT_ARCHIVED') { res.status(409).json({ error: 'NOT_ARCHIVED', message: err.message }); return; }
    console.error('[unarchiveVenue] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message ?? 'Unexpected error.' });
  }
}
