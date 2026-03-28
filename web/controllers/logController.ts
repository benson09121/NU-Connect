/**
 * web/controllers/logController.ts
 *
 * REST handlers for the Activity Log system.
 *
 * Routes (all under /api/web/logs):
 *   GET    /         → getLogs       (full paginated, role-scoped)
 *   GET    /recent   → getRecentLogs (dashboard widget)
 *   GET    /stats    → getLogStats   (dashboard summary cards)
 */

import { Request, Response } from 'express';
import * as logModel from '../models/logModel';

// ---------------------------------------------------------------------------
// 1. GET /logs
// ---------------------------------------------------------------------------

export async function getLogs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.email;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const action_type = req.query.action_type as string | undefined;
    const user_id = req.query.user_id as string | undefined;
    const organization_id = req.query.organization_id
      ? parseInt(req.query.organization_id as string, 10)
      : undefined;
    const start_date = req.query.start_date as string | undefined;
    const end_date = req.query.end_date as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await logModel.getLogs(userId, {
      page,
      limit,
      action_type,
      user_id,
      organization_id,
      start_date,
      end_date,
      search,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch logs', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 2. GET /logs/recent
// ---------------------------------------------------------------------------

export async function getRecentLogs(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.email;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string, 10) || 10;

    const data = await logModel.getRecentLogs(userId, limit);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching recent logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recent logs', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 3. GET /logs/stats
// ---------------------------------------------------------------------------

export async function getLogStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.email;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const data = await logModel.getLogStats(userId);

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch log stats', message: error.message });
  }
}
