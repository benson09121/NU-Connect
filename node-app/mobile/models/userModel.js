const pool = require('../../config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function getUser(mail) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEmail(?);', [mail]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function getPermissions(mail) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserPermissions(?)', [mail]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function generateToken(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserPermissions(?)', [email]);
        if (!rows || rows.length === 0) { // Ensure rows is not undefined or empty
            throw new Error('User not found');
        }
        const result = rows[0]; 
        console.log(result);
        const token = jwt.sign({ result }, process.env.JWT_SECRET, { expiresIn: '7d' });
        console.log(token);
        return token;
    } finally {
        connection.release();
    }
}


async function getUserByEmail(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEmail(?)', [email]);
        return rows[0][0] || null;
    } catch (error) {
        console.error('Error getting user by email:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createPendingMobileUser(email, program_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CreatePendingMobileUser(?, ?)', [email, program_id]);
        return rows[0][0] || null;
    } catch (error) {
        console.error('Error creating pending mobile user:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function updateUserStatus(user_id, status) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'UPDATE tbl_user SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            [status, user_id]
        );
        return result.affectedRows > 0;
    } catch (error) {
        console.error('Error updating user status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

// 🆕 NEW FUNCTION FOR MOBILE: Handle login with name updates and status change
async function handleMobileLogin(email, firstName, lastName) {
    const connection = await pool.getConnection();
    try {
        // Use the existing HandleLogin stored procedure which already handles Pending → Active transition
        const [rows] = await connection.query('CALL HandleLogin(?, ?, ?)', [email, firstName, lastName]);
        return rows[0];
    } catch (error) {
        console.error('Error handling mobile login:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { 
    getUser, 
    generateToken, 
    getPermissions, 
    getUserByEmail, 
    createPendingMobileUser, 
    updateUserStatus,
    handleMobileLogin // 🆕 NEW EXPORT
};
