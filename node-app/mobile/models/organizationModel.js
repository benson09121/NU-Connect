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

async function createMembershipTransaction(org_id, user_id, payment_data) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CreateMembershipTransaction(?, ?, ?);', 
            [org_id, user_id, payment_data]
        );
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
    submitOrganizationApplication,
    createMembershipTransaction
};

