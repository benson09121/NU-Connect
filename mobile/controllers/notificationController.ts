// @ts-nocheck
const notificationModel = require('../models/notificationModel');
const { broadcastToUser } = require('../../services/websocketService');

async function getNotifications(req, res) {
    try {
        const notifications = await notificationModel.getNotifications(req.user.email);
        res.status(200).json({
            notifications: Array.isArray(notifications) ? notifications : [],
            code: 'OK',
        });
    } catch (error) {
        res.status(500).json({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
        });
    }
}

async function markNotificationsAsRead(req, res) {
    try {
        await notificationModel.markAllAsRead(req.user.email);

        const unread = await notificationModel.getNewNotificationCount(req.user.email);
        const unreadCount = Number(unread?.count ?? unread?.new_count ?? 0) || 0;

        // Push realtime updates to the mobile user room
        broadcastToUser(req.user.email, 'notification:unread-count', { count: unreadCount });
        broadcastToUser(req.user.email, 'notification:marked-read', { scope: 'all', count: unreadCount });

        res.status(200).json({
            code: 'OK',
            message: 'All notifications marked as read',
            count: unreadCount,
        });
    } catch (error) {
        res.status(500).json({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
        });
    }
}

async function markSingleNotificationAsRead(req, res) {
    try {
        const updated = await notificationModel.markSingleAsRead(req.user.email, req.params.id);
        if (!updated) {
            return res.status(404).json({
                code: 'NOT_FOUND',
                message: 'Notification not found',
                notification_id: Number(req.params.id),
            });
        }

        const unread = await notificationModel.getNewNotificationCount(req.user.email);
        const unreadCount = Number(unread?.count ?? unread?.new_count ?? 0) || 0;

        broadcastToUser(req.user.email, 'notification:unread-count', { count: unreadCount });
        broadcastToUser(req.user.email, 'notification:marked-read', {
            scope: 'single',
            count: unreadCount,
            notification_id: updated.notification_id,
            notification_recipient_id: updated.notification_recipient_id,
            already_read: Boolean(updated.already_read),
        });

        res.status(200).json({
            code: 'OK',
            message: 'Notification marked as read',
            count: unreadCount,
            notification_id: updated.notification_id,
            notification_recipient_id: updated.notification_recipient_id,
            already_read: Boolean(updated.already_read),
        });
    } catch (error) {
        res.status(500).json({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
        });
    }
}

async function getNewNotifications(req, res) {
    try {
        const count = await notificationModel.getNewNotificationCount(req.user.email);

        const unreadCount = Number(count?.count ?? count?.new_count ?? 0) || 0;
        res.status(200).json({
            count: unreadCount,
            code: 'OK',
        });
    } catch (error) {
        res.status(500).json({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
        });
    }
}

module.exports = {
    getNotifications,
    markNotificationsAsRead,
    markSingleNotificationAsRead,
    getNewNotifications,
};