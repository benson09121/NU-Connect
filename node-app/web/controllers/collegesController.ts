import { Request, Response } from 'express';
import * as collegesModel from '../models/collegesModel';
import { broadcastToPage } from '../../services/websocketService';

// ---------------------------------------------------------------------------
// GET /colleges
// ---------------------------------------------------------------------------

export async function getAllColleges(req: Request, res: Response): Promise<void> {
  try {
    const colleges = await collegesModel.getAllColleges();
    res.json(colleges);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch colleges.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /colleges
// ---------------------------------------------------------------------------

export async function createCollege(req: Request, res: Response): Promise<void> {
  const { name, abbreviation } = req.body as { name: string; abbreviation: string };

  if (!name || !abbreviation) {
    res.status(422).json({ success: false, error: 'name and abbreviation are required.' });
    return;
  }

  try {
    const college = await collegesModel.createCollege(name, abbreviation);
    broadcastToPage('accounts', 'college:created', { college_id: college.college_id });
    res.json({ success: true, message: 'College created successfully.', data: college });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'A college with this name or abbreviation already exists.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create college.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// PUT /colleges
// ---------------------------------------------------------------------------

export async function updateCollege(req: Request, res: Response): Promise<void> {
  const { college_id, name, abbreviation } = req.body as {
    college_id: number;
    name: string;
    abbreviation: string;
  };

  if (!college_id || !name || !abbreviation) {
    res.status(422).json({ success: false, error: 'college_id, name and abbreviation are required.' });
    return;
  }

  try {
    await collegesModel.updateCollege(Number(college_id), name, abbreviation);
    broadcastToPage('accounts', 'college:updated', { college_id });
    res.json({ success: true, message: 'College updated successfully.' });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'A college with this name or abbreviation already exists.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to update college.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /colleges/archive
// ---------------------------------------------------------------------------

export async function archiveCollege(req: Request, res: Response): Promise<void> {
  const { college_id, reason } = req.body as { college_id: number; reason?: string };

  if (!college_id) {
    res.status(422).json({ success: false, error: 'college_id is required.' });
    return;
  }

  try {
    await collegesModel.archiveCollege(Number(college_id), reason ?? '', req.user?.user_id ?? '');
    broadcastToPage('accounts', 'college:archived', { college_id });
    res.json({ success: true, message: 'College archived successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive college.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /colleges/unarchive
// ---------------------------------------------------------------------------

export async function unarchiveCollege(req: Request, res: Response): Promise<void> {
  const { college_id } = req.body as { college_id: number };

  if (!college_id) {
    res.status(422).json({ success: false, error: 'college_id is required.' });
    return;
  }

  try {
    await collegesModel.unarchiveCollege(Number(college_id));
    broadcastToPage('accounts', 'college:unarchived', { college_id });
    res.json({ success: true, message: 'College restored successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to restore college.';
    res.status(500).json({ success: false, error: msg });
  }
}
