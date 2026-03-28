const { prisma } = require('../../config/db');
const jwt = require('jsonwebtoken');
const { getAllUserPermissions } = require('../../web/models/permissionModel.ts');
require('dotenv').config();

function mapUserForMobile(user) {
    if (!user) return null;

    return {
        user_id: user.user_id,
        email: user.email,
        f_name: user.f_name || 'User',
        l_name: user.l_name || 'Student',
        status: user.status,
        role_id: user.role_id,
        role_name: user.tbl_role?.role_name || null,
        program_id: user.program_id ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
    };
}

async function getUserRecordByEmail(email) {
    return prisma.tbl_user.findUnique({
        where: { email },
        include: {
            tbl_role: {
                select: {
                    role_id: true,
                    role_name: true,
                },
            },
        },
    });
}

async function buildLegacyPermissionPayload(email) {
    const bundle = await getAllUserPermissions(email);

    const orgIds = Object.keys(bundle.organizations || {})
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

    const uniqueOrgIds = [...new Set(orgIds)];

    let orgRows = [];
    if (uniqueOrgIds.length) {
        try {
            orgRows = await prisma.tbl_organization.findMany({
                where: { organization_id: { in: uniqueOrgIds } },
                select: {
                    organization_id: true,
                    name: true,
                },
            });
        } catch (error) {
            // Do not block mobile home/events if org name lookup fails.
            console.error('[mobile.userModel] Failed organization lookup:', error?.message || error);
            orgRows = [];
        }
    }

    const orgNameMap = new Map(orgRows.map((org) => [org.organization_id, org.name]));

    const organizations = Object.values(bundle.organizations || {}).map((orgEntry) => ({
        organization_id: orgEntry.organizationId,
        organization_name: orgNameMap.get(orgEntry.organizationId) || '',
        permissions: orgEntry.resolved || [],
    }));

    return {
        user_info: {
            user_id: bundle.userId,
            email: bundle.email,
            f_name: bundle.f_name || 'User',
            l_name: bundle.l_name || 'Student',
            role_id: bundle.role?.id ?? null,
            role_name: bundle.role?.name || null,
            program_id: bundle.program_id ?? null,
            permissions: bundle.allResolved || [],
            organizations,
        },
    };
}

async function getUser(mail) {
    const user = await getUserRecordByEmail(mail);
    return mapUserForMobile(user);
}

async function getPermissions(mail) {
    return buildLegacyPermissionPayload(mail);
}

async function generateToken(email) {
    const permissionsPayload = await buildLegacyPermissionPayload(email);
    if (!permissionsPayload?.user_info?.user_id) {
        throw new Error('User not found');
    }

    const result = [permissionsPayload];
    const token = jwt.sign({ result }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return token;
}


async function getUserByEmail(email) {
    try {
        const user = await getUserRecordByEmail(email);
        return mapUserForMobile(user);
    } catch (error) {
        console.error('Error getting user by email:', error);
        throw error;
    }
}

async function createPendingMobileUser(email, program_id) {
    try {
        let studentRole = await prisma.tbl_role.findFirst({
            where: {
                role_name: {
                    equals: 'Student',
                    mode: 'insensitive',
                },
            },
            select: { role_id: true },
        });

        if (!studentRole) {
            studentRole = await prisma.tbl_role.findFirst({
                orderBy: { role_id: 'asc' },
                select: { role_id: true },
            });
        }

        if (!studentRole?.role_id) {
            throw new Error('Unable to resolve a default role for mobile registration');
        }

        const createdUser = await prisma.tbl_user.create({
            data: {
                email,
                program_id: Number(program_id),
                role_id: studentRole.role_id,
                status: 'Pending',
            },
            include: {
                tbl_role: {
                    select: {
                        role_id: true,
                        role_name: true,
                    },
                },
            },
        });

        return mapUserForMobile(createdUser);
    } catch (error) {
        console.error('Error creating pending mobile user:', error);
        throw error;
    }
}

async function updateUserStatus(user_id, status) {
    try {
        const result = await prisma.tbl_user.updateMany({
            where: { user_id },
            data: { status },
        });

        return result.count > 0;
    } catch (error) {
        console.error('Error updating user status:', error);
        throw error;
    }
}

// 🆕 NEW FUNCTION FOR MOBILE: Handle login with name updates and status change
async function handleMobileLogin(email, firstName, lastName) {
    try {
        return activateExistingUser(email, firstName, lastName);
    } catch (error) {
        console.error('Error handling mobile login:', error);
        throw error;
    }
}

// 🆕 NEW FUNCTION FOR MOBILE: Activate EXISTING users only (no account creation)
async function activateExistingUser(email, firstName, lastName) {
    try {
        const existing = await prisma.tbl_user.findUnique({
            where: { email },
            select: {
                user_id: true,
                status: true,
            },
        });

        if (!existing) {
            console.log('📱 activateExistingUser: User not found:', email);
            return null; // User doesn't exist
        }

        // Only activate if user is pending
        if (existing.status === 'Pending') {
            console.log('📱 activateExistingUser: Activating pending user:', email);

            // Update user status and names
            const updateResult = await prisma.tbl_user.updateMany({
                where: { email },
                data: {
                    f_name: firstName || 'User',
                    l_name: lastName || 'Student',
                    status: 'Active',
                },
            });

            if (updateResult.count > 0) {
                console.log('📱 activateExistingUser: User activated successfully:', email);

                return buildLegacyPermissionPayload(email);
            } else {
                console.log('📱 activateExistingUser: Update failed for:', email);
                return null;
            }
        } else {
            console.log('📱 activateExistingUser: User not pending, current status:', existing.status);

            // For active users, just update names if different and get permissions
            if (firstName && lastName) {
                await prisma.tbl_user.updateMany({
                    where: {
                        email,
                        OR: [
                            { f_name: { not: firstName } },
                            { l_name: { not: lastName } },
                        ],
                    },
                    data: {
                        f_name: firstName,
                        l_name: lastName,
                    },
                });
            }

            return buildLegacyPermissionPayload(email);
        }
    } catch (error) {
        console.error('📱 Error activating existing user:', error);
        throw error;
    }
}

module.exports = { 
    getUser, 
    generateToken, 
    getPermissions, 
    getUserByEmail, 
    createPendingMobileUser, 
    updateUserStatus,
    handleMobileLogin, // 🆕 OLD EXPORT (still available for compatibility)
    activateExistingUser // 🆕 NEW EXPORT (preferred for existing-user-only logic)
};

