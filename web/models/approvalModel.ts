/**
 * web/models/approvalModel.ts
 *
 * Prisma-based queries for the Approval System (V2).
 *
 * Replaces MySQL stored procedures:
 *   sp_GetApprovalChain, sp_GetMyPendingApprovals, sp_ReceiveAndSignApproval,
 *   sp_SignApprovalStep, sp_ApproveApplicationStep, sp_ValidateApprovalChain,
 *   sp_CreateApprovalChain, sp_SubmitFacultySelection, RejectApplication,
 *   sp_GetFacultyByProgram
 */

import { prisma } from '../../config/db';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalChainStep {
  chain_id: number;
  application_id: number;
  period_id: number | null;
  approval_order: number;
  approver_user_id: string;
  approver_role: string;
  approver_name: string;
  approver_email: string;
  status: string;
  is_final_approval: boolean;
  uses_endorsed: boolean;
  has_signature: boolean;
  signature_url: string | null;
  remarks: string | null;
  endorsed_at: Date | null;
  received_at: Date | null;
  signed_at: Date | null;
  approved_at: Date | null;
  created_at: Date | null;
  status_description: string;
}

export interface PendingApprovalItem {
  chain_id: number;
  application_id: number;
  approval_order: number;
  approver_role: string;
  status: string;
  is_final_approval: boolean;
  uses_endorsed: boolean;
  has_signature: boolean;
  organization_name: string | null;
  organization_logo: string | null;
  category: string | null;
  application_type: string;
  submitted_by: string;
  submission_date: Date | null;
  previous_unsigned_count: number;
  can_sign: boolean;
}

export interface ValidationResult {
  is_complete: boolean;
  total_steps: number;
  total_final_steps: number;
  approved_final_steps: number;
  remaining_final_approvals: number;
}

export interface FacultyMember {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  program_id: number | null;
  program_name: string | null;
  program_abbrev: string | null;
  college_id: number | null;
  college_name: string | null;
  role_name: string;
}

