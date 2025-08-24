const notificationModel = require('../models/notificationModel');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function getNotifications(req, res) {
    const { sessionId, is_read, limit = 50, offset = 0 } = req.query;
    try {
        const notifications = await notificationModel.getNotificationsByEmail(
            req.user.email,
            is_read === 'true' ? true : is_read === 'false' ? false : null,
            parseInt(limit),
            parseInt(offset)
        );

        if (sessionId) {
            subscribeToChannel(sessionId, `notifications_${req.user.email}`);
        }

        res.status(200).json({
            success: true,
            data: notifications
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching notifications."
        });
    }
}

async function markNotificationRead(req, res) {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ 
                success: false,
                error: "Notification ID is required." 
            });
        }

        const result = await notificationModel.markNotificationRead(
            parseInt(id),
            req.user.user_id
        );

        publishToChannel(`notifications_${req.user.email}`, {
            operation: 'UPDATE',
            data: { notification_id: id, is_read: true }
        });

        res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while marking notification as read."
        });
    }
}

async function createNotification(req, res) {
    try {
        const { title, message, url = null, entity_type, entity_id, recipient_emails, action } = req.body;
        
        if (!title || !message || !entity_type || !recipient_emails) {
            return res.status(400).json({ 
                success: false,
                error: "Title, message, entity_type, and recipient_emails are required." 
            });
        }

        const result = await notificationModel.createNotification(
            title,
            message,
            url || null,                          // pass nullable url
            entity_type,
            entity_id || null,
            req.user.user_id,
            Array.isArray(recipient_emails) ? recipient_emails : [recipient_emails],
            action || 'manual'
        );

        // Publish to recipients (include url in SSE payload)
        const recipients = Array.isArray(recipient_emails) ? recipient_emails : [recipient_emails];
        recipients.forEach(email => {
            publishToChannel(`notifications_${email}`, {
                operation: 'CREATE',
                data: { 
                    title,
                    message,
                    entity_type,
                    entity_id,
                    action,
                    url: url || null,
                    created_at: new Date()
                }
            });
        });

        res.status(201).json({
            success: true,
            message: "Notification created successfully.",
            data: result
        });
    } catch (error) {
        console.error('[notification.createNotification]', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while creating notification."
        });
    }
}

// New function for testing notification system
async function testNotification(req, res) {
    try {
        const { recipient_email, title = 'Test Notification', message = 'This is a test notification.' } = req.body;
        
        if (!recipient_email) {
            return res.status(400).json({ 
                success: false,
                error: "recipient_email is required." 
            });
        }

        const result = await notificationModel.createNotification(
            title,
            message,
            'system',
            null,
            req.user.user_id,
            [recipient_email],
            'test'
        );

        publishToChannel(`notifications_${recipient_email}`, {
            operation: 'CREATE',
            data: { 
                title,
                message,
                entity_type: 'system',
                action: 'test',
                created_at: new Date()
            }
        });

        res.status(201).json({
            success: true,
            message: "Test notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending test notification."
        });
    }
}

// Specialized notification functions
async function notifyApplicationPeriodCreated(req, res) {
    try {
        const { period_id, start_date, end_date } = req.body;
        
        if (!period_id || !start_date || !end_date) {
            return res.status(400).json({ 
                success: false,
                error: "period_id, start_date, and end_date are required." 
            });
        }

        const result = await notificationModel.notifyApplicationPeriodCreated(
            period_id,
            req.user.user_id,
            start_date,
            end_date
        );

        res.status(201).json({
            success: true,
            message: "Application period creation notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending application period creation notification."
        });
    }
}

async function notifyApplicationPeriodUpdated(req, res) {
    try {
        const { period_id, start_date, end_date } = req.body;
        
        if (!period_id || !start_date || !end_date) {
            return res.status(400).json({ 
                success: false,
                error: "period_id, start_date, and end_date are required." 
            });
        }

        const result = await notificationModel.notifyApplicationPeriodUpdated(
            period_id,
            req.user.user_id,
            start_date,
            end_date
        );

        res.status(201).json({
            success: true,
            message: "Application period update notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending application period update notification."
        });
    }
}

async function notifyApprovalProcessInitiated(req, res) {
    try {
        const { application_id, organization_id, organization_name } = req.body;
        
        if (!application_id || !organization_id || !organization_name) {
            return res.status(400).json({ 
                success: false,
                error: "application_id, organization_id, and organization_name are required." 
            });
        }

        const result = await notificationModel.notifyApprovalProcessInitiated(
            application_id,
            organization_id,
            organization_name,
            req.user.user_id
        );

        res.status(201).json({
            success: true,
            message: "Approval process initiation notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending approval process initiation notification."
        });
    }
}

async function notifyNewOrganizationApplication(req, res) {
    try {
        const { organization_id, application_id, organization_name, applicant_user_id, program_id } = req.body;
        
        if (!organization_id || !application_id || !organization_name || !applicant_user_id) {
            return res.status(400).json({ 
                success: false,
                error: "organization_id, application_id, organization_name, and applicant_user_id are required." 
            });
        }

        const result = await notificationModel.notifyNewOrganizationApplication(
            organization_id,
            application_id,
            organization_name,
            applicant_user_id,
            program_id || null
        );

        res.status(201).json({
            success: true,
            message: "New organization application notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending new organization application notification."
        });
    }
}

async function notifyNewEventProposal(req, res) {
    try {
        const { event_id, event_application_id, event_title, organization_id, organization_name, applicant_user_id } = req.body;
        
        if (!event_id || !event_application_id || !event_title || !organization_id || !organization_name || !applicant_user_id) {
            return res.status(400).json({ 
                success: false,
                error: "event_id, event_application_id, event_title, organization_id, organization_name, and applicant_user_id are required." 
            });
        }

        const result = await notificationModel.notifyNewEventProposal(
            event_id,
            event_application_id,
            event_title,
            organization_id,
            organization_name,
            applicant_user_id
        );

        res.status(201).json({
            success: true,
            message: "New event proposal notification sent successfully.",
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending new event proposal notification."
        });
    }
}

module.exports = {
    getNotifications,
    markNotificationRead,
    createNotification,
    testNotification,
    notifyApplicationPeriodCreated,
    notifyApplicationPeriodUpdated,
    notifyApprovalProcessInitiated,
    notifyNewOrganizationApplication,
    notifyNewEventProposal
};