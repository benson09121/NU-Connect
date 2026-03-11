/**
 * web/controllers/globalRequirementController.ts
 *
 * Handlers for the Global Requirements Pool endpoints:
 *
 *   GET    /api/web/organizations/requirements                        → list
 *   POST   /api/web/organizations/requirements                        → create (multipart)
 *   PATCH  /api/web/organizations/requirements/:requirementId         → edit (multipart)
 *   DELETE /api/web/organizations/requirements/:requirementId         → archive or delete
 *   GET    /api/web/organizations/requirements/:requirementId/template → download template
 *
 * Auth: Bearer token via validateAzureJWT middleware.
 * File uploads: express-fileupload — field name is `template_file`.
 *
 * Storage path convention (under nuconnect-files/):
 *   Relative: requirements/{filename}
 *   Absolute: {STORAGE_BASE_PATH}/requirements/{filename}
 *
 * Real-time: broadcastApplicationPeriodUpdated() fires after every mutation.
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import type { UploadedFile } from 'express-fileupload';
import {
  listGlobalRequirements,
  createGlobalRequirement,
  updateGlobalRequirement,
  deleteOrArchiveRequirement,
  getRequirementTemplateInfo,
} from '../models/globalRequirementModel';
import { broadcastApplicationPeriodUpdated } from '../../services/organizationsPageBroadcast';
import { storage } from '../../config/storage';

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

function getEmail(req: Request): string | undefined {
  return req.user?.email;
}

function handleError(res: Response, err: unknown, context: string): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[GlobalRequirement] ${context} error:`, err);

  if (message === 'USER_NOT_FOUND') {
    res.status(404).json({ error: 'NOT_FOUND', message: 'User not found in the system' });
    return;
  }
  if (message === 'REQUIREMENT_NOT_FOUND') {
    res.status(404).json({ error: 'REQUIREMENT_NOT_FOUND', message: 'Requirement does not exist' });
    return;
  }
  if (message === 'DUPLICATE_NAME') {
    res.status(409).json({ error: 'DUPLICATE_NAME', message: 'A non-archived requirement with this name already exists' });
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
    console.warn(`[GlobalRequirement] Could not delete template file: ${filename}`, e);
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/requirements
// ---------------------------------------------------------------------------

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await listGlobalRequirements();
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err, 'list');
  }
}

// ---------------------------------------------------------------------------
// POST /api/web/organizations/requirements
// ---------------------------------------------------------------------------

/**
 * Creates a new requirement in the global pool.
 *
 * Body (multipart/form-data):
 *   requirement_name   string   required
 *   is_applicable_to   enum     required ("new" | "renew" | "both")
 *   template_file      File     optional
 */
