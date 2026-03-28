import { Request, Response } from 'express';
import * as programsModel from '../models/programsModel';
import { broadcastToPage } from '../../services/websocketService';
import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Helper: resolve user_id from email
// ---------------------------------------------------------------------------

async function resolveUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.tbl_user.findUnique({ where: { email }, select: { user_id: true } });
  return user?.user_id ?? null;
}

// ---------------------------------------------------------------------------
// GET /programs
// ---------------------------------------------------------------------------

export async function getAllPrograms(req: Request, res: Response): Promise<void> {
  try {
    const programs = await programsModel.getAllPrograms();
    res.json(programs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch programs.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /programs
// ---------------------------------------------------------------------------

export async function createProgram(req: Request, res: Response): Promise<void> {
  const { college_id, name, abbreviation } = req.body as {
    college_id?: number;
    name?: string;
    abbreviation?: string;
    email?: string;
  };

  if (!college_id || !name || !abbreviation) {
    res.status(422).json({ success: false, error: 'college_id, name, and abbreviation are required.' });
    return;
  }

  let programId: number;
  try {
    const result = await programsModel.createProgram(Number(college_id), name.trim(), abbreviation.trim());
    programId = result.program_id;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'Program name or abbreviation already exists.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to create program.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'program:created', { program_id: programId });
  res.json({ success: true, program_id: programId });
}

// ---------------------------------------------------------------------------
// PUT /programs
// ---------------------------------------------------------------------------

export async function updateProgram(req: Request, res: Response): Promise<void> {
  const { program_id, college_id, name, abbreviation } = req.body as {
    program_id?: number;
    college_id?: number;
    name?: string;
    abbreviation?: string;
    email?: string;
  };

  if (!program_id || !college_id || !name || !abbreviation) {
    res.status(422).json({ success: false, error: 'program_id, college_id, name, and abbreviation are required.' });
    return;
  }

  try {
    await programsModel.updateProgram(
      Number(program_id),
      Number(college_id),
      name.trim(),
      abbreviation.trim(),
    );
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'Program name or abbreviation already exists.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to update program.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'program:updated', { program_id });
  res.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /programs/archive
// ---------------------------------------------------------------------------

export async function archiveProgram(req: Request, res: Response): Promise<void> {
  const { program_id, email, reason } = req.body as {
    program_id?: number;
    email?: string;
    reason?: string;
  };

  if (!program_id) {
    res.status(422).json({ success: false, error: 'program_id is required.' });
    return;
  }

  const archivedByUserId =
    req.user?.user_id ??
    (email ? (await resolveUserIdByEmail(email)) ?? '' : '');

  try {
    await programsModel.archiveProgram(Number(program_id), archivedByUserId, reason);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to archive program.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'program:archived', { program_id });
  res.json({ success: true });
}

// ---------------------------------------------------------------------------
// POST /programs/unarchive
// ---------------------------------------------------------------------------

export async function unarchiveProgram(req: Request, res: Response): Promise<void> {
  const { program_id } = req.body as { program_id?: number };

  if (!program_id) {
    res.status(422).json({ success: false, error: 'program_id is required.' });
    return;
  }

  try {
    await programsModel.unarchiveProgram(Number(program_id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unarchive program.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'program:unarchived', { program_id });
  res.json({ success: true });
}
