/**
 * web/controllers/approvalController.ts
 *
 * TypeScript controller for the Approval System (V2).
 *
 * Replaces the old JS controller that used MySQL stored procedures + SSE.
 * Uses Prisma via approvalModel.ts and Socket.IO via websocketService.ts.
 *
 * Routes (all under /api/web/approvals):
 *   GET    /chain/:applicationId         → getApprovalChain
 *   POST   /chain/:chainId/receive       → markApprovalReceived
 *   POST   /chain/:chainId/sign          → signApprovalStep
 *   POST   /chain/:chainId/approve       → approveApprovalStep
 *   POST   /chain/:chainId/reject        → rejectApprovalStep
 *   GET    /check-esignature             → checkUserESignature
 *   GET    /my-pending                   → getMyPendingApprovals
 *   GET    /faculty/by-program/:programId → getFacultyByProgram
 *   POST   /faculty-selection            → submitFacultySelection
 *   GET    /validate/:applicationId      → validateApprovalChain
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import * as approvalModel from '../models/approvalModel';
import { broadcastToPage, broadcastToUser, broadcastToOrgDetail } from '../../services/websocketService';
import { notify, logActivity } from '../../services/notificationAndLogService';
import { generateApplicationDocuments } from '../../lib/documentGenerator';

const copyFileAsync = promisify(fs.copyFile);

// ---------------------------------------------------------------------------
// Helper — sync tbl_application.status from approval chain state
// ---------------------------------------------------------------------------

/**
 * Derives the canonical application status from the live approval chain and
 * writes it back to tbl_application.status so the field is always a reliable
 * materialized cache of the chain state.
 *
 * Rules (evaluated in priority order):
 *   1. Any chain step is Rejected  → status = 'Rejected'
 *   2. Every is_final_approval step is Approved → status = 'Approved'
 *   3. Otherwise → status = 'Pending'
 *
 * Returns the new status string so callers can include it in socket payloads.
 */
async function syncApplicationStatus(applicationId: number): Promise<string> {
  const { prisma } = await import('../../config/db');

  const chain = await prisma.tbl_application_approval_chain.findMany({
    where: { application_id: applicationId },
    select: { status: true, is_final_approval: true },
  });

  let newStatus: 'Pending' | 'Approved' | 'Rejected' = 'Pending';

  if (chain.some((step) => step.status === 'Rejected')) {
    newStatus = 'Rejected';
  } else {
    const finalSteps = chain.filter((step) => step.is_final_approval);
    if (finalSteps.length > 0 && finalSteps.every((step) => step.status === 'Approved')) {
      newStatus = 'Approved';
    }
  }

  await prisma.tbl_application.update({
    where: { application_id: applicationId },
    data: { status: newStatus },
  });

  return newStatus;
}

// ---------------------------------------------------------------------------
// 1. GET /approvals/chain/:applicationId
// ---------------------------------------------------------------------------

