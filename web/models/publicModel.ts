/**
 * web/models/publicModel.ts
 *
 * Prisma-based queries for unauthenticated public routes.
 * No Azure JWT is required — these are called from the registration page.
 */

import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Programs grouped by college
// ---------------------------------------------------------------------------

/**
 * Returns all active programs grouped by their college.
 * Shape: [{ ProgramsList: [{ college_name, program: [{ program_id, program_name }] }] }]
 */
export async function getPrograms() {
  const colleges = await prisma.tbl_college.findMany({
    where: { status: 'Active' },
    select: {
      name: true,
      tbl_program: {
        where: { status: 'Active' },
        select: { program_id: true, name: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return [
    {
      ProgramsList: colleges.map((c) => ({
        college_name: c.name,
        program: c.tbl_program.map((p) => ({
          program_id: p.program_id,
          program_name: p.name,
        })),
      })),
    },
  ];
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** Returns all roles (role_name only) for the registration dropdown. */
export async function getRoles() {
  return prisma.tbl_role.findMany({
    select: { role_name: true },
    orderBy: { role_name: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Active user accounts (email-only list for duplicate checking)
// ---------------------------------------------------------------------------

/** Returns emails of all non-archived users. */
export async function getAccounts() {
  return prisma.tbl_user.findMany({
    where: { status: { not: 'Archive' } },
    select: { email: true },
    orderBy: { email: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// User applications (pending/approved/rejected — for duplicate checking)
// ---------------------------------------------------------------------------

/**
 * Returns all non-archived user applications with email + lowercase status.
 * Frontend allows re-apply only when status === 'rejected'.
 */
export async function getPendingApplications() {
  const apps = await prisma.tbl_user_application.findMany({
    where: { archived_at: null },
    select: { email: true, status: true },
    orderBy: { created_at: 'desc' },
  });

  return apps.map((a) => ({
    email: a.email,
    status: (a.status ?? 'Pending').toLowerCase(),
  }));
}

// ---------------------------------------------------------------------------
// Submit user application
// ---------------------------------------------------------------------------

/**
 * Inserts a new row into tbl_user_application.
 * Throws with code 'DUPLICATE' if a non-rejected application already exists.
 */
export async function addUserApplication(
  email: string,
  roleName: string,
  programId: number | null,
  reason: string,
  college: string | null,
) {
  // Resolve role_id from the role name submitted by the frontend
  const role = await prisma.tbl_role.findFirst({
    where: { role_name: roleName },
    select: { role_id: true },
  });

  if (!role) {
    throw new Error(`Role '${roleName}' not found.`);
  }

  // Block duplicate: existing Pending or Approved application for this email
  const existing = await prisma.tbl_user_application.findFirst({
    where: {
      email,
      status: { not: 'Rejected' },
      archived_at: null,
    },
    select: { application_id: true },
  });

  if (existing) {
    const err = new Error('You already have a pending or approved application for this email.');
    (err as any).code = 'DUPLICATE';
    throw err;
  }

  await prisma.tbl_user_application.create({
    data: {
      email,
      role_id: role.role_id,
      program_id: programId,
      college: college ?? null,
      reason,
      status: 'Pending',
    },
  });
}
