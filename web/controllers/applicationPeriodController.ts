/**
 * web/controllers/applicationPeriodController.ts
 *
 * Handlers for the Application Periods endpoints (V2):
 *
 *   GET   /api/web/organizations/application-periods/active    → getActive (includes requirements)
 *   GET   /api/web/organizations/application-periods           → listAll
 *   POST  /api/web/organizations/application-periods           → create (accepts start_time, end_time, is_active)
 *   PATCH /api/web/organizations/application-periods/:periodId → edit (accepts start_time, end_time)
 *   PATCH /api/web/organizations/application-periods/:periodId/terminate → terminate
 *
 * Auth: Bearer token via validateAzureJWT middleware.
 * Identity: req.user.email (Azure preferred_username).
 *
 * Real-time: broadcastApplicationPeriodUpdated() fires 'application-period:updated'
 * to all sockets in the 'organizations' page room after every mutation.
 */

import { Request, Response } from 'express';
import {
  getActivePeriod,
  getAllPeriods,
  createPeriod,
  updatePeriod,
  terminatePeriod,
} from '../models/applicationPeriodModel';
import { broadcastApplicationPeriodUpdated } from '../../services/organizationsPageBroadcast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEmail(req: Request): string | undefined {
  return req.user?.email;
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ApplicationPeriod] ${context} error:`, err);

  if (message === 'USER_NOT_FOUND') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found in the system' });
    return;
  }
  if (message === 'PERIOD_NOT_FOUND') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Application period not found' });
    return;
  }
  if (message === 'INVALID_DATES') {
    res.status(400).json({ error: 'INVALID_DATES', message: 'Invalid date format. Use YYYY-MM-DD.' });
    return;
  }
  if (message === 'END_BEFORE_START') {
    res.status(400).json({ error: 'INVALID_DATES', message: 'end_date must be on or after start_date.' });
    return;
  }

  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/application-periods/active
// ---------------------------------------------------------------------------

/**
 * Returns the currently active application period WITH its assigned requirements.
 * 404 if no active period exists.
 */
export async function getActive(req: Request, res: Response): Promise<void> {
  try {
    const period = await getActivePeriod();
    if (!period) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'No active application period' });
      return;
    }
    res.status(200).json(period);
  } catch (err) {
    handleError(res, err, 'getActive');
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/application-periods
// ---------------------------------------------------------------------------

export async function listAll(req: Request, res: Response): Promise<void> {
  try {
    const result = await getAllPeriods();
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listAll');
  }
}

// ---------------------------------------------------------------------------
// POST /api/web/organizations/application-periods
// ---------------------------------------------------------------------------

/**
 * Creates a new application period.
 *
 * Body: { start_date, end_date, start_time?, end_time?, is_active? }
 */
export async function create(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);
  if (!email) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    return;
  }

  const { start_date, end_date, start_time, end_time, is_active } = req.body ?? {};
  if (!start_date || !end_date) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'start_date and end_date are required' });
    return;
  }

  try {
    const period = await createPeriod(email, { start_date, end_date, start_time, end_time, is_active });
    res.status(201).json(period);

    broadcastApplicationPeriodUpdated().catch((broadcastErr) =>
      console.error('[ApplicationPeriod] broadcast error after create:', broadcastErr)
    );
  } catch (err) {
    handleError(res, err, 'create');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/web/organizations/application-periods/:periodId
// ---------------------------------------------------------------------------

/**
 * Updates an existing period (partial update).
 *
 * Body: { start_date?, end_date?, start_time?, end_time? }
 */
export async function edit(req: Request, res: Response): Promise<void> {
  const periodId = parseInt(String(req.params.periodId), 10);
  if (isNaN(periodId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid period ID' });
    return;
  }

  const { start_date, end_date, start_time, end_time } = req.body ?? {};

  try {
    const period = await updatePeriod(periodId, { start_date, end_date, start_time, end_time });
    res.status(200).json(period);

    broadcastApplicationPeriodUpdated().catch((broadcastErr) =>
      console.error('[ApplicationPeriod] broadcast error after edit:', broadcastErr)
    );
  } catch (err) {
    handleError(res, err, 'edit');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/web/organizations/application-periods/:periodId/terminate
// ---------------------------------------------------------------------------

/**
 * Terminates a period by setting is_active = false.
 *
 * Response: { period_id, is_active: false }
 */
export async function terminate(req: Request, res: Response): Promise<void> {
  const periodId = parseInt(String(req.params.periodId), 10);
  if (isNaN(periodId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid period ID' });
    return;
  }

  try {
    const result = await terminatePeriod(periodId);
    res.status(200).json(result);

    broadcastApplicationPeriodUpdated().catch((broadcastErr) =>
      console.error('[ApplicationPeriod] broadcast error after terminate:', broadcastErr)
    );
  } catch (err) {
    handleError(res, err, 'terminate');
  }
}

export default { getActive, listAll, create, edit, terminate };
