const msal = require('@azure/msal-node');
const axios = require('axios');
const accountModel = require('../models/accountModel');
const userActivationModel = require('../models/userActivationModel');
const emailService = require('../../services/emailService');
const { subscribeToChannel, publishToChannel } = require('./sseController');

async function getAccounts(req, res) {
  const { sessionId } = req.query;
  try {
    const accounts = await accountModel.getAccounts();

    if (sessionId) {
      subscribeToChannel(sessionId, 'accounts');
      // send current snapshot so clients render immediately
      publishToChannel('accounts', {
        operation: 'SNAPSHOT',
        data: accounts,
      });
    }

    res.status(200).json({ data: accounts });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while fetching the accounts.',
    });
  }
}

async function addAccount(req, res) {
  const { email, role, program } = req.body;
  try {
    await accountModel.addAccount(email, role, program, req.user.email);

    // Broadcast full snapshot after mutation
    const allAccounts = await accountModel.getAccounts();
    publishToChannel('accounts', {
      operation: 'SNAPSHOT',
      data: allAccounts,
    });

    // Fire-and-forget invitation + email
    try {
      const msalConfig = {
        auth: {
          clientId: process.env.AZURE_CLIENT_ID,
          authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
        },
      };
      const cca = new msal.ConfidentialClientApplication(msalConfig);
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
      await emailService.sendInvitationEmail(email, redemptionUrl);
      console.log(`Invitation email sent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
      // Do not fail account creation if email fails
    }

    res.status(200).json({
      success: true,
      message: 'Account added successfully.',
      data: allAccounts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while adding the account.',
    });
  }
}

async function updateAccount(req, res) {
  const { user_id, role, program, status } = req.body;
  try {
    // Normalize program value - treat empty strings as null
    const normalizedProgram =
      program === '' || program === 'not_applicable' ? null : program;

    await accountModel.updateAccount(
      user_id,
      role,
      normalizedProgram,
      status,
      req.user.email
    );

    const allAccounts = await accountModel.getAccounts();
    publishToChannel('accounts', {
      operation: 'SNAPSHOT',
      data: allAccounts,
    });

    res.status(200).json({
      success: true,
      message: 'Account updated successfully.',
      data: allAccounts,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'An error occurred while updating the account.',
    });
  }
}

async function deleteAccount(req, res) {
  const { email } = req.params;
  const { reason } = req.body; // Optional
  try {
    await accountModel.deleteAccount(email, req.user.email, reason);

    const allAccounts = await accountModel.getAccounts();
    publishToChannel('accounts', {
      operation: 'SNAPSHOT',
      data: allAccounts,
    });

    res.status(200).json({
      success: true,
      message: 'Account archived successfully.',
      data: allAccounts,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message || 'An error occurred while archiving the account.',
    });
  }
}

async function unarchiveAccount(req, res) {
  const { user_id } = req.params;
  const { reason } = req.body; // reason is optional
  try {
    await accountModel.unarchiveAccount(user_id, req.user.email, reason);

    const allAccounts = await accountModel.getAccounts();
    publishToChannel('accounts', {
      operation: 'SNAPSHOT',
      data: allAccounts,
    });

    res.status(200).json({
      success: true,
      message: 'Account unarchived successfully.',
      data: allAccounts,
    });
  } catch (error) {
    res.status(500).json({
      error:
        error.message || 'An error occurred while unarchiving the account.',
    });
  }
}

async function getPrograms(req, res) {
  try {
    const programs = await accountModel.getPrograms();
    res.status(200).json({ data: programs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error.message || 'An error occurred while fetching the programs.',
    });
  }
}

async function getRoles(req, res) {
  try {
    const roles = await accountModel.getRoles();
    res.status(200).json({ data: roles });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while fetching the roles.',
    });
  }
}

async function getAllPendingUsersAndApplications(req, res) {
  const { sessionId } = req.query;
  try {
    const result = await accountModel.getAllPendingUsersAndApplications();

    if (sessionId) {
      subscribeToChannel(sessionId, 'user-applications');
      // Push current snapshot right away
      publishToChannel('user-applications', {
        operation: 'SNAPSHOT',
        data: result,
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred while fetching pending users and applications.',
    });
  }
}

async function addUserApplication(req, res) {
  let { email, role, program_id, reason } = req.body;
  console.log('addUserApplication received:', { email, role, program_id, reason });

  if (program_id === '' || program_id === undefined) program_id = null;

  try {
    if (!email || !role || !reason) {
      return res
        .status(400)
        .json({ success: false, error: 'Email, role, and reason are required.' });
    }

    await accountModel.addUserApplication(email, role, program_id, reason);

    const fullPending = await accountModel.getAllPendingUsersAndApplications();
    publishToChannel('user-applications', {
      operation: 'SNAPSHOT',
      data: fullPending,
    });

    res.status(201).json({ success: true, data: fullPending });
  } catch (error) {
    if (
      error.message &&
      error.message.includes(
        'You already have a pending application. Please wait for approval or contact support.'
      )
    ) {
      return res.status(409).json({
        success: false,
        error: 'An application with this email already exists.',
      });
    }
    res.status(500).json({
      success: false,
      error:
        error.message || 'An error occurred while submitting the application.',
    });
  }
}

async function getAccessToken(cca) {
  const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return response.accessToken;
}

async function approveUserApplication(req, res) {
  const { application_id } = req.body;
  try {
    if (!application_id) {
      return res
        .status(400)
        .json({ success: false, error: 'application_id is required.' });
    }

    const application = await accountModel.approveUserApplication(application_id);

    // Update the pending applications snapshot
    const fullPending = await accountModel.getAllPendingUsersAndApplications();
    publishToChannel('user-applications', {
      operation: 'SNAPSHOT',
      data: fullPending,
    });

    // Optionally also refresh accounts list if your approval flow creates/updates an account
    try {
      const allAccounts = await accountModel.getAccounts();
      publishToChannel('accounts', {
        operation: 'SNAPSHOT',
        data: allAccounts,
      });
    } catch (e) {
      console.warn('approveUserApplication: accounts snapshot publish skipped:', e?.message);
    }

    // Send Azure invitation and email
    if (application && application.email) {
      try {
        const msalConfig = {
          auth: {
            clientId: process.env.AZURE_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
            clientSecret: process.env.AZURE_CLIENT_SECRET,
          },
        };
        const cca = new msal.ConfidentialClientApplication(msalConfig);
        const token = await getAccessToken(cca);
        const response = await axios.post(
          'https://graph.microsoft.com/v1.0/invitations',
          {
            invitedUserEmailAddress: application.email,
            inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
            sendInvitationMessage: false,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const redemptionUrl = response.data.inviteRedeemUrl;
        await emailService.sendInvitationEmail(application.email, redemptionUrl);
      } catch (emailError) {
        console.error('approveUserApplication: invitation email failed:', emailError);
      }
    }

    res.status(200).json({ success: true, data: application });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred while approving the application.',
    });
  }
}

async function resendInvitationEmail(req, res) {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }
    const result = await emailService.resendInvitationEmail(email);
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message || 'Invitation resent successfully.',
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to resend invitation email.',
      });
    }
  } catch (error) {
    console.error('Failed to resend invitation email:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while resending the invitation email.',
    });
  }
}

async function sendTestEmail(req, res) {
  const { email } = req.body;
  try {
    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: 'Email is required.' });
    }

    const result = await emailService.sendTestEmail(email);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Test email sent successfully.',
        data: { email, messageId: result.messageId },
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email: ' + result.error,
      });
    }
  } catch (error) {
    console.error('Failed to send test email:', error);
    res.status(500).json({
      success: false,
      error:
        error.message || 'An error occurred while sending the test email.',
    });
  }
}

async function diagnoseEmailDelivery(req, res) {
  const { email } = req.body;
  try {
    if (!email) {
      return res
        .status(400)
        .json({ success: false, error: 'Email is required.' });
    }

    const result = await emailService.diagnoseEmailDelivery(email);

    res.status(200).json({
      success: result.success,
      message: result.message,
      data: result.diagnostics || {},
    });
  } catch (error) {
    console.error('Email delivery diagnosis failed:', error);
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred during email delivery diagnosis.',
    });
  }
}

async function rejectUserApplication(req, res) {
  const { application_id, rejection_reason } = req.body;
  try {
    if (!application_id) {
      return res
        .status(400)
        .json({ success: false, error: 'application_id is required.' });
    }

    const application = await accountModel.rejectUserApplication(
      application_id,
      req.user.email,
      rejection_reason || 'No reason provided'
    );

    const fullPending = await accountModel.getAllPendingUsersAndApplications();
    publishToChannel('user-applications', {
      operation: 'SNAPSHOT',
      data: fullPending,
    });

    res.status(200).json({ success: true, data: application });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred while rejecting the application.',
    });
  }
}

async function getUserActivationStatus(req, res) {
  const { email } = req.params;
  try {
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
    }

    const userStatus = await userActivationModel.getUserActivationStatus(email);

    if (!userStatus) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: userStatus,
    });
  } catch (error) {
    console.error('Failed to get user activation status:', error);
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred while fetching user activation status.',
    });
  }
}

async function getPendingUsers(req, res) {
  try {
    const pendingUsers = await userActivationModel.getPendingUsers();
    res.status(200).json({
      success: true,
      data: pendingUsers,
      count: pendingUsers.length,
    });
  } catch (error) {
    console.error('Failed to get pending users:', error);
    res.status(500).json({
      success: false,
      error:
        error.message ||
        'An error occurred while fetching pending users.',
    });
  }
}

async function manuallyActivateUser(req, res) {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required',
      });
    }

    const result = await userActivationModel.manuallyActivateUser(
      email,
      req.user.email
    );

    if (result) {
      // Publish full accounts snapshot after activation
      const allAccounts = await accountModel.getAccounts();
      publishToChannel('accounts', {
        operation: 'SNAPSHOT',
        data: allAccounts,
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${email} has been manually activated`,
      data: { email, activated_by: req.user.email },
    });
  } catch (error) {
    console.error('Failed to manually activate user:', error);
    res.status(500).json({
      success: false,
      error:
        error.message || 'An error occurred while activating the user.',
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