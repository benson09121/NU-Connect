const notificationModel = require('../models/notificationModel');

function parseIsRead(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

async function getNotifications(req, res) {
  try {
    const { only_unread, limit, offset, email, is_read } = req.query;
    const l = parseInt(limit, 10) || 50;
    const o = parseInt(offset, 10) || 0;

    let data;
    if (email) {
      // New path using GetNotificationsByEmail (supports is_read)
      data = await notificationModel.getNotificationsByEmail({
        email,
        is_read: parseIsRead(is_read),
        limit: l,
        offset: o
      });
    }
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

async function markNotificationRead(req, res) {
  try {
    const { email } = req.body;
    const notification_id = parseInt(req.params.id, 10);
    if (!notification_id) return res.status(400).json({ error: 'Invalid notification id.' });
    const user_id = req.user?.user_id || null;
    const result = await notificationModel.markNotificationRead({
      notification_id,
      user_id,
      email
    });
    res.json({ message: 'Notification marked as read.', result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

module.exports = {
  getNotifications,
  markNotificationRead
};