const msal = require('@azure/msal-node');
const axios = require('axios');
const userModel = require('../models/userModel');
const userActivationModel = require('../models/userActivationModel');
const { sendInvitationEmail } = require('../../services/emailService');

require('dotenv').config();


async function getAccessToken(cca) {
    const response = await cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
    });
    return response.accessToken;
}

async function register(req, res) {
    const { email } = req.body;
    console.log(email);
    const msalConfig = {
        auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
        }
    };

    const cca = new msal.ConfidentialClientApplication(msalConfig);

     try {
    const token = await getAccessToken(cca);
    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/invitations",
      {
        invitedUserEmailAddress: email,
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false // Disable Microsoft email
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const redemptionUrl = response.data.inviteRedeemUrl;
    console.log(redemptionUrl);
    await sendInvitationEmail(email, redemptionUrl); // Your custom email function

    res.status(200).json({ message: "Custom invitation sent" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function login(req, res) {
    try {
        // Check user status before login
        const userStatusBefore = await userActivationModel.getUserActivationStatus(req.user.email);
        const wasActiveBefore = userStatusBefore?.status === 'Active';
        
        const permissionResult = await userModel.handleLogin(req.user);
        
        // Check if user was activated during this login
        if (!wasActiveBefore && userStatusBefore?.status === 'Pending') {
            console.log(`🎉 User ${req.user.email} activated on first login!`);
            // Log the activation event
            await userActivationModel.logUserActivation(
                req.user.user_id, 
                req.user.email, 
                'first_login'
            );
        }
        
        console.log(permissionResult);
        // Extract permissions array from the nested user_info object
        const permissions = permissionResult[0]?.user_info?.permissions || [];
        
        if (permissions.includes("WEB_ACCESS")) {
            // Add activation status to response
            const userInfo = {
                ...permissionResult[0].user_info,
                activation_info: {
                    was_just_activated: !wasActiveBefore && userStatusBefore?.status === 'Pending',
                    activation_date: wasActiveBefore ? userStatusBefore?.updated_at : new Date().toISOString()
                }
            };
            res.status(200).json(userInfo);
        } else {
            res.status(401).json({ message: "Access Denied" });
        }
    }
    catch (error) {
        console.error("Error in login:", error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { register, login };