export interface ApplicationListItem {
  id: number;
  organization_name: string | null;
  submitted_org_name: string | null;
  category: string | null;
  application_type: string;
  application_status: string;
  submitted_by: string;
  submission_date: Date | null;
  organization_logo: string | null;
  programs: string[];
  current_step: {
    approver_role: string;
    approver_name: string;
    approval_order: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Status descriptions
// ---------------------------------------------------------------------------

function getStatusDescription(status: string): string {
  switch (status) {
    case 'Pending':  return 'Waiting for previous approver';
    case 'Endorsed': return 'Endorsed by approver';
    case 'Received': return 'Ready to approve';
    case 'Signed':   return 'Signed (non-final)';
    case 'Approved': return 'Approved (FINAL)';
    case 'Rejected': return 'Rejected';
    default:         return status;
  }
}

// ---------------------------------------------------------------------------
// 1. Get Approval Chain — replaces sp_GetApprovalChain
// ---------------------------------------------------------------------------

export async function getApprovalChain(applicationId: number): Promise<ApprovalChainStep[]> {
  const rows = await prisma.tbl_application_approval_chain.findMany({
    where: { application_id: applicationId },
    include: {
      tbl_user: {
        select: {
          user_id: true,
          f_name: true,
          l_name: true,
          email: true,
          tbl_user_esignature: { select: { signature_path: true } },
        },
      },
      tbl_role: { select: { role_name: true } },
    },
    orderBy: { approval_order: 'asc' },
  });

  return rows.map((r) => {
    const hasSig = !!r.tbl_user.tbl_user_esignature?.signature_path;
    return {
      chain_id: r.chain_id,
      application_id: r.application_id,
      period_id: r.period_id,
      approval_order: r.approval_order,
      approver_user_id: r.approver_user_id,
      approver_role: r.tbl_role.role_name,
      approver_name: `${r.tbl_user.f_name ?? ''} ${r.tbl_user.l_name ?? ''}`.trim(),
      approver_email: r.tbl_user.email,
      status: r.status,
      is_final_approval: r.is_final_approval,
      uses_endorsed: r.uses_endorsed,
      has_signature: hasSig,
      signature_url: r.signature_path
        ? `/approval-signatures/${r.signature_path}`
        : null,
      remarks: r.remarks,
      endorsed_at: r.endorsed_at,
      received_at: r.received_at,
      signed_at: r.signed_at,
      approved_at: r.approved_at,
      created_at: r.created_at,
      status_description: getStatusDescription(r.status),
    };
  });
}

// ---------------------------------------------------------------------------
// 2. Receive & Sign — replaces sp_ReceiveAndSignApproval
// ---------------------------------------------------------------------------

export async function receiveAndSignApproval(
  chainId: number,
  userEmail: string,
  notes: string
): Promise<{ success: boolean; message: string; chain_id?: number; signature_filename?: string; action_type?: string }> {
  // Resolve user from email
  const user = await prisma.tbl_user.findUnique({
    where: { email: userEmail },
    include: { tbl_user_esignature: true },
  });
  if (!user) return { success: false, message: 'User not found' };

  // Check e-signature
  const sigPath = user.tbl_user_esignature?.signature_path;
  if (!sigPath) return { success: false, message: 'Please upload your e-signature first. Go to your profile to upload.' };

  // Get chain step
  const chain = await prisma.tbl_application_approval_chain.findUnique({
    where: { chain_id: chainId },
  });
  if (!chain) return { success: false, message: 'Approval chain step not found' };

  // Validate user is the assigned approver
  if (chain.approver_user_id !== user.user_id) {
    return { success: false, message: 'You are not authorized to receive this approval' };
  }

  // Check for rejected steps in the same application
  const rejected = await prisma.tbl_application_approval_chain.count({
    where: { application_id: chain.application_id, status: 'Rejected' },
  });
  if (rejected > 0) {
    return { success: false, message: 'This application has been rejected and cannot be approved further.' };
  }

  // Must be Pending
  if (chain.status !== 'Pending') {
    return { success: false, message: `Cannot receive - current status is ${chain.status}` };
  }

  // Determine new status based on uses_endorsed flag
  const newStatus = chain.uses_endorsed ? 'Endorsed' : 'Received';
  const sigFilename = sigPath.split('/').pop() ?? sigPath;

  if (chain.uses_endorsed) {
    await prisma.tbl_application_approval_chain.update({
      where: { chain_id: chainId },
      data: {
        status: 'Endorsed',
        endorsed_at: new Date(),
        signature_path: sigFilename,
        remarks: notes || null,
      },
    });
  } else {
    await prisma.tbl_application_approval_chain.update({
      where: { chain_id: chainId },
      data: {
        status: 'Received',
        received_at: new Date(),
        signature_path: sigFilename,
        remarks: notes || null,
      },
    });
  }

  return {
    success: true,
    message: `Approval ${newStatus} and e-signature applied successfully`,
    chain_id: chainId,
    signature_filename: sigFilename,
    action_type: newStatus,
  };
}

// ---------------------------------------------------------------------------
// 3. Sign — replaces sp_SignApprovalStep
// ---------------------------------------------------------------------------

export async function signApprovalStep(
  chainId: number,
  userId: string,
  notes: string | null
): Promise<{ success: boolean; message: string; chain_id?: number; user_signature_path?: string; approval_signature_path?: string }> {
  // Check e-signature
  const esig = await prisma.tbl_user_esignature.findUnique({
    where: { user_id: userId },
  });
  if (!esig) return { success: false, message: 'Please upload your e-signature first' };

  // Get chain step
  const chain = await prisma.tbl_application_approval_chain.findUnique({
    where: { chain_id: chainId },
  });
  if (!chain) return { success: false, message: 'Approval chain step not found' };

  // Validate user
  if (chain.approver_user_id !== userId) {
    return { success: false, message: 'You are not authorized to sign this approval step' };
  }

  // Must be Pending, Endorsed, or Received
  if (!['Pending', 'Endorsed', 'Received'].includes(chain.status)) {
    return { success: false, message: `Cannot sign - current status is ${chain.status}` };
  }

  // Sequential enforcement: all previous steps must be Signed
  const prevUnsigned = await prisma.tbl_application_approval_chain.count({
    where: {
      application_id: chain.application_id,
      approval_order: { lt: chain.approval_order },
      status: { notIn: ['Signed', 'Approved'] },
    },
  });
  if (prevUnsigned > 0) {
    return { success: false, message: 'Cannot sign - previous approval steps must be signed first' };
  }

  // Build approval signature path
  const sanitizedUserId = userId.replace(/@/g, '_at_').replace(/\./g, '_');
  const approvalSigPath = `app${chain.application_id}_chain${chainId}_${sanitizedUserId}.png`;

  await prisma.tbl_application_approval_chain.update({
    where: { chain_id: chainId },
    data: {
      status: 'Signed',
      signed_at: new Date(),
      signature_path: approvalSigPath,
      remarks: notes || null,
    },
  });

  return {
    success: true,
    message: 'Approval signed successfully',
    chain_id: chainId,
    user_signature_path: esig.signature_path,
    approval_signature_path: approvalSigPath,
  };
}

// ---------------------------------------------------------------------------
// 4. Approve — replaces sp_ApproveApplicationStep
// ---------------------------------------------------------------------------

export async function approveApprovalStep(
  chainId: number,
  remarks: string | null
): Promise<{
  success: boolean;
  message: string;
  organization_created?: boolean;
  organization_id?: number | null;
  org_version_id?: number | null;
  organization_name?: string | null;
  organization_logo?: string | null;
  application_id?: number;
  affectedUserIds?: string[];
}> {
  const chain = await prisma.tbl_application_approval_chain.findUnique({
    where: { chain_id: chainId },
  });
  if (!chain) return { success: false, message: 'Approval chain step not found' };

  const applicationId = chain.application_id;

  if (chain.is_final_approval) {
    // Final approver → set Approved
    await prisma.tbl_application_approval_chain.update({
      where: { chain_id: chainId },
      data: { status: 'Approved', approved_at: new Date(), remarks: remarks || null },
    });

    // Check if ALL final approvers are done
    const [remainingFinal, totalFinal] = await Promise.all([
      prisma.tbl_application_approval_chain.count({
        where: {
          application_id: applicationId,
          is_final_approval: true,
          status: { not: 'Approved' },
        },
      }),
      prisma.tbl_application_approval_chain.count({
        where: {
          application_id: applicationId,
          is_final_approval: true,
        },
      }),
    ]);

    // Safety: never auto-promote if there are no final approval steps at all
    if (totalFinal === 0) {
      return {
        success: false,
        message: 'Approval chain is misconfigured — no final approval steps exist. Contact the administrator.',
      };
    }

    if (remainingFinal === 0) {
      // ALL final approvers done → set application.status = Approved
      // and promote the org (call promoteApplication)
      const promotionResult = await promoteApplication(applicationId, remarks);

      return {
        success: true,
        message: 'Application fully approved - organization created successfully',
        organization_created: true,
        organization_id: promotionResult.organization_id,
        org_version_id: promotionResult.org_version_id,
        organization_name: promotionResult.organization_name,
        organization_logo: promotionResult.organization_logo,
        application_id: applicationId,
        affectedUserIds: promotionResult.affectedUserIds,
      };
    } else {
      return {
        success: true,
        message: 'Final approval recorded - waiting for other final approver(s)',
        organization_created: false,
        organization_id: null,
        org_version_id: null,
        organization_name: null,
        organization_logo: null,
        application_id: applicationId,
      };
    }
  } else {
    // Non-final → set Signed
    await prisma.tbl_application_approval_chain.update({
      where: { chain_id: chainId },
      data: { status: 'Signed', signed_at: new Date() },
    });

    return {
      success: true,
      message: 'Approval signed successfully',
      organization_created: false,
      organization_id: null,
      org_version_id: null,
      organization_name: null,
      organization_logo: null,
      application_id: applicationId,
    };
  }
}

// ---------------------------------------------------------------------------
// promoteApplication — replaces ApproveApplication stored procedure
//
// When ALL final approvers have approved:
//   1. Set tbl_application.status = Approved
//   2. Create or update tbl_organization
//   3. Wire up executives, members, renewal cycle
// ---------------------------------------------------------------------------

async function promoteApplication(applicationId: number, remarks: string | null) {
  // Load application + org version snapshot
  const app = await prisma.tbl_application.findUniqueOrThrow({
    where: { application_id: applicationId },
    include: {
      tbl_organization_version: {
        include: {
          tbl_organization_version_course: {
            include: { tbl_program: true },
          },
        },
      },
      tbl_user_tbl_application_applicant_user_idTotbl_user: {
        select: { email: true }
      }
    },
  });

  const ov = app.tbl_organization_version;
  if (!ov) throw new Error('Organization version snapshot not found');

  const applicantEmail = app.tbl_user_tbl_application_applicant_user_idTotbl_user?.email;

  // Mark application approved
  await prisma.tbl_application.update({
    where: { application_id: applicationId },
    data: { status: 'Approved', updated_at: new Date() },
  });

  // Load proposed executives
  const executives = await prisma.tbl_application_executives.findMany({
    where: { application_id: applicationId },
    orderBy: { proposed_rank_id: 'asc' },
  });

  // Find the Student role_id (needed for user provisioning below)
  const studentRole = await prisma.tbl_role.findFirst({
    where: { role_name: 'Student' },
  });
  const studentRoleId = studentRole?.role_id ?? 1;

  // Helper: resolve (or provision) a tbl_user record by email
  async function resolveUserByEmail(email: string, displayName: string | null, roleId: number): Promise<string> {
    const existing = await prisma.tbl_user.findUnique({ where: { email } });
    if (existing) return existing.user_id;

    // Check staging table
    const staging = await prisma.tbl_user_application.findFirst({
      where: { email, status: 'Approved' },
    });

    // Provision into tbl_user (UUID auto-generated)
    const parts = (displayName ?? '').split(' ');
    const newUser = await prisma.tbl_user.create({
      data: {
        email,
        f_name: parts[0] ?? '',
        l_name: parts.slice(1).join(' ') ?? '',
        role_id: roleId,
        status: staging ? 'Active' : 'Pending',
      },
    });

    if (staging) {
      await prisma.tbl_user_application.update({
        where: { application_id: staging.application_id },
        data: { 
          transferred_at: new Date(),
          archived_at: new Date(),
        },
      });
    }

    console.log(`[promoteApplication] Provisioned user ${email} → ${newUser.user_id}`);
    return newUser.user_id;
  }

  // Find the president (rank 1) and resolve their user_id early (needed for renewal_cycle)
  const president = executives.find((e) => e.proposed_rank_id === 1);
  let presidentUserId: string = ov.created_by;
  if (president?.proposed_email) {
    presidentUserId = await resolveUserByEmail(president.proposed_email, president.proposed_name, studentRoleId);
  }

  let orgId: number;
  let cycleNumber: number;

  if (app.application_type === 'renewal' && app.organization_id) {
    // ── RENEWAL ─────────────────────────────────────────────────────────────
    orgId = app.organization_id;

    // Generate slug from org name
    const renewalSlug = (ov.name ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Update the organization with new version
    await prisma.tbl_organization.update({
      where: { organization_id: orgId },
      data: {
        current_org_version_id: ov.org_version_id,
        name: ov.name,
        slug: renewalSlug,
        status: 'Approved',
      },
    });

    // Update the org_version to point to the organization
    await prisma.tbl_organization_version.update({
      where: { org_version_id: ov.org_version_id },
      data: { organization_id: orgId, status: 'Approved' },
    });

    // Determine next cycle number
    const lastCycle = await prisma.tbl_renewal_cycle.findFirst({
      where: { organization_id: orgId },
      orderBy: { cycle_number: 'desc' },
    });
    cycleNumber = (lastCycle?.cycle_number ?? 0) + 1;
  } else {
    // ── NEW ORGANIZATION ────────────────────────────────────────────────────
    // Generate slug: lowercase, spaces → hyphens, strip non-alphanumeric
    const slug = (ov.name ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Create the organization
    const newOrg = await prisma.tbl_organization.create({
      data: {
        adviser_id: ov.created_by,
        current_org_version_id: ov.org_version_id,
        name: ov.name,
        slug,
        status: 'Approved',
      },
    });
    orgId = newOrg.organization_id;

    // Update the org_version to point to the new organization
    await prisma.tbl_organization_version.update({
      where: { org_version_id: ov.org_version_id },
      data: { organization_id: orgId, status: 'Approved' },
    });

    // Link application to the new organization
    await prisma.tbl_application.update({
      where: { application_id: applicationId },
      data: { organization_id: orgId },
    });

    cycleNumber = 1;
  }

  // Create renewal cycle
  await prisma.tbl_renewal_cycle.create({
    data: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      president_id: presidentUserId,
      org_version_id: ov.org_version_id,
    },
  });

  // Create executive roles and add members
  for (const exec of executives) {
    if (!exec.proposed_email || !exec.proposed_rank_id) continue;

    // Create executive role for this cycle
    const role = await prisma.tbl_executive_role.create({
      data: {
        organization_id: orgId,
        cycle_number: cycleNumber,
        role_title: exec.proposed_title ?? 'Officer',
        rank_id: exec.proposed_rank_id,
      },
    });

    // Resolve user_id by email (provision if first login)
    let userId: string;
    try {
      userId = await resolveUserByEmail(exec.proposed_email, exec.proposed_name, studentRoleId);
    } catch (err) {
      console.warn(`[promoteApplication] Could not resolve user for ${exec.proposed_email}, skipping:`, err);
      continue;
    }

    // Add as organization member
    await prisma.tbl_organization_members.create({
      data: {
        organization_id: orgId,
        cycle_number: cycleNumber,
        user_id: userId,
        org_version_id: ov.org_version_id,
        member_type: 'Executive',
        status: 'Active',
        executive_role_id: role.executive_role_id,
      },
    });
  }

  // Copy org version courses to organization courses
  for (const ovc of ov.tbl_organization_version_course) {
    await prisma.tbl_organization_course.upsert({
      where: {
        organization_id_program_id: {
          organization_id: orgId,
          program_id: ovc.program_id,
        },
      },
      update: {},
      create: {
        organization_id: orgId,
        program_id: ovc.program_id,
      },
    });
  }

  // ── Copy application logo to organization directory ────────────────────────
  // Source: nuconnect-files/applications/{appId}/logo/{filename}
  // Dest:   nuconnect-files/organizations/{orgId}/{orgVersionId}/logo/{filename}
  if (ov.logo_path) {
    const basePath = process.env.NODE_ENV === 'production'
      ? '/app/nuconnect-files'
      : path.join(process.cwd(), 'nuconnect-files');

    const srcPath = path.join(basePath, 'applications', String(applicationId), 'logo', ov.logo_path);
    const destDir = path.join(basePath, 'organizations', String(orgId), String(ov.org_version_id), 'logo');
    const destPath = path.join(destDir, ov.logo_path);

    try {
      if (fs.existsSync(srcPath)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        console.log(`[promoteApplication] Logo copied: ${srcPath} → ${destPath}`);
      } else {
        console.warn(`[promoteApplication] Logo source not found: ${srcPath}`);
      }
    } catch (err) {
      console.error('[promoteApplication] Failed to copy logo:', err);
      // Non-fatal — the org is still created
    }
  }

  return {
    organization_id: orgId,
    org_version_id: ov.org_version_id,
    organization_name: ov.name,
    organization_logo: ov.logo_path,
    affectedUserIds: Array.from(new Set([applicantEmail, ...executives.map(e => e.proposed_email ? e.proposed_email : '').filter(Boolean)])),
  };
}

// ---------------------------------------------------------------------------
// 5. Reject — replaces RejectApplication
// ---------------------------------------------------------------------------

export async function rejectApplication(
  chainId: number,
  reason: string,
  applicationId: number
): Promise<ApprovalChainStep | null> {
  // Update chain step
  await prisma.tbl_application_approval_chain.update({
    where: { chain_id: chainId },
    data: {
      status: 'Rejected',
      remarks: reason,
      approved_at: new Date(),
    },
  });

  // Update application status
  await prisma.tbl_application.update({
    where: { application_id: applicationId },
    data: { status: 'Rejected', updated_at: new Date() },
  });

  // Return the updated step with joins
  const row = await prisma.tbl_application_approval_chain.findUnique({
    where: { chain_id: chainId },
    include: {
      tbl_user: { select: { user_id: true, f_name: true, l_name: true, email: true } },
      tbl_role: { select: { role_name: true } },
    },
  });

  if (!row) return null;

  return {
    chain_id: row.chain_id,
    application_id: row.application_id,
    period_id: row.period_id,
    approval_order: row.approval_order,
    approver_user_id: row.approver_user_id,
    approver_role: row.tbl_role.role_name,
    approver_name: `${row.tbl_user.f_name ?? ''} ${row.tbl_user.l_name ?? ''}`.trim(),
    approver_email: row.tbl_user.email,
    status: row.status,
    is_final_approval: row.is_final_approval,
    uses_endorsed: row.uses_endorsed,
    has_signature: false,
    signature_url: null,
    remarks: row.remarks,
    endorsed_at: row.endorsed_at,
    received_at: row.received_at,
    signed_at: row.signed_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    status_description: getStatusDescription(row.status),
  };
}

// ---------------------------------------------------------------------------
// 6. Validate Approval Chain — replaces sp_ValidateApprovalChain
// ---------------------------------------------------------------------------

export async function validateApprovalChain(applicationId: number): Promise<ValidationResult> {
  const [totalSteps, totalFinal, approvedFinal] = await Promise.all([
    prisma.tbl_application_approval_chain.count({
      where: { application_id: applicationId },
    }),
    prisma.tbl_application_approval_chain.count({
      where: { application_id: applicationId, is_final_approval: true },
    }),
    prisma.tbl_application_approval_chain.count({
      where: { application_id: applicationId, is_final_approval: true, status: 'Approved' },
    }),
  ]);

  return {
    is_complete: totalFinal > 0 && approvedFinal === totalFinal,
    total_steps: totalSteps,
    total_final_steps: totalFinal,
    approved_final_steps: approvedFinal,
    remaining_final_approvals: totalFinal - approvedFinal,
  };
}

// ---------------------------------------------------------------------------
// 7. Get My Pending Approvals — replaces sp_GetMyPendingApprovals
// ---------------------------------------------------------------------------

export async function getMyPendingApprovals(userEmail: string): Promise<PendingApprovalItem[]> {
  // Resolve user_id from email
  const user = await prisma.tbl_user.findUnique({
    where: { email: userEmail },
    include: { tbl_user_esignature: true },
  });
  if (!user) return [];

  const hasSig = !!user.tbl_user_esignature?.signature_path;

  // Get pending/received steps for this user
  const rows = await prisma.tbl_application_approval_chain.findMany({
    where: {
      approver_user_id: user.user_id,
      status: { in: ['Pending', 'Received'] },
    },
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_application: {
        select: {
          application_id: true,
          submitted_org_name: true,
          submitted_org_logo: true,
          category: true,
          application_type: true,
          created_at: true,
          tbl_user_tbl_application_applicant_user_idTotbl_user: {
            select: { f_name: true, l_name: true },
          },
        },
      },
    },
    orderBy: [{ created_at: 'desc' }, { approval_order: 'asc' }],
  });

  // For each row, count previous unsigned steps
  const result: PendingApprovalItem[] = [];
  for (const r of rows) {
    const prevUnsigned = await prisma.tbl_application_approval_chain.count({
      where: {
        application_id: r.application_id,
        approval_order: { lt: r.approval_order },
        status: { notIn: ['Signed', 'Approved'] },
      },
    });

    const applicant = r.tbl_application.tbl_user_tbl_application_applicant_user_idTotbl_user;

    result.push({
      chain_id: r.chain_id,
      application_id: r.application_id,
      approval_order: r.approval_order,
      approver_role: r.tbl_role.role_name,
      status: r.status,
      is_final_approval: r.is_final_approval,
      uses_endorsed: r.uses_endorsed,
      has_signature: hasSig,
      organization_name: r.tbl_application.submitted_org_name,
      organization_logo: r.tbl_application.submitted_org_logo,
      category: r.tbl_application.category,
      application_type: r.tbl_application.application_type,
      submitted_by: `${applicant.f_name ?? ''} ${applicant.l_name ?? ''}`.trim(),
      submission_date: r.tbl_application.created_at,
      previous_unsigned_count: prevUnsigned,
      can_sign: prevUnsigned === 0 && hasSig,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// 8. Check E-Signature — replaces checkUserESignature
// ---------------------------------------------------------------------------

export async function checkUserESignature(userEmail: string): Promise<{
  hasSignature: boolean;
  signatureUrl: string | null;
}> {
  const user = await prisma.tbl_user.findUnique({
    where: { email: userEmail },
    include: { tbl_user_esignature: true },
  });

  if (!user) return { hasSignature: false, signatureUrl: null };

  const sigPath = user.tbl_user_esignature?.signature_path ?? null;
  return {
    hasSignature: !!sigPath,
    signatureUrl: sigPath ? `/esignatures/${sigPath}` : null,
  };
}

// ---------------------------------------------------------------------------
// 9. Get Faculty by Program — replaces sp_GetFacultyByProgram
// ---------------------------------------------------------------------------

export async function getFacultyByProgram(programId: number): Promise<FacultyMember[]> {
  // Faculty role — users with role "Faculty" who are active and match program or have no program
  const rows = await prisma.tbl_user.findMany({
    where: {
      tbl_role: { role_name: 'Faculty' },
      status: 'Active',
      OR: [
        { program_id: programId },
        { program_id: null },
      ],
    },
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: {
        include: { tbl_college: true },
      },
    },
    orderBy: [{ l_name: 'asc' }, { f_name: 'asc' }],
  });

  return rows.map((u) => {
    const prog = u.tbl_program_tbl_user_program_idTotbl_program;
    return {
      user_id: u.user_id,
      email: u.email,
      first_name: u.f_name,
      last_name: u.l_name,
      full_name: `${u.f_name ?? ''} ${u.l_name ?? ''}`.trim(),
      program_id: prog?.program_id ?? null,
      program_name: prog?.name ?? null,
      program_abbrev: prog?.abbreviation ?? null,
      college_id: prog?.tbl_college?.college_id ?? null,
      college_name: prog?.tbl_college?.name ?? null,
      role_name: u.tbl_role.role_name,
    };
  });
}

// ---------------------------------------------------------------------------
// 10. Create Approval Chain — replaces sp_CreateApprovalChain
//
// Builds the approval chain for an application. The chain structure depends
// on the organization category:
//
//   Co-Curricular:   [Program Chair] → [Dean] → SDAO Rank 2 → SDAO Rank 1
//                    → SDAO Rank 2 (final) → Academic Director (final)
//
//   Extra-Curricular: [Dean] → SDAO Rank 2 → SDAO Rank 1
//                     → SDAO Rank 2 (final) → Academic Director (final)
//                     (faculty advisers are added later via submitFacultySelection)
//
// Steps in [brackets] are skipped if no user is assigned to that role.
// At a minimum, SDAO Rank 2 (final approver) is REQUIRED. If no final
// approver can be resolved, the function throws an error so the application
// does not silently auto-approve.
// ---------------------------------------------------------------------------

export interface ApprovalChainApprover {
  user_id: string;
  email: string;
  full_name: string;
  approval_order: number;
  is_final_approval: boolean;
}

export interface ApprovalChainResult {
  chain_length: number;
  skipped_roles: string[];
  warnings: string[];
  approver_user_ids: string[];
  approvers: ApprovalChainApprover[];
  first_approver: ApprovalChainApprover | null;
  adviser_user_id: string | null;
  adviser_email: string | null;
  adviser_name: string | null;
}

export async function createApprovalChain(applicationId: number): Promise<ApprovalChainResult> {
  // Get application + org version details
  const app = await prisma.tbl_application.findUniqueOrThrow({
    where: { application_id: applicationId },
    include: {
      tbl_organization_version: { select: { category: true, base_program_id: true } },
    },
  });

  const periodId = app.period_id;
  const category = app.tbl_organization_version?.category;
  const baseProgramId = app.tbl_organization_version?.base_program_id;

  // Get college_id from program
  let collegeId: number | null = null;
  if (baseProgramId) {
    const prog = await prisma.tbl_program.findUnique({ where: { program_id: baseProgramId } });
    collegeId = prog?.college_id ?? null;
  }

  // Resolve role IDs
  const [
    programChairRole,
    deanRole,
    sdaoRole,
    academicDirectorRole,
  ] = await Promise.all([
    prisma.tbl_role.findFirst({ where: { role_name: { contains: 'Chair' } } }),
    prisma.tbl_role.findFirst({ where: { role_name: { contains: 'Dean' } } }),
    prisma.tbl_role.findFirst({ where: { role_name: { contains: 'SDAO' } } }),
    prisma.tbl_role.findFirst({
      where: { OR: [{ role_name: { contains: 'Academic Director' } }, { role_name: { contains: 'Director' } }] },
    }),
  ]);

  // Resolve approver users
  const [programChair, dean, sdaoStaff2, sdaoStaff1, sdaoDirector, academicDirector] = await Promise.all([
    baseProgramId
      ? prisma.tbl_user.findFirst({
          where: {
            program_id: baseProgramId,
            tbl_role: { role_name: { contains: 'Chair' } },
            status: 'Active',
          },
        })
      : null,
    collegeId
      ? prisma.tbl_college_dean.findFirst({
          where: { college_id: collegeId, is_active: true },
        })
      : null,
    prisma.tbl_sdao_approver.findFirst({
      where: { sdao_rank: 2 },
      include: { tbl_user: { select: { status: true, user_id: true } } },
    }),
    prisma.tbl_sdao_approver.findFirst({
      where: { sdao_rank: 1 },
      include: { tbl_user: { select: { status: true, user_id: true } } },
    }),
    prisma.tbl_sdao_approver.findFirst({
      where: { sdao_rank: 3 },
      include: { tbl_user: { select: { status: true, user_id: true } } },
    }),
    prisma.tbl_user.findFirst({
      where: {
        tbl_role: { OR: [{ role_name: { contains: 'Academic Director' } }, { role_name: { contains: 'Director' } }] },
        status: 'Active',
      },
    }),
  ]);

  // ── Collect warnings for missing optional approvers ──────────────────────
  const skippedRoles: string[] = [];
  const warnings: string[] = [];

  const isCoCurricular = category === 'Co_Curricular_Organization';

  if (isCoCurricular && (!programChair || !programChairRole)) {
    skippedRoles.push('Program Chair');
    warnings.push('No active Program Chair found for this program — step skipped');
  }

  if (!dean || !deanRole) {
    skippedRoles.push('Dean');
    warnings.push('No active Dean found for this college — step skipped');
  }

  if (!sdaoStaff1 || sdaoStaff1.tbl_user.status !== 'Active' || !sdaoRole) {
    skippedRoles.push('SDAO Staff (Rank 1)');
    warnings.push('No active SDAO Staff Rank 1 found — step skipped');
  }

  if (!sdaoStaff2 || sdaoStaff2.tbl_user.status !== 'Active' || !sdaoRole) {
    skippedRoles.push('SDAO Staff (Rank 2)');
    warnings.push('No active SDAO Staff Rank 2 found — step skipped');
  }

  // ── Validate that we can build a valid chain ─────────────────────────────
  // At minimum, SDAO Director (rank 3, final approver) is required
  const hasValidSdaoDirector = sdaoDirector && sdaoDirector.tbl_user.status === 'Active' && sdaoRole;

  if (!hasValidSdaoDirector) {
    throw new Error(
      'APPROVAL_CHAIN_INCOMPLETE: Cannot create approval chain — no active SDAO Director is assigned. ' +
      'Please contact the system administrator to assign an SDAO Director before submitting applications.'
    );
  }

  // Log warnings for optional missing approvers
  if (warnings.length > 0) {
    console.warn(
      `[createApprovalChain] Application ${applicationId}: ${warnings.join('; ')}`
    );
  }

  // Clean existing chain
  await prisma.tbl_application_approval_chain.deleteMany({
    where: { application_id: applicationId },
  });

  let order = 0;
  const chainInserts: Parameters<typeof prisma.tbl_application_approval_chain.create>[0]['data'][] = [];

  if (isCoCurricular) {
    // Co-Curricular: Program Chair → Dean → SDAO chain
    if (programChair && programChairRole) {
      order++;
      chainInserts.push({
        application_id: applicationId,
        period_id: periodId,
        approver_user_id: programChair.user_id,
        approver_role_id: programChairRole.role_id,
        approval_order: order,
        uses_endorsed: true,
        status: 'Pending',
      });
    }

    if (dean && deanRole) {
      order++;
      chainInserts.push({
        application_id: applicationId,
        period_id: periodId,
        approver_user_id: dean.dean_user_id,
        approver_role_id: deanRole.role_id,
        approval_order: order,
        uses_endorsed: true,
        status: 'Pending',
      });
    }
  } else {
    // Extra-Curricular: Dean → SDAO chain (faculty added via faculty-selection)
    if (dean && deanRole) {
      order++;
      chainInserts.push({
        application_id: applicationId,
        period_id: periodId,
        approver_user_id: dean.dean_user_id,
        approver_role_id: deanRole.role_id,
        approval_order: order,
        uses_endorsed: true,
        status: 'Pending',
      });
    }
  }

  // Common SDAO chain: Staff Rank 2 → Staff Rank 1 → SDAO Director (final)
  // Each approver appears only once.

  // SDAO Staff Rank 2 (optional — endorsement/review)
  if (sdaoStaff2 && sdaoStaff2.tbl_user.status === 'Active' && sdaoRole) {
    order++;
    chainInserts.push({
      application_id: applicationId,
      period_id: periodId,
      approver_user_id: sdaoStaff2.user_id,
      approver_role_id: sdaoRole.role_id,
      approval_order: order,
      status: 'Pending',
    });
  }

  // SDAO Staff Rank 1 (optional — review)
  if (sdaoStaff1 && sdaoStaff1.tbl_user.status === 'Active' && sdaoRole) {
    order++;
    chainInserts.push({
      application_id: applicationId,
      period_id: periodId,
      approver_user_id: sdaoStaff1.user_id,
      approver_role_id: sdaoRole.role_id,
      approval_order: order,
      status: 'Pending',
    });
  }

  // SDAO Director (FINAL approval — always present, validated above)
  order++;
  chainInserts.push({
    application_id: applicationId,
    period_id: periodId,
    approver_user_id: sdaoDirector!.user_id,
    approver_role_id: sdaoRole!.role_id,
    approval_order: order,
    is_final_approval: true,
    status: 'Pending',
  });

  // Academic Director (FINAL approval — optional)
  if (academicDirector && academicDirectorRole) {
    order++;
    chainInserts.push({
      application_id: applicationId,
      period_id: periodId,
      approver_user_id: academicDirector.user_id,
      approver_role_id: academicDirectorRole.role_id,
      approval_order: order,
      is_final_approval: true,
      status: 'Pending',
    });
  } else {
    skippedRoles.push('Academic Director');
    warnings.push('No active Academic Director found — step skipped');
  }

  // Bulk insert
  for (const data of chainInserts) {
    await prisma.tbl_application_approval_chain.create({ data });
  }

  // Collect unique approver user IDs for notifications
  const approverUserIds = [...new Set(chainInserts.map((c) => c.approver_user_id))];

  // Resolve approver details (name, email, order) for personalized notifications
  const approverUsers = await prisma.tbl_user.findMany({
    where: { user_id: { in: approverUserIds } },
    select: { user_id: true, email: true, f_name: true, l_name: true },
  });
  const userMap = new Map(approverUsers.map((u) => [u.user_id, u]));

  const approvers: ApprovalChainApprover[] = chainInserts.map((c) => {
    const u = userMap.get(c.approver_user_id);
    return {
      user_id: c.approver_user_id,
      email: u?.email ?? '',
      full_name: `${u?.f_name ?? ''} ${u?.l_name ?? ''}`.trim() || c.approver_user_id,
      approval_order: c.approval_order,
      is_final_approval: c.is_final_approval ?? false,
    };
  });

  const firstApprover = approvers.length > 0
    ? approvers.reduce((a, b) => (a.approval_order < b.approval_order ? a : b))
    : null;

  // Resolve adviser (for renewals the org already exists, for new apps it doesn't)
  let adviserUserId: string | null = null;
  let adviserEmail: string | null = null;
  let adviserName: string | null = null;

  if (app.organization_id) {
    const org = await prisma.tbl_organization.findUnique({
      where: { organization_id: app.organization_id },
      select: {
        adviser_id: true,
        tbl_user_tbl_organization_adviser_idTotbl_user: {
          select: { user_id: true, email: true, f_name: true, l_name: true },
        },
      },
    });
    if (org?.adviser_id) {
      const adviser = org.tbl_user_tbl_organization_adviser_idTotbl_user;
      adviserUserId = adviser.user_id;
      adviserEmail = adviser.email;
      adviserName = `${adviser.f_name ?? ''} ${adviser.l_name ?? ''}`.trim() || null;
    }
  }

  return {
    chain_length: chainInserts.length,
    skipped_roles: skippedRoles,
    warnings,
    approver_user_ids: approverUserIds,
    approvers,
    first_approver: firstApprover,
    adviser_user_id: adviserUserId,
    adviser_email: adviserEmail,
    adviser_name: adviserName,
  };
}

// ---------------------------------------------------------------------------
// 11. Submit Faculty Selection — replaces sp_SubmitFacultySelection
// ---------------------------------------------------------------------------

export async function submitFacultySelection(
  applicationId: number,
  periodId: number,
  faculty1Id: string,
  faculty2Id: string
): Promise<void> {
  // Resolve role IDs
  const [facultyRole, sdaoRole, adRole] = await Promise.all([
    prisma.tbl_role.findFirst({ where: { role_name: 'Faculty' } }),
    prisma.tbl_role.findFirst({ where: { role_name: { contains: 'SDAO' } } }),
    prisma.tbl_role.findFirst({
      where: { OR: [{ role_name: { contains: 'Academic Director' } }, { role_name: { contains: 'Director' } }] },
    }),
  ]);

  if (!facultyRole) throw new Error('Faculty role not found');
  if (!sdaoRole) throw new Error('SDAO role not found');
  if (!adRole) throw new Error('Academic Director role not found');

  // Resolve SDAO users
  const [sdaoRank2, sdaoRank1, academicDirector] = await Promise.all([
    prisma.tbl_sdao_approver.findFirst({ where: { sdao_rank: 2 } }),
    prisma.tbl_sdao_approver.findFirst({ where: { sdao_rank: 1 } }),
    prisma.tbl_user.findFirst({
      where: {
        tbl_role: { OR: [{ role_name: { contains: 'Academic Director' } }, { role_name: { contains: 'Director' } }] },
        status: 'Active',
      },
    }),
  ]);

  if (!sdaoRank2 || !sdaoRank1 || !academicDirector) {
    throw new Error('SDAO or Academic Director users not found');
  }

  // Build 6-step chain
  const steps = [
    { approver_user_id: faculty1Id, approver_role_id: facultyRole.role_id, approval_order: 1, uses_endorsed: true, status: 'Received' as const },
    { approver_user_id: faculty2Id, approver_role_id: facultyRole.role_id, approval_order: 2, uses_endorsed: true, status: 'Pending' as const },
    { approver_user_id: sdaoRank2.user_id, approver_role_id: sdaoRole.role_id, approval_order: 3, uses_endorsed: false, status: 'Pending' as const },
    { approver_user_id: sdaoRank1.user_id, approver_role_id: sdaoRole.role_id, approval_order: 4, uses_endorsed: false, status: 'Pending' as const },
    { approver_user_id: sdaoRank2.user_id, approver_role_id: sdaoRole.role_id, approval_order: 5, uses_endorsed: false, is_final_approval: true, status: 'Pending' as const },
    { approver_user_id: academicDirector.user_id, approver_role_id: adRole.role_id, approval_order: 6, uses_endorsed: false, is_final_approval: true, status: 'Pending' as const },
  ];

  for (const step of steps) {
    await prisma.tbl_application_approval_chain.create({
      data: {
        application_id: applicationId,
        period_id: periodId,
        ...step,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 12. Get Application List — NEW endpoint for Organizations Applications tab
// ---------------------------------------------------------------------------

export async function getApplicationsList(
  periodId?: number,
  statusFilter?: string
): Promise<{ applications: ApplicationListItem[]; period: { id: number; start_date: Date; end_date: Date } | null }> {
  // Resolve period — use provided or find active
  let period: { period_id: number; start_date: Date; end_date: Date } | null = null;

  if (periodId) {
    period = await prisma.tbl_application_period.findUnique({
      where: { period_id: periodId },
      select: { period_id: true, start_date: true, end_date: true },
    });
  } else {
    period = await prisma.tbl_application_period.findFirst({
      where: { is_active: true },
      orderBy: { created_at: 'desc' },
      select: { period_id: true, start_date: true, end_date: true },
    });
  }

  if (!period) {
    return { applications: [], period: null };
  }

  // Build status filter
  const statusWhere = statusFilter
    ? { status: statusFilter as 'Pending' | 'Approved' | 'Rejected' }
    : {};

  const apps = await prisma.tbl_application.findMany({
    where: {
      period_id: period.period_id,
      ...statusWhere,
    },
    include: {
      tbl_user_tbl_application_applicant_user_idTotbl_user: {
        select: { f_name: true, l_name: true },
      },
      tbl_organization_version: {
        include: {
          tbl_organization_version_course: {
            include: { tbl_program: { select: { abbreviation: true } } },
          },
        },
      },
      tbl_application_approval_chain: {
        where: { status: { in: ['Pending', 'Received'] } },
        include: {
          tbl_role: { select: { role_name: true } },
          tbl_user: { select: { f_name: true, l_name: true } },
        },
        orderBy: { approval_order: 'asc' },
        take: 1,
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const applications: ApplicationListItem[] = apps.map((a) => {
    const applicant = a.tbl_user_tbl_application_applicant_user_idTotbl_user;
    const currentChainStep = a.tbl_application_approval_chain[0] ?? null;
    const programs = a.tbl_organization_version?.tbl_organization_version_course
      .map((c) => c.tbl_program.abbreviation)
      .filter(Boolean) as string[] ?? [];

    return {
      id: a.application_id,
      organization_name: a.tbl_organization_version?.name ?? a.submitted_org_name,
      submitted_org_name: a.submitted_org_name,
      category: a.category,
      application_type: a.application_type,
      application_status: a.status ?? 'Pending',
      submitted_by: `${applicant.f_name ?? ''} ${applicant.l_name ?? ''}`.trim(),
      submission_date: a.created_at,
      organization_logo: a.submitted_org_logo,
      programs,
      current_step: currentChainStep
        ? {
            approver_role: currentChainStep.tbl_role.role_name,
            approver_name: `${currentChainStep.tbl_user.f_name ?? ''} ${currentChainStep.tbl_user.l_name ?? ''}`.trim(),
            approval_order: currentChainStep.approval_order,
          }
        : null,
    };
  });

  return {
    applications,
    period: {
      id: period.period_id,
      start_date: period.start_date,
      end_date: period.end_date,
    },
  };
}

// ---------------------------------------------------------------------------
// 13. Get chain context — helper for broadcasting after actions
// ---------------------------------------------------------------------------

export async function getChainContext(chainId: number): Promise<{
  application_id: number;
  submitted_org_name: string | null;
  applicant_email: string;
  applicant_user_id: string;
  applicant_name: string;
  current_approver_email: string;
  current_approver_name: string;
  current_approver_user_id: string;
  next_approver: { user_id: string; email: string; full_name: string } | null;
} | null> {
  const chain = await prisma.tbl_application_approval_chain.findUnique({
    where: { chain_id: chainId },
    include: {
      tbl_user: { select: { user_id: true, email: true, f_name: true, l_name: true } },
      tbl_application: {
        select: {
          application_id: true,
          submitted_org_name: true,
          applicant_user_id: true,
          tbl_user_tbl_application_applicant_user_idTotbl_user: {
            select: { user_id: true, email: true, f_name: true, l_name: true },
          },
        },
      },
    },
  });

  if (!chain) return null;

  const applicant = chain.tbl_application.tbl_user_tbl_application_applicant_user_idTotbl_user;

  // Find the next pending step in the chain (order > current step's order)
  const nextStep = await prisma.tbl_application_approval_chain.findFirst({
    where: {
      application_id: chain.tbl_application.application_id,
      approval_order: { gt: chain.approval_order },
      status: 'Pending',
    },
    orderBy: { approval_order: 'asc' },
    include: {
      tbl_user: { select: { user_id: true, email: true, f_name: true, l_name: true } },
    },
  });

  return {
    application_id: chain.tbl_application.application_id,
    submitted_org_name: chain.tbl_application.submitted_org_name,
    applicant_email: applicant.email,
    applicant_user_id: applicant.user_id,
    applicant_name: `${applicant.f_name ?? ''} ${applicant.l_name ?? ''}`.trim() || applicant.email,
    current_approver_email: chain.tbl_user.email,
    current_approver_name: `${chain.tbl_user.f_name ?? ''} ${chain.tbl_user.l_name ?? ''}`.trim() || chain.tbl_user.email,
    current_approver_user_id: chain.tbl_user.user_id,
    next_approver: nextStep
      ? {
          user_id: nextStep.tbl_user.user_id,
          email: nextStep.tbl_user.email,
          full_name: `${nextStep.tbl_user.f_name ?? ''} ${nextStep.tbl_user.l_name ?? ''}`.trim() || nextStep.tbl_user.email,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// 14. Get application officers — for post-approval email sending
// ---------------------------------------------------------------------------

export async function getApplicationOfficers(applicationId: number) {
  return prisma.tbl_application_executives.findMany({
    where: { application_id: applicationId },
    select: {
      proposed_email: true,
      proposed_name: true,
      proposed_title: true,
    },
  });
}
