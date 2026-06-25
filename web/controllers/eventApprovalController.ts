/**
 * web/controllers/eventApprovalController.ts
 *
 * TypeScript handlers for the Event Approval API.
 *
 * Routes:
 *   GET  /event-applications/requirement          — serve requirement file blob
 *   GET  /event-applications/publication-image    — serve publication image blob
 *   GET  /event-applications/:eventApplicationId/details  — full application + requirements
 *   PUT  /event-applications/:event_application_id/approve/:approval_id
 *   PUT  /event-applications/:event_application_id/reject/:approval_id
 *   GET  /get-events-applications-approvals       — approval timeline (used with realtime)
 */

import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import * as model from '../models/eventApprovalModel';
import { broadcastToPage, broadcastGlobal } from '../../services/websocketService';
import { notify, logActivity } from '../../services/notificationAndLogService';
import * as emailService from '../../services/emailService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEventsStorageDir(): string {
  const base =
    process.env.STORAGE_BASE_PATH ?? path.resolve(__dirname, '..', '..', 'nuconnect-files');
  return path.join(base, 'events');
}

function fullName(req: Request): string {
  return [req.user?.f_name ?? req.user?.first_name, req.user?.l_name ?? req.user?.last_name]
    .filter(Boolean)
    .join(' ');
}

// ---------------------------------------------------------------------------
// 1. GET /event-applications/:eventApplicationId/details
//    eventApplicationId param carries the proposed_event_id value
// ---------------------------------------------------------------------------

