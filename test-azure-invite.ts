import 'dotenv/config';
import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

async function getAzureToken(cca: ConfidentialClientApplication): Promise<string> {
  const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!response?.accessToken) throw new Error('Failed to acquire Azure token.');
  return response.accessToken;
}

async function inviteAzureUser(email: string): Promise<string | null> {
  try {
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.AZURE_CLIENT_ID ?? '',
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
      },
    });
    const token = await getAzureToken(cca);
    const resp = await axios.post(
      'https://graph.microsoft.com/v1.0/invitations',
      {
        invitedUserEmailAddress: email,
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return (resp.data.inviteRedeemUrl as string) ?? null;
  } catch (err: any) {
    const msg = err.response?.data || err.message;
    console.error('[Azure invite] failed:', JSON.stringify(msg, null, 2));
    return null;
  }
}

inviteAzureUser("nuconnect2026@gmail.com").then(url => console.log("Redemption URL:", url));
