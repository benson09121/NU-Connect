const msal = require('@azure/msal-node');
const axios = require('axios');
require('dotenv').config();

async function test() {
  const msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
    },
  };
  const cca = new msal.ConfidentialClientApplication(msalConfig);
  const tokenResp = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] });
  
  try {
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/invitations',
      {
        invitedUserEmailAddress: 'benz@gmail.com', // Let's try inviting an existing user
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false,
      },
      { headers: { Authorization: `Bearer ${tokenResp.accessToken}` } }
    );
    console.log("✅ Success", response.data.inviteRedeemUrl);
  } catch (err) {
    console.error("❌ Error", err.response?.data || err.message);
  }
}
test();
