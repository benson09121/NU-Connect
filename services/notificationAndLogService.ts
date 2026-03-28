/**
 * services/notificationAndLogService.ts
 *
 * Server-side trigger functions for notifications and activity logs.
 *
 * Usage from any controller:
 *   import { notify, logActivity } from '../services/notificationAndLogService';
 *
 *   // In an approval handler:
 *   await notify({
 *     recipientIds: ['user-abc'],
 *     sender: { id: req.user.user_id, name: 'Dr. Santos' },
 *     title: 'Application Approved',
 *     message: 'Your application for NU Dev Guild was approved.',
 *     type: 'application_approved',
 *     entityType: 'application',
 *     entityId: 42,
 *     redirectUrl: '/organizations/app-details/42/NU%20Dev%20Guild',
 *   });
 *
 *   await logActivity({
 *     userId: req.user.user_id,
 *     userEmail: req.user.email,
 *     fullName: 'Dr. Santos',
 *     action: 'Approved application for NU Dev Guild',
 *     actionType: 'approval_approve',
 *     entityType: 'application',
 *     entityId: 42,
 *     organizationId: 5,
 *   });
 *
 * Both functions handle:
 *   1. DB persistence (via models)
 *   2. Socket.IO real-time broadcast
 */

import {
  createNotification,
  buildNotificationPayload,
  getUnreadCount,
  NotificationData,
} from '../web/models/notificationModel';
import { createLog, isAdminRole, LogData } from '../web/models/logModel';
import { broadcastToUser, broadcastToPage } from './websocketService';
import { prisma } from '../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotifyParams {
  recipientIds: string[];
  sender?: { id?: string | null; name?: string | null } | null;
  title: string;
  message: string;
  type?: string;
  entityType?: string;
  entityId?: number | null;
  redirectUrl?: string | null;
}

export interface LogActivityParams {
  userId: string;
  userEmail: string;
  fullName: string;
  action: string;
  actionType: string;
  entityType?: string | null;
  entityId?: number | null;
  organizationId?: number | null;
  redirectUrl?: string | null;
  metaData?: any;
}

// ---------------------------------------------------------------------------
// Admin role names (used for "broadcast to all SDAO" notifications)
// ---------------------------------------------------------------------------

const ADMIN_ROLE_NAMES = ['SDAO Rank 1', 'SDAO Rank 2', 'Academic Director', 'Admin'];

// ---------------------------------------------------------------------------
// Helper: get all SDAO/Admin user IDs
// ---------------------------------------------------------------------------

export async function getAdminUserIds(): Promise<string[]> {
  const roles = await prisma.tbl_role.findMany({
    where: { role_name: { in: ADMIN_ROLE_NAMES } },
    select: { role_id: true },
  });
  const roleIds = roles.map((r) => r.role_id);

  const users = await prisma.tbl_user.findMany({
    where: {
      role_id: { in: roleIds },
      status: 'Active',
    },
    select: { user_id: true },
  });

  return users.map((u) => u.user_id);
}

// ---------------------------------------------------------------------------
// Helper: get all users with a specific permission
// ---------------------------------------------------------------------------

/**
 * Get user IDs of all active users who have a given permission via their role.
 * Used for broadcasting period-related notifications to WEB_ACCESS / APPLY_ORGANIZATION holders.
 */
export async function getUserIdsWithPermission(permissionName: string): Promise<string[]> {
  const result = await prisma.tbl_role_permission.findMany({
    where: {
      tbl_permission: { permission_name: permissionName },
    },
    select: {
      role_id: true,
    },
  });
  const roleIds = result.map((r) => r.role_id);

  const users = await prisma.tbl_user.findMany({
    where: {
      role_id: { in: roleIds },
      status: 'Active',
    },
    select: { user_id: true },
  });

  return users.map((u) => u.user_id);
}

