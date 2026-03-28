import { prisma } from '../../config/db';

export interface UserActivationStatus {
  user_id: string;
  email: string;
  f_name: string | null;
  l_name: string | null;
  status: string;
  created_at: Date | null;
  updated_at: Date | null;
  role_name: string | null;
  program_name: string | null;
  status_description: string;
}

function statusDescription(status: string | null | undefined): string {
  switch (status) {
    case 'Active':
      return 'User is fully activated';
    case 'Pending':
      return 'User has not logged in yet';
    case 'Archive':
    case 'Archived':
      return 'User account is archived';
    default:
      return 'Unknown status';
  }
}

function displayName(firstName: string | null, lastName: string | null, email: string): string {
  const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return full || email;
}

/**
 * Get user activation status and details.
 */
export async function getUserActivationStatus(email: string): Promise<UserActivationStatus | null> {
  const user = await prisma.tbl_user.findUnique({
    where: { email },
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: { select: { name: true } },
    },
  });

  if (!user) return null;

  return {
    user_id: user.user_id,
    email: user.email,
    f_name: user.f_name,
    l_name: user.l_name,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
    role_name: user.tbl_role?.role_name ?? null,
    program_name: user.tbl_program_tbl_user_program_idTotbl_program?.name ?? null,
    status_description: statusDescription(user.status),
  };
}

/**
 * Log user activation event.
 */
export async function logUserActivation(
  userId: string,
  email: string,
  activationMethod = 'first_login',
): Promise<boolean> {
  const user = await prisma.tbl_user.findUnique({
    where: { user_id: userId },
    select: { f_name: true, l_name: true },
  });

  await prisma.tbl_logs.create({
    data: {
      user_id: userId,
      user_email: email,
      full_name: displayName(user?.f_name ?? null, user?.l_name ?? null, email),
      action: `User activated via ${activationMethod}`,
      action_type: 'USER_ACTIVATED',
      entity_type: 'user',
      redirect_url: null,
      meta_data: {
        email,
        activation_method: activationMethod,
        activated_at: new Date().toISOString(),
        ip_address: 'system',
        user_agent: 'system',
      },
    },
  });

  console.log(`✅ User activation logged for ${email} (${userId})`);
  return true;
}

/**
 * Get pending users (for admin dashboard).
 */
export async function getPendingUsers() {
  const rows = await prisma.tbl_user.findMany({
    where: { status: 'Pending' },
    include: {
      tbl_role: { select: { role_name: true } },
      tbl_program_tbl_user_program_idTotbl_program: { select: { name: true } },
    },
    orderBy: { created_at: 'asc' },
  });

  const now = Date.now();
  return rows.map((u) => {
    const createdAtMs = u.created_at ? new Date(u.created_at).getTime() : now;
    const daysPending = Math.max(0, Math.floor((now - createdAtMs) / (1000 * 60 * 60 * 24)));

    return {
      user_id: u.user_id,
      email: u.email,
      f_name: u.f_name,
      l_name: u.l_name,
      role_name: u.tbl_role?.role_name ?? null,
      program_name: u.tbl_program_tbl_user_program_idTotbl_program?.name ?? null,
      created_at: u.created_at,
      days_pending: daysPending,
    };
  });
}

/**
 * Manually activate a user (admin function).
 */
export async function manuallyActivateUser(email: string, activatedBy: string): Promise<boolean> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.tbl_user.updateMany({
      where: { email, status: 'Pending' },
      data: { status: 'Active', updated_at: new Date() },
    });

    if (result.count === 0) {
      throw new Error('User not found or already activated');
    }

    const user = await tx.tbl_user.findUnique({
      where: { email },
      select: { user_id: true, email: true, f_name: true, l_name: true },
    });

    if (user) {
      await tx.tbl_logs.create({
        data: {
          user_id: user.user_id,
          user_email: user.email,
          full_name: displayName(user.f_name, user.l_name, user.email),
          action: `User manually activated by ${activatedBy}`,
          action_type: 'USER_MANUALLY_ACTIVATED',
          entity_type: 'user',
          redirect_url: null,
          meta_data: {
            email,
            activated_by: activatedBy,
            activation_method: 'manual_admin',
            activated_at: new Date().toISOString(),
          },
        },
      });
    }
  });

  console.log(`✅ User ${email} manually activated by ${activatedBy}`);
  return true;
}
