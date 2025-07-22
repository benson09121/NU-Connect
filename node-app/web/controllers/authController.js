const msal = require('@azure/msal-node');
const axios = require('axios');
const userModel = require('../models/userModel');
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
        const permissionResult = await userModel.handleLogin(req.user);
        
        // const isUserExist = await userModel.checkUserExists(req.user.email);
        // console.log(req.user);
        // if (isUserExist.length === 0) {
        //     console.log("Creating user");
        //     await userModel.createUser(req.user);
        // }
        // console.log("isUserExist", isUserExist);
        // if (!req.user || !req.user.user_id) {
        //     return res.status(400).json({ error: "User information missing from request." });
        // }
        // const permissionResult = await userModel.getPermissions(req.user.user_id);
        console.log(permissionResult);
        // Extract permissions array from the nested user_info object
        const permissions = permissionResult[0]?.user_info?.permissions || [];
        permissions.includes("WEB_ACCESS") ? res.status(200).json(permissionResult[0].user_info) : res.status(401).json({ message: "Access Denied" });
    }
    catch (error) {
        console.error("Error in login:", error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = { register, login };