/**
 * web/controllers/termsController.ts
 *
 * Handlers for the Academic Terms endpoints:
 *   GET    /api/web/term-payments/terms/current  — currently active term
 *   GET    /api/web/term-payments/terms          — all terms
 *   POST   /api/web/term-payments/terms          — create (SDAO)
 *   PUT    /api/web/term-payments/terms/:id      — update (SDAO)
 *   DELETE /api/web/term-payments/terms/:id      — delete (SDAO)
 */

import { Request, Response } from 'express';
import * as model from '../models/termsModel';
import { broadcastToPage } from '../../services/websocketService';
import { logActivity } from '../../services/notificationAndLogService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFullName(req: Request): string {
  const fn = req.user?.first_name ?? req.user?.f_name ?? '';
  const ln = req.user?.last_name ?? req.user?.l_name ?? '';
  return `${fn} ${ln}`.trim() || (req.user?.email ?? 'Unknown');
}

function parseTermId(req: Request, res: Response): number | null {
  const id = parseInt(req.params['id'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Term ID must be a number.' });
    return null;
  }
  return id;
}

function handleError(res: Response, err: unknown, context: string): void {
  const error = err as any;
  const code: string = error?.code ?? '';
  const message: string = error?.message ?? 'Unexpected error.';

  if (code === 'NOT_FOUND') {
    res.status(404).json({ message });
    return;
  }
  if (code === 'DUPLICATE_TERM') {
    res.status(409).json({ message });
    return;
  }
  if (code === 'HAS_PAYMENTS') {
    res.status(400).json({ message });
    return;
  }

  console.error(`[TermsController] ${context}:`, err);
  res.status(500).json({ message: 'Internal server error.' });
}

// ---------------------------------------------------------------------------
// GET /term-payments/terms/current
// ---------------------------------------------------------------------------

export async function getCurrentActiveTerm(req: Request, res: Response): Promise<void> {
  try {
    const term = await model.getCurrentActiveTerm();
    if (!term) {
      res.status(404).json({ message: 'No active term found.' });
      return;
    }
    res.json(term);
  } catch (err) {
    handleError(res, err, 'getCurrentActiveTerm');
  }
}

// ---------------------------------------------------------------------------
// GET /term-payments/terms
// ---------------------------------------------------------------------------

export async function getAllTerms(req: Request, res: Response): Promise<void> {
  try {
    const terms = await model.getAllTerms();
    res.json(terms);
  } catch (err) {
    handleError(res, err, 'getAllTerms');
  }
}

// ---------------------------------------------------------------------------
// POST /term-payments/terms
// ---------------------------------------------------------------------------

export async function createTerm(req: Request, res: Response): Promise<void> {
  const userId = req.user?.user_id;
  if (!userId) { res.status(401).json({ message: 'Unauthorized.' }); return; }

  const { academic_year, term_name, start_date, end_date } = req.body;
  if (!academic_year || !term_name || !start_date || !end_date) {
    res.status(400).json({ message: 'academic_year, term_name, start_date, and end_date are required.' });
    return;
  }

  const VALID_NAMES = ['First Term', 'Second Term', 'Third Term'];
  if (!VALID_NAMES.includes(term_name)) {
    res.status(400).json({ message: `term_name must be one of: ${VALID_NAMES.join(', ')}.` });
    return;
  }

  if (!/^\d{4}-\d{4}$/.test(academic_year)) {
    res.status(400).json({ message: 'academic_year must be in YYYY-YYYY format (e.g. 2024-2025).' });
    return;
  }

  if (new Date(start_date) >= new Date(end_date)) {
    res.status(400).json({ message: 'start_date must be before end_date.' });
    return;
  }

  try {
    const term = await model.createTerm({ academic_year, term_name, start_date, end_date, created_by: userId });
    try { broadcastToPage('terms', 'term:created', { term_id: term.term_id }); } catch (_) {}
    try {
      await logActivity({
        userId,
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Created academic term "${term_name}" for ${academic_year} (${start_date} – ${end_date})`,
        actionType: 'term_created',
        entityType: 'academic_term',
        entityId: term.term_id,
      });
    } catch (_) {}
    res.status(201).json({ message: 'Term created.', term });
  } catch (err) {
    handleError(res, err, 'createTerm');
  }
}

// ---------------------------------------------------------------------------
// PUT /term-payments/terms/:id
// ---------------------------------------------------------------------------

export async function updateTerm(req: Request, res: Response): Promise<void> {
  const id = parseTermId(req, res);
  if (id === null) return;

  const { academic_year, term_name, start_date, end_date } = req.body;

  if (term_name !== undefined) {
    const VALID_NAMES = ['First Term', 'Second Term', 'Third Term'];
    if (!VALID_NAMES.includes(term_name)) {
      res.status(400).json({ message: `term_name must be one of: ${VALID_NAMES.join(', ')}.` });
      return;
    }
  }

  if (academic_year !== undefined && !/^\d{4}-\d{4}$/.test(academic_year)) {
    res.status(400).json({ message: 'academic_year must be in YYYY-YYYY format (e.g. 2024-2025).' });
    return;
  }

  if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
    res.status(400).json({ message: 'start_date must be before end_date.' });
    return;
  }

  try {
    const term = await model.updateTerm(id, { academic_year, term_name, start_date, end_date });
    try { broadcastToPage('terms', 'term:updated', { term_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId: req.user?.user_id ?? '',
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Updated academic term #${id} "${term.term_name}" (${term.academic_year})`,
        actionType: 'term_updated',
        entityType: 'academic_term',
        entityId: id,
      });
    } catch (_) {}
    res.json({ message: 'Term updated.', term });
  } catch (err) {
    handleError(res, err, 'updateTerm');
  }
}

// ---------------------------------------------------------------------------
// DELETE /term-payments/terms/:id
// ---------------------------------------------------------------------------

export async function deleteTerm(req: Request, res: Response): Promise<void> {
  const id = parseTermId(req, res);
  if (id === null) return;

  try {
    const deleted = await model.deleteTerm(id);
    try { broadcastToPage('terms', 'term:deleted', { term_id: id }); } catch (_) {}
    try {
      await logActivity({
        userId: req.user?.user_id ?? '',
        userEmail: req.user?.email ?? '',
        fullName: getFullName(req),
        action: `Deleted academic term "${deleted.term_name}" (${deleted.academic_year})`,
        actionType: 'term_deleted',
        entityType: 'academic_term',
        entityId: id,
      });
    } catch (_) {}
    res.json({ message: 'Term deleted.' });
  } catch (err) {
    handleError(res, err, 'deleteTerm');
  }
}
