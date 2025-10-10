const pool = require('../../config/db');

async function getAccounts() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetManagedAccounts();');
        return rows[0];
    }
    catch (error) {
        console.error('Error getting permissions:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function addAccount(email, role, program, createdByEmail) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL AddManagedAccount(?, ?, ?, ?)', 
            [email, role, program, createdByEmail]
        );
        return rows[0];
    }
    catch (error) {
        console.error('Error adding account:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function updateAccount(user_id, role, program, status, updatedByEmail) {
    const connection = await pool.getConnection();
    try {
        // Handle null/undefined program values
        const programName = program === null || program === undefined || program === '' 
            ? null 
            : program;
            
        const [rows] = await connection.query(
            'CALL UpdateManagedAccount(?, ?, ?, ?, ?)',
            [user_id, role, programName, status, updatedByEmail]
        );
        return rows[0];
    }
    catch (error) {
        console.error('Error updating account:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function deleteAccount(email, archivedByEmail, reason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL DeleteManagedAccount(?, ?, ?)', 
            [email, archivedByEmail, reason || 'Manual archive']
        );
        return rows[0];
    }
    catch (error) {
        console.error('Error deleting account:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function unarchiveAccount(user_id, unarchivedByEmail, reason = null) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL UnarchiveManagedAccount(?, ?, ?)', 
            [user_id, unarchivedByEmail, reason]
        );
        return rows[0];
    }
    catch (error) {
        console.error('Error unarchiving account:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getPrograms() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetPrograms();');
        return rows[0];
    }
    catch (error) {
        console.error('Error getting programs:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getRoles() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetRoles();');
        return rows[0];
    }
    catch (error) {
        console.error('Error getting roles:', error);
        throw error;
    }
    finally {
        connection.release();
    }
}

async function getAllPendingUsersAndApplications() {
    const connection = await pool.getConnection();
    try {
        const [results] = await connection.query('CALL GetAllPendingUsersAndApplications();');
        return {
            users: results[0],
            applications: results[1]
        };
    } finally {
        connection.release();
    }
}

async function addUserApplication(email, role, program_id, reason) {
    const connection = await pool.getConnection();
    try {
        // Convert empty string or undefined to null
        const programIdParam = (program_id === '' || program_id === undefined) ? null : program_id;
        const [rows] = await connection.query(
            'CALL AddUserApplication(?, ?, ?, ?);',
            [email, role, programIdParam, reason]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function approveUserApplication(application_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ApproveUserApplication(?);', [application_id]);
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function rejectUserApplication(application_id, rejectedByEmail, rejectionReason) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL RejectUserApplication(?, ?, ?);', 
            [application_id, rejectedByEmail, rejectionReason]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

// 🆕 NEW HELPER FUNCTION FOR ROLE-BASED STATUS CHECKS
async function getUserRoleAndStatus(email) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(`
            SELECT 
                u.user_id,
                u.email,
                u.status,
                r.role_name,
                r.role_name = 'Student' as is_student
            FROM tbl_user u
            LEFT JOIN tbl_role r ON u.role_id = r.role_id
            WHERE u.email = ?
        `, [email]);
        return rows[0] || null;
    } catch (error) {
        console.error('Error getting user role and status:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getAccounts,
    addAccount,
    updateAccount,
    deleteAccount,
    unarchiveAccount,
    getPrograms,
    getRoles,
    addUserApplication,
    getAllPendingUsersAndApplications,
    approveUserApplication,
    rejectUserApplication,
    getUserRoleAndStatus, // 🆕 NEW EXPORT
};