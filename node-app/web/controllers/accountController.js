const msal = require('@azure/msal-node');
const axios = require('axios');
const accountModel = require('../models/accountModel');
const userActivationModel = require('../models/userActivationModel');
const emailService = require('../../services/emailService');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function getAccounts(req, res){
    const { sessionId } = req.query;
    try{
        const accounts = await accountModel.getAccounts();
        if(sessionId){
            subscribeToChannel(sessionId, "accounts");
        }
        res.status(200).json({
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while fetching the accounts.",
        });
    }
}

async function addAccount(req, res){
    const { email, role, program } = req.body;
    try{
        const accounts = await accountModel.addAccount(
            email, 
            role, 
            program, 
            req.user.email // createdByEmail from authenticated user
        );
        
        publishToChannel('accounts', {
            operation: 'CREATE',
            data: accounts
        });

        // Send Azure invitation and email for new accounts
        try {
            const msalConfig = {
                auth: {
                    clientId: process.env.AZURE_CLIENT_ID,
                    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                    clientSecret: process.env.AZURE_CLIENT_SECRET,
                }
            };
            const cca = new msal.ConfidentialClientApplication(msalConfig);
            const token = await getAccessToken(cca);
            
            const response = await axios.post(
                "https://graph.microsoft.com/v1.0/invitations",
                {
                    invitedUserEmailAddress: email,
                    inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
                    sendInvitationMessage: false
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            const redemptionUrl = response.data.inviteRedeemUrl;
            await emailService.sendInvitationEmail(email, redemptionUrl);
            console.log(`Invitation email sent to ${email}`);
        } catch (emailError) {
            console.error('Failed to send invitation email:', emailError);
            // Don't fail the account creation if email fails
        }
        
        res.status(200).json({
            success: true,
            message: "Account added successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while adding the account.",
        });
    }
}

async function updateAccount(req, res){
    const { user_id, role, program, status } = req.body;
    try{
        // Normalize program value - treat empty strings as null
        const normalizedProgram = program === '' || program === 'not_applicable' 
            ? null 
            : program;
            
        const accounts = await accountModel.updateAccount(
            user_id, 
            role, 
            normalizedProgram, 
            status, 
            req.user.email // updatedByEmail from authenticated user
        );
        
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        
        res.status(200).json({
            success: true,
            message: "Account updated successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while updating the account.",
        });
    }
}

async function deleteAccount(req, res){
    const { email } = req.params;
    const { reason } = req.body; // Optional reason from request body
    try{
        const accounts = await accountModel.deleteAccount(
            email, 
            req.user.email, // archivedByEmail from authenticated user
            reason
        );
        
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        
        res.status(200).json({
            success: true,
            message: "Account archived successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while archiving the account.",
        });
    }
}

async function unarchiveAccount(req, res){
    const { user_id } = req.params;
    try{
        const accounts = await accountModel.unarchiveAccount(
            user_id, 
            req.user.email // unarchivedByEmail from authenticated user
        );
        
        publishToChannel('accounts', {
            operation: 'UPDATE',
            data: accounts
        });
        
        res.status(200).json({
            success: true,
            message: "Account unarchived successfully.",
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            error: error.message || "An error occurred while unarchiving the account.",
        });
    }
}

async function getPrograms(req, res) {
    try {
        const programs = await accountModel.getPrograms();
        res.status(200).json({data: programs});
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching the programs.",
        });
    }
}

async function getRoles(req, res) {
    try {
        const roles = await accountModel.getRoles();
        res.status(200).json({data: roles});
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching the roles.",
        });
    }
}

async function getAllPendingUsersAndApplications(req, res) {
    const { sessionId } = req.query;
    try {
        const result = await accountModel.getAllPendingUsersAndApplications();
        
        if(sessionId){
            subscribeToChannel(sessionId, "user-applications");
        }
        
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching pending users and applications.",
        });
    }
}

async function addUserApplication(req, res) {
    const { email, role, program_id, reason } = req.body;
    try {
        if (!email || !role || !program_id || !reason) {
            return res.status(400).json({ success: false, error: "All fields are required." });
        }
        const application = await accountModel.addUserApplication(email, role, program_id, reason);
        
        publishToChannel('user-applications', {
            operation: 'CREATE',
            data: application
        });
        
        res.status(201).json({ success: true, data: application });
    } catch (error) {
        if (error.message && error.message.includes('You already have a pending application. Please wait for approval or contact support.')) {
            return res.status(409).json({
                success: false,
                error: "An application with this email already exists."
            });
        }
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while submitting the application.",
        });
    }
}

async function getAccessToken(cca) {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    return response.accessToken;
}