export async function getApprovalChain(req: Request, res: Response): Promise<void> {
  try {
    const applicationId = parseInt(req.params.applicationId as string, 10);
    const chain = await approvalModel.getApprovalChain(applicationId);

    // Compute next_approver: lowest approval_order among pending steps
    const pendingSteps = chain.filter((s) => s.status === 'Pending');
    const nextStep = pendingSteps.length > 0
      ? pendingSteps.reduce((a, b) => (a.approval_order < b.approval_order ? a : b))
      : null;
    const next_approver = nextStep
      ? {
          chain_id: nextStep.chain_id,
          approver_name: nextStep.approver_name,
          approver_email: nextStep.approver_email,
          approver_role: nextStep.approver_role,
          approval_order: nextStep.approval_order,
        }
      : null;

    res.status(200).json({
      success: true,
      application_id: applicationId,
      count: chain.length,
      next_approver,
      data: chain,
    });
  } catch (error: any) {
    console.error('Error fetching approval chain:', error);
    res.status(500).json({ error: 'Failed to fetch approval chain', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 2. POST /approvals/chain/:chainId/receive
// ---------------------------------------------------------------------------

export async function markApprovalReceived(req: Request, res: Response): Promise<void> {
  try {
    const chainId = parseInt(req.params.chainId as string, 10);
    const { notes } = req.body;
    const userEmail = req.user.email;

    const result = await approvalModel.receiveAndSignApproval(chainId, userEmail, notes || '');

    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }

    // Sync application status and broadcast real-time update
    const ctx = await approvalModel.getChainContext(chainId);
    if (ctx) {
      const applicationStatus = await syncApplicationStatus(ctx.application_id);
      const updatedChain = await approvalModel.getApprovalChain(ctx.application_id);
      const orgName = ctx.submitted_org_name ?? 'Unknown Organization';

      broadcastToPage('approvals', 'approval:updated', {
        application_id: ctx.application_id,
        chain_id: chainId,
        type: 'approval_received',
        org_name: orgName,
        approver_email: userEmail,
        application_status: applicationStatus,
        approvalChain: updatedChain,
      });

      broadcastToUser(ctx.applicant_email, 'approval:updated', {
        application_id: ctx.application_id,
        type: 'approval_received',
        message: `${ctx.current_approver_name} has received the application for "${orgName}".`,
      });

      // Notify applicant
      notify({
        recipientIds: [ctx.applicant_user_id],
        sender: { id: ctx.current_approver_user_id, name: ctx.current_approver_name },
        title: `Application Received: "${orgName}"`,
        message: `${ctx.current_approver_name} has received your application for "${orgName}" and will review it shortly.`,
        type: 'approval_received',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl: `/organizations/app-details/${ctx.application_id}/${encodeURIComponent(orgName)}`,
      }).catch((err) => console.error('[approval] notify error:', err));

      // Notify next approver if one exists
      if (ctx.next_approver) {
        notify({
          recipientIds: [ctx.next_approver.user_id],
          sender: { id: ctx.current_approver_user_id, name: ctx.current_approver_name },
          title: `It's your turn to approve`,
          message: `${ctx.current_approver_name} has completed their approval step for "${orgName}". It is now your turn to review.`,
          type: 'approval_turn',
          entityType: 'application',
          entityId: ctx.application_id,
          redirectUrl: `/organizations/app-details/${ctx.application_id}/${encodeURIComponent(orgName)}`,
        }).catch((err) => console.error('[approval] notify next error:', err));
      }

      // Log activity
      logActivity({
        userId: ctx.current_approver_user_id,
        userEmail,
        fullName: ctx.current_approver_name,
        action: result.action_type === 'Endorsed' ? 'approval_endorsed' : 'approval_received',
        actionType: result.action_type === 'Endorsed' ? 'approval_endorsed' : 'approval_received',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl: `/organizations/app-details/${ctx.application_id}/${encodeURIComponent(orgName)}`,
        metaData: { chain_id: chainId, remarks: notes || null },
      }).catch((err) => console.error('[approval] log error:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Approval received with e-signature successfully',
      data: {
        chain_id: chainId,
        status: result.action_type ?? 'Received',
        signed_at: new Date().toISOString(),
        signature_applied: true,
      },
    });
  } catch (error: any) {
    console.error('Error receiving approval:', error);
    res.status(500).json({ error: 'Failed to receive approval with e-signature', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 3. POST /approvals/chain/:chainId/sign
// ---------------------------------------------------------------------------

export async function signApprovalStep(req: Request, res: Response): Promise<void> {
  try {
    const chainId = parseInt(req.params.chainId as string, 10);
    const userId = req.user.user_id;
    const { notes } = req.body;

    const result = await approvalModel.signApprovalStep(chainId, userId, notes || null);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }

    // Copy e-signature file
    if (result.user_signature_path && result.approval_signature_path) {
      try {
        const esigDir = process.env.ESIGNATURES_DIR || path.join(__dirname, '../../nuconnect-files/esignatures');
        const approvalSigDir = process.env.APPROVAL_SIGNATURES_DIR || path.join(__dirname, '../../nuconnect-files/approval-signatures');

        const sourcePath = path.join(esigDir, path.basename(result.user_signature_path));
        const destPath = path.join(approvalSigDir, result.approval_signature_path);

        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        if (fs.existsSync(sourcePath)) {
          await copyFileAsync(sourcePath, destPath);
        }
      } catch (copyError) {
        console.error('Failed to copy e-signature file:', copyError);
      }
    }

    // Sync application status and broadcast real-time update
    const ctx = await approvalModel.getChainContext(chainId);
    if (ctx) {
      const applicationStatus = await syncApplicationStatus(ctx.application_id);
      const updatedChain = await approvalModel.getApprovalChain(ctx.application_id);
      const validation = await approvalModel.validateApprovalChain(ctx.application_id);
      const orgName = ctx.submitted_org_name ?? 'Unknown Organization';
      const redirectUrl = `/organizations/app-details/${ctx.application_id}/${encodeURIComponent(orgName)}`;

      broadcastToPage('approvals', 'approval:updated', {
        application_id: ctx.application_id,
        chain_id: chainId,
        type: 'approval_signed',
        org_name: orgName,
        approver_id: userId,
        is_complete: validation.is_complete,
        application_status: applicationStatus,
        approvalChain: updatedChain,
      });

      broadcastToUser(ctx.applicant_email, 'approval:updated', {
        application_id: ctx.application_id,
        type: 'approval_signed',
        message: `${ctx.current_approver_name} has endorsed the application for "${orgName}".`,
      });

      // Notify applicant
      notify({
        recipientIds: [ctx.applicant_user_id],
        sender: { id: ctx.current_approver_user_id, name: ctx.current_approver_name },
        title: `Application Endorsed: "${orgName}"`,
        message: `${ctx.current_approver_name} has endorsed your application for "${orgName}".`,
        type: 'approval_signed',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl,
      }).catch((err) => console.error('[approval] notify error:', err));

      // Notify the NEXT approver in line (it's their turn now)
      if (ctx.next_approver) {
        notify({
          recipientIds: [ctx.next_approver.user_id],
          sender: { id: ctx.current_approver_user_id, name: ctx.current_approver_name },
          title: `It's your turn to approve`,
          message: `${ctx.current_approver_name} has completed their approval step for "${orgName}". It is now your turn to review.`,
          type: 'approval_turn',
          entityType: 'application',
          entityId: ctx.application_id,
          redirectUrl,
        }).catch((err) => console.error('[approval] notify next error:', err));
      }

      // Log activity
      logActivity({
        userId: ctx.current_approver_user_id,
        userEmail: ctx.current_approver_email,
        fullName: ctx.current_approver_name,
        action: 'approval_signed',
        actionType: 'approval_signed',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl,
        metaData: { chain_id: chainId, remarks: notes || null },
      }).catch((err) => console.error('[approval] log error:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Approval signed successfully',
      data: {
        chain_id: chainId,
        status: 'Signed',
        signed_at: new Date().toISOString(),
        signature_applied: true,
      },
    });
  } catch (error: any) {
    console.error('Error signing approval:', error);
    res.status(500).json({ error: 'Failed to sign approval', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 4. POST /approvals/chain/:chainId/approve
// ---------------------------------------------------------------------------

export async function approveApprovalStep(req: Request, res: Response): Promise<void> {
  try {
    const chainId = parseInt(req.params.chainId as string, 10);
    const userId = req.user.user_id;
    const userEmail = req.user.email;
    const { remarks } = req.body;

    // Validate approver identity and e-signature
    const { prisma } = await import('../../config/db');

    const chainInfo = await prisma.tbl_application_approval_chain.findUnique({
      where: { chain_id: chainId },
      include: {
        tbl_application: { select: { submitted_org_name: true, application_id: true } },
      },
    });

    if (!chainInfo) {
      res.status(404).json({ success: false, error: 'Approval chain step not found' });
      return;
    }

    // Check e-signature
    const esig = await prisma.tbl_user_esignature.findUnique({
      where: { user_id: chainInfo.approver_user_id },
    });

    if (!esig) {
      res.status(400).json({ success: false, error: 'E-signature not found. Please upload your e-signature first.' });
      return;
    }

    // Save signature path to chain BEFORE approving
    const sigFilename = path.basename(esig.signature_path);
    await prisma.tbl_application_approval_chain.update({
      where: { chain_id: chainId },
      data: { signature_path: sigFilename },
    });

    // Approve
    const result = await approvalModel.approveApprovalStep(chainId, remarks || null);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }

    // Sync application status and broadcast real-time update
    const applicationId = result.application_id!;
    const applicationStatus = await syncApplicationStatus(applicationId);
    const updatedChain = await approvalModel.getApprovalChain(applicationId);
    const ctx = await approvalModel.getChainContext(chainId);
    const orgName = chainInfo.tbl_application.submitted_org_name ?? 'Unknown Organization';
    const redirectUrl = `/organizations/app-details/${applicationId}/${encodeURIComponent(orgName)}`;

    broadcastToPage('approvals', 'approval:updated', {
      application_id: applicationId,
      chain_id: chainId,
      type: 'approval_approved',
      org_name: orgName,
      approver_id: userId,
      approver_email: userEmail,
      is_final_approval: chainInfo.is_final_approval,
      application_status: applicationStatus,
      approvalChain: updatedChain,
    });

    if (ctx) {
      const approverName = ctx.current_approver_name;

      // Notify the applicant
      broadcastToUser(ctx.applicant_email, 'approval:updated', {
        application_id: applicationId,
        type: result.organization_created ? 'application_approved' : 'approval_approved',
        message: result.organization_created
          ? `Congratulations! Your application for "${orgName}" has been fully approved by ${approverName}. Your organization has been created.`
          : `${approverName} has approved their step for your application for "${orgName}".`,
      });

      notify({
        recipientIds: [ctx.applicant_user_id],
        sender: { id: ctx.current_approver_user_id, name: approverName },
        title: result.organization_created
          ? `Application Approved: "${orgName}"`
          : `Approval Progress: "${orgName}"`,
        message: result.organization_created
          ? `Congratulations! Your application for "${orgName}" has been fully approved. Your organization has been created.`
          : `${approverName} has approved their step for your application for "${orgName}". The review process continues.`,
        type: result.organization_created ? 'application_approved' : 'approval_approved',
        entityType: 'application',
        entityId: applicationId,
        redirectUrl,
      }).catch((err) => console.error('[approval] notify applicant error:', err));

      // Notify the NEXT approver in line (it's their turn now)
      if (!result.organization_created && ctx.next_approver) {
        notify({
          recipientIds: [ctx.next_approver.user_id],
          sender: { id: ctx.current_approver_user_id, name: approverName },
          title: `It's your turn to approve`,
          message: `${approverName} has completed their approval step for "${orgName}". It is now your turn to review.`,
          type: 'approval_turn',
          entityType: 'application',
          entityId: applicationId,
          redirectUrl,
        }).catch((err) => console.error('[approval] notify next error:', err));
      }

      // Log activity
      logActivity({
        userId: ctx.current_approver_user_id,
        userEmail: ctx.current_approver_email,
        fullName: approverName,
        action: result.organization_created ? 'application_approved' : 'approval_approved',
        actionType: result.organization_created ? 'application_approved' : 'approval_approved',
        entityType: 'application',
        entityId: applicationId,
        organizationId: result.organization_id ?? null,
        redirectUrl,
        metaData: { chain_id: chainId, remarks: remarks || null, is_final: chainInfo.is_final_approval },
      }).catch((err) => console.error('[approval] log error:', err));
    }

    // After final approval — broadcast applications list update + trigger document generation
    if (result.organization_created) {
      broadcastToPage('organizations', 'applications:updated', {
        application_id: applicationId,
        type: 'approved',
      });

      // Broadcast to org-detail room for renewal / newly-created org
      if (result.organization_id) {
        broadcastToOrgDetail(result.organization_id, 'org:renewal-status:updated', { org_id: result.organization_id });
        broadcastToOrgDetail(result.organization_id, 'org:dashboard:updated', { org_id: result.organization_id });
        broadcastToOrgDetail(result.organization_id, 'org:applications:updated', { org_id: result.organization_id });
      }

      // Non-blocking: generate DOCX + PDF after response is sent
      setImmediate(() => {
        generateApplicationDocuments(applicationId)
          .catch((err) => console.error('[doc-gen] generation failed for application', applicationId, err));
      });
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        chain_id: chainId,
        status: 'Approved',
        approved_at: new Date().toISOString(),
        application_status: result.organization_created ? 'Approved' : 'Pending',
        organization_created: result.organization_created,
        organization_id: result.organization_id,
        org_version_id: result.org_version_id,
        organization_name: result.organization_name,
      },
    });
  } catch (error: any) {
    console.error('Error approving approval step:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to approve approval step', message: error.message });
    }
  }
}

// ---------------------------------------------------------------------------
// 5. POST /approvals/chain/:chainId/reject
// ---------------------------------------------------------------------------

export async function rejectApprovalStep(req: Request, res: Response): Promise<void> {
  try {
    const chainId = parseInt(req.params.chainId as string, 10);
    const { reason } = req.body;
    const userEmail = req.user.email;

    if (!reason || reason.trim().length < 10) {
      res.status(400).json({
        success: false,
        error: 'Rejection reason is required and must be at least 10 characters',
      });
      return;
    }

    // Validate approver identity
    const { prisma } = await import('../../config/db');

    const chainStep = await prisma.tbl_application_approval_chain.findUnique({
      where: { chain_id: chainId },
      include: {
        tbl_user: { select: { email: true } },
      },
    });

    if (!chainStep) {
      res.status(404).json({ success: false, error: 'Approval chain step not found' });
      return;
    }

    if (chainStep.tbl_user.email !== userEmail) {
      res.status(403).json({ success: false, error: 'You are not authorized to reject this approval step' });
      return;
    }

    const result = await approvalModel.rejectApplication(
      chainId,
      reason.trim(),
      chainStep.application_id
    );

    // Sync application status and broadcast rejection
    const applicationStatus = await syncApplicationStatus(chainStep.application_id);
    const ctx = await approvalModel.getChainContext(chainId);
    if (ctx) {
      const orgName = ctx.submitted_org_name ?? 'Unknown Organization';
      const rejecterName = ctx.current_approver_name;
      const redirectUrl = `/organizations/app-details/${ctx.application_id}/${encodeURIComponent(orgName)}`;

      broadcastToPage('approvals', 'approval:updated', {
        application_id: ctx.application_id,
        chain_id: chainId,
        type: 'approval_rejected',
        rejectedBy: userEmail,
        reason: reason.trim(),
        application_status: applicationStatus,
      });

      broadcastToUser(ctx.applicant_email, 'approval:updated', {
        application_id: ctx.application_id,
        type: 'approval_rejected',
        message: `Your application for "${orgName}" has been rejected by ${rejecterName}. Reason: ${reason.trim()}`,
      });

      // Notify applicant via notification system
      notify({
        recipientIds: [ctx.applicant_user_id],
        sender: { id: ctx.current_approver_user_id, name: rejecterName },
        title: `Application Rejected: "${orgName}"`,
        message: `${rejecterName} has rejected your application for "${orgName}". Reason: ${reason.trim()}. You may revise and resubmit.`,
        type: 'application_rejected',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl,
      }).catch((err) => console.error('[approval] notify reject error:', err));

      broadcastToPage('organizations', 'applications:updated', {
        application_id: ctx.application_id,
        type: 'rejected',
      });

      // Broadcast to org-detail room if the application is linked to an org
      const rejectedApp = await prisma.tbl_application.findUnique({
        where: { application_id: ctx.application_id },
        select: { organization_id: true },
      });
      if (rejectedApp?.organization_id) {
        broadcastToOrgDetail(rejectedApp.organization_id, 'org:renewal-status:updated', { org_id: rejectedApp.organization_id });
        broadcastToOrgDetail(rejectedApp.organization_id, 'org:applications:updated', { org_id: rejectedApp.organization_id });
      }

      // Log activity
      logActivity({
        userId: ctx.current_approver_user_id,
        userEmail,
        fullName: rejecterName,
        action: 'application_rejected',
        actionType: 'application_rejected',
        entityType: 'application',
        entityId: ctx.application_id,
        redirectUrl,
        metaData: { chain_id: chainId, reason: reason.trim() },
      }).catch((err) => console.error('[approval] log error:', err));
    }

    res.status(200).json({
      success: true,
      message: 'Application rejected successfully. The applicant will be notified and can resubmit.',
      data: {
        chain_id: chainId,
        application_id: chainStep.application_id,
        rejected_by: userEmail,
        reason: reason.trim(),
        rejected_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error rejecting approval:', error);
    res.status(500).json({ success: false, error: 'Failed to reject approval', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 6. GET /approvals/check-esignature
// ---------------------------------------------------------------------------

export async function checkUserESignature(req: Request, res: Response): Promise<void> {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      res.status(401).json({ success: false, error: 'User not authenticated.' });
      return;
    }

    const result = await approvalModel.checkUserESignature(userEmail);

    res.status(200).json({
      success: true,
      hasSignature: result.hasSignature,
      signatureUrl: result.signatureUrl,
      message: result.hasSignature
        ? 'User has uploaded e-signature'
        : 'User needs to upload e-signature first',
    });
  } catch (error: any) {
    console.error('Error checking e-signature:', error);
    res.status(500).json({ success: false, error: error.message || 'An error occurred while checking e-signature.' });
  }
}

// ---------------------------------------------------------------------------
// 7. GET /approvals/my-pending
// ---------------------------------------------------------------------------

export async function getMyPendingApprovals(req: Request, res: Response): Promise<void> {
  try {
    const userEmail = req.user.email;
    const pending = await approvalModel.getMyPendingApprovals(userEmail);

    res.status(200).json({
      success: true,
      count: pending.length,
      data: pending,
    });
  } catch (error: any) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch pending approvals', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 8. GET /approvals/faculty/by-program/:programId
// ---------------------------------------------------------------------------

export async function getFacultyByProgram(req: Request, res: Response): Promise<void> {
  try {
    const programId = parseInt(req.params.programId as string, 10);
    const faculty = await approvalModel.getFacultyByProgram(programId);

    res.status(200).json({
      success: true,
      program_id: programId,
      count: faculty.length,
      data: faculty,
    });
  } catch (error: any) {
    console.error('Error fetching faculty by program:', error);
    res.status(500).json({ error: 'Failed to fetch faculty', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 9. POST /approvals/faculty-selection
// ---------------------------------------------------------------------------

export async function submitFacultySelection(req: Request, res: Response): Promise<void> {
  try {
    const { application_id, period_id, faculty_ids } = req.body;
    const userId = req.user.user_id;

    if (!application_id || !period_id || !faculty_ids || !Array.isArray(faculty_ids)) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: application_id, period_id, and faculty_ids array',
      });
      return;
    }

    if (faculty_ids.length !== 2) {
      res.status(400).json({ success: false, error: 'Exactly 2 faculty members must be selected' });
      return;
    }

    if (faculty_ids[0] === faculty_ids[1]) {
      res.status(400).json({ success: false, error: 'Both faculty members must be different' });
      return;
    }

    // Validate application
    const { prisma } = await import('../../config/db');

    const app = await prisma.tbl_application.findUnique({
      where: { application_id },
      select: { category: true, status: true, applicant_user_id: true },
    });

    if (!app) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    if (app.category !== 'Extra_Curricular_Organization') {
      res.status(400).json({ success: false, error: 'Faculty selection is only for extra-curricular organizations' });
      return;
    }

    // Check caller is the applicant
    const user = await prisma.tbl_user.findUnique({ where: { email: req.user.email } });
    if (!user || user.user_id !== app.applicant_user_id) {
      res.status(403).json({ success: false, error: 'Unauthorized: Only the applicant can select faculty advisors' });
      return;
    }

    // Check no existing chain
    const existing = await prisma.tbl_application_approval_chain.count({
      where: { application_id },
    });

    if (existing > 0) {
      res.status(400).json({ success: false, error: 'Approval chain already exists for this application' });
      return;
    }

    // Create chain
    await approvalModel.submitFacultySelection(application_id, period_id, faculty_ids[0], faculty_ids[1]);

    // Fetch the created chain for response
    const chain = await approvalModel.getApprovalChain(application_id);

    // Broadcast
    broadcastToPage('approvals', 'approval:updated', {
      application_id,
      type: 'approval_chain_created',
      approvalChain: chain,
    });

    res.status(201).json({
      success: true,
      message: 'Faculty selection submitted and approval chain created',
      data: {
        application_id,
        approval_chain: chain,
      },
    });
  } catch (error: any) {
    console.error('Error submitting faculty selection:', error);
    res.status(500).json({ error: 'Failed to submit faculty selection', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 10. GET /approvals/validate/:applicationId
// ---------------------------------------------------------------------------

export async function validateApprovalChain(req: Request, res: Response): Promise<void> {
  try {
    const applicationId = parseInt(req.params.applicationId as string, 10);
    const validation = await approvalModel.validateApprovalChain(applicationId);

    res.status(200).json({
      success: true,
      data: {
        isComplete: validation.is_complete,
        totalSteps: validation.total_steps,
        totalFinalSteps: validation.total_final_steps,
        completedSteps: validation.approved_final_steps,
        remainingFinalApprovals: validation.remaining_final_approvals,
      },
    });
  } catch (error: any) {
    console.error('Error validating approval chain:', error);
    res.status(500).json({ error: 'Failed to validate approval chain', message: error.message });
  }
}

// ---------------------------------------------------------------------------
// 11. GET /organizations/applications (applications list)
// ---------------------------------------------------------------------------

export async function getApplicationsList(req: Request, res: Response): Promise<void> {
  try {
    const periodId = req.query.period_id ? parseInt(req.query.period_id as string, 10) : undefined;
    const status = req.query.status as string | undefined;

    const result = await approvalModel.getApplicationsList(periodId, status);

    res.status(200).json({
      success: true,
      data: result.applications,
      total: result.applications.length,
      period: result.period
        ? {
            id: result.period.id,
            start_date: result.period.start_date,
            end_date: result.period.end_date,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error fetching applications list:', error);
    res.status(500).json({ error: 'Failed to fetch applications', message: error.message });
  }
}
