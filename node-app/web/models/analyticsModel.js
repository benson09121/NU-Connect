const pool = require('../../config/db');


async function getLeaderboards() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllOrganizationsEventStatistics()');
        return rows[0];
    } catch (error) {
        console.error('Error fetching leaderboards:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getActivities(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEventActivities(?)', [organization_id]   );
        return rows[0];
    } catch (error) {
        console.error('Error fetching activities:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationAnalytics() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAnalyticsOrganizations()');
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization analytics:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getOrganizationFinance(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetOrganizationFinance(?)', [organization_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching organization finances:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function getMemberEngagement(organization_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetMemberEngagement(?)', [organization_id]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching member engagement:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getLeaderboards,
    getActivities,
    getOrganizationAnalytics,
    getOrganizationFinance,
    getMemberEngagement
};