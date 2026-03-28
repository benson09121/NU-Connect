/**
 * web/controllers/publicController.ts
 *
 * Request handlers for unauthenticated public routes.
 * Mounted at /api/web/public via web/routes/public.ts.
 */

import { Request, Response } from 'express';
import * as publicModel from '../models/publicModel';

// ---------------------------------------------------------------------------

export async function handleGetPrograms(req: Request, res: Response) {
  try {
    const data = await publicModel.getPrograms();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------

export async function handleGetRoles(req: Request, res: Response) {
  try {
    const roles = await publicModel.getRoles();
    res.json({ data: roles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------

export async function handleGetAccounts(req: Request, res: Response) {
  try {
    const accounts = await publicModel.getAccounts();
    res.json({ data: accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------

export async function handleGetPendingApplications(req: Request, res: Response) {
  try {
    const apps = await publicModel.getPendingApplications();
    res.json(apps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------

export async function handleAddUserApplication(req: Request, res: Response) {
  let { email, role, program_id, college, reason } = req.body;

  if (!email || !role || !reason) {
    res.status(400).json({ success: false, error: 'email, role, and reason are required.' });
    return;
  }

  // Normalize program_id — frontend sends null/omitted for roles without a program
  let resolvedProgramId: number | null = null;
  if (program_id !== undefined && program_id !== null && program_id !== '' && program_id !== 'not_applicable') {
    resolvedProgramId = Number(program_id) || null;
  }

  // college — only relevant for Dean role; null/undefined for all others
  const resolvedCollege: string | null = (college && typeof college === 'string' && college.trim()) ? college.trim() : null;

  try {
    await publicModel.addUserApplication(email, role, resolvedProgramId, reason, resolvedCollege);
    res.status(201).json({ success: true, message: 'Application submitted successfully.' });
  } catch (err: any) {
    if ((err as any).code === 'DUPLICATE') {
      res.status(409).json({ success: false, error: 'An application with this email already exists.' });
      return;
    }
    res.status(500).json({ success: false, error: err.message });
  }
}
