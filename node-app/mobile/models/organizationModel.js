const pool = require('../../config/db');
const { redisClient } = require('../../config/redis');
const { Auth } = require("./userIdModel");

async function getOrganizations(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizations(?);', [user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getUserOrganization() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUserOrganization(?);', [Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}
async function getOrganizationQuestion(org_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationQuestion(?);', [org_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getOrganizationFee(org_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationFee(?);', [org_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}
async function submitOrganizationApplication(org_id, user_id, question_id, answer) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL ApplyForMembership(?, ?, ?, ?);', 
            [org_id, user_id, question_id, answer]
        );
        return rows[0];
    } finally {
        connection.release();
    }
}

async function createMembershipTransaction(userEmail, payerName, amount, paymentType, proofImage, organizationId, organizationVersionId) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL CreateMembershipTransaction(?, ?, ?, ?, ?, ?, ?)',
            [userEmail, payerName, amount, paymentType, proofImage, organizationId, organizationVersionId]
        );
        return result[0];
    } catch (error) {
        console.error('Error creating membership transaction:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getUserTransactions(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetTransactionsByUser(?);', [user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function leaveOrganization(organization_id, organization_version_id , user_id,leave_reason = null) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CreateLeaveApplication(?, ?, ?, ?);', [organization_id, organization_version_id, user_id, leave_reason]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function checkLeaveStatus(organization_id, organization_version_id , user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CheckPendingLeaveStatus(?, ?, ?);', [organization_id, organization_version_id, user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

module.exports = {
    getOrganizations,
    getUserOrganization,
    getOrganizationQuestion,
    getOrganizationFee,
    checkLeaveStatus,
    submitOrganizationApplication,
    createMembershipTransaction,
    getUserTransactions,
    leaveOrganization
};