async function approveUserApplication(req, res) {
    const { application_id } = req.body;
    try {
        if (!application_id) {
            return res.status(400).json({ success: false, error: "application_id is required." });
        }
        
        const application = await accountModel.approveUserApplication(application_id);

        publishToChannel('user-applications', {
            operation: 'UPDATE',
            data: application
        });

        // Send Azure invitation and email
        if (application && application.email) {
            const msalConfig = {
                auth: {
                    clientId: process.env.AZURE_CLIENT_ID,
                    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                    clientSecret: process.env.AZURE_CLIENT_SECRET,
                }
            };
            const cca = new msal.ConfidentialClientApplication(msalConfig);
            const token = await getAccessToken(cca);
            const response = await axios.post(
                "https://graph.microsoft.com/v1.0/invitations",
                {
                    invitedUserEmailAddress: application.email,
                    inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
                    sendInvitationMessage: false
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const redemptionUrl = response.data.inviteRedeemUrl;
            await emailService.sendInvitationEmail(application.email, redemptionUrl);
        }

        res.status(200).json({ success: true, data: application });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while approving the application.",
        });
    }
}

async function resendInvitationEmail(req, res) {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, error: "Email is required." });
        }

        // Send Azure invitation and email
        const msalConfig = {
            auth: {
                clientId: process.env.AZURE_CLIENT_ID,
                authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
                clientSecret: process.env.AZURE_CLIENT_SECRET,
            }
        };
        const cca = new msal.ConfidentialClientApplication(msalConfig);
        const token = await getAccessToken(cca);
        
        const response = await axios.post(
            "https://graph.microsoft.com/v1.0/invitations",
            {
                invitedUserEmailAddress: email,
                inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
                sendInvitationMessage: false
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const redemptionUrl = response.data.inviteRedeemUrl;
        const emailResult = await emailService.sendInvitationEmail(email, redemptionUrl, true); // true for isResend
        
        if (emailResult.success) {
            res.status(200).json({
                success: true,
                message: "Invitation email resent successfully.",
                data: { email, messageId: emailResult.messageId }
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to resend invitation email: " + emailResult.error
            });
        }
    } catch (error) {
        console.error('Failed to resend invitation email:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while resending the invitation email."
        });
    }
}

async function sendTestEmail(req, res) {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, error: "Email is required." });
        }

        const result = await emailService.sendTestEmail(email);
        
        if (result.success) {
            res.status(200).json({
                success: true,
                message: "Test email sent successfully.",
                data: { email, messageId: result.messageId }
            });
        } else {
            res.status(500).json({
                success: false,
                error: "Failed to send test email: " + result.error
            });
        }
    } catch (error) {
        console.error('Failed to send test email:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while sending the test email."
        });
    }
}

async function diagnoseEmailDelivery(req, res) {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, error: "Email is required." });
        }

        const result = await emailService.diagnoseEmailDelivery(email);
        
        res.status(200).json({
            success: result.success,
            message: result.message,
            data: result.diagnostics || {}
        });
    } catch (error) {
        console.error('Email delivery diagnosis failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred during email delivery diagnosis."
        });
    }
}

async function rejectUserApplication(req, res) {
    const { application_id, rejection_reason } = req.body;
    try {
        if (!application_id) {
            return res.status(400).json({ success: false, error: "application_id is required." });
        }
        
        const application = await accountModel.rejectUserApplication(
            application_id, 
            req.user.email, // rejectedByEmail from authenticated user
            rejection_reason || 'No reason provided'
        );

        // Send rejection email to applicant
        if (application && application.email) {
            try {
                await emailService.sendRejectionEmail(
                    application.email, 
                    rejection_reason || 'No reason provided',
                    true // canReapply
                );
                console.log(`Rejection email sent to ${application.email}`);
            } catch (emailError) {
                console.error('Failed to send rejection email:', emailError);
            }
        }

        publishToChannel('user-applications', {
            operation: 'UPDATE',
            data: application
        });

        res.status(200).json({ success: true, data: application });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while rejecting the application.",
        });
    }
}

async function getUserActivationStatus(req, res) {
    const { email } = req.params;
    try {
        if (!email) {
            return res.status(400).json({
                success: false,
                error: "Email address is required"
            });
        }

        const userStatus = await userActivationModel.getUserActivationStatus(email);
        
        if (!userStatus) {
            return res.status(404).json({
                success: false,
                error: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: userStatus
        });
    } catch (error) {
        console.error('Failed to get user activation status:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching user activation status."
        });
    }
}

async function getPendingUsers(req, res) {
    try {
        const pendingUsers = await userActivationModel.getPendingUsers();
        
        res.status(200).json({
            success: true,
            data: pendingUsers,
            count: pendingUsers.length
        });
    } catch (error) {
        console.error('Failed to get pending users:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while fetching pending users."
        });
    }
}

async function manuallyActivateUser(req, res) {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({
                success: false,
                error: "Email address is required"
            });
        }

        const result = await userActivationModel.manuallyActivateUser(email, req.user.email);
        
        if (result) {
            // Publish update to connected clients
            publishToChannel('accounts', {
                operation: 'ACTIVATE',
                data: { email, activated_by: req.user.email }
            });
        }

        res.status(200).json({
            success: true,
            message: `User ${email} has been manually activated`,
            data: { email, activated_by: req.user.email }
        });
    } catch (error) {
        console.error('Failed to manually activate user:', error);
        res.status(500).json({
            success: false,
            error: error.message || "An error occurred while activating the user."
        });
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
    resendInvitationEmail,
    sendTestEmail,
    diagnoseEmailDelivery,
    getUserActivationStatus,
    getPendingUsers,
    manuallyActivateUser,
};