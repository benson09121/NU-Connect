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
    const existing = await prisma.tbl_user.findFirst({
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
      console.warn(`[userModel] handleLogin: no DB record for ${user.email}`);
    }

    return existing;
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