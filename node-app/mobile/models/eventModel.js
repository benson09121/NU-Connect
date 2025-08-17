const pool = require('../../config/db');
const { redisClient } = require('../../config/redis');
const { Auth } = require("./userIdModel");

async function getAllEvents() {

    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllEvents(?);', [Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function createEvent(user_id, title, description, venue, date, start_time, end_time, organization_id, status, type, is_open_to_all) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL CreateEvent(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
            [user_id, title, description, venue, date, start_time, end_time, organization_id, status ?? 'Pending', type ?? 'Free', is_open_to_all ?? 1]// 1 - 0
        );
        // Invalidate the cache
        await redisClient.del(`events:user:${user_id}`);
        return result[0][0];
    } finally {
        connection.release();
    }
}

async function registerEvent(event_id) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL RegisterEvent(?, ?)',
            [event_id, Auth.get_userId]
        );
        return result[0][0];
    } finally {
        connection.release();
    }
}

async function checkEventRegistration(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CheckEventRegistration(?, ?)',
            [event_id, Auth.get_userId]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function archiveEvent(event_id) {
    const connection = await pool.getConnection();
    try {
        await connection.query(
            'UPDATE tbl_event SET status = "Archived" WHERE event_id = ?',
            [event_id]
        );

        // Invalidate the cache
        await redisClient.del('events:all');
    } finally {
        connection.release();
    }
}

async function getSpecificEvent(eventId, userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetSpecificEvent(?, ?)',
            [eventId, userId]
        );
        return rows[0][0];
    } finally {
        connection.release();
    }
}

async function getEventAttendees(eventId) {
    const cacheKey = `events:attendees:${eventId}`;
    const cachedAttendees = await redisClient.get(cacheKey);
    if (cachedAttendees) {
        return JSON.parse(cachedAttendees);
    }
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetEventAttendees(?);',
            [eventId]
        );
        return rows;
    } finally {
        connection.release();
    }
}

async function refreshAttendeesCache(eventId) {
    const connection = await pool.getConnection();
    try {
        const rows = await connection.query(`CALL GetEventAttendees(?);`,
            [eventId]
        );
        // Update the cache in Redis
        await redisClient.set(`events:attendees:${eventId}`, JSON.stringify(rows), 'EX', 3600);
    } finally {
        connection.release();
    }
}
async function getTickets() {
    const connection = await pool.getConnection();
    try {

        const [rows] = await connection.query("Call GetUserEventRegistrations(?);", [Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}
async function getUpcomingEvents() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUpcomingEvents(?);', [Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function addGeneratedCertificate({ event_id, template_id, pdfFilename, verification_code }) {
    const connection = await pool.getConnection();
    try{
    const [rows] = await connection.query('CALL AddGeneratedCertificate(?, ?, ?, ?, ?);', [event_id, Auth.get_userId ,template_id, pdfFilename, verification_code]); // Ensure only 5 arguments are passed
    return rows[0];
    }
    finally{
        connection.release();
    }
}

async function getEvaluation(event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetEvaluationQuestions(?);', [event_id]);
        return rows[0];
    }
    finally {
        connection.release();
    }
}

async function submitEvaluation(response) {
    const connection = await pool.getConnection();
    try {
        const jsonData = JSON.stringify(response);
        await connection.query('CALL SubmitEvaluation(?);', [jsonData]);
    } finally {
        connection.release();
    }
}
async function getAllEventCertificates() {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllEventCertificates(?);', [Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function scanTicket(email, event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ScanTicket(?, ?, ?);', [email, event_id, Auth.get_userId]);
        return rows[0];
    } finally {
        connection.release();
    }
}

module.exports = {
    getAllEvents,
    createEvent,
    registerEvent,
    archiveEvent,
    getSpecificEvent,
    getEventAttendees,
    refreshAttendeesCache,
    checkEventRegistration,
    getTickets,
    getUpcomingEvents,
    addGeneratedCertificate,
    getEvaluation,
    submitEvaluation,
    getAllEventCertificates,
    scanTicket
};
