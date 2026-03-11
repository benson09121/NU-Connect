/**
 * web/controllers/periodRequirementAssignmentController.ts
 *
 * Handlers for assigning / unassigning requirements to/from periods:
 *
 *   GET    /api/web/organizations/application-periods/:periodId/requirements
 *   POST   /api/web/organizations/application-periods/:periodId/requirements
 *   DELETE /api/web/organizations/application-periods/:periodId/requirements/:requirementId
 *
 * POST supports two modes:
 *   Case A — Assign existing: body contains { requirement_id }
 *   Case B — Create + assign: multipart with requirement_name, is_applicable_to, template_file?
 *
 * Auth: Bearer token via validateAzureJWT middleware.
 * Real-time: broadcastApplicationPeriodUpdated() fires after every mutation.
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { UploadedFile } from 'express-fileupload';
import {
  getAssignedRequirements,
  assignExistingRequirement,
  createAndAssignRequirement,
  unassignRequirement,
} from '../models/periodRequirementAssignmentModel';
import { broadcastApplicationPeriodUpdated } from '../../services/organizationsPageBroadcast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt'];

/** Relative path for storage adapter */
function relativeTemplatePath(filename: string): string {
  return `requirements/${filename}`;
}

/** Absolute write path for file uploads */
function absoluteTemplateDir(): string {
  const base =
    process.env.STORAGE_BASE_PATH ??
    path.resolve(__dirname, '..', '..', 'nuconnect-files');
  return path.join(base, 'requirements');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePeriodId(req: Request): number | null {
  const id = parseInt(String(req.params.periodId), 10);
  return isNaN(id) ? null : id;
}

function parseRequirementId(req: Request): number | null {
  const id = parseInt(String(req.params.requirementId), 10);
  return isNaN(id) ? null : id;
}

function getEmail(req: Request): string | undefined {
  return req.user?.email;
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[PeriodReqAssignment] ${context} error:`, err);

  if (message === 'USER_NOT_FOUND') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found in the system' });
    return;
  }
  if (message === 'PERIOD_NOT_FOUND') {
    res.status(404).json({ error: 'INVALID_PERIOD', message: 'Application period not found' });
    return;
  }
  if (message === 'REQUIREMENT_NOT_FOUND') {
    res.status(404).json({ error: 'REQUIREMENT_NOT_FOUND', message: 'Requirement does not exist' });
    return;
  }
  if (message === 'ALREADY_ASSIGNED') {
    res.status(409).json({ error: 'ALREADY_ASSIGNED', message: 'Requirement already assigned to this period' });
    return;
  }
  if (message === 'DUPLICATE_NAME') {
    res.status(409).json({ error: 'DUPLICATE_NAME', message: 'A requirement with this name already exists' });
    return;
  }
  if (message === 'ASSIGNMENT_NOT_FOUND') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Requirement is not assigned to this period' });
    return;
  }

  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}

/**
 * Save an uploaded template file and return the stored filename.
 */
function saveTemplateFile(file: UploadedFile): { filename: string } | { error: string } {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` };
  }

  const dir = absoluteTemplateDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const base = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const filename = `template-${Date.now()}-${base}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.data);

  return { filename };
}

/** Delete a template file from disk — non-fatal if it doesn't exist. */
function removeTemplateFile(filename: string): void {
  try {
    const filePath = path.join(absoluteTemplateDir(), filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn(`[PeriodReqAssignment] Could not delete template file: ${filename}`, e);
  }
}

// ---------------------------------------------------------------------------
// GET .../application-periods/:periodId/requirements
// ---------------------------------------------------------------------------

export async function listAssigned(req: Request, res: Response): Promise<void> {
  const periodId = parsePeriodId(req);
  if (!periodId) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid period ID' });
    return;
  }

  try {
    const result = await getAssignedRequirements(periodId);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'listAssigned');
  }
}

// ---------------------------------------------------------------------------
// POST .../application-periods/:periodId/requirements
// ---------------------------------------------------------------------------

/**
 * Assign a requirement to a period.
 *
 * Case A — body contains { requirement_id } → assign existing from pool.
 * Case B — multipart form with requirement_name, is_applicable_to, template_file?
 *          → create new requirement in pool AND assign to period.
 */
export async function assignRequirement(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);
  if (!email) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    return;
  }

  const periodId = parsePeriodId(req);
  if (!periodId) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid period ID' });
    return;
  }

  const { requirement_id, requirement_name, is_applicable_to } = req.body ?? {};

  // Case A: assign existing requirement
  if (requirement_id) {
    const reqId = parseInt(String(requirement_id), 10);
    if (isNaN(reqId)) {
      res.status(400).json({ error: 'INVALID_ID', message: 'Invalid requirement_id' });
      return;
    }

    try {
      const result = await assignExistingRequirement(periodId, reqId);
      res.status(201).json(result);

      broadcastApplicationPeriodUpdated().catch((e) =>
        console.error('[PeriodReqAssignment] broadcast error after assign:', e)
      );
    } catch (err) {
      handleError(res, err, 'assignExisting');
    }
    return;
  }

  // Case B: create new requirement + assign
  if (!requirement_name || String(requirement_name).trim().length < 2) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'requirement_name is required (min 2 chars), or provide requirement_id to assign an existing requirement' });
    return;
  }
  if (!is_applicable_to || !['new', 'renew', 'both'].includes(is_applicable_to)) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'is_applicable_to is required (new, renew, or both)' });
    return;
  }

  // Handle optional template file
  let storedFilePath: string | null = null;
  const uploadedFile = req.files?.template_file as UploadedFile | undefined;
  if (uploadedFile) {
    const result = saveTemplateFile(uploadedFile);
    if ('error' in result) {
      res.status(400).json({ error: 'INVALID_FILE', message: result.error });
      return;
    }
    storedFilePath = relativeTemplatePath(result.filename);
  }

  try {
    const requirement = await createAndAssignRequirement(email, periodId, {
      requirement_name: String(requirement_name).trim(),
      is_applicable_to,
      file_path: storedFilePath,
    });

    res.status(201).json(requirement);

    broadcastApplicationPeriodUpdated().catch((e) =>
      console.error('[PeriodReqAssignment] broadcast error after create+assign:', e)
    );
  } catch (err) {
    if (storedFilePath) removeTemplateFile(path.basename(storedFilePath));
    handleError(res, err, 'createAndAssign');
  }
}

// ---------------------------------------------------------------------------
// DELETE .../application-periods/:periodId/requirements/:requirementId
// ---------------------------------------------------------------------------

/**
 * Unassign a requirement from a period.
 * Only removes the junction link — does NOT delete from the global pool.
 */
export async function unassign(req: Request, res: Response): Promise<void> {
  const periodId = parsePeriodId(req);
  const requirementId = parseRequirementId(req);

  if (!periodId || !requirementId) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid period or requirement ID' });
    return;
  }

  try {
    const result = await unassignRequirement(periodId, requirementId);
    res.status(200).json(result);

    broadcastApplicationPeriodUpdated().catch((e) =>
      console.error('[PeriodReqAssignment] broadcast error after unassign:', e)
    );
  } catch (err) {
    handleError(res, err, 'unassign');
  }
}

export default { listAssigned, assignRequirement, unassign };
