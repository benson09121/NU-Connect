const msal = require('@azure/msal-node');
const axios = require('axios');
const accountModel = require('../models/accountModel');
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
};