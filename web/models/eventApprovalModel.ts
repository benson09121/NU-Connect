/**
 * web/models/eventApprovalModel.ts
 *
 * Prisma-based queries for the Event Approval System.
 *
 * Covers:
 *   - Fetching event application details (by proposed_event_id)
 *   - Fetching the approval timeline for an event application
 *   - Approving / rejecting a single step in the approval chain
 *   - Syncing event and application status after an action
 */

import { prisma } from '../../config/db';
import {
  event_status,
  status_pending_approved_rejected,
  status_pending_approved_rejected_revision,
} from '../../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalTimelineItem {
  id: number;
  f_name: string | null;
  l_name: string | null;
  email: string;
  role_name: string;
  status: string;
  comment: string | null;
  actioned_at: Date | null;
}

export interface InitiateApprovalResult {
  stepsCreated: number;
  firstApproverUserId: string | null;   // kept for backward compat
  firstApproverEmail: string | null;
  firstApproverUserIds: string[];        // all recipients for step 1 (SDAO = multiple)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch full event application details.
 * @param proposedEventId  the value supplied in the route param (= tbl_event.event_id)
 */
export async function getEventApplicationDetails(proposedEventId: number) {
  return prisma.tbl_event_application.findFirst({
    where: { proposed_event_id: proposedEventId },
    include: {
      tbl_event: {
        include: {
          tbl_event_collaborator: {
            include: {
              tbl_organization: { select: { organization_id: true, name: true } },
            },
          },
          tbl_event_schedule: {
            include: {
              tbl_event_schedule_venue: {
                select: {
                  venue_id: true,
                  tbl_venue: { select: { name: true } },
                },
              },
            },
            orderBy: [{ date: 'asc' }, { start_time: 'asc' }],
          },
        },
      },
      tbl_user: { select: { f_name: true, l_name: true } },
      tbl_renewal_cycle: {
        include: {
          tbl_organization: {
            select: { name: true, organization_id: true, current_org_version_id: true },
          },
        },
      },
      tbl_event_requirement_submissions: {
        include: {
          tbl_event_application_requirement: {
            select: { requirement_name: true, is_applicable_to: true },
          },
        },
      },
      tbl_event_approval_process: {
        include: {
          tbl_user: { select: { f_name: true, l_name: true, email: true } },
          tbl_role: { select: { role_name: true } },
        },
        orderBy: { step_number: 'asc' },
      },
    },
  });
}

/**
 * Build the approval chain for a freshly submitted event application.
 *
 * Mirrors InitiateEventApprovalProcess from the legacy stored procedure:
 *   - Iterates tbl_role rows where is_approver = true and hierarchy_order IS NOT NULL,
 *     in ascending hierarchy_order.
 *   - For roles whose name contains "Adviser"  → uses the org's assigned adviser_id.
 *   - For "Program Chair"                      → finds the active user with that role
 *                                                in the org's base program.
 *   - For all other approver roles             → finds the first active user with that role.
 *   - Skips roles for which no suitable user exists (warns to console).
 *
 * Throws with { code: 'APPROVAL_CHAIN_INCOMPLETE' } if no steps can be created.
 */
export async function initiateEventApprovalProcess(
  eventApplicationId: number,
): Promise<InitiateApprovalResult> {
  // 1. Fetch application with organisational context
  const app = await prisma.tbl_event_application.findUniqueOrThrow({
    where: { event_application_id: eventApplicationId },
    include: {
      tbl_renewal_cycle: {
        include: {
          tbl_organization: { select: { adviser_id: true } },
          tbl_organization_version: { select: { base_program_id: true } },
        },
      },
    },
  });

  const adviserId = app.tbl_renewal_cycle.tbl_organization.adviser_id;
  const baseProgramId =
    app.tbl_renewal_cycle.tbl_organization_version?.base_program_id ?? null;

  // 2. Fetch all approver roles in hierarchy order
  const approverRoles = await prisma.tbl_role.findMany({
    where: {
      is_approver: true,
      hierarchy_order: { not: null },
    },
    orderBy: { hierarchy_order: 'asc' },
    select: { role_id: true, role_name: true, hierarchy_order: true },
  });

  if (approverRoles.length === 0) {
    throw Object.assign(
      new Error(
        'No approver roles configured. Please set up the approval hierarchy in role management.',
      ),
      { code: 'APPROVAL_CHAIN_INCOMPLETE' },
    );
  }

  // 3. Delete any stale steps (idempotent)
  await prisma.tbl_event_approval_process.deleteMany({
    where: { event_application_id: eventApplicationId },
  });

  // 4. Build the chain
  let stepsCreated = 0;
  let firstApproverUserId: string | null = null;
  let firstApproverEmail: string | null = null;
  let firstApproverUserIds: string[] = [];

  for (const role of approverRoles) {
    let approverUserId: string | null = null;

    if (role.role_name.toLowerCase().includes('adviser')) {
      // The org's designated faculty adviser is always step 1
      approverUserId = adviserId;
    } else if (role.role_name === 'Program Chair' && baseProgramId) {
      const user = await prisma.tbl_user.findFirst({
        where: { role_id: role.role_id, program_id: baseProgramId, status: 'Active' },
        select: { user_id: true },
      });
      approverUserId = user?.user_id ?? null;
    } else {
      const user = await prisma.tbl_user.findFirst({
        where: { role_id: role.role_id, status: 'Active' },
        select: { user_id: true },
      });
      approverUserId = user?.user_id ?? null;
    }

    if (!approverUserId) {
      console.warn(
        `[initiateEventApprovalProcess] No approver found for role "${role.role_name}" ` +
          `(hierarchy_order=${role.hierarchy_order}) — step skipped`,
      );
      continue;
    }

    await prisma.tbl_event_approval_process.create({
      data: {
        event_application_id: eventApplicationId,
        approver_id: approverUserId,
        approval_role_id: role.role_id,
        status: status_pending_approved_rejected.Pending,
        step_number: role.hierarchy_order!,
      },
    });

    stepsCreated++;

    if (stepsCreated === 1) {
      firstApproverUserId = approverUserId;
      // For SDAO roles, collect all active users with the role so they can all be notified
      const isSdaoRole = role.role_name.toLowerCase().includes('sdao');
      if (isSdaoRole) {
        const allSdao = await prisma.tbl_user.findMany({
          where: { role_id: role.role_id, status: 'Active' },
          select: { user_id: true, email: true },
        });
        firstApproverUserIds = allSdao.map((u) => u.user_id);
        firstApproverEmail = allSdao.find((u) => u.user_id === approverUserId)?.email ?? null;
      } else {
        firstApproverUserIds = [approverUserId];
        const u = await prisma.tbl_user.findUnique({
          where: { user_id: approverUserId },
          select: { email: true },
        });
        firstApproverEmail = u?.email ?? null;
      }
    }
  }

  if (stepsCreated === 0) {
    throw Object.assign(
      new Error(
        'No valid approvers found for any approval steps. ' +
          'Please ensure approver roles have active users assigned.',
      ),
      { code: 'APPROVAL_CHAIN_INCOMPLETE' },
    );
  }

  return { stepsCreated, firstApproverUserId, firstApproverEmail, firstApproverUserIds };
}

/**
 * Return all approval steps for an event application, ordered by step_number.
 */
export async function getEventApprovalTimeline(
  eventApplicationId: number,
): Promise<ApprovalTimelineItem[]> {
  const steps = await prisma.tbl_event_approval_process.findMany({
    where: { event_application_id: eventApplicationId },
    include: {
      tbl_user: { select: { f_name: true, l_name: true, email: true } },
      tbl_role: { select: { role_name: true } },
    },
    orderBy: { step_number: 'asc' },
  });

  return steps.map((step) => ({
    id: step.event_approval_id,
    f_name: step.tbl_user.f_name,
    l_name: step.tbl_user.l_name,
    email: step.tbl_user.email,
    role_name: step.tbl_role.role_name,
    status: step.status ?? 'Pending',
    comment: step.comment ?? null,
    actioned_at: step.approved_at ?? null,
  }));
}

/**
 * Approve or reject a single step in the event approval chain.
 *
 * Will:
 *   1. Validate the step belongs to the given application and is still Pending.
 *   2. Validate the acting user is the assigned approver.
 *   3. Update the step status + comment + approved_at.
 *   4. Re-derive and persist the parent application status.
 *   5. Sync the proposed event status (Approved / Rejected) if the chain is settled.
 *
 * Throws errors with `.code` set to:
 *   STEP_NOT_FOUND | NOT_THE_APPROVER | STEP_NOT_PENDING
 */
export async function actionEventApplicationStep(
  eventApplicationId: number,
  approvalId: number,
  userId: string,
  action: 'Approved' | 'Rejected',
  comment: string,
): Promise<{
  applicationStatus: string;
  proposedEventId: number | null;
  nextApproverUserId: string | null;
  applicantUserId: string;
  eventTitle: string | null;
}> {
  // 1. Fetch the specific step
  const step = await prisma.tbl_event_approval_process.findFirst({
    where: {
      event_approval_id: approvalId,
      event_application_id: eventApplicationId,
    },
  });

  if (!step) {
    const err = new Error('Approval step not found');
    (err as any).code = 'STEP_NOT_FOUND';
    throw err;
  }

  if (step.approver_id !== userId) {
    // For SDAO-tier roles any active user holding that role may act.
    // Check the step's role name and validate the acting user's role.
    const stepRole = await prisma.tbl_role.findUnique({
      where: { role_id: step.approval_role_id },
      select: { role_name: true },
    });
    const isSdaoStep = stepRole?.role_name?.toLowerCase().includes('sdao') ?? false;

    if (isSdaoStep) {
      const actingUser = await prisma.tbl_user.findUnique({
        where: { user_id: userId },
        select: { role_id: true },
      });
      if (actingUser?.role_id !== step.approval_role_id) {
        const err = new Error('You do not have the required SDAO role to approve this step');
        (err as any).code = 'NOT_THE_APPROVER';
        throw err;
      }
      // Reassign the step to the actual SDAO user who acted
      await prisma.tbl_event_approval_process.update({
        where: { event_approval_id: approvalId },
        data: { approver_id: userId },
      });
      // Re-fetch step with updated approver_id
      step.approver_id = userId;
    } else {
      const err = new Error('You are not the assigned approver for this step');
      (err as any).code = 'NOT_THE_APPROVER';
      throw err;
    }
  }

  if (step.status !== status_pending_approved_rejected.Pending) {
    const err = new Error('This step has already been actioned');
    (err as any).code = 'STEP_NOT_PENDING';
    throw err;
  }

  // 2. Update the approval step
  await prisma.tbl_event_approval_process.update({
    where: { event_approval_id: approvalId },
    data: {
      status:
        action === 'Approved'
          ? status_pending_approved_rejected.Approved
          : status_pending_approved_rejected.Rejected,
      comment: comment || null,
      approved_at: new Date(),
    },
  });

  // 3. Re-compute application status from all steps
  const allSteps = await prisma.tbl_event_approval_process.findMany({
    where: { event_application_id: eventApplicationId },
    select: { status: true },
  });

  let newAppStatus: status_pending_approved_rejected_revision =
    status_pending_approved_rejected_revision.Pending;

  if (allSteps.some((s) => s.status === status_pending_approved_rejected.Rejected)) {
    newAppStatus = status_pending_approved_rejected_revision.Rejected;
  } else if (allSteps.every((s) => s.status === status_pending_approved_rejected.Approved)) {
    newAppStatus = status_pending_approved_rejected_revision.Approved;
  }

  await prisma.tbl_event_application.update({
    where: { event_application_id: eventApplicationId },
    data: { status: newAppStatus, updated_at: new Date() },
  });

  // 4. Sync the proposed event's status when chain is settled
  const evApp = await prisma.tbl_event_application.findUnique({
    where: { event_application_id: eventApplicationId },
    select: {
      proposed_event_id: true,
      applicant_user_id: true,
      tbl_event: { select: { title: true } },
    },
  });

  // 5. Find next pending approver (only relevant when current step was Approved)
  let nextApproverUserId: string | null = null;
  if (action === 'Approved' && newAppStatus === status_pending_approved_rejected_revision.Pending) {
    const nextStep = await prisma.tbl_event_approval_process.findFirst({
      where: {
        event_application_id: eventApplicationId,
        status: status_pending_approved_rejected.Pending,
        step_number: { gt: step.step_number },
      },
      orderBy: { step_number: 'asc' },
      select: { approver_id: true },
    });
    nextApproverUserId = nextStep?.approver_id ?? null;
  }

  if (evApp?.proposed_event_id) {
    if (newAppStatus === status_pending_approved_rejected_revision.Approved) {
      await prisma.tbl_event.update({
        where: { event_id: evApp.proposed_event_id },
        data: { status: event_status.Approved },
      });
    } else if (newAppStatus === status_pending_approved_rejected_revision.Rejected) {
      await prisma.tbl_event.update({
        where: { event_id: evApp.proposed_event_id },
        data: { status: event_status.Rejected },
      });
    }
  }

  return {
    applicationStatus: String(newAppStatus),
    proposedEventId: evApp?.proposed_event_id ?? null,
    nextApproverUserId,
    applicantUserId: evApp?.applicant_user_id ?? '',
    eventTitle: evApp?.tbl_event?.title ?? null,
  };
}
