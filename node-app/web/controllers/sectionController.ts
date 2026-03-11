import { Request, Response } from 'express';
import * as sectionModel from '../models/sectionModel';
import { broadcastToPage } from '../../services/websocketService';

// ---------------------------------------------------------------------------
// POST /sections
// ---------------------------------------------------------------------------

export async function createSection(req: Request, res: Response): Promise<void> {
  const { section_name, program_id } = req.body as {
    section_name?: string;
    program_id?: number;
  };

  if (!section_name || !program_id) {
    res.status(422).json({ success: false, error: 'section_name and program_id are required.' });
    return;
  }

  let sectionId: number;
  try {
    const result = await sectionModel.createSection(section_name, Number(program_id));
    sectionId = result.section_id;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'A section with this name already exists in the selected program.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create section.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'section:created', { section_id: sectionId });
  res.json({ success: true, section_id: sectionId });
}

// ---------------------------------------------------------------------------
// PUT /sections/:section_id
// ---------------------------------------------------------------------------

export async function updateSection(req: Request, res: Response): Promise<void> {
  const sectionId = parseInt(req.params.section_id as string, 10);
  const { section_name, program_id } = req.body as {
    section_name?: string;
    program_id?: number;
  };

  if (!sectionId || !section_name || !program_id) {
    res.status(422).json({ success: false, error: 'section_id, section_name, and program_id are required.' });
    return;
  }

  try {
    await sectionModel.updateSection(sectionId, section_name, Number(program_id));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'A section with this name already exists in the selected program.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to update section.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'section:updated', { section_id: sectionId });
  res.json({ success: true });
}

// ---------------------------------------------------------------------------
// DELETE /sections/:section_id
// ---------------------------------------------------------------------------

export async function archiveSection(req: Request, res: Response): Promise<void> {
  const sectionId = parseInt(req.params.section_id as string, 10);

  if (!sectionId) {
    res.status(422).json({ success: false, error: 'section_id is required.' });
    return;
  }

  try {
    await sectionModel.archiveSection(sectionId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive section.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'section:archived', { section_id: sectionId });
  res.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /sections/:section_id/unarchive
// ---------------------------------------------------------------------------

export async function unarchiveSection(req: Request, res: Response): Promise<void> {
  const sectionId = parseInt(req.params.section_id as string, 10);

  if (!sectionId) {
    res.status(422).json({ success: false, error: 'section_id is required.' });
    return;
  }

  try {
    await sectionModel.unarchiveSection(sectionId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to restore section.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'section:unarchived', { section_id: sectionId });
  res.json({ success: true });
}
