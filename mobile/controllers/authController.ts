import { Request, Response } from 'express';
import * as msal from '@azure/msal-node';
import axios from 'axios';
import 'dotenv/config';
import { prisma } from '../../config/db';
import { getAllPrograms } from '../../web/models/programsModel';
import { getAllUserPermissions } from '../../web/models/permissionModel';

const { sendStudentInvitationEmail } = require('../../services/emailService') as {
  sendStudentInvitationEmail: (
    email: string,
    redemptionUrl: string,
    programName: string,
    isResend: boolean,
  ) => Promise<{ success: boolean; error?: string; messageId?: string }>;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveMobileAccess(roleName: string | null | undefined): {
  policy: 'MOBILE_FULL_ACCESS' | 'MOBILE_VIEW_ONLY';
  can_write: boolean;
} {
  if (roleName === 'Student') {
    return { policy: 'MOBILE_FULL_ACCESS', can_write: true };
  }

  return { policy: 'MOBILE_VIEW_ONLY', can_write: false };
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item, '').trim())
    .filter((item) => item.length > 0);
}

async function getAccessToken(cca: msal.ConfidentialClientApplication): Promise<string> {
  const response = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  return response!.accessToken;
}

async function buildSessionPayload(email: string) {
  const user = await prisma.tbl_user.findUnique({
    where: { email },
    include: {
      tbl_role: {
        select: {
          role_name: true,
          role_id: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  const bundle = await getAllUserPermissions(email);
  const orgIds = Object.keys(bundle.organizations || {}).map((id) => Number(id)).filter((n) => Number.isFinite(n));

  const orgRows = orgIds.length
    ? await prisma.tbl_organization.findMany({
      where: { organization_id: { in: orgIds } },
      select: { organization_id: true, name: true },
    })
    : [];

  const orgNameMap = new Map(orgRows.map((o) => [o.organization_id, o.name]));

  return {
    user: {
      user_id: user.user_id,
      email: user.email,
      f_name: user.f_name || 'User',
      l_name: user.l_name || 'Student',
      role_id: user.role_id,
      role_name: user.tbl_role?.role_name || '',
      program_id: user.program_id,
      status: asString(user.status, 'Active'),
    },
    access: resolveMobileAccess(user.tbl_role?.role_name),
    permissions: {
      all_resolved: asStringArray(bundle.allResolved),
      organizations: Object.values(bundle.organizations || {}).map((entry) => ({
        organization_id: entry.organizationId,
        organization_name: orgNameMap.get(entry.organizationId) || '',
        permissions: asStringArray(entry.resolved),
      })),
    },
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const email = req.user?.email;
    if (!email) {
      res.status(401).json({ message: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const current = await prisma.tbl_user.findUnique({
      where: { email },
      select: {
        user_id: true,
        status: true,
      },
    });

    if (!current) {
      res.status(403).json({
        message: 'Your account has not been approved yet. Please contact the SDAO.',
        code: 'ACCOUNT_NOT_APPROVED',
      });
      return;
    }

    if (current.status === 'Archive') {
      res.status(403).json({
        message: 'Your account is inactive. Please contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
      return;
    }

    let userActivated = false;
    if (current.status === 'Pending') {
      await prisma.tbl_user.update({
        where: { user_id: current.user_id },
        data: {
          status: 'Active',
          f_name: req.user?.f_name || undefined,
          l_name: req.user?.l_name || undefined,
        },
      });
      userActivated = true;
    }

    const payload = await buildSessionPayload(email);
    if (!payload) {
      res.status(404).json({ message: 'User not found', code: 'NOT_FOUND' });
      return;
    }

    res.status(200).json({
      message: 'User Authenticated',
      user_activated: userActivated,
      ...payload,
    });
  } catch (error: any) {
    console.error('[mobile.auth.login] error:', error);
    res.status(500).json({
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: error.message,
    });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, program_id, program_name } = req.body as {
    email?: string;
    program_id?: number;
    program_name?: string;
  };

  if (!email || !program_id || !program_name) {
    res.status(400).json({
      success: false,
      message: 'Email, program_id, and program_name are required',
      error_code: 'MISSING_FIELDS',
    });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({
      success: false,
      message: 'Invalid email format',
      error_code: 'INVALID_EMAIL',
    });
    return;
  }

  if (!Number.isFinite(Number(program_id))) {
    res.status(400).json({
      success: false,
      message: 'Invalid program_id. Must be a valid program identifier',
      error_code: 'INVALID_PROGRAM_ID',
    });
    return;
  }

  if (!program_name.trim()) {
    res.status(400).json({
      success: false,
      message: 'Invalid program_name. Program name cannot be empty',
      error_code: 'INVALID_PROGRAM_NAME',
    });
    return;
  }

  try {
    const existing = await prisma.tbl_user.findUnique({
      where: { email },
      include: {
        tbl_role: {
          select: {
            role_name: true,
          },
        },
      },
    });

    let isResend = false;
    let userId: string;
    let userStatus: string;

    if (existing) {
      if (existing.status !== 'Pending') {
        res.status(409).json({
          success: false,
          message: 'Email is already registered and active',
          error_code: 'EMAIL_EXISTS',
          status: existing.status,
        });
        return;
      }

      isResend = true;
      userId = existing.user_id;
      userStatus = existing.status;
    } else {
      let studentRole = await prisma.tbl_role.findFirst({
        where: {
          role_name: {
            equals: 'Student',
            mode: 'insensitive',
          },
        },
        select: { role_id: true },
      });

      if (!studentRole) {
        studentRole = await prisma.tbl_role.findFirst({
          orderBy: { role_id: 'asc' },
          select: { role_id: true },
        });
      }

      if (!studentRole?.role_id) {
        throw new Error('Unable to resolve student role for registration');
      }

      const created = await prisma.tbl_user.create({
        data: {
          email,
          program_id: Number(program_id),
          role_id: studentRole.role_id,
          status: 'Pending',
        },
        select: {
          user_id: true,
          status: true,
        },
      });

      userId = created.user_id;
      userStatus = created.status;
    }

    const msalConfig: msal.Configuration = {
      auth: {
        clientId: process.env.AZURE_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
        clientSecret: process.env.AZURE_CLIENT_SECRET!,
      },
    };

    const cca = new msal.ConfidentialClientApplication(msalConfig);
    const token = await getAccessToken(cca);

    const azureResponse = await axios.post(
      'https://graph.microsoft.com/v1.0/invitations',
      {
        invitedUserEmailAddress: email,
        inviteRedirectUrl: process.env.AZURE_REDIRECT_URL,
        sendInvitationMessage: false,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const redemptionUrl = azureResponse.data.inviteRedeemUrl;
    const azureUserId = azureResponse.data.invitedUser.id;

    const emailResult = await sendStudentInvitationEmail(
      email,
      redemptionUrl,
      program_name.trim(),
      isResend,
    );

    res.status(200).json({
      success: true,
      message: isResend
        ? 'Student invitation resent successfully'
        : 'Student account created and invitation sent successfully',
      data: {
        user_id: userId,
        email,
        program_id,
        program_name: program_name.trim(),
        status: userStatus,
        account_type: 'student_mobile',
        invitation_sent: emailResult.success,
        resend: isResend,
        azure_user_id: azureUserId,
        email_message_id: emailResult.messageId,
        email_error: emailResult.success ? undefined : emailResult.error,
      },
    });
  } catch (error: any) {
    console.error('[mobile.auth.register] error:', error);

    if (error.response?.status === 400) {
      res.status(400).json({
        success: false,
        message: 'Invalid email or Azure AD configuration error',
        error_code: 'AZURE_ERROR',
        details: error.response.data?.error?.message || 'Unknown Azure error',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during registration',
      error_code: 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Registration failed',
    });
  }
}

export async function getAllProgramsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const programs = await getAllPrograms();
    res.json(programs);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'An error occurred while fetching programs.',
    });
  }
}

const authController = {
  login,
  register,
  getAllPrograms: getAllProgramsHandler,
};

export default authController;