// ---------------------------------------------------------------------------
// 1. notify() — Create notifications + broadcast via Socket.IO
// ---------------------------------------------------------------------------

/**
 * Create a notification for one or more recipients and push via Socket.IO.
 *
 * Also emits `notification:unread-count` to each recipient with their updated count.
 */
export async function notify(params: NotifyParams): Promise<void> {
  if (!params.recipientIds.length) return;

  // De-duplicate recipient IDs
  const uniqueRecipients = [...new Set(params.recipientIds)];

  const notificationData: NotificationData = {
    sender_id: params.sender?.id ?? null,
    sender_name: params.sender?.name ?? null,
    title: params.title,
    message: params.message,
    type: params.type ?? 'general',
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    redirect_url: params.redirectUrl ?? null,
  };

  try {
    const result = await createNotification(uniqueRecipients, notificationData);

    // Resolve app user_ids → emails for Socket.IO rooms (rooms are keyed by email)
    const recipientUsers = await prisma.tbl_user.findMany({
      where: { user_id: { in: uniqueRecipients } },
      select: { user_id: true, email: true },
    });
    const userIdToEmail = new Map(recipientUsers.map((u) => [u.user_id, u.email]));

    // Broadcast to each recipient via Socket.IO
    for (const recipientRow of result.recipients) {
      const payload = buildNotificationPayload(
        notificationData,
        result.notification_id,
        recipientRow,
      );

      // Socket rooms are keyed by email, not app user_id
      const recipientEmail = userIdToEmail.get(recipientRow.recipient_id);
      if (!recipientEmail) continue; // user not found — skip broadcast

      // Send the notification itself
      broadcastToUser(recipientEmail, 'notification:new', {
        notification: payload,
      });

      // Also send updated unread count
      const unreadCount = await getUnreadCount(recipientRow.recipient_id);
      broadcastToUser(recipientEmail, 'notification:unread-count', {
        count: unreadCount,
      });
    }
  } catch (error) {
    console.error('[NotificationService] Failed to create notification:', error);
    // Don't throw — notifications should not break the main flow
  }
}

// ---------------------------------------------------------------------------
// 2. logActivity() — Create log entry + broadcast via Socket.IO
// ---------------------------------------------------------------------------

/**
 * Create an activity log entry and push via Socket.IO.
 *
 * Broadcasts:
 *   - `log:new` to the `page:logs` room (for SDAO/Admin live view)
 *   - `log:new` to the user's private room
 *   - `log:stats-updated` to the `page:dashboard` room
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const logData: LogData = {
    user_id: params.userId,
    user_email: params.userEmail,
    full_name: params.fullName,
    action: params.action,
    action_type: params.actionType,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    organization_id: params.organizationId ?? null,
    redirect_url: params.redirectUrl ?? null,
    meta_data: params.metaData,
  };

  try {
    const logItem = await createLog(logData);

    // Broadcast to SDAO/Admin users viewing the logs page
    broadcastToPage('logs', 'log:new', { log: logItem });

    // Broadcast to the user's private room (rooms are keyed by email)
    broadcastToUser(params.userEmail, 'log:new', { log: logItem });

    // Broadcast stats update to dashboard page
    broadcastToPage('dashboard', 'log:stats-updated', {
      action_type: params.actionType,
      timestamp: logItem.created_at,
    });
  } catch (error) {
    console.error('[LogService] Failed to create log:', error);
    // Don't throw — logging should not break the main flow
  }
}

// ---------------------------------------------------------------------------
// 3. notifyAndLog() — Convenience: do both at once
// ---------------------------------------------------------------------------

/**
 * Create both a notification and a log entry in one call.
 * Useful when an action triggers both (e.g., approval approve).
 */
export async function notifyAndLog(
  notifyParams: NotifyParams,
  logParams: LogActivityParams,
): Promise<void> {
  await Promise.all([
    notify(notifyParams),
    logActivity(logParams),
  ]);
}
