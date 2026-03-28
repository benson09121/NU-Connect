/**
 * web/controllers/notificationController.ts
 *
 * REST handlers for the Notification system.
 *
 * Routes (all under /api/web/notifications):
 *   GET    /                  → getNotifications     (paginated, filtered by recipient)
 *   GET    /unread-count      → getUnreadCount       (badge count)
 *   PUT    /:id/read          → markRead             (mark single as read)
 *   PUT    /read-all          → markAllRead          (mark all as read)
 *   POST   /                  → createNotifications  (server-side / admin trigger)
 */

import { Request, Response } from 'express';
import * as notificationModel from '../models/notificationModel';
import { broadcastToUser } from '../../services/websocketService';
import { notify } from '../../services/notificationAndLogService';
import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Helper: resolve authenticated user's email → tbl_user.user_id
// ---------------------------------------------------------------------------

async function resolveAppUserId(email: string): Promise<string | null> {
  const user = await prisma.tbl_user.findFirst({
    where: { email },
    select: { user_id: true },
  });
  return user?.user_id ?? null;
}

// ---------------------------------------------------------------------------
// 1. GET /notifications
// ---------------------------------------------------------------------------

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const appUserId = await resolveAppUserId(email);
    if (!appUserId) {
      res.status(404).json({ success: false, error: 'User not found in system' });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const type = req.query.type as string | undefined;

    let is_read: boolean | undefined;
    if (req.query.is_read === 'true') is_read = true;
    else if (req.query.is_read === 'false') is_read = false;

    const result = await notificationModel.getUserNotifications(appUserId, {
      page,
      limit,
      is_read,
      type,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch notifications', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 2. GET /notifications/unread-count
// ---------------------------------------------------------------------------

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const appUserId = await resolveAppUserId(email);
    if (!appUserId) {
      res.status(404).json({ success: false, error: 'User not found in system' });
      return;
    }

    const count = await notificationModel.getUnreadCount(appUserId);

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 3. PUT /notifications/:id/read
// ---------------------------------------------------------------------------

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const appUserId = await resolveAppUserId(email);
    if (!appUserId) {
      res.status(404).json({ success: false, error: 'User not found in system' });
      return;
    }

    const notificationRecipientId = parseInt(req.params.id as string, 10);
    if (isNaN(notificationRecipientId)) {
      res.status(400).json({ success: false, error: 'Invalid notification ID' });
      return;
    }

    const result = await notificationModel.markAsRead(notificationRecipientId, appUserId);

    if (!result) {
      res.status(404).json({ success: false, error: 'Notification not found or access denied' });
      return;
    }

    // Broadcast read event + updated unread count (use email — socket rooms are keyed by email)
    broadcastToUser(email, 'notification:read', {
      notification_recipient_id: notificationRecipientId,
    });

    const unreadCount = await notificationModel.getUnreadCount(appUserId);
    broadcastToUser(email, 'notification:unread-count', { count: unreadCount });

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 4. PUT /notifications/read-all
// ---------------------------------------------------------------------------

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const appUserId = await resolveAppUserId(email);
    if (!appUserId) {
      res.status(404).json({ success: false, error: 'User not found in system' });
      return;
    }

    const count = await notificationModel.markAllAsRead(appUserId);

    // Broadcast read-all event + updated unread count (use email — socket rooms are keyed by email)
    broadcastToUser(email, 'notification:read-all', { count });
    broadcastToUser(email, 'notification:unread-count', { count: 0 });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      count,
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark all as read', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 5. POST /notifications (server-side / admin trigger)
// ---------------------------------------------------------------------------

export async function createNotifications(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const appUserId = await resolveAppUserId(email);
    if (!appUserId) {
      res.status(404).json({ success: false, error: 'User not found in system' });
      return;
    }

    const {
      recipient_ids,
      sender_id,
      sender_name,
      title,
      message,
      type,
      entity_type,
      entity_id,
      redirect_url,
    } = req.body;

    if (!recipient_ids || !Array.isArray(recipient_ids) || recipient_ids.length === 0) {
      res.status(400).json({ success: false, error: 'recipient_ids is required and must be a non-empty array' });
      return;
    }

    if (!title || !message) {
      res.status(400).json({ success: false, error: 'title and message are required' });
      return;
    }

    await notify({
      recipientIds: recipient_ids,
      sender: { id: sender_id ?? appUserId, name: sender_name ?? null },
      title,
      message,
      type,
      entityType: entity_type,
      entityId: entity_id,
      redirectUrl: redirect_url,
    });

    res.status(201).json({
      success: true,
      message: 'Notifications created',
      count: recipient_ids.length,
    });
  } catch (error: any) {
    console.error('Error creating notifications:', error);
    res.status(500).json({ success: false, error: 'Failed to create notifications', message: error.message });
  }
}
