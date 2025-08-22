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

async function getNotificationsByEmail(email, isRead = null, limit = 50, offset = 0) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL GetNotificationsByEmail(?, ?, ?, ?)', [
            email,
            isRead,
            limit,
            offset
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error fetching notifications:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function markNotificationRead(notificationId, userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL MarkNotificationRead(?, ?)', [
            notificationId,
            userId
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function createNotification(title, message, entityType, entityId, senderId, recipientEmails, action) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL CreateNotification(?, ?, ?, ?, ?, ?, ?)', [
            title,
            message,
            entityType,
            entityId,
            senderId,
            JSON.stringify(recipientEmails),
            action
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function notifyApplicationPeriodCreated(periodId, createdBy, startDate, endDate) {
    const connection = await pool.getConnection();
    try {
        // Get admin emails
        const [adminUsers] = await connection.query(
            'SELECT JSON_ARRAYAGG(email) as emails FROM tbl_user WHERE role_id IN (3, 4) AND status = "Active"'
        );
        const adminEmails = adminUsers[0]?.emails ? JSON.parse(adminUsers[0].emails) : [];
        
        if (adminEmails.length > 0) {
            return await createNotification(
                'New Application Period Created',
                `A new application period has been created from ${startDate} to ${endDate}. Organizations can now submit applications during this period.`,
                'system',
                periodId,
                createdBy,
                adminEmails,
                'application_period_created'
            );
        }
    } catch (error) {
        console.error('Error notifying application period creation:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function notifyApplicationPeriodUpdated(periodId, updatedBy, startDate, endDate) {
    const connection = await pool.getConnection();
    try {
        // Get admin emails
        const [adminUsers] = await connection.query(
            'SELECT JSON_ARRAYAGG(email) as emails FROM tbl_user WHERE role_id IN (3, 4) AND status = "Active"'
        );
        const adminEmails = adminUsers[0]?.emails ? JSON.parse(adminUsers[0].emails) : [];
        
        if (adminEmails.length > 0) {
            return await createNotification(
                'Application Period Updated',
                `Application period has been updated. New dates: ${startDate} to ${endDate}.`,
                'system',
                periodId,
                updatedBy,
                adminEmails,
                'application_period_updated'
            );
        }
    } catch (error) {
        console.error('Error notifying application period update:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function notifyApprovalProcessInitiated(applicationId, organizationId, organizationName, initiatedBy) {
    const connection = await pool.getConnection();
    try {
        // Get pending approver emails for this application
        const [approvers] = await connection.query(`
            SELECT JSON_ARRAYAGG(u.email) as emails
            FROM tbl_approval_process ap
            JOIN tbl_user u ON ap.approver_id = u.user_id
            WHERE ap.organization_id = ? AND ap.status = 'Pending'
        `, [organizationId]);
        
        const approverEmails = approvers[0]?.emails ? JSON.parse(approvers[0].emails) : [];
        
        if (approverEmails.length > 0) {
            return await createNotification(
                'New Application Requires Approval',
                `Organization application for "${organizationName}" is pending your approval. Please review the application in the approval workflow.`,
                'organization',
                organizationId,
                initiatedBy,
                approverEmails,
                'approval_process_initiated'
            );
        }
    } catch (error) {
        console.error('Error notifying approval process initiation:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function notifyNewOrganizationApplication(organizationId, applicationId, organizationName, applicantUserId, programId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL NotifyNewOrganizationApplication(?, ?, ?, ?, ?)', [
            organizationId,
            applicationId,
            organizationName,
            applicantUserId,
            programId
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error notifying new organization application:', error);
        throw error;
    } finally {
        connection.release();
    }
}

async function notifyNewEventProposal(eventId, eventApplicationId, eventTitle, organizationId, organizationName, applicantUserId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query('CALL NotifyNewEventProposal(?, ?, ?, ?, ?, ?)', [
            eventId,
            eventApplicationId,
            eventTitle,
            organizationId,
            organizationName,
            applicantUserId
        ]);
        return rows[0];
    } catch (error) {
        console.error('Error notifying new event proposal:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getUserIdByEmail,
    createNotification,
    getNotificationsByEmail,
    markNotificationRead,
    notifyApplicationPeriodCreated,
    notifyApplicationPeriodUpdated,
    notifyApprovalProcessInitiated,
    notifyNewOrganizationApplication,
    notifyNewEventProposal
};