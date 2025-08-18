const pool = require('../../config/db');

async function getUserIdByEmail(email) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'SELECT user_id FROM tbl_user WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0]?.user_id || null;
  } finally {
    conn.release();
  }
}

async function getNotificationsByEmail({ email, is_read = null, limit = 50, offset = 0 }) {
  if (!email) throw new Error('email required');
  // Normalize is_read (null means no filter)
  let readFilter = null;
  if (is_read === true || is_read === false) readFilter = is_read;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'CALL GetNotificationsByEmail(?, ?, ?, ?);',
      [email, readFilter, limit, offset]
    );
    return rows[0];
  } finally {
    conn.release();
  }
}

async function markNotificationRead({ notification_id, user_id, email }) {
  if (!notification_id) throw new Error('notification_id required');
  if (!user_id) {
    if (!email) throw new Error('user_id or email required');
    user_id = await getUserIdByEmail(email);
    if (!user_id) throw new Error('User not found for provided email');
  }
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'CALL MarkNotificationRead(?, ?);',
      [notification_id, user_id]
    );
    return rows[0][0];
  } finally {
    conn.release();
  }
}

module.exports = {
  getNotificationsByEmail,
  markNotificationRead,
  getUserIdByEmail
};