import { Request, Response } from 'express';
import * as msal from '@azure/msal-node';
import axios from 'axios';
import 'dotenv/config';
import * as userActivationModel from '../models/userActivationModel';
import { broadcastToPage, broadcastToUser } from '../../services/websocketService';

// JS modules — typed as any until migrated

const userModel = require('../models/userModel') as any;
const accountModel = require('../models/accountModel') as any;
const { sendInvitationEmail } = require('../../services/emailService') as { sendInvitationEmail: (email: string, url: string) => Promise<void> };

async function getAccessToken(cca: msal.ConfidentialClientApplication): Promise<string> {
  const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return response!.accessToken;
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email } = req.body;
  console.log(email);

  const msalConfig: msal.Configuration = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
    },
  };

  const cca = new msal.ConfidentialClientApplication(msalConfig);

  try {
    const token = await getAccessToken(cca);
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/invitations',
      {
        invitedUserEmailAddress: email,
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const redemptionUrl = response.data.inviteRedeemUrl;
    console.log(redemptionUrl);
    await sendInvitationEmail(email, redemptionUrl);

    res.status(200).json({ message: 'Custom invitation sent' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const userStatusBefore = await userActivationModel.getUserActivationStatus(req.user!.email);
    const wasActiveBefore = userStatusBefore?.status === 'Active';
    const permissionResult = await userModel.handleLogin(req.user);
    console.log(userStatusBefore);

    if (!wasActiveBefore && userStatusBefore?.status === 'Pending') {
      console.log(`🎉 User ${req.user!.email} activated on first login!`);

      const user = await userModel.getUserByEmail(req.user!.email);
      if (!user || !user.user_id) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }

      await userActivationModel.logUserActivation(user.user_id, req.user!.email, 'first_login');

      try {
        if (userStatusBefore?.role_name && userStatusBefore.role_name.toLowerCase() !== 'student') {
          const allAccounts = await accountModel.getAccounts();
          broadcastToPage('accounts', 'accounts:updated', { operation: 'SNAPSHOT', data: allAccounts });
          console.log(`📡 Broadcasted accounts update after ${req.user!.email} activation`);
        }

        const fullPending = await accountModel.getAllPendingUsersAndApplications();
        broadcastToPage('accounts', 'user-applications:updated', { operation: 'SNAPSHOT', data: fullPending });
        broadcastToUser(req.user!.email, 'user:activation-updated', {
          email: req.user!.email,
          status: 'Active',
        });
        console.log(`📡 Broadcasted pending applications update after ${req.user!.email} activation`);
      } catch (broadcastError) {
        console.error('Failed to broadcast status change updates:', broadcastError);
      }
    }

    console.log(permissionResult);

    const permissionsRaw = permissionResult[0]?.user_info?.permissions;
    const permissions: string[] = Array.isArray(permissionsRaw) ? permissionsRaw.flat() : [];

    if (permissions.includes('WEB_ACCESS')) {
      const userInfo = {
        ...permissionResult[0].user_info,
        activation_info: {
          was_just_activated: !wasActiveBefore && userStatusBefore?.status === 'Pending',
          activation_date: wasActiveBefore
            ? userStatusBefore?.updated_at
            : new Date().toISOString(),
        },
      };
      res.status(200).json(userInfo);
    } else {
      res.status(401).json({ message: 'Access Denied' });
    }
  } catch (error: any) {
    console.error('Error in login:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const email = req.user!.email;

  try {
    const user = await userModel.getUserByEmail(email);
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the user.',
    });
  }
}

const authController = {
  login,
  register
}

export default authController;