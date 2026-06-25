// @ts-nocheck
const { prisma } = require('../../config/db');

async function getOrganizations(user_id) {
    const organizations = await prisma.tbl_organization.findMany({
        where: { status: 'Approved' },
        include: {
            tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: {
                include: {
                    tbl_organization_members: {
                        where: { status: { in: ['Active', 'Pending'] } },
                        include: {
                            tbl_user: { select: { f_name: true, l_name: true, profile_picture: true } },
                            tbl_executive_role: { select: { role_title: true } }
                        }
                    }
                }
            },
            tbl_event: {
                where: { start_date: { gte: new Date() }, status: 'Approved' },
                orderBy: { start_date: 'asc' },
                take: 5
            }
        }
    });

    const result = organizations.map(org => {
        const version = org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
        if (!version) return null;

        const allMembers = version.tbl_organization_members || [];
        const userMembers = allMembers.filter(m => m.user_id === user_id);
        const userMember = userMembers.find(m => m.status === 'Active') || userMembers[0];
        const membershipStatus = userMember ? userMember.status : 'Not Member';
        const activeMembers = allMembers.filter(m => m.status === 'Active');

        const officers = activeMembers
            .filter(m => m.executive_role_id != null && m.tbl_executive_role)
            .map(m => ({
                f_name: m.tbl_user?.f_name || '',
                l_name: m.tbl_user?.l_name || '',
                role_name: m.tbl_executive_role?.role_title || '',
                profile_picture: m.tbl_user?.profile_picture || ''
            }));

        const member_names = activeMembers
            .filter(m => m.executive_role_id == null)
            .map(m => ({
                first_name: m.tbl_user?.f_name || '',
                last_name: m.tbl_user?.l_name || ''
            })).slice(0, 3);

        const upcoming_events = (org.tbl_event || []).map(e => ({
            event_id: e.event_id,
            venue: e.venue || '',
            start_time: e.start_date.toISOString().split('T')[1].substring(0, 8),
            end_time: e.end_date.toISOString().split('T')[1].substring(0, 8),
            event_start_date: e.start_date.toISOString().split('T')[0],
            event_title: e.title,
            total_attendees: 0 
        }));

        return {
            organization_id: org.organization_id,
            organization_name: org.name,
            logo: version.logo_path,
            organization_version_id: version.org_version_id,
            total_members: activeMembers.length,
            organization_type: version.category,
            organization_description: version.description,
            membership_status: membershipStatus === 'Pending' ? 'Pending' : (membershipStatus === 'Active' ? 'Member' : 'Not Member'),
            is_recruiting: version.is_recruiting ? 1 : 0,
            membership_fee_amount: version.membership_fee_amount ? Number(version.membership_fee_amount) : 0,
            membership_fee_type: version.membership_fee_type,
            officers,
            upcoming_events,
            member_names
        };
    }).filter(Boolean);

    return result;
}

async function getUserOrganization() {
    return [];
}

async function getOrganizationQuestion(org_id) {
    const orgIdNum = Number(org_id);
    const questions = await prisma.tbl_membership_question.findMany({
        where: { organization_id: orgIdNum },
        orderBy: { question_id: 'asc' }
    });
    return questions.map(q => ({
        question_id: q.question_id,
        organization_id: q.organization_id,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options
    }));
}

async function getOrganizationFee(org_id) {
    const orgIdNum = Number(org_id);
    const org = await prisma.tbl_organization.findUnique({
        where: { organization_id: orgIdNum },
        include: { tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version: true }
    });
    if (!org) return null;
    const version = org.tbl_organization_version_tbl_organization_current_org_version_idTotbl_organization_version;
    return {
        membership_fee: version?.membership_fee_amount ? Number(version.membership_fee_amount) : 0,
        membership_fee_type: version?.membership_fee_type || 'Free'
    };
}

