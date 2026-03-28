/**
 * web/models/periodRequirementAssignmentModel.ts
 *
 * Prisma-based queries for assigning / unassigning requirements to periods.
 *
 * Junction table: tbl_application_period_requirement (period_id, requirement_id).
 *
 * Endpoints:
 *   GET    /api/web/organizations/application-periods/:periodId/requirements
 *   POST   /api/web/organizations/application-periods/:periodId/requirements
 *   DELETE /api/web/organizations/application-periods/:periodId/requirements/:requirementId
 */

import { prisma } from '../../config/db';
import { resolveUser } from './organizationsPageModel';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface AssignedRequirementItem {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: string;
  file_path: string | null;
}

export interface AssignedRequirementsListResponse {
  requirements: AssignedRequirementItem[];
  total: number;
}

export interface AssignExistingInput {
  requirement_id: number;
}

export interface AssignNewInput {
  requirement_name: string;
  is_applicable_to: 'new' | 'renew' | 'both';
  file_path?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertPeriodExists(periodId: number): Promise<void> {
  const exists = await prisma.tbl_application_period.findUnique({
    where: { period_id: periodId },
    select: { period_id: true },
  });
  if (!exists) throw new Error('PERIOD_NOT_FOUND');
}

// ---------------------------------------------------------------------------
// Model functions
// ---------------------------------------------------------------------------

/**
 * List all requirements assigned to a period.
 */
export async function getAssignedRequirements(
  periodId: number
): Promise<AssignedRequirementsListResponse> {
  await assertPeriodExists(periodId);

  const links = await prisma.tbl_application_period_requirement.findMany({
    where: { period_id: periodId },
    include: {
      tbl_application_requirement: {
        select: {
          requirement_id: true,
          requirement_name: true,
          is_applicable_to: true,
          file_path: true,
        },
      },
    },
  });

  const requirements: AssignedRequirementItem[] = links.map((link) => ({
    requirement_id: link.tbl_application_requirement.requirement_id,
    requirement_name: link.tbl_application_requirement.requirement_name,
    is_applicable_to: link.tbl_application_requirement.is_applicable_to ?? 'new',
    file_path: link.tbl_application_requirement.file_path,
  }));

  return { requirements, total: requirements.length };
}

/**
 * Assign an existing requirement from the pool to a period.
 * Throws ALREADY_ASSIGNED if the link already exists.
 * Throws REQUIREMENT_NOT_FOUND if the requirement doesn't exist or is archived.
 */
export async function assignExistingRequirement(
  periodId: number,
  requirementId: number
): Promise<AssignedRequirementItem> {
  await assertPeriodExists(periodId);

  // Verify requirement exists and is not archived
  const req = await prisma.tbl_application_requirement.findUnique({
    where: { requirement_id: requirementId },
    select: {
      requirement_id: true,
      requirement_name: true,
      is_applicable_to: true,
      file_path: true,
      is_archived: true,
    },
  });
  if (!req || req.is_archived) throw new Error('REQUIREMENT_NOT_FOUND');

  // Check if already assigned
  const existing = await prisma.tbl_application_period_requirement.findUnique({
    where: { period_id_requirement_id: { period_id: periodId, requirement_id: requirementId } },
  });
  if (existing) throw new Error('ALREADY_ASSIGNED');

  await prisma.tbl_application_period_requirement.create({
    data: { period_id: periodId, requirement_id: requirementId },
  });

  return {
    requirement_id: req.requirement_id,
    requirement_name: req.requirement_name,
    is_applicable_to: req.is_applicable_to ?? 'new',
    file_path: req.file_path,
  };
}

/**
 * Create a new requirement in the global pool AND assign it to a period in one step.
 * Throws DUPLICATE_NAME if a non-archived requirement with this name already exists.
 */
export async function createAndAssignRequirement(
  email: string,
  periodId: number,
  input: AssignNewInput
): Promise<AssignedRequirementItem> {
  const user = await resolveUser(email);
  await assertPeriodExists(periodId);

  const trimmed = input.requirement_name.trim();

  // Duplicate name check
  const dup = await prisma.tbl_application_requirement.findFirst({
    where: { requirement_name: trimmed, is_archived: false },
    select: { requirement_id: true },
  });
  if (dup) throw new Error('DUPLICATE_NAME');

  // Transaction: insert requirement + insert link
  const result = await prisma.$transaction(async (tx) => {
    const req = await tx.tbl_application_requirement.create({
      data: {
        requirement_name: trimmed,
        is_applicable_to: input.is_applicable_to,
        file_path: input.file_path ?? null,
        is_archived: false,
        created_by: user.user_id,
      },
      select: {
        requirement_id: true,
        requirement_name: true,
        is_applicable_to: true,
        file_path: true,
      },
    });

    await tx.tbl_application_period_requirement.create({
      data: { period_id: periodId, requirement_id: req.requirement_id },
    });

    return req;
  });

  return {
    requirement_id: result.requirement_id,
    requirement_name: result.requirement_name,
    is_applicable_to: result.is_applicable_to ?? 'new',
    file_path: result.file_path,
  };
}

/**
 * Unassign a requirement from a period.
 * Only removes the junction row — does NOT delete the requirement from the pool.
 * Throws ASSIGNMENT_NOT_FOUND if the link doesn't exist.
 */
export async function unassignRequirement(
  periodId: number,
  requirementId: number
): Promise<{ unassigned: true }> {
  await assertPeriodExists(periodId);

  const existing = await prisma.tbl_application_period_requirement.findUnique({
    where: { period_id_requirement_id: { period_id: periodId, requirement_id: requirementId } },
  });
  if (!existing) throw new Error('ASSIGNMENT_NOT_FOUND');

  await prisma.tbl_application_period_requirement.delete({
    where: { period_id_requirement_id: { period_id: periodId, requirement_id: requirementId } },
  });

  return { unassigned: true };
}
