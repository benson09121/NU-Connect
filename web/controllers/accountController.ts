import { Request, Response } from 'express';
import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';
import * as accountModel from '../models/accountModel';
import { broadcastToPage } from '../../services/websocketService';

import * as emailService from '../../services/emailService';

// ---------------------------------------------------------------------------
// Azure B2B invitation helper
// ---------------------------------------------------------------------------

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Azure invite] failed:', msg);
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /manage/accounts
// ---------------------------------------------------------------------------

export async function getAccounts(req: Request, res: Response): Promise<void> {
  try {
    const accounts = await accountModel.getAccounts();
    res.json(accounts);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch accounts.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /manage/accounts
// ---------------------------------------------------------------------------

export async function addAccount(req: Request, res: Response): Promise<void> {
  const { email, role, program, sdao_rank, section_id, college } = req.body as {
    email: string;
    role: string;
    program?: number | null;
    sdao_rank?: number | null;
    section_id?: number | null;
    college?: string | null;
  };

  if (!email || !role) {
    res.status(422).json({ success: false, error: 'email and role are required.' });
    return;
  }

  const collegeId = college != null ? parseInt(college as string, 10) || null : null;

  try {
    await accountModel.addAccount(
      email,
      role,
      program ?? null,
      sdao_rank ?? null,
      section_id ?? null,
      collegeId,
    );
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'DUPLICATE_EMAIL') {
      res.status(409).json({ success: false, error: 'A user with this email already exists.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to add account.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  // Broadcast
  broadcastToPage('accounts', 'account:created', { email });

  // Azure invite + email (fire-and-forget)
  setImmediate(async () => {
    let redemptionUrl = await inviteAzureUser(email);
    // If Azure fails (e.g. user already exists in tenant), provide the base app URL instead
    if (!redemptionUrl) {
      redemptionUrl = process.env.VITE_FRONTEND_URL || 'http://localhost:5173/welcome';
    }
    
    try {
      await emailService.sendInvitationEmail(email, redemptionUrl);
      console.log(`[addAccount] Invitation email sent to ${email}`);
    } catch (emailErr) {
      console.error('[addAccount] Email send failed:', (emailErr as Error).message);
    }
  });

  res.json({ success: true, message: 'Account created successfully and invitation email sent.' });
}

// ---------------------------------------------------------------------------
// PUT /manage/accounts
// ---------------------------------------------------------------------------

export async function updateAccount(req: Request, res: Response): Promise<void> {
  const { user_id, role, program, status, sdao_rank, section_id, college } = req.body as {
    user_id: string;
    role: string;
    program?: number | null;
    status?: string;
    sdao_rank?: number | null;
    section_id?: number | null;
    college?: string | null;
  };

  if (!user_id || !role) {
    res.status(422).json({ success: false, error: 'user_id and role are required.' });
    return;
  }

  const normalizedProgram =
    program === 0 || program === null || program === undefined ? null : program;
  const collegeId = college != null ? parseInt(college as string, 10) || null : null;

  try {
    await accountModel.updateAccount(
      String(user_id),
      role,
      normalizedProgram,
      status ?? 'Active',
      sdao_rank ?? null,
      section_id ?? null,
      collegeId,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update account.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'account:updated', { user_id });
  res.json({ success: true, message: 'Account updated successfully.' });
}

// ---------------------------------------------------------------------------
// DELETE /manage/accounts/:email
// ---------------------------------------------------------------------------

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  const email = req.params.email as string;
  const { reason } = req.body as { reason?: string };

  try {
    await accountModel.archiveAccount(email, req.user?.user_id ?? '', reason);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to archive account.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'account:archived', { email });
  res.json({ success: true, message: 'Account archived successfully.' });
}

// ---------------------------------------------------------------------------
// PUT /manage/accounts/unarchive/:user_id
// ---------------------------------------------------------------------------

export async function unarchiveAccount(req: Request, res: Response): Promise<void> {
  const user_id = req.params.user_id as string;

  try {
    await accountModel.unarchiveAccount(user_id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to restore account.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'account:unarchived', { user_id });
  res.json({ success: true, message: 'Account restored successfully.' });
}

// ---------------------------------------------------------------------------
// GET /manage/roles
// ---------------------------------------------------------------------------

export async function getRoles(req: Request, res: Response): Promise<void> {
  try {
    const roles = await accountModel.getRoles();
    res.json({ data: roles });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch roles.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// GET /get-programs
// ---------------------------------------------------------------------------

export async function getPrograms(req: Request, res: Response): Promise<void> {
  try {
    const programs = await accountModel.getPrograms();
    res.json(programs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch programs.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// GET /manage/sdao-ranks/available
// ---------------------------------------------------------------------------

export async function getAvailableSdaoRanks(req: Request, res: Response): Promise<void> {
  const excludeUserId = req.query.exclude_user_id
    ? String(req.query.exclude_user_id)
    : undefined;

  try {
    const result = await accountModel.getAvailableSdaoRanks(excludeUserId);
    res.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch SDAO ranks.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// GET /sections
// ---------------------------------------------------------------------------

export async function getSections(req: Request, res: Response): Promise<void> {
  const programId = req.query.programId
    ? parseInt(String(req.query.programId), 10)
    : undefined;

  try {
    const sections = await accountModel.getSections(programId);
    res.json({ success: true, data: sections });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch sections.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// GET /manage/pending-users-applications
// ---------------------------------------------------------------------------

export async function getPendingApplications(req: Request, res: Response): Promise<void> {
  try {
    const data = await accountModel.getPendingApplications();
    res.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch pending applications.';
    res.status(500).json({ success: false, error: msg });
  }
}

// ---------------------------------------------------------------------------
// POST /manage/user-application/approve
// ---------------------------------------------------------------------------

export async function approveUserApplication(req: Request, res: Response): Promise<void> {
  const { application_id } = req.body as { application_id: number };

  if (!application_id) {
    res.status(400).json({ success: false, error: 'application_id is required.' });
    return;
  }

  let applicationEmail: string;
  try {
    const result = await accountModel.approveUserApplication(Number(application_id));
    applicationEmail = result.email;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Application not found.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to approve application.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'user-application:updated', { application_id });

  // Azure invite + email (fire-and-forget)
  setImmediate(async () => {
    let redemptionUrl = await inviteAzureUser(applicationEmail);
    // If Azure fails (e.g. user already exists in tenant), provide the base app URL instead
    if (!redemptionUrl) {
      redemptionUrl = process.env.VITE_FRONTEND_URL || 'http://localhost:5173/welcome';
    }
    
    try {
      await emailService.sendInvitationEmail(applicationEmail, redemptionUrl);
      console.log(`[approveApplication] Invitation email sent to ${applicationEmail}`);
    } catch (emailErr) {
      console.error('[approveApplication] Email send failed:', (emailErr as Error).message);
    }
  });

  res.json({ success: true, message: 'Application approved and invitation email sent.' });
}

// ---------------------------------------------------------------------------
// POST /manage/user-application/reject
// ---------------------------------------------------------------------------

export async function rejectUserApplication(req: Request, res: Response): Promise<void> {
  const { application_id, rejection_reason } = req.body as {
    application_id: number;
    rejection_reason?: string;
  };

  if (!application_id) {
    res.status(400).json({ success: false, error: 'application_id is required.' });
    return;
  }

  let applicationEmail: string;
  try {
    const result = await accountModel.rejectUserApplication(
      Number(application_id),
      req.user?.user_id ?? '',
      rejection_reason ?? 'No reason provided',
    );
    applicationEmail = result.email;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (code === 'NOT_FOUND') {
      res.status(404).json({ success: false, error: 'Application not found.' });
      return;
    }
    const msg = err instanceof Error ? err.message : 'Failed to reject application.';
    res.status(500).json({ success: false, error: msg });
    return;
  }

  broadcastToPage('accounts', 'user-application:updated', { application_id });

  // Rejection email (fire-and-forget)
  setImmediate(async () => {
    try {
      await emailService.sendRejectionEmail(
        applicationEmail,
        rejection_reason ?? 'No reason provided',
        true,
      );
      console.log(`[rejectApplication] Rejection email sent to ${applicationEmail}`);
    } catch (emailErr) {
      console.error('[rejectApplication] Email send failed:', (emailErr as Error).message);
    }
  });

  res.json({ success: true, message: 'Application rejected.' });
}

// ---------------------------------------------------------------------------
// POST /manage/resend-invitation
// ---------------------------------------------------------------------------

export async function resendInvitation(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };

  if (!email) {
    res.status(400).json({ success: false, error: 'email is required.' });
    return;
  }

  try {
    const result = await emailService.resendInvitationEmail(email);
    if (result?.success) {
      res.json({ success: true, message: 'Invitation email resent successfully.' });
    } else {
      const errorMsg = (result as any)?.error || (result as any)?.message || 'Failed to resend invitation.';
      res.status(500).json({ success: false, error: errorMsg });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to resend invitation.';
    res.status(500).json({ success: false, error: msg });
  }
}
