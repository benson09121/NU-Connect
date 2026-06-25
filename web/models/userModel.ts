import {prisma} from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserLoginInput {
  email?: string;
  f_name?: string;
  l_name?: string;
  user_id?: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Check whether a user record exists by email.
 */
export async function checkUserExists(email: string) {
  try {
    return await prisma.tbl_user.findFirst({
      where: { email },
      select: {
        user_id: true,
        email: true,
        f_name: true,
        l_name: true,
        status: true,
        tbl_role: { select: { role_id: true, role_name: true } },
      },
    });
  } catch (error) {
    console.error('Error checking user existence:', error);
    throw error;
  }
}

/**
 * Fetch a user record by email.
 */
export async function getUserByEmail(email: string) {
  try {
    return await prisma.tbl_user.findFirst({
      where: { email },
      select: {
        user_id: true,
        email: true,
        f_name: true,
        l_name: true,
        status: true,
        role_id: true,
        tbl_role: { select: { role_id: true, role_name: true } },
      },
    });
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
}

/**
 * Called on every login — returns the user record.
 * Users are added manually to the DB; this does NOT create accounts.
 */
export async function handleLogin(user: UserLoginInput) {
  try {
    let existing = await prisma.tbl_user.findFirst({
      where: { email: user.email },
      select: {
        user_id: true,
        email: true,
        f_name: true,
        l_name: true,
        status: true,
        role_id: true,
        tbl_role: { select: { role_id: true, role_name: true } },
      },
    });

    if (!existing) {
      // Check if there is an approved application without an archive_at
      const app = await prisma.tbl_user_application.findFirst({
        where: { email: user.email, status: 'Approved', archived_at: null },
      });

      if (app) {
        // Create user in tbl_user as Active since they are logging in right now
        await prisma.tbl_user.create({
          data: {
            email: user.email!,
            f_name: user.f_name || null,
            l_name: user.l_name || null,
            role_id: app.role_id,
            program_id: app.program_id,
            status: 'Active',
          }
        });

        // Archive the application
        await prisma.tbl_user_application.update({
          where: { application_id: app.application_id },
          data: { archived_at: new Date() },
        });

        // Refetch the created user
        existing = await prisma.tbl_user.findFirst({
          where: { email: user.email },
          select: {
            user_id: true,
            email: true,
            f_name: true,
            l_name: true,
            status: true,
            role_id: true,
            tbl_role: { select: { role_id: true, role_name: true } },
          },
        });
      } else {
        console.warn(`[userModel] handleLogin: no DB record for ${user.email}`);
      }
    } else {
      // Make sure if they are pending, we update them to active
      if (existing.status === 'Pending') {
        await prisma.tbl_user.update({
          where: { email: user.email },
          data: { status: 'Active' }
        });
        existing.status = 'Active';
      }
    }

    // Fetch permissions for the role
    const permissionsRecords = await prisma.tbl_role_permission.findMany({
      where: { role_id: existing.role_id },
      include: { tbl_permission: true },
    });
    const permissions = permissionsRecords.map(rp => rp.tbl_permission.permission_name);

    return [{
      user_info: {
        ...existing,
        permissions
      }
    }];
  } catch (error) {
    console.error('Error handling login:', error);
    throw error;
  }
}

/**
 * Placeholder — redemption URL is handled by Azure AD and not stored in the DB.
 */
export async function updateRedemptionUrl(email: string, _redemptionUrl: string) {
  console.log(`📝 Note: Redemption URL generated for ${email} (not stored in database)`);
  return { success: true, message: 'Redemption URL handling completed' };
}