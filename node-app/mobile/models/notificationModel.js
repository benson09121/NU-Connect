const pool = require('../../config/db');


async function getNotifications(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('Call GetAllNotification(?)', [email]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching notifications:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function markAllAsRead(email) {
    const connection = await pool.getConnection();
    try {
        await connection.query('CALL MarkAllNotificationsAsRead(?)', [email]);
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getNewNotificationCount(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetNewNotificationCount(?)', [email]);
        return rows[0][0];
    } catch (error) {
        console.error('Error fetching new notification count:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { getNotifications, markAllAsRead, getNewNotificationCount };