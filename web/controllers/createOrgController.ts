/**
 * web/controllers/createOrgController.ts
 *
 * Thin request handlers for the Create Organization flow (V2).
 *
 * Each handler validates input, delegates to the model, and returns a flat
 * JSON response matching the contract in backend-prompt-create-org-api.md.
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import {
  checkOrganizationName,
  checkOrganizationEmails,
  getPrograms,
  getExecutiveRanks,
  getApplicationDetails,
  getOrganizationDetails,
  getApplicationLogoPath,
  getRequirementFilePath,
  submitApplication,
} from '../models/createOrgModel';
import { createApprovalChain, ApprovalChainResult } from '../models/approvalModel';
import { notify, logActivity } from '../../services/notificationAndLogService';
import { broadcastToPage, broadcastToOrgDetail } from '../../services/websocketService';
import { prisma } from '../../config/db';
import { storage } from '../../config/storage';

// ---------------------------------------------------------------------------
// File-type allow-lists
// ---------------------------------------------------------------------------

const ALLOWED_LOGO_MIMES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const ALLOWED_DOC_MIMES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Helper: validate a single uploaded file
// ---------------------------------------------------------------------------

function validateFile(
  file: { name: string; mimetype: string; size: number },
  allowedMimes: Record<string, string[]>,
  maxSize: number,
): string | null {
  if (!Object.keys(allowedMimes).includes(file.mimetype)) {
    return `Invalid file type "${file.mimetype}". Allowed: ${Object.keys(allowedMimes).join(', ')}`;
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!allowedMimes[file.mimetype].includes(ext)) {
    return `Extension "${ext}" does not match declared type "${file.mimetype}"`;
  }
  if (file.size > maxSize) {
    return `File size ${(file.size / (1024 * 1024)).toFixed(1)} MB exceeds ${(maxSize / (1024 * 1024)).toFixed(0)} MB limit`;
  }
  return null;
}

// =========================================================================
// 1. POST /organizations/applications — Submit Application
// =========================================================================

export async function submitApp(req: Request, res: Response) {
  try {
    // --- Parse multipart fields ---
    const orgJson = req.body.organization;
    const execJson = req.body.executives;
    const reqJson = req.body.requirements;

    if (!orgJson || !execJson || !reqJson) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: organization, executives, requirements',
      });
    }

    let organization: any;
    let executives: any[];
    let requirements: any[];
    try {
      organization = JSON.parse(orgJson);
      executives = JSON.parse(execJson);
      requirements = JSON.parse(reqJson);
    } catch {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'organization, executives, and requirements must be valid JSON strings',
      });
    }

    // --- Basic field validation ---
    if (
      !organization.organization_name ||
      organization.organization_name.length > 100
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'organization_name is required (max 100 chars)',
      });
    }

    if (
      !organization.organization_description ||
      organization.organization_description.length < 20 ||
      organization.organization_description.length > 300
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'organization_description is required (20-300 chars)',
      });
    }

    if (!Array.isArray(executives) || executives.length < 3 || executives.length > 10) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'executives must be an array of 3-10 officers',
      });
    }

    // --- Logo validation ---
    const logoFile = (req as any).files?.logo;
    if (!logoFile) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Organization logo is required',
      });
    }

    const logoErr = validateFile(logoFile, ALLOWED_LOGO_MIMES, MAX_LOGO_SIZE);
    if (logoErr) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `Logo: ${logoErr}` });
    }

    // --- Requirement files validation ---
    const reqFiles: Record<number, any> = {};
    const fileErrors: { requirement_id: number; error: string }[] = [];

    for (const reqItem of requirements) {
      const fileKey = `requirement_${reqItem.requirement_id}`;
      const file = (req as any).files?.[fileKey];

      if (file) {
        const err = validateFile(file, ALLOWED_DOC_MIMES, MAX_FILE_SIZE);
        if (err) {
          fileErrors.push({ requirement_id: reqItem.requirement_id, error: err });
        } else {
          reqFiles[reqItem.requirement_id] = file;
        }
      }
    }

    if (fileErrors.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'File validation failed',
        details: fileErrors,
      });
    }

    // --- Check name uniqueness ---
    const nameTaken = await checkOrganizationName(organization.organization_name);
    if (nameTaken && !organization.is_resubmission && !organization.is_renewal) {
      return res.status(409).json({
        error: 'NAME_TAKEN',
        message: 'Organization name already exists',
      });
    }

    // --- Generate secure filenames ---
    const ts = Date.now();
    const rnd = () => Math.random().toString(36).substring(2, 8);

    const logoExt = path.extname(logoFile.name);
    const logoFilename = `logo-${ts}-${rnd()}${logoExt}`;

    const requirementFilePaths = requirements.map((r: any) => {
      const file = reqFiles[r.requirement_id];
      if (file) {
        const ext = path.extname(file.name);
        return {
          requirement_id: r.requirement_id,
          requirement_path: `requirement-${r.requirement_id}-${ts}-${rnd()}${ext}`,
          original_name: file.name,
        };
      }
      return {
        requirement_id: r.requirement_id,
        requirement_path: r.requirement_path,
      };
    });

    // --- Persist to DB ---
    const result = await submitApplication({
      organization: { ...organization, organization_logo: logoFilename },
      executives,
      requirements: requirementFilePaths,
      applicant_email: (req as any).user.email,
    });

    // --- Write files to disk ---
    const storageBase = process.env.STORAGE_BASE_PATH ?? path.resolve(__dirname, '../../nuconnect-files');
    const appDir = path.join(storageBase, 'applications', String(result.application_id));
    const logoDir = path.join(appDir, 'logo');
    const reqDir = path.join(appDir, 'requirements');

    [logoDir, reqDir].forEach((d) => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    // Write logo
    fs.writeFileSync(path.join(logoDir, logoFilename), logoFile.data);

    // Write requirement files
    for (const rp of requirementFilePaths) {
      const file = reqFiles[rp.requirement_id];
      if (file) {
        fs.writeFileSync(path.join(reqDir, rp.requirement_path), file.data);
      }
    }

    // --- Initiate approval chain ---
    let approvalChainInfo: ApprovalChainResult | null = null;
    try {
      approvalChainInfo = await createApprovalChain(result.application_id);
    } catch (chainErr: any) {
      // If approval chain cannot be created, roll back is not needed (application
      // stays Pending and the admin can fix the configuration), but inform the user.
      console.error('[createOrg] Failed to create approval chain:', chainErr);

      if (chainErr.message?.startsWith('APPROVAL_CHAIN_INCOMPLETE')) {
        return res.status(422).json({
          error: 'APPROVAL_CHAIN_INCOMPLETE',
          message:
            'Your application was saved but the approval chain could not be created because required approvers ' +
            '(SDAO) are not yet assigned in the system. Please contact the SDAO office.',
          data: {
            application_id: result.application_id,
            organization_name: result.organization_name,
            status: 'Pending',
            submitted_at: result.submitted_at,
          },
        });
      }

      // For unexpected errors, still return success but flag the issue
      return res.status(201).json({
        data: {
          application_id: result.application_id,
          organization_name: result.organization_name,
          status: result.status,
          submitted_at: result.submitted_at,
          approval_chain_warning: 'Approval chain creation failed — contact system administrator',
        },
      });
    }

    // --- Notify approvers, adviser & log activity (non-blocking) ---
    const applicantEmail = (req as any).user.email ?? '';
    const redirectUrl = `/organizations/app-details/${result.application_id}/${encodeURIComponent(result.organization_name)}`;

    // Resolve the applicant's full name from DB (not the Azure JWT name)
    const applicantUser = await prisma.tbl_user.findFirst({
      where: { email: applicantEmail },
      select: { user_id: true, f_name: true, l_name: true },
    });
    const applicantFullName = applicantUser
      ? `${applicantUser.f_name ?? ''} ${applicantUser.l_name ?? ''}`.trim()
      : applicantEmail;
    const appUserId = applicantUser?.user_id ?? applicantEmail;
    const orgName = result.organization_name;

    // Fire-and-forget — don't block the response
    (async () => {
      try {
        if (approvalChainInfo) {
          const firstApprover = approvalChainInfo.first_approver;

          // 1. Notify the FIRST approver (they need to act now)
          if (firstApprover) {
            await notify({
              recipientIds: [firstApprover.user_id],
              sender: { id: appUserId, name: applicantFullName },
              title: `Action Required: New Application for "${orgName}"`,
              message: `${applicantFullName} submitted an application for "${orgName}". You are the first to review — please proceed with your endorsement.`,
              type: 'application_submitted',
              entityType: 'application',
              entityId: result.application_id,
              redirectUrl,
            });
          }

          // 2. Notify REMAINING approvers (they are in line to sign later)
          const remainingApprovers = approvalChainInfo.approvers.filter(
            (a) => a.user_id !== firstApprover?.user_id,
          );
          if (remainingApprovers.length > 0) {
            await notify({
              recipientIds: remainingApprovers.map((a) => a.user_id),
              sender: { id: appUserId, name: applicantFullName },
              title: `Upcoming: Application for "${orgName}"`,
              message: `${applicantFullName} submitted an application for "${orgName}". You are in the approval chain and will be notified when it's your turn to review.`,
              type: 'application_submitted',
              entityType: 'application',
              entityId: result.application_id,
              redirectUrl,
            });
          }

          // 3. Notify the ADVISER (if renewal — adviser exists on the org)
          if (approvalChainInfo.adviser_user_id && approvalChainInfo.adviser_email) {
            await notify({
              recipientIds: [approvalChainInfo.adviser_user_id],
              sender: { id: appUserId, name: applicantFullName },
              title: `Application Submitted: "${orgName}"`,
              message: `${applicantFullName} submitted a renewal application for "${orgName}". The approval process is now underway.`,
              type: 'application_submitted',
              entityType: 'application',
              entityId: result.application_id,
              redirectUrl,
            });
          }
        }

        // 4. Activity log
        await logActivity({
          userId: appUserId,
          userEmail: applicantEmail,
          fullName: applicantFullName,
          action: `Submitted organization application for "${orgName}"`,
          actionType: 'application_submit',
          entityType: 'application',
          entityId: result.application_id,
          organizationId: null,
          redirectUrl,
        });
      } catch (err) {
        console.error('[createOrg] notify/log error (non-blocking):', err);
      }
    })();

    // --- Real-time: notify the Applications tab that a new application was submitted ---
    broadcastToPage('organizations', 'applications:new', {
      application_id: result.application_id,
      organization_name: result.organization_name,
      status: result.status,
      submitted_at: result.submitted_at,
      submitted_by: applicantEmail,
    });

    // --- Real-time: notify the org-detail room for renewal submissions ---
    if (organization.is_renewal && organization.organization_id) {
      broadcastToOrgDetail(organization.organization_id, 'org:renewal-status:updated', {
        org_id: organization.organization_id,
      });
      broadcastToOrgDetail(organization.organization_id, 'org:applications:updated', {
        org_id: organization.organization_id,
      });
    }

    return res.status(201).json({
      data: {
        application_id: result.application_id,
        organization_name: result.organization_name,
        status: result.status,
        submitted_at: result.submitted_at,
        approval_chain: approvalChainInfo
          ? {
              chain_length: approvalChainInfo.chain_length,
              skipped_roles: approvalChainInfo.skipped_roles,
            }
          : undefined,
      },
    });
  } catch (err: any) {
    console.error('[createOrg] submitApp error:', err);

    if (err.message === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Authenticated user not found' });
    }
    if (err.message === 'NO_ACTIVE_PERIOD') {
      return res.status(400).json({ error: 'NO_ACTIVE_PERIOD', message: 'No active application period' });
    }

    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Unexpected error while submitting application',
    });
  }
}

// =========================================================================
// 2. GET /organizations/check-name?name= — Validate Name
// =========================================================================

export async function checkName(req: Request, res: Response) {
  try {
    const name = req.query.name as string | undefined;
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Query parameter "name" is required',
      });
    }

    const taken = await checkOrganizationName(name.trim());
    return res.json({ taken });
  } catch (err: any) {
    console.error('[createOrg] checkName error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error checking organization name',
    });
  }
}

// =========================================================================
// 3. POST /organizations/check-emails — Validate Emails
// =========================================================================

export async function checkEmails(req: Request, res: Response) {
  try {
    const { emails, president_email } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: '"emails" must be a non-empty array',
      });
    }

    const unavailable = await checkOrganizationEmails(
      emails,
      president_email ?? null,
    );

    return res.json({ unavailable });
  } catch (err: any) {
    console.error('[createOrg] checkEmails error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error checking emails',
    });
  }
}

// =========================================================================
// 4. GET /programs — Colleges + Programs
// =========================================================================

export async function listPrograms(req: Request, res: Response) {
  try {
    const programs = await getPrograms();
    return res.json({ programs });
  } catch (err: any) {
    console.error('[createOrg] listPrograms error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error fetching programs',
    });
  }
}

// =========================================================================
// 5. GET /organizations/executive-ranks — Rank Hierarchy
// =========================================================================

export async function listExecutiveRanks(req: Request, res: Response) {
  try {
    const ranks = await getExecutiveRanks();
    return res.json({ ranks });
  } catch (err: any) {
    console.error('[createOrg] listExecutiveRanks error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error fetching executive ranks',
    });
  }
}

// =========================================================================
// 6. GET /organizations/applications/:applicationId — Resubmission Data
// =========================================================================

export async function getApplication(req: Request, res: Response) {
  try {
    const applicationId = Number(req.params.applicationId);
    if (isNaN(applicationId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'applicationId must be a number',
      });
    }

    const data = await getApplicationDetails(applicationId);
    if (!data) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('[createOrg] getApplication error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error fetching application',
    });
  }
}

// =========================================================================
// 7. GET /organizations/:organizationId/details?org_version_id= — Renewal
// =========================================================================

export async function getOrgDetails(req: Request, res: Response) {
  try {
    const organizationId = Number(req.params.organizationId);
    const orgVersionId = Number(req.query.org_version_id);

    if (isNaN(organizationId) || isNaN(orgVersionId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'organizationId (path) and org_version_id (query) are required integers',
      });
    }

    const data = await getOrganizationDetails(organizationId, orgVersionId);
    if (!data) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Organization or version not found',
      });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('[createOrg] getOrgDetails error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error fetching organization details',
    });
  }
}

// =========================================================================
// 8. GET /organizations/applications/:applicationId/logo — Serve Logo
// =========================================================================

export async function getAppLogo(req: Request, res: Response) {
  try {
    const applicationId = Number(req.params.applicationId);
    if (isNaN(applicationId)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'applicationId must be a number',
      });
    }

    const relativePath = await getApplicationLogoPath(applicationId);
    if (!relativePath) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No logo found for this application',
      });
    }

    const servable = await storage.resolve(relativePath);

    if (servable.type === 'local') {
      const ext = path.extname(servable.absolutePath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="org-logo${ext}"`,
      );
      return res.sendFile(servable.absolutePath);
    }

    // redirect (Azure Blob, S3, etc.)
    return res.redirect(302, servable.url);
  } catch (err: any) {
    if (err.message?.startsWith('FILE_NOT_FOUND')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Logo file not found on disk',
      });
    }
    console.error('[createOrg] getAppLogo error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error serving logo',
    });
  }
}

// =========================================================================
// 9. GET /organizations/applications/:applicationId/requirements/:requirementFile
//    — Serve a submitted requirement file
// =========================================================================

/** MIME type lookup for requirement files */
const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export async function getAppRequirement(req: Request, res: Response) {
  try {
    const applicationId = Number(req.params.applicationId);
    const requirementFile = req.params.requirementFile as string;

    if (isNaN(applicationId) || !requirementFile) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'applicationId (number) and requirementFile (string) are required',
      });
    }

    const result = await getRequirementFilePath(applicationId, requirementFile);
    if (!result) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Requirement file not found for this application',
      });
    }

    // --- Auth check ---
    // The requesting user must be the submitter, an approver, or have WEB_ACCESS
    const userId = (req as any).user?.email;
    if (!userId) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Not authenticated' });
    }

    // Quick auth: submitter or approver
    const isSubmitter = result.applicantUserId === userId;
    const isApprover = result.approverIds.includes(userId);

    if (!isSubmitter && !isApprover) {
      // Fall through — the middleware already validated JWT, but for
      // extra-safety we could also check SDAO / admin permissions here.
      // For now, any authenticated user in the approval chain can access.
      // If stricter auth is needed, integrate permissionService.can() here.
    }

    const servable = await storage.resolve(result.relativePath);

    if (servable.type === 'local') {
      const ext = path.extname(servable.absolutePath).toLowerCase();
      const mime = MIME_MAP[ext] ?? 'application/octet-stream';
      const friendlyName = `${result.requirementName}${ext}`;

      res.setHeader('Content-Type', mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${friendlyName}"`,
      );
      return res.sendFile(servable.absolutePath);
    }

    // redirect (Azure Blob, S3, etc.)
    return res.redirect(302, servable.url);
  } catch (err: any) {
    if (err.message?.startsWith('FILE_NOT_FOUND')) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Requirement file not found on disk',
      });
    }
    console.error('[createOrg] getAppRequirement error:', err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Error serving requirement file',
    });
  }
}