export async function create(req: Request, res: Response): Promise<void> {
  const email = getEmail(req);
  if (!email) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token invalid or expired' });
    return;
  }

  const { requirement_name, is_applicable_to } = req.body ?? {};

  if (!requirement_name || String(requirement_name).trim().length < 2) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'requirement_name is required (min 2 chars)' });
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
    const requirement = await createGlobalRequirement(email, {
      requirement_name: String(requirement_name).trim(),
      is_applicable_to,
      file_path: storedFilePath,
    });

    res.status(201).json(requirement);

    broadcastApplicationPeriodUpdated().catch((e) =>
      console.error('[GlobalRequirement] broadcast error after create:', e)
    );
  } catch (err) {
    if (storedFilePath) removeTemplateFile(path.basename(storedFilePath));
    handleError(res, err, 'create');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/web/organizations/requirements/:requirementId
// ---------------------------------------------------------------------------

/**
 * Updates an existing requirement (partial update).
 *
 * Body (multipart/form-data — send only changed fields):
 *   requirement_name   string   optional
 *   is_applicable_to   enum     optional
 *   template_file      File     optional — replaces existing template
 */
export async function edit(req: Request, res: Response): Promise<void> {
  const requirementId = parseInt(String(req.params.requirementId), 10);
  if (isNaN(requirementId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid requirement ID' });
    return;
  }

  const { requirement_name, is_applicable_to } = req.body ?? {};

  const updateData: Record<string, any> = {};
  if (requirement_name !== undefined) updateData.requirement_name = String(requirement_name).trim();
  if (is_applicable_to !== undefined) {
    if (!['new', 'renew', 'both'].includes(is_applicable_to)) {
      res.status(400).json({ error: 'INVALID_FIELD', message: 'is_applicable_to must be new, renew, or both' });
      return;
    }
    updateData.is_applicable_to = is_applicable_to;
  }

  // Handle optional new template file
  let newFilePath: string | null = null;
  let oldFilePath: string | null = null;
  const uploadedFile = req.files?.template_file as UploadedFile | undefined;

  if (uploadedFile) {
    const result = saveTemplateFile(uploadedFile);
    if ('error' in result) {
      res.status(400).json({ error: 'INVALID_FILE', message: result.error });
      return;
    }
    newFilePath = relativeTemplatePath(result.filename);
    updateData.file_path = newFilePath;
  }

  try {
    // Get old file_path before updating so we can clean it up
    if (newFilePath) {
      const oldInfo = await getRequirementTemplateInfo(requirementId);
      oldFilePath = oldInfo?.file_path ?? null;
    }

    const requirement = await updateGlobalRequirement(requirementId, updateData);
    res.status(200).json(requirement);

    // Clean up old file after successful update
    if (newFilePath && oldFilePath) {
      removeTemplateFile(path.basename(oldFilePath));
    }

    broadcastApplicationPeriodUpdated().catch((e) =>
      console.error('[GlobalRequirement] broadcast error after edit:', e)
    );
  } catch (err) {
    if (newFilePath) removeTemplateFile(path.basename(newFilePath));
    handleError(res, err, 'edit');
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/web/organizations/requirements/:requirementId
// ---------------------------------------------------------------------------

/**
 * Archive or hard-delete a requirement.
 *
 * If the requirement has FK connections → soft-archive (200 { archived: true }).
 * If not → hard-delete (200 { deleted: true }).
 */
export async function remove(req: Request, res: Response): Promise<void> {
  const requirementId = parseInt(String(req.params.requirementId), 10);
  if (isNaN(requirementId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid requirement ID' });
    return;
  }

  try {
    const result = await deleteOrArchiveRequirement(requirementId);

    if (result.deleted) {
      res.status(200).json({ deleted: true });
      // Clean up template file on hard-delete
      if (result.file_path) removeTemplateFile(path.basename(result.file_path));
    } else {
      res.status(200).json({ archived: true });
    }

    broadcastApplicationPeriodUpdated().catch((e) =>
      console.error('[GlobalRequirement] broadcast error after delete/archive:', e)
    );
  } catch (err) {
    handleError(res, err, 'remove');
  }
}

// ---------------------------------------------------------------------------
// GET /api/web/organizations/requirements/:requirementId/template
// ---------------------------------------------------------------------------

/**
 * Download the template file for a requirement.
 */
export async function downloadTemplate(req: Request, res: Response): Promise<void> {
  const requirementId = parseInt(String(req.params.requirementId), 10);
  if (isNaN(requirementId)) {
    res.status(400).json({ error: 'INVALID_ID', message: 'Invalid requirement ID' });
    return;
  }

  try {
    const info = await getRequirementTemplateInfo(requirementId);

    if (!info) {
      res.status(404).json({ error: 'NO_TEMPLATE', message: 'This requirement has no template file' });
      return;
    }

    let file;
    try {
      file = await storage.resolve(info.file_path);
    } catch {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Template file not found in storage' });
      return;
    }

    const filename = path.basename(info.file_path);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (file.type === 'local') {
      res.sendFile(file.absolutePath);
    } else {
      res.redirect(302, file.url);
    }
  } catch (err) {
    handleError(res, err, 'downloadTemplate');
  }
}

export default { list, create, edit, remove, downloadTemplate };
