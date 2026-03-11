/**
 * web/models/globalRequirementModel.ts
 *
 * Prisma-based queries for the Global Requirements Pool.
 *
 * Requirements are NOT bound to any specific period — they are a reusable
 * pool of requirement templates. Periods reference them via the junction
 * table tbl_application_period_requirement.
 *
 * Endpoints:
 *   GET    /api/web/organizations/requirements                        → list all (non-archived)
 *   POST   /api/web/organizations/requirements                        → create
 *   PATCH  /api/web/organizations/requirements/:requirementId         → edit
 *   DELETE /api/web/organizations/requirements/:requirementId         → archive or hard-delete
 *   GET    /api/web/organizations/requirements/:requirementId/template → download template
 */

import { prisma } from '../../config/db';
import { resolveUser } from './organizationsPageModel';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface GlobalRequirementItem {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: string;
  file_path: string | null;
  created_at: string; // ISO-8601
}

export interface GlobalRequirementsListResponse {
  requirements: GlobalRequirementItem[];
  total: number;
}

export interface CreateGlobalRequirementInput {
  requirement_name: string;
  is_applicable_to: 'new' | 'renew' | 'both';
  file_path?: string | null;
}

export interface UpdateGlobalRequirementInput {
  requirement_name?: string;
  is_applicable_to?: 'new' | 'renew' | 'both';
  file_path?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(r: {
  requirement_id: number;
  requirement_name: string;
  is_applicable_to: string | null;
  file_path: string | null;
  created_at: Date | null;
}): GlobalRequirementItem {
  return {
    requirement_id: r.requirement_id,
    requirement_name: r.requirement_name,
    is_applicable_to: r.is_applicable_to ?? 'new',
    file_path: r.file_path,
    created_at: (r.created_at ?? new Date()).toISOString(),
  };
}

const requirementSelect = {
  requirement_id: true,
  requirement_name: true,
  is_applicable_to: true,
  file_path: true,
  created_at: true,
} as const;

// ---------------------------------------------------------------------------
// Model functions
// ---------------------------------------------------------------------------

/**
 * List all non-archived requirements from the pool.
 */
export async function listGlobalRequirements(): Promise<GlobalRequirementsListResponse> {
  const rows = await prisma.tbl_application_requirement.findMany({
    where: { is_archived: false },
    orderBy: { requirement_name: 'asc' },
    select: requirementSelect,
  });

  const requirements = rows.map(mapRow);
  return { requirements, total: requirements.length };
}

/**
 * Create a new requirement in the global pool.
 * Throws DUPLICATE_NAME if a non-archived requirement with the same name exists.
 */
export async function createGlobalRequirement(
  email: string,
  input: CreateGlobalRequirementInput
): Promise<GlobalRequirementItem> {
  const user = await resolveUser(email);

  const trimmed = input.requirement_name.trim();

  // Duplicate check — only among non-archived
  const duplicate = await prisma.tbl_application_requirement.findFirst({
    where: { requirement_name: trimmed, is_archived: false },
    select: { requirement_id: true },
  });
  if (duplicate) throw new Error('DUPLICATE_NAME');

  const row = await prisma.tbl_application_requirement.create({
    data: {
      requirement_name: trimmed,
      is_applicable_to: input.is_applicable_to,
      file_path: input.file_path ?? null,
      is_archived: false,
      created_by: user.user_id,
    },
    select: requirementSelect,
  });

  return mapRow(row);
}

/**
 * Update an existing requirement.
 * Throws REQUIREMENT_NOT_FOUND if the requirement doesn't exist or is archived.
 * Throws DUPLICATE_NAME if renaming to an existing non-archived name.
 */
export async function updateGlobalRequirement(
  requirementId: number,
  input: UpdateGlobalRequirementInput
): Promise<GlobalRequirementItem> {
  const existing = await prisma.tbl_application_requirement.findUnique({
    where: { requirement_id: requirementId },
    select: { requirement_id: true, requirement_name: true, is_archived: true },
  });

  if (!existing || existing.is_archived) throw new Error('REQUIREMENT_NOT_FOUND');

  // Duplicate name check when renaming
  if (input.requirement_name) {
    const trimmed = input.requirement_name.trim();
    if (trimmed !== existing.requirement_name) {
      const dup = await prisma.tbl_application_requirement.findFirst({
        where: { requirement_name: trimmed, is_archived: false, NOT: { requirement_id: requirementId } },
        select: { requirement_id: true },
      });
      if (dup) throw new Error('DUPLICATE_NAME');
    }
  }

  const data: Record<string, any> = { updated_at: new Date() };
  if (input.requirement_name !== undefined) data.requirement_name = input.requirement_name.trim();
  if (input.is_applicable_to !== undefined) data.is_applicable_to = input.is_applicable_to;
  if (input.file_path !== undefined) data.file_path = input.file_path;

  const row = await prisma.tbl_application_requirement.update({
    where: { requirement_id: requirementId },
    data,
    select: requirementSelect,
  });

  return mapRow(row);
}

/**
 * Delete or archive a requirement.
 *
 * If the requirement has FK connections (junction table or submitted docs)
 * → soft-archive (set is_archived = true).
 * Else → hard-delete.
 *
 * Returns { archived: true } or { deleted: true } + the old file_path for cleanup.
 */
export async function deleteOrArchiveRequirement(
  requirementId: number
): Promise<{ archived: boolean; deleted: boolean; file_path: string | null }> {
  const existing = await prisma.tbl_application_requirement.findUnique({
    where: { requirement_id: requirementId },
    select: { requirement_id: true, file_path: true, is_archived: true },
  });

  if (!existing || existing.is_archived) throw new Error('REQUIREMENT_NOT_FOUND');

  // Check for FK connections
  const [junctionCount, submissionCount] = await Promise.all([
    prisma.tbl_application_period_requirement.count({
      where: { requirement_id: requirementId },
    }),
    prisma.tbl_organization_requirement_submission.count({
      where: { requirement_id: requirementId },
    }),
  ]);

  const hasConnections = junctionCount > 0 || submissionCount > 0;

  if (hasConnections) {
    // Soft-archive
    await prisma.tbl_application_requirement.update({
      where: { requirement_id: requirementId },
      data: { is_archived: true, updated_at: new Date() },
    });
    return { archived: true, deleted: false, file_path: null }; // don't delete file on archive
  } else {
    // Hard-delete
    await prisma.tbl_application_requirement.delete({
      where: { requirement_id: requirementId },
    });
    return { archived: false, deleted: true, file_path: existing.file_path };
  }
}

/**
 * Returns the file_path for a requirement's template (for downloads).
 */
export async function getRequirementTemplateInfo(
  requirementId: number
): Promise<{ file_path: string } | null> {
  const row = await prisma.tbl_application_requirement.findUnique({
    where: { requirement_id: requirementId },
    select: { file_path: true, is_archived: true },
  });

  if (!row || row.is_archived) return null;
  if (!row.file_path) return null;
  return { file_path: row.file_path };
}
