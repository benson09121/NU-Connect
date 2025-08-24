const pool = require('../../config/db');

/**
 * Get user activation status and details
 */
async function getUserActivationStatus(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(`
            SELECT 
                u.user_id,
                u.email,
                u.f_name,
                u.l_name,
                u.status,
                u.created_at,
                u.updated_at,
                r.role_name,
                p.name as program_name,
                CASE 
                    WHEN u.status = 'Active' THEN 'User is fully activated'
                    WHEN u.status = 'Pending' THEN 'User has not logged in yet'
                    WHEN u.status = 'Archive' THEN 'User account is archived'
                    ELSE 'Unknown status'
                END as status_description
            FROM tbl_user u
            LEFT JOIN tbl_role r ON u.role_id = r.role_id
            LEFT JOIN tbl_program p ON u.program_id = p.program_id
            WHERE u.email = ?
        `, [email]);
        
        return rows[0] || null;
    } catch (error) {
        console.error('Error getting user activation status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Log user activation event
 */
async function logUserActivation(userId, email, activationMethod = 'first_login') {
    const connection = await pool.getConnection();
    try {
        await connection.query(`
            INSERT INTO tbl_logs (
                user_id,
                action_type,
                type,
                meta_data,
                redirect_url,
                file_path
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            userId,
            'USER_ACTIVATED',
            'ACCOUNT_MANAGEMENT',
            JSON.stringify({
                email: email,
                activation_method: activationMethod,
                activated_at: new Date().toISOString(),
                ip_address: 'system',
                user_agent: 'system'
            }),
            NULL, // no redirect url for activation log
            'user_activation_log'
        ]);
        
        console.log(`✅ User activation logged for ${email} (${userId})`);
        return true;
    } catch (error) {
        console.error('Error logging user activation:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Get pending users (for admin dashboard)
 */
async function getPendingUsers() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(`
            SELECT 
                u.user_id,
                u.email,
                u.f_name,
                u.l_name,
                r.role_name,
                p.name as program_name,
                u.created_at,
                DATEDIFF(NOW(), u.created_at) as days_pending
            FROM tbl_user u
            LEFT JOIN tbl_role r ON u.role_id = r.role_id
            LEFT JOIN tbl_program p ON u.program_id = p.program_id
            WHERE u.status = 'Pending'
            ORDER BY u.created_at ASC
        `);
        
        return rows;
    } catch (error) {
        console.error('Error getting pending users:', error);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Manually activate a user (admin function)
 */
async function manuallyActivateUser(email, activatedBy) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Update user status
        const [updateResult] = await connection.query(`
            UPDATE tbl_user 
            SET status = 'Active', updated_at = NOW()
            WHERE email = ? AND status = 'Pending'
        `, [email]);
        
        if (updateResult.affectedRows === 0) {
            throw new Error('User not found or already activated');
        }
        
        // Get user details for logging
        const [userRows] = await connection.query(`
            SELECT user_id, email FROM tbl_user WHERE email = ?
        `, [email]);
        
        if (userRows.length > 0) {
            // Log the manual activation (match tbl_logs columns)
            await connection.query(`
                INSERT INTO tbl_logs (
                    user_id,
                    action_type,
                    type,
                    meta_data,
                    redirect_url,
                    file_path
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                userRows[0].user_id, 
                'USER_MANUALLY_ACTIVATED', 
                'ACCOUNT_MANAGEMENT', 
                JSON.stringify({
                    email: email,
                    activated_by: activatedBy,
                    activation_method: 'manual_admin',
                    activated_at: new Date().toISOString()
                }),
                NULL,
                'manual_user_activation'
            ]);
        }
        
        await connection.commit();
        console.log(`✅ User ${email} manually activated by ${activatedBy}`);
        return true;
    } catch (error) {
        await connection.rollback();
        console.error('Error manually activating user:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getUserActivationStatus,
    logUserActivation,
    getPendingUsers,
    manuallyActivateUser
};
