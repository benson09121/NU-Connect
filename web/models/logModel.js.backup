const pool = require('../../config/db');

async function getLogs({ user_id = null, type = null, start_date = null, end_date = null } = {}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetLogs(?, ?, ?, ?);',
            [user_id, type, start_date, end_date]
        );
        // rows may be nested arrays from CALL; first resultset is rows[0]
        return (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows[0] || [];
    } finally {
        connection.release();
    }
}

async function getOrgRelevantLogs({ user_id = null, type = null, start_date = null, end_date = null } = {}) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetOrgRelevantLogs(?, ?, ?, ?);',
            [user_id, type, start_date, end_date]
        );
        return (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0] : rows[0] || [];
    } finally {
        connection.release();
    }
}

async function getSystemCounts(user_id = null) {
    const connection = await pool.getConnection();
    try {
        // Always pass a parameter, even if null
        const [rows] = await connection.query('CALL GetSystemCounts(?);', [user_id]);
        // The result is a single row
        return (Array.isArray(rows) && Array.isArray(rows[0])) ? rows[0][0] : rows[0] || {};
    } finally {
        connection.release();
    }
}

// New: wrapper to call LogAction stored procedure
async function createLog(p_user_email, p_action, p_type, p_meta_data = null, p_redirect_url = null, p_file_path = null) {
    const connection = await pool.getConnection();
    try {
        await connection.query(
            'CALL LogAction(?, ?, ?, ?, ?, ?);',
            [
                p_user_email,
                p_action,
                p_type,
                p_meta_data ? JSON.stringify(p_meta_data) : null,
                p_redirect_url,
                p_file_path
            ]
        );
        return true;
    } finally {
        connection.release();
    }
}

module.exports = {
    getLogs,
    getOrgRelevantLogs,
    getSystemCounts,
    createLog
};