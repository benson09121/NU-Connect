const pool = require('../../config/db');
const { redisClient } = require('../../config/redis');

async function getAllEvents(organizations) {

    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllEventsByOrganizations(?);', [JSON.stringify(organizations)]);
        return rows[0];
    } finally {
        connection.release();
    }
}
async function registerEvent(event_id, user_id, status, transaction_id) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL RegisterEvent(?, ?, ?, ?)',  // Make sure this matches exactly
            [event_id, user_id, status, transaction_id]
        );
        return result[0];
    } finally {
        connection.release();
    }
}

async function unregisterEvent(event_id, user_id) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL UnRegisterEvent(?, ?)',
            [event_id, user_id]
        );
        return result[0];
    } finally {
        connection.release();
    }
}

async function checkEventRegistration(event_id, user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL CheckEventRegistration(?, ?)',
            [event_id, user_id]
        );
        return rows[0][0];
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

async function getTickets(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query("Call GetEventTickets(?);", [user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}
async function getUpcomingEvents(organizations) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetUpcomingEvents(?);', [JSON.stringify(organizations)]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function addGeneratedCertificate({ event_id, template_id, pdfFilename, verification_code, user_id }) {
    const connection = await pool.getConnection();
    try{
    const [rows] = await connection.query('CALL AddGeneratedCertificate(?, ?, ?, ?, ?);', [event_id, user_id ,template_id, pdfFilename, verification_code]); // Ensure only 5 arguments are passed
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
async function getAllEventCertificates(user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetAllEventCertificates(?);', [user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function scanTicket(email, event_id,  user_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL ScanTicket(?, ?, ?);', [email, event_id, user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function getEventAttendees(eventId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'CALL GetEventAttendees(?);',
            [eventId]
        );
        return rows[0];
    } finally {
        connection.release();
    }
}

async function updateMemberEventStatus(user_id, event_id) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL UpdateMemberEventStatus(?, ?);', [event_id, user_id]);
        return rows[0];
    } finally {
        connection.release();
    }
}

async function createEventTransaction(userEmail, payerName, amount, paymentMethod, proofImage, eventId, organizationId, organizationVersionId) {
    const connection = await pool.getConnection();
    try {
        const [result] = await connection.query(
            'CALL CreateEventTransaction(?, ?, ?, ?, ?, ?, ?, ?)',
            [userEmail, payerName, amount, paymentMethod, proofImage, eventId, organizationId, organizationVersionId]
        );
        return result[0];
    } catch (error) {
        console.error('Error creating event transaction:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function approveTransaction(params) {
  const conn = await pool.getConnection();
  try {
    const {
      transaction_id,
      organization_id,
      organization_version_id,
      category,
      user_email
    } = params;

    const [rows] = await conn.query(
      'CALL ApproveTransaction(?, ?, ?, ?, ?);',
      [transaction_id, organization_id, organization_version_id, category, user_email]
    );
    
    return rows[0];
  } finally {
    conn.release();
  }
}


module.exports = {
    getAllEvents,
    registerEvent,
    getSpecificEvent,
    checkEventRegistration,
    getTickets,
    getUpcomingEvents,
    addGeneratedCertificate,
    getEvaluation,
    submitEvaluation,
    getAllEventCertificates,
    scanTicket,
    getEventAttendees,
    unregisterEvent,
    updateMemberEventStatus,
    createEventTransaction,
    approveTransaction
};