async function submitOrganizationApplication(org_id, organization_version_id, user_id, answers) {
    const cycle = await prisma.tbl_renewal_cycle.findFirst({
        where: { organization_id: Number(org_id) },
        orderBy: { cycle_number: 'desc' }
    });
    const cycleNum = cycle ? cycle.cycle_number : 1;

    const application = await prisma.tbl_membership_application.create({
        data: {
            organization_id: Number(org_id),
            cycle_number: cycleNum,
            user_id: user_id,
            status: 'Pending',
            tbl_membership_response: {
                create: answers.map(a => ({
                    question_id: Number(a.question_id),
                    response_value: String(a.answer)
                }))
            }
        }
    });
    
    await prisma.tbl_organization_members.create({
        data: {
            organization_id: Number(org_id),
            cycle_number: cycleNum,
            user_id: user_id,
            org_version_id: Number(organization_version_id),
            status: 'Pending',
            member_type: 'Member'
        }
    });

    return application;
}

async function createMembershipTransaction(userEmail, payerName, amount, paymentType, proofImage, organizationId, organizationVersionId) {
    const user = await prisma.tbl_user.findUnique({ where: { email: userEmail } });
    if (!user) throw new Error('User not found');

    const paymentTypeRec = await prisma.tbl_payment_type.findFirst({ where: { label: paymentType } });
    const paymentTypeId = paymentTypeRec ? paymentTypeRec.payment_type_id : 1; 

    const txTypeRec = await prisma.tbl_transaction_type.findFirst({ where: { code: 'MEMBERSHIP_FEE' } });
    const transactionTypeId = txTypeRec ? txTypeRec.transaction_type_id : 1;

    const transaction = await prisma.tbl_transaction.create({
        data: {
            user_id: user.user_id,
            payer_name: payerName,
            amount: Number(amount),
            payment_description: 'Membership Fee',
            transaction_type_id: transactionTypeId,
            payment_type_id: paymentTypeId,
            org_version_id: Number(organizationVersionId),
            status: 'Pending',
            transaction_date: new Date(),
            proof_image: proofImage
        }
    });

    const cycle = await prisma.tbl_renewal_cycle.findFirst({
        where: { organization_id: Number(organizationId) },
        orderBy: { cycle_number: 'desc' }
    });

    await prisma.tbl_transaction_membership.create({
        data: {
            transaction_id: transaction.transaction_id,
            organization_id: Number(organizationId),
            cycle_number: cycle ? cycle.cycle_number : 1
        }
    });

    return transaction;
}

async function getUserTransactions(user_id) {
    const txs = await prisma.tbl_transaction.findMany({
        where: { user_id: user_id },
        include: {
            tbl_organization_version: { select: { name: true } }
        },
        orderBy: { transaction_date: 'desc' }
    });
    return txs.map(tx => ({
        transaction_id: tx.transaction_id,
        amount: tx.amount,
        status: tx.status,
        date: tx.transaction_date,
        organization_name: tx.tbl_organization_version?.name || 'Unknown',
        description: tx.payment_description
    }));
}

async function leaveOrganization(organization_id, organization_version_id, user_id, leave_reason = null) {
    const cycle = await prisma.tbl_renewal_cycle.findFirst({
        where: { organization_id: Number(organization_id) },
        orderBy: { cycle_number: 'desc' }
    });
    return await prisma.tbl_membership_leave_application.create({
        data: {
            organization_id: Number(organization_id),
            cycle_number: cycle ? cycle.cycle_number : 1,
            user_id: user_id,
            leave_reason: leave_reason || 'Personal reasons',
            status: 'Pending'
        }
    });
}

async function checkLeaveStatus(organization_id, organization_version_id, user_id) {
    const leaveApp = await prisma.tbl_membership_leave_application.findFirst({
        where: {
            organization_id: Number(organization_id),
            user_id: user_id,
            status: 'Pending'
        }
    });
    return leaveApp ? [leaveApp] : [];
}

module.exports = {
    getOrganizations,
    getUserOrganization,
    getOrganizationQuestion,
    getOrganizationFee,
    checkLeaveStatus,
    submitOrganizationApplication,
    createMembershipTransaction,
    getUserTransactions,
    leaveOrganization
};
