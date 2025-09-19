const notificationModel = require('../models/notificationModel');

async function getNotifications(req, res) {
    try {
        const notifications = await notificationModel.getNotifications(req.user.email);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function markNotificationsAsRead(req, res) {
    try {
        await notificationModel.markAllAsRead(req.user.email);
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function getNewNotifications(req, res) {
    try {
        const count = await notificationModel.getNewNotificationCount(req.user.email);
        res.json(count);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = { getNotifications, markNotificationsAsRead, getNewNotifications };