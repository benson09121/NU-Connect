import { prisma } from '../../config/db';
import type { status_active_pending_archive } from '../../lib/generated/prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountItem {
  user_id: string;
  email: string;
  f_name: string | null;
  l_name: string | null;
  role: string | null;
  program: string | null;
  program_id: number | null;
  section_id: number | null;
  sdao_rank: number | null;
  status: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  archived_by: string | null; // archiver's email
  college_name: string | null;
  college_id: number | null;
  college_abbreviation: string | null;
  organization_name: string | null;
  created_at: string | null;
  last_updated: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveRoleByName(roleName: string) {
  const role = await prisma.tbl_role.findFirst({ where: { role_name: roleName } });
  if (!role) throw Object.assign(new Error(`Role '${roleName}' not found`), { code: 'ROLE_NOT_FOUND' });
  return role;
}

// ---------------------------------------------------------------------------
// Accounts CRUD
// ---------------------------------------------------------------------------

export async function getAccounts(): Promise<AccountItem[]> {
  const users = await prisma.tbl_user.findMany({
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: {
        select: { name: true, abbreviation: true, tbl_college: { select: { name: true } } },
      },
      tbl_sdao_approver: { select: { sdao_rank: true } },
      tbl_user: { select: { email: true } }, // archived_by → archiver user
      tbl_college_dean: {
        where: { is_active: true },
        select: { tbl_college: { select: { college_id: true, name: true, abbreviation: true } } },
        take: 1,
      },
    },
    orderBy: [{ l_name: 'asc' }, { f_name: 'asc' }],
  });

  return users.map((u) => ({
    user_id: u.user_id,
    email: u.email,
    f_name: u.f_name,
    l_name: u.l_name,
    role: u.tbl_role?.role_name ?? null,
    program:
      u.tbl_program_tbl_user_program_idTotbl_program?.abbreviation ??
      u.tbl_program_tbl_user_program_idTotbl_program?.name ??
      null,
    program_id: u.program_id,
    section_id: u.section_id,
    sdao_rank: u.tbl_sdao_approver?.sdao_rank ?? null,
    status: u.status,
    archived_at: u.archived_at?.toISOString() ?? null,
    archived_reason: u.archived_reason ?? null,
    archived_by: (u.tbl_user as { email: string } | null)?.email ?? null,
    // Dean college_name/id/abbreviation comes from tbl_college_dean; others from program's college
    college_name:
      u.tbl_college_dean[0]?.tbl_college?.name ??
      u.tbl_program_tbl_user_program_idTotbl_program?.tbl_college?.name ??
      null,
    college_id: u.tbl_college_dean[0]?.tbl_college?.college_id ?? null,
    college_abbreviation: u.tbl_college_dean[0]?.tbl_college?.abbreviation ?? null,
    organization_name: null,
    created_at: u.created_at?.toISOString() ?? null,
    last_updated: u.updated_at?.toISOString() ?? null,
  }));
}

export async function addAccount(
  email: string,
  roleName: string,
  programId: number | null,
  sdaoRank: number | null,
  sectionId: number | null,
  collegeId: number | null = null,
): Promise<{ user_id: string; email: string }> {
  const existing = await prisma.tbl_user.findUnique({ where: { email } });
  if (existing) throw Object.assign(new Error('A user with this email already exists.'), { code: 'DUPLICATE_EMAIL' });

  const role = await resolveRoleByName(roleName);

  const user = await prisma.tbl_user.create({
    data: {
      email,
      role_id: role.role_id,
      program_id: programId ?? null,
      section_id: sectionId ?? null,
      status: 'Active',
    },
  });

  if (sdaoRank != null) {
    await prisma.tbl_sdao_approver.create({
      data: { user_id: user.user_id, sdao_rank: sdaoRank },
    });
  }

  // Associate Dean with their college
  if (roleName === 'Dean' && collegeId != null) {
    await prisma.tbl_college_dean.create({
      data: { college_id: collegeId, dean_user_id: user.user_id, is_active: true },
    });
  }

  return { user_id: user.user_id, email: user.email };
}

export async function updateAccount(
  userId: string,
  roleName: string,
  programId: number | null,
  statusVal: string,
  sdaoRank: number | null,
  sectionId: number | null,
  collegeId: number | null = null,
): Promise<void> {
  const role = await resolveRoleByName(roleName);

  await prisma.tbl_user.update({
    where: { user_id: userId },
    data: {
      role_id: role.role_id,
      program_id: programId ?? null,
      section_id: sectionId ?? null,
      status: (statusVal as status_active_pending_archive) ?? 'Active',
    },
  });

  if (sdaoRank != null) {
    await prisma.tbl_sdao_approver.upsert({
      where: { user_id: userId },
      create: { user_id: userId, sdao_rank: sdaoRank },
      update: { sdao_rank: sdaoRank },
    });
  } else {
    await prisma.tbl_sdao_approver.deleteMany({ where: { user_id: userId } });
  }

  // Manage Dean-college association
  // Deactivate all existing dean entries for this user first
  await prisma.tbl_college_dean.updateMany({
    where: { dean_user_id: userId },
    data: { is_active: false },
  });
  if (roleName === 'Dean' && collegeId != null) {
    // Reactivate existing record or create a new one
    const existing = await prisma.tbl_college_dean.findFirst({
      where: { dean_user_id: userId, college_id: collegeId },
    });
    if (existing) {
      await prisma.tbl_college_dean.update({
        where: { id: existing.id },
        data: { is_active: true, updated_at: new Date() },
      });
    } else {
      await prisma.tbl_college_dean.create({
        data: { college_id: collegeId, dean_user_id: userId, is_active: true },
      });
    }
  }
}

export async function archiveAccount(
  email: string,
  archivedByUserId: string,
  reason?: string,
): Promise<void> {
  const user = await prisma.tbl_user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('User not found.'), { code: 'NOT_FOUND' });

  await prisma.tbl_user.update({
    where: { email },
    data: {
      status: 'Archive',
      archived_at: new Date(),
      archived_by: archivedByUserId,
      archived_reason: reason ?? null,
    },
  });
}

export async function unarchiveAccount(userId: string): Promise<void> {
  await prisma.tbl_user.update({
    where: { user_id: userId },
    data: {
      status: 'Active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function getRoles() {
  return prisma.tbl_role.findMany({
    select: { role_id: true, role_name: true },
    orderBy: { role_name: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Programs (grouped by college)
// ---------------------------------------------------------------------------

export async function getPrograms() {
  const colleges = await prisma.tbl_college.findMany({
    where: { status: 'Active' },
    orderBy: { name: 'asc' },
    include: {
      tbl_program: {
        where: { status: 'Active' },
        select: { program_id: true, name: true, abbreviation: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  return colleges.map((c) => ({
    college_name: c.name,
    program: c.tbl_program.map((p) => ({
      program_id: p.program_id,
      program_name: p.name,
    })),
  }));
}

// ---------------------------------------------------------------------------
// SDAO Ranks
// ---------------------------------------------------------------------------

const ALL_SDAO_RANKS = [1, 2, 3];

export async function getAvailableSdaoRanks(excludeUserId?: string) {
  const taken = await prisma.tbl_sdao_approver.findMany({
    ...(excludeUserId ? { where: { user_id: { not: excludeUserId } } } : {}),
    select: { sdao_rank: true },
  });

  const takenRanks = taken.map((t) => t.sdao_rank);
  const availableRanks = ALL_SDAO_RANKS.filter((r) => !takenRanks.includes(r));

  return { availableRanks, takenRanks };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function getSections(programId?: number) {
  const rows = await prisma.tbl_section.findMany({
    where: {
      ...(programId != null ? { program_id: programId } : {}),
    },
    include: {
      tbl_program: { select: { name: true, abbreviation: true } },
    },
    orderBy: { section_name: 'asc' },
  });

  return rows.map((s) => ({
    section_id: s.section_id,
    section_name: s.section_name,
    program_id: s.program_id,
    program_name: s.tbl_program?.name ?? null,
    is_active: s.is_active,
    status: s.is_active === false ? 'Archive' : 'Active',
    created_at: s.created_at?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Pending User Applications
// ---------------------------------------------------------------------------

export async function getPendingApplications() {
  const apps = await prisma.tbl_user_application.findMany({
    where: { status: 'Pending' },
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_program: { select: { name: true, abbreviation: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return {
    users: apps.map((a) => ({
      user_id: a.application_id,
      application_id: a.application_id,
      email: a.email,
      f_name: null as string | null,
      l_name: null as string | null,
      role: a.tbl_role?.role_name ?? null,
      program: a.tbl_program?.abbreviation ?? a.tbl_program?.name ?? null,
      college: a.college ?? null,
      status: a.status,
      reason: a.reason,
      created_at: a.created_at?.toISOString() ?? null,
    })),
    applications: [] as unknown[],
  };
}

export async function approveUserApplication(applicationId: number) {
  const app = await prisma.tbl_user_application.findUnique({
    where: { application_id: applicationId },
  });
  if (!app) throw Object.assign(new Error('Application not found.'), { code: 'NOT_FOUND' });
  if (app.status !== 'Pending') throw Object.assign(new Error('Application is not Pending.'), { code: 'INVALID_STATUS' });

  await prisma.tbl_user_application.update({
    where: { application_id: applicationId },
    data: { status: 'Approved' },
  });

  return { email: app.email, role_id: app.role_id, program_id: app.program_id };
}

export async function rejectUserApplication(
  applicationId: number,
  rejectedByUserId: string,
  reason: string,
) {
  const app = await prisma.tbl_user_application.findUnique({
    where: { application_id: applicationId },
  });
  if (!app) throw Object.assign(new Error('Application not found.'), { code: 'NOT_FOUND' });

  await prisma.tbl_user_application.update({
    where: { application_id: applicationId },
    data: {
      status: 'Rejected',
      rejected_by: rejectedByUserId,
      rejected_at: new Date(),
      rejected_reason: reason,
    },
  });

  return { email: app.email };
}