export async function getEventApplicationDetails(req: Request, res: Response): Promise<void> {
  try {
    const proposedEventId = parseInt(req.params.eventApplicationId as string, 10);
    if (!proposedEventId || isNaN(proposedEventId)) {
      res.status(400).json({ error: 'Invalid eventApplicationId' });
      return;
    }

    const app = await model.getEventApplicationDetails(proposedEventId);
    if (!app) {
      res.status(404).json({ error: 'Event application not found' });
      return;
    }

    const event = app.tbl_event;
    const org = app.tbl_renewal_cycle?.tbl_organization;
    const orgVersionId = app.tbl_renewal_cycle?.org_version_id ?? org?.current_org_version_id ?? null;
    const applicantName = [app.tbl_user.f_name, app.tbl_user.l_name].filter(Boolean).join(' ');

    const collaborators =
      event?.tbl_event_collaborator?.map((c) => ({
        organization_id: c.tbl_organization.organization_id,
        name: c.tbl_organization.name,
      })) ?? [];

    // Build approval chain — now included directly in the details response
    const approvalChain = (app.tbl_event_approval_process ?? []).map((step, index) => ({
      step_number: step.step_number ?? index + 1,
      approval_id: step.event_approval_id,
      approver_name: [step.tbl_user.f_name, step.tbl_user.l_name].filter(Boolean).join(' '),
      approver_email: step.tbl_user.email,
      role_name: step.tbl_role.role_name,
      status: step.status ?? 'Pending',
      comment: step.comment ?? null,
      actioned_at: step.approved_at ?? null,
    }));

    const currentStep = approvalChain.find((s) => s.status === 'Pending') ?? null;
    const totalSteps = approvalChain.length;
    const completedSteps = approvalChain.filter((s) => s.status === 'Approved').length;

    res.status(200).json({
      application: {
        event_application_id: app.event_application_id,
        proposed_event_id: app.proposed_event_id,
        title: event?.title ?? null,
        description: event?.description ?? null,
        venue_type: event?.venue_type ?? null,
        venue: event?.venue ?? null,
        start_date: event?.start_date ?? null,
        end_date: event?.end_date ?? null,
        schedules: (event?.tbl_event_schedule ?? []).map((s: any) => ({
          schedule_id: s.schedule_id,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          note: s.note ?? null,
          venue_ids: (s.tbl_event_schedule_venue ?? []).map((sv: any) => sv.venue_id),
          venues: (s.tbl_event_schedule_venue ?? []).map((sv: any) => ({
            venue_id: sv.venue_id,
            name: sv.tbl_venue?.name ?? null,
          })),
        })),
        type: event?.type ?? null,
        is_open_to: event?.is_open_to ?? null,
        fee: event?.fee ?? null,
        capacity: event?.capacity ?? null,
        applicant_name: applicantName,
        organization_name: org?.name ?? null,
        organization_id: app.organization_id,
        organization_version_id: orgVersionId,
        application_status: app.status,
        application_created_at: app.created_at,
        collaborators,
        image: event?.image ?? null,
        publication_image: null,
        publication_image_name: event?.image ?? null,
      },
      requirements: app.tbl_event_requirement_submissions.map((sub) => ({
        requirement_id: sub.requirement_id,
        requirement_name: sub.tbl_event_application_requirement?.requirement_name ?? null,
        is_applicable_to: sub.tbl_event_application_requirement?.is_applicable_to ?? null,
        file_path: sub.file_path ?? null,
        file_name: sub.file_path ? path.basename(sub.file_path) : null,
        submitted_at: sub.submitted_at ?? null,
      })),
      approval_chain: approvalChain,
      approval_progress: {
        total_steps: totalSteps,
        completed_steps: completedSteps,
        current_step: currentStep
          ? {
              step_number: currentStep.step_number,
              approver_name: currentStep.approver_name,
              approver_email: currentStep.approver_email,
              role_name: currentStep.role_name,
            }
          : null,
      },
    });
  } catch (error: any) {
    console.error('[getEventApplicationDetails] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 2. PUT /event-applications/:event_application_id/approve/:approval_id
// ---------------------------------------------------------------------------

export async function approveEventApplicationStep(req: Request, res: Response): Promise<void> {
  try {
    const eventApplicationId = parseInt(req.params.event_application_id as string, 10);
    const approvalId = parseInt(req.params.approval_id as string, 10);
    const userId = req.user?.user_id;
    const { comment = '', user_email } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await model.actionEventApplicationStep(
      eventApplicationId,
      approvalId,
      userId,
      'Approved',
      comment,
    );

    // Push updated timeline to all listeners on this application's channel
    const timeline = await model.getEventApprovalTimeline(eventApplicationId);
    try {
      broadcastToPage(
        `event_approval_timeline_${eventApplicationId}`,
        'approval:updated',
        timeline,
      );
    } catch (_) {}

    // Derive post-action state from timeline
    const allStatuses = timeline.map((s) => s.status);
    const isFullyApproved = allStatuses.length > 0 && allStatuses.every((s) => s === 'Approved');
    const nextPendingStep = timeline.find((s) => s.status === 'Pending');

    // Single fetch for all notification context (proposed_event_id = the frontend route key)
    try {
      const { prisma: db } = await import('../../config/db');
      const evApp = await db.tbl_event_application.findUnique({
        where: { event_application_id: eventApplicationId },
        select: {
          applicant_user_id: true,
          tbl_event: { select: { title: true, event_id: true, start_date: true } },
          tbl_renewal_cycle: { select: { tbl_organization: { select: { name: true } } } },
          tbl_user: { select: { email: true } }
        },
      });

      const proposedEventId = evApp?.tbl_event?.event_id ?? eventApplicationId;
      const eventTitle = evApp?.tbl_event?.title ?? `#${eventApplicationId}`;
      const applicantUserId = evApp?.applicant_user_id ?? null;
      const approverName = fullName(req);

      // Notify the next approver(s) in the chain
      if (nextPendingStep) {
        const isSdaoStep = nextPendingStep.role_name?.toLowerCase().includes('sdao') ?? false;

        let recipientIds: string[] = [];
        if (isSdaoStep) {
          // For SDAO steps, notify ALL active users with that role
          const sdaoRole = await db.tbl_role.findFirst({
            where: { role_name: nextPendingStep.role_name },
            select: { role_id: true },
          });
          if (sdaoRole) {
            const sdaoUsers = await db.tbl_user.findMany({
              where: { role_id: sdaoRole.role_id, status: 'Active' },
              select: { user_id: true },
            });
            recipientIds = sdaoUsers.map((u) => u.user_id);
          }
        } else {
          const nextUser = await db.tbl_user.findFirst({
            where: { email: nextPendingStep.email },
            select: { user_id: true },
          });
          if (nextUser) recipientIds = [nextUser.user_id];
        }

        if (recipientIds.length > 0) {
          await notify({
            recipientIds,
            sender: { id: userId, name: approverName },
            title: 'Event Application Awaiting Your Approval',
            message: `"${eventTitle}" has been approved by ${approverName} and now requires your review.`,
            type: 'event_approval_requested',
            entityType: 'event_application',
            entityId: eventApplicationId,
            redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
          });
        }
      }

      if (applicantUserId) {
        if (isFullyApproved) {
          // Notify president — application is fully approved
          await notify({
            recipientIds: [applicantUserId],
            sender: { id: userId, name: approverName },
            title: 'Your Event Application Has Been Approved! 🎉',
            message: `Your event application "${eventTitle}" has been fully approved and is now active.`,
            type: 'event_application_approved',
            entityType: 'event_application',
            entityId: eventApplicationId,
            redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
          });
          
          try {
            broadcastGlobal('upcoming-events:updated', { eventApplicationId });
          } catch (_) {}

          // Send fully approved email
          if (evApp?.tbl_user?.email) {
            emailService.sendEventApprovalEmail(evApp.tbl_user.email, {
              title: eventTitle,
              event_id: proposedEventId,
              start_date: evApp.tbl_event?.start_date ? new Date(evApp.tbl_event.start_date).toLocaleDateString() : 'TBD',
              organization_name: evApp.tbl_renewal_cycle?.tbl_organization?.name ?? 'Your Organization',
              adviser_email: null
            }).catch(err => console.error('[email error]', err));
          }
        } else if (nextPendingStep) {
          // Notify president — step approved, moving to next reviewer
          await notify({
            recipientIds: [applicantUserId],
            sender: { id: userId, name: approverName },
            title: 'Your Event Application Has Progressed',
            message: `"${eventTitle}" was approved by ${approverName} (${nextPendingStep.role_name ?? ''}) and is now awaiting the next reviewer.`,
            type: 'event_approval_step_approved',
            entityType: 'event_application',
            entityId: eventApplicationId,
            redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
          });
        }
      }

      await logActivity({
        userId,
        userEmail: req.user?.email ?? user_email ?? '',
        fullName: approverName,
        action: `Approved event application "${eventTitle}" (step ${timeline.findIndex((s) => s.id === approvalId) + 1})`,
        actionType: 'event_approval_approved',
        entityType: 'event_application',
        entityId: eventApplicationId,
        redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
      });
    } catch (_) {}

    res.status(200).json({ message: 'Event application approved successfully.' });
  } catch (error: any) {
    if ((error as any).code === 'STEP_NOT_FOUND') {
      res.status(404).json({ error: error.message });
      return;
    }
    if ((error as any).code === 'NOT_THE_APPROVER') {
      res.status(403).json({ error: error.message });
      return;
    }
    if ((error as any).code === 'STEP_NOT_PENDING') {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('[approveEventApplicationStep] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 3. PUT /event-applications/:event_application_id/reject/:approval_id
// ---------------------------------------------------------------------------

export async function rejectEventApplicationStep(req: Request, res: Response): Promise<void> {
  try {
    const eventApplicationId = parseInt(req.params.event_application_id as string, 10);
    const approvalId = parseInt(req.params.approval_id as string, 10);
    const userId = req.user?.user_id;
    const { comment = '', user_email } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await model.actionEventApplicationStep(
      eventApplicationId,
      approvalId,
      userId,
      'Rejected',
      comment,
    );

    const timeline = await model.getEventApprovalTimeline(eventApplicationId);
    try {
      broadcastToPage(
        `event_approval_timeline_${eventApplicationId}`,
        'approval:updated',
        timeline,
      );
    } catch (_) {}

    // Notify the applicant about the rejection + log activity
    try {
      const { prisma: db } = await import('../../config/db');
      const evApp = await db.tbl_event_application.findUnique({
        where: { event_application_id: eventApplicationId },
        select: {
          applicant_user_id: true,
          tbl_event: { select: { title: true, event_id: true } },
          tbl_renewal_cycle: { select: { tbl_organization: { select: { name: true } } } },
          tbl_user: { select: { email: true } }
        },
      });

      const proposedEventId = evApp?.tbl_event?.event_id ?? eventApplicationId;
      const eventTitle = evApp?.tbl_event?.title ?? `#${eventApplicationId}`;
      const rejecterName = fullName(req);

      if (evApp?.applicant_user_id) {
        await notify({
          recipientIds: [evApp.applicant_user_id],
          sender: { id: userId, name: rejecterName },
          title: 'Your Event Application Was Rejected',
          message: `Your event application "${eventTitle}" was rejected by ${rejecterName}.${comment ? ` Reason: ${comment}` : ''}`,
          type: 'event_application_rejected',
          entityType: 'event_application',
          entityId: eventApplicationId,
          redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
        });

        if (evApp?.tbl_user?.email) {
          emailService.sendEventRejectionEmail(evApp.tbl_user.email, {
            title: eventTitle,
            event_id: proposedEventId,
            reason: comment || 'No reason provided',
            organization_name: evApp.tbl_renewal_cycle?.tbl_organization?.name ?? 'Your Organization',
            adviser_email: null
          }).catch(err => console.error('[email error]', err));
        }
      }

      await logActivity({
        userId,
        userEmail: req.user?.email ?? user_email ?? '',
        fullName: rejecterName,
        action: `Rejected event application "${eventTitle}"`,
        actionType: 'event_approval_rejected',
        entityType: 'event_application',
        entityId: eventApplicationId,
        redirectUrl: `/events/event-approval/${proposedEventId}/${encodeURIComponent(eventTitle)}`,
      });
    } catch (_) {}

    res.status(200).json({ message: 'Event application rejected successfully.' });
  } catch (error: any) {
    if ((error as any).code === 'STEP_NOT_FOUND') {
      res.status(404).json({ error: error.message });
      return;
    }
    if ((error as any).code === 'NOT_THE_APPROVER') {
      res.status(403).json({ error: error.message });
      return;
    }
    if ((error as any).code === 'STEP_NOT_PENDING') {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error('[rejectEventApplicationStep] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 4. GET /event-applications/requirement
//    Serve a requirement file as a binary blob.
//    Query: requirement_name, organization_id, event_id, organization_version_id
// ---------------------------------------------------------------------------

export async function getRequirementFile(req: Request, res: Response): Promise<void> {
  try {
    const { requirement_name, organization_id, event_id } = req.query;

    if (!requirement_name || !organization_id || !event_id) {
      res.status(400).json({ error: 'requirement_name, organization_id, and event_id are required' });
      return;
    }

    // Sanitise filename — prevent path traversal
    const safeFilename = path.basename(String(requirement_name));
    const physicalPath = path.join(
      getEventsStorageDir(),
      String(organization_id),
      'events',
      String(event_id),
      'requirements',
      safeFilename,
    );

    if (!fs.existsSync(physicalPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const contentType = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    fs.createReadStream(physicalPath).pipe(res);
  } catch (error: any) {
    console.error('[getRequirementFile] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 5. GET /event-applications/publication-image
//    Serve the publication / poster image as a binary blob.
//    Query: organization_id, organization_version_id, event_id, image_name
// ---------------------------------------------------------------------------

export async function getPublicationImage(req: Request, res: Response): Promise<void> {
  try {
    const { organization_id, event_id, image_name } = req.query;

    if (!organization_id || !event_id || !image_name) {
      res.status(400).json({ error: 'organization_id, event_id, and image_name are required' });
      return;
    }

    // Sanitise — prevent path traversal
    const safeFilename = path.basename(String(image_name));
    let physicalPath = path.join(
      getEventsStorageDir(),
      String(organization_id),
      'events',
      String(event_id),
      'publication_images',
      safeFilename,
    );

    if (!fs.existsSync(physicalPath)) {
      // Fallback: check if the image was uploaded as a requirement instead of publication_image
      const reqPath = path.join(
        getEventsStorageDir(),
        String(organization_id),
        'events',
        String(event_id),
        'requirements',
        safeFilename,
      );
      if (fs.existsSync(reqPath)) {
        physicalPath = reqPath;
      } else {
        res.status(404).json({ error: 'Image not found' });
        return;
      }
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const imageContentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const contentType = imageContentTypes[ext] ?? 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    fs.createReadStream(physicalPath).pipe(res);
  } catch (error: any) {
    console.error('[getPublicationImage] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// 6. GET /get-events-applications-approvals
//    Returns the approval timeline for an event application.
//    Query: event_id (= event_application_id)
//    Used by the realtime channel event_approval_timeline_${event_application_id}
// ---------------------------------------------------------------------------

export async function getEventsApplicationsApprovals(req: Request, res: Response): Promise<void> {
  try {
    const eventApplicationId = parseInt(req.query.event_id as string, 10);
    if (!eventApplicationId || isNaN(eventApplicationId)) {
      res.status(400).json({ error: 'event_id (event_application_id) is required' });
      return;
    }

    const timeline = await model.getEventApprovalTimeline(eventApplicationId);
    res.status(200).json(timeline);
  } catch (error: any) {
    console.error('[getEventsApplicationsApprovals] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
