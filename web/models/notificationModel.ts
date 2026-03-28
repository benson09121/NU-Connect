/**
 * web/models/notificationModel.ts
 *
 * Prisma-based queries for the Notification system.
 *
 * Tables:
 *   tbl_notification          — notification content (shared across recipients)
 *   tbl_notification_recipient — per-user read state
 */

import { prisma } from '../../config/db';

const VALID_ENTITY_TYPES = new Set([
  'user',
  'organization',
  'event',
  'transaction',
  'system',
  'approval',
  'general',
  'application',
  'period',
  'requirement',
]);

function normalizeEntityType(raw?: string | null): string {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'general';

  // Backward/feature aliases used across controllers
  if (v === 'event_application' || v === 'application_event') return 'application';
  if (v === 'event_requirement' || v === 'event_requirement_submission') return 'requirement';
  if (v === 'blocked_period') return 'period';

  return VALID_ENTITY_TYPES.has(v) ? v : 'general';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationData {
  sender_id?: string | null;
  sender_name?: string | null;
  title: string;
  message: string;
  type?: string;
  entity_type?: string;
  entity_id?: number | null;
  redirect_url?: string | null;
}

export interface NotificationItem {
  notification_recipient_id: number;
  notification_id: number;
  sender_id: string | null;
  sender_name: string | null;
  title: string;
  message: string;
  type: string;
  entity_type: string;
  entity_id: number | null;
  redirect_url: string | null;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date | null;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ---------------------------------------------------------------------------
// 1. Create notification(s) for multiple recipients
// ---------------------------------------------------------------------------

/**
 * Create a single notification and link it to one or more recipients.
 * Returns the notification rows created (for Socket.IO broadcasting).
 */
export async function createNotification(
  recipientIds: string[],
  notification: NotificationData,
): Promise<{ notification_id: number; recipients: { notification_recipient_id: number; recipient_id: string }[] }> {
  const entityType = normalizeEntityType(notification.entity_type);

  const result = await prisma.tbl_notification.create({
    data: {
      sender_id: notification.sender_id ?? null,
      sender_name: notification.sender_name ?? null,
      title: notification.title,
      message: notification.message,
      type: notification.type ?? 'general',
      entity_type: entityType as any,
      entity_id: notification.entity_id ?? null,
      redirect_url: notification.redirect_url ?? null,
      tbl_notification_recipient: {
        create: recipientIds.map((rid) => ({
          recipient_id: rid,
        })),
      },
    },
    include: {
      tbl_notification_recipient: {
        select: {
          notification_recipient_id: true,
          recipient_id: true,
        },
      },
    },
  });

  return {
    notification_id: result.notification_id,
    recipients: result.tbl_notification_recipient,
  };
}

/**
 * Build a NotificationItem shape from a created notification and recipient.
 * Useful for Socket.IO payloads.
 */
export function buildNotificationPayload(
  notificationData: NotificationData,
  notificationId: number,
  recipientRow: { notification_recipient_id: number; recipient_id: string },
): NotificationItem {
  const entityType = normalizeEntityType(notificationData.entity_type);

  return {
    notification_recipient_id: recipientRow.notification_recipient_id,
    notification_id: notificationId,
    sender_id: notificationData.sender_id ?? null,
    sender_name: notificationData.sender_name ?? null,
    title: notificationData.title,
    message: notificationData.message,
    type: notificationData.type ?? 'general',
    entity_type: entityType,
    entity_id: notificationData.entity_id ?? null,
    redirect_url: notificationData.redirect_url ?? null,
    is_read: false,
    read_at: null,
    created_at: new Date(),
  };
}

// ---------------------------------------------------------------------------
// 2. Get paginated notifications for a user
// ---------------------------------------------------------------------------

export async function getUserNotifications(
  recipientId: string,
  options: {
    page?: number;
    limit?: number;
    is_read?: boolean | undefined;
    type?: string | undefined;
  } = {},
): Promise<PaginatedResult<NotificationItem>> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = { recipient_id: recipientId };
  if (options.is_read !== undefined) {
    where.is_read = options.is_read;
  }

  // Build notification-level filter
  const notificationWhere: any = {};
  if (options.type) {
    notificationWhere.type = options.type;
  }

  if (Object.keys(notificationWhere).length > 0) {
    where.tbl_notification = notificationWhere;
  }

  const [recipients, total] = await Promise.all([
    prisma.tbl_notification_recipient.findMany({
      where,
      skip,
      take: limit,
      orderBy: { tbl_notification: { created_at: 'desc' } },
      include: {
        tbl_notification: true,
      },
    }),
    prisma.tbl_notification_recipient.count({ where }),
  ]);

  const data: NotificationItem[] = recipients.map((r) => ({
    notification_recipient_id: r.notification_recipient_id,
    notification_id: r.notification_id,
    sender_id: r.tbl_notification.sender_id,
    sender_name: r.tbl_notification.sender_name,
    title: r.tbl_notification.title,
    message: r.tbl_notification.message,
    type: r.tbl_notification.type,
    entity_type: r.tbl_notification.entity_type,
    entity_id: r.tbl_notification.entity_id,
    redirect_url: r.tbl_notification.redirect_url,
    is_read: r.is_read,
    read_at: r.read_at,
    created_at: r.tbl_notification.created_at,
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Get unread count
// ---------------------------------------------------------------------------

export async function getUnreadCount(recipientId: string): Promise<number> {
  return prisma.tbl_notification_recipient.count({
    where: {
      recipient_id: recipientId,
      is_read: false,
    },
  });
}

// ---------------------------------------------------------------------------
// 4. Mark single notification as read
// ---------------------------------------------------------------------------

/**
 * Mark a single notification_recipient row as read.
 * Returns the updated row, or null if not found / not owned by the user.
 */
export async function markAsRead(
  notificationRecipientId: number,
  recipientId: string,
): Promise<{ notification_recipient_id: number; notification_id: number } | null> {
  // Verify ownership
  const row = await prisma.tbl_notification_recipient.findFirst({
    where: {
      notification_recipient_id: notificationRecipientId,
      recipient_id: recipientId,
    },
  });

  if (!row) return null;
  if (row.is_read) return { notification_recipient_id: row.notification_recipient_id, notification_id: row.notification_id };

  const updated = await prisma.tbl_notification_recipient.update({
    where: { notification_recipient_id: notificationRecipientId },
    data: {
      is_read: true,
      read_at: new Date(),
    },
    select: {
      notification_recipient_id: true,
      notification_id: true,
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// 5. Mark all notifications as read
// ---------------------------------------------------------------------------

/**
 * Mark all unread notifications for a user as read.
 * Returns the count of updated rows.
 */
export async function markAllAsRead(recipientId: string): Promise<number> {
  const result = await prisma.tbl_notification_recipient.updateMany({
    where: {
      recipient_id: recipientId,
      is_read: false,
    },
    data: {
      is_read: true,
      read_at: new Date(),
    },
  });

  return result.count;
}
