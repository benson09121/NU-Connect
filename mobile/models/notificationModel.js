const { prisma } = require('../../config/db');

async function resolveUserIdByEmail(email) {
    if (!email) return null;

    const user = await prisma.tbl_user.findFirst({
        where: {
            email: {
                equals: String(email).trim(),
                mode: 'insensitive',
            },
        },
        select: { user_id: true },
    });

    return user?.user_id || null;
}

async function getNotifications(email) {
    try {
        const recipientId = await resolveUserIdByEmail(email);
        if (!recipientId) return [];

        const rows = await prisma.tbl_notification_recipient.findMany({
            where: { recipient_id: recipientId },
            orderBy: [
                { tbl_notification: { created_at: 'desc' } },
                { notification_recipient_id: 'desc' },
            ],
            include: {
                tbl_notification: true,
            },
        });

        return rows.map((row) => ({
            notification_recipient_id: row.notification_recipient_id,
            notification_id: row.notification_id,
            sender_id: row.tbl_notification?.sender_id || null,
            sender_name: row.tbl_notification?.sender_name || null,
            type: row.tbl_notification?.type || 'general',
            entity_type: row.tbl_notification?.entity_type || 'general',
            entity_id: row.tbl_notification?.entity_id ?? null,
            title: row.tbl_notification?.title || '',
            message: row.tbl_notification?.message || '',
            redirect_url: row.tbl_notification?.redirect_url || null,
            is_read: Boolean(row.is_read),
            read_at: row.read_at || null,
            created_at: row.tbl_notification?.created_at || row.created_at || null,
        }));
    } catch (error) {
        console.error('Error fetching notifications:', error);
        throw error;
    }
}

async function markAllAsRead(email) {
    try {
        const recipientId = await resolveUserIdByEmail(email);
        if (!recipientId) return 0;

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

        return result.count || 0;
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        throw error;
    }
}

async function markSingleAsRead(email, id) {
    try {
        const recipientId = await resolveUserIdByEmail(email);
        const numericId = Number(id);

        if (!recipientId || !Number.isInteger(numericId) || numericId <= 0) {
            return null;
        }

        // Support both notification_recipient_id and notification_id for compatibility.
        const row = await prisma.tbl_notification_recipient.findFirst({
            where: {
                recipient_id: recipientId,
                OR: [
                    { notification_recipient_id: numericId },
                    { notification_id: numericId },
                ],
            },
            orderBy: [
                { is_read: 'asc' },
                { notification_recipient_id: 'desc' },
            ],
            select: {
                notification_recipient_id: true,
                notification_id: true,
                is_read: true,
            },
        });

        if (!row) return null;

        if (row.is_read) {
            return {
                notification_recipient_id: row.notification_recipient_id,
                notification_id: row.notification_id,
                already_read: true,
            };
        }

        const updated = await prisma.tbl_notification_recipient.update({
            where: { notification_recipient_id: row.notification_recipient_id },
            data: {
                is_read: true,
                read_at: new Date(),
            },
            select: {
                notification_recipient_id: true,
                notification_id: true,
            },
        });

        return {
            ...updated,
            already_read: false,
        };
    } catch (error) {
        console.error('Error marking single notification as read:', error);
        throw error;
    }
}

async function getNewNotificationCount(email) {
    try {
        const recipientId = await resolveUserIdByEmail(email);
        if (!recipientId) return { count: 0 };

        const count = await prisma.tbl_notification_recipient.count({
            where: {
                recipient_id: recipientId,
                is_read: false,
            },
        });

        return { count };
    } catch (error) {
        console.error('Error fetching new notification count:', error);
        throw error;
    }
}

module.exports = { getNotifications, markAllAsRead, markSingleAsRead, getNewNotificationCount };