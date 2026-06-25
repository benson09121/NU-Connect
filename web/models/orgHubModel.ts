/**
 * web/models/orgHubModel.ts
 *
 * Prisma-based queries for the Organization Hub page (GET /organizations/:orgId/hub)
 * and all supporting mutations (officers, committees, members, applications, leave, payments).
 */

import { prisma } from '../../config/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the cycle_number for a given org + version pair.
 * Throws 'CYCLE_NOT_FOUND' when no matching row exists.
 */
export async function getCycleNumber(
  orgId: number,
  orgVersionId: number
): Promise<number> {
  const cycle = await prisma.tbl_renewal_cycle.findFirst({
    where: { organization_id: orgId, org_version_id: orgVersionId },
    select: { cycle_number: true },
    orderBy: { cycle_number: 'desc' },
  });
  if (!cycle) throw new Error('CYCLE_NOT_FOUND');
  return cycle.cycle_number;
}

/** Find a user record by email. Returns null when not found. */
export async function getUserByEmail(email: string) {
  return prisma.tbl_user.findUnique({
    where: { email },
    select: {
      user_id: true,
      f_name: true,
      l_name: true,
      email: true,
      program_id: true,
    },
  });
}

/** Resolve tbl_executive_rank.rank_id from a rank_level value. */
export async function getRankByLevel(rankLevel: number) {
  return prisma.tbl_executive_rank.findUnique({
    where: { rank_level: rankLevel },
    select: { rank_id: true },
  });
}

// ---------------------------------------------------------------------------
// 1. Officers (Executive members)
// ---------------------------------------------------------------------------

export async function getOfficers(orgVersionId: number) {
  const rows = await prisma.tbl_organization_members.findMany({
    where: { org_version_id: orgVersionId, member_type: 'Executive' },
    select: {
      member_id: true,
      tbl_user: {
        select: {
          user_id: true,
          f_name: true,
          l_name: true,
          email: true,
          tbl_program_tbl_user_program_idTotbl_program: {
            select: { name: true, abbreviation: true },
          },
        },
      },
      tbl_executive_role: {
        select: {
          executive_role_id: true,
          role_title: true,
          rank_id: true,
          tbl_executive_rank: { select: { rank_level: true } },
        },
      },
    },
    orderBy: [
      { tbl_executive_role: { tbl_executive_rank: { rank_level: 'asc' } } },
      { member_id: 'asc' },
    ],
  });

  return rows.map((r) => ({
    id: r.member_id,
    member_id: r.member_id,
    f_name: r.tbl_user.f_name ?? null,
    l_name: r.tbl_user.l_name ?? null,
    email: r.tbl_user.email,
    program_name:
      r.tbl_user.tbl_program_tbl_user_program_idTotbl_program?.name ?? null,
    program_abbreviation:
      r.tbl_user.tbl_program_tbl_user_program_idTotbl_program?.abbreviation ?? null,
    role_title: r.tbl_executive_role?.role_title ?? null,
    rank_id: r.tbl_executive_role?.rank_id ?? null,
    rank_level: r.tbl_executive_role?.tbl_executive_rank?.rank_level ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 2. Regular members
// ---------------------------------------------------------------------------

export async function getMembers(orgVersionId: number) {
  const rows = await prisma.tbl_organization_members.findMany({
    where: { org_version_id: orgVersionId, member_type: 'Member', status: 'Active' },
    select: {
      member_id: true,
      status: true,
      joined_at: true,
      tbl_user: {
        select: {
          user_id: true,
          f_name: true,
          l_name: true,
          email: true,
        },
      },
    },
    orderBy: { member_id: 'asc' },
  });

  return rows.map((r) => ({
    id: r.member_id,
    member_id: r.member_id,
    f_name: r.tbl_user.f_name ?? null,
    l_name: r.tbl_user.l_name ?? null,
    email: r.tbl_user.email,
    position: 'Member',
    status: r.status ?? 'Active',
    joined_at: r.joined_at?.toISOString() ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 3. Committees
// ---------------------------------------------------------------------------

export async function getCommittees(orgId: number, cycleNumber: number) {
  const rows = await prisma.tbl_committee.findMany({
    where: { organization_id: orgId, cycle_number: cycleNumber },
    select: {
      committee_id: true,
      name: true,
      description: true,
    },
    orderBy: { committee_id: 'asc' },
  });

  return rows.map((r) => ({
    committee_id: r.committee_id,
    committee_name: r.name,
    description: r.description ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 4. Committee members
// ---------------------------------------------------------------------------

export async function getCommitteeMembers(orgId: number, cycleNumber: number) {
  const rows = await prisma.tbl_committee_members.findMany({
    where: {
      tbl_committee: { organization_id: orgId, cycle_number: cycleNumber },
    },
    select: {
      committee_member_id: true,
      tbl_user: {
        select: {
          user_id: true,
          f_name: true,
          l_name: true,
          email: true,
        },
      },
      tbl_committee: {
        select: { committee_id: true, name: true },
      },
      tbl_committee_role: {
        select: { role_name: true },
      },
    },
    orderBy: { committee_member_id: 'asc' },
  });

  return rows.map((r) => {
    // Map Prisma enum "Committee_Head" → "Head", "Committee_Officer" → "Officer"
    const roleRaw = r.tbl_committee_role?.role_name ?? null;
    let roleDisplay = 'Officer';
    if (roleRaw === 'Committee_Head') roleDisplay = 'Head';
    else if (roleRaw === 'Committee_Officer') roleDisplay = 'Officer';

    return {
      committee_member_id: r.committee_member_id,
      member_id: r.committee_member_id,
      f_name: r.tbl_user.f_name ?? null,
      l_name: r.tbl_user.l_name ?? null,
      email: r.tbl_user.email,
      committee_name: r.tbl_committee.name,
      committee_id: r.tbl_committee.committee_id,
      role: roleDisplay,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Pending membership applications
// ---------------------------------------------------------------------------

export async function getPendingApplications(orgId: number, cycleNumber: number, orgVersionId?: number) {
  const rows = await prisma.tbl_membership_application.findMany({
    where: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      status: 'Pending',
    },
    select: {
      application_id: true,
      applied_at: true,
      status: true,
      user_id: true,
      tbl_user_tbl_membership_application_user_idTotbl_user: {
        select: {
          f_name: true,
          l_name: true,
          email: true,
          profile_picture: true,
          tbl_program_tbl_user_program_idTotbl_program: {
            select: { name: true },
          },
        },
      },
      tbl_membership_response: {
        select: {
          response_id: true,
          response_value: true,
          tbl_membership_question: {
            select: {
              question_text: true,
              is_required: true,
            }
          }
        }
      }
    },
    orderBy: { applied_at: 'asc' },
  });

  // We need to fetch transactions for these users manually if relation is hard to query
  // tbl_transaction has user_id and org_version_id
  const userIds = rows.map(r => r.user_id);
  
  let transactions = [];
  let orgVersion = null;
  
  if (orgVersionId) {
    transactions = await prisma.tbl_transaction.findMany({
      where: {
        user_id: { in: userIds },
        tbl_transaction_membership: {
          organization_id: orgId,
          cycle_number: cycleNumber
        }
      },
      orderBy: { transaction_date: 'desc' }
    });
    
    orgVersion = await prisma.tbl_organization_version.findUnique({
      where: { org_version_id: orgVersionId },
      select: { membership_fee_type: true, membership_fee_amount: true }
    });
  }

  return rows.map((r) => {
    const u = r.tbl_user_tbl_membership_application_user_idTotbl_user;
    
    // Find the most recent membership transaction for this user
    const tx = transactions.find(t => t.user_id === r.user_id);
    
    return {
      application_id: r.application_id,
      name: `${u.f_name || ''} ${u.l_name || ''}`.trim(),
      f_name: u.f_name ?? null,
      l_name: u.l_name ?? null,
      email: u.email,
      profile_picture: u.profile_picture,
      program_name: u.tbl_program_tbl_user_program_idTotbl_program?.name ?? null,
      applied_at: r.applied_at?.toISOString() ?? null,
      status: r.status,
      member_type: 'Member',
      
      // Payment details
      membership_fee_type: orgVersion?.membership_fee_type ?? 'Free',
      membership_fee_amount: orgVersion?.membership_fee_amount ?? null,
      payment_status: tx ? tx.status : null,
      proof_image: tx ? tx.proof_image : null,
      
      // Responses
      application_responses: r.tbl_membership_response.map(resp => ({
        response_id: resp.response_id,
        question_text: resp.tbl_membership_question?.question_text,
        is_required: resp.tbl_membership_question?.is_required ? 1 : 0,
        response_value: resp.response_value
      }))
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Archived members
// ---------------------------------------------------------------------------

export async function getArchivedMembers(orgId: number, cycleNumber: number) {
  const rows = await prisma.tbl_archived_organization_members.findMany({
    where: { organization_id: orgId, cycle_number: cycleNumber },
    select: {
      archived_id: true,
      member_id: true,
      archived_at: true,
      tbl_user: {
        select: { f_name: true, l_name: true, email: true },
      },
    },
    orderBy: { archived_at: 'desc' },
  });

  return rows.map((r) => ({
    id: r.archived_id,
    member_id: r.member_id,
    f_name: r.tbl_user.f_name ?? null,
    l_name: r.tbl_user.l_name ?? null,
    email: r.tbl_user.email,
    // joined_at is not stored in tbl_archived_organization_members — schema does not carry it over
    joined_at: null as string | null,
    archived_at: r.archived_at?.toISOString() ?? null,
    archived_reason: null as string | null,
  }));
}

// ---------------------------------------------------------------------------
// 7. Leave applications
// ---------------------------------------------------------------------------

export async function getLeaveApplications(orgId: number, cycleNumber: number) {
  const rows = await prisma.tbl_membership_leave_application.findMany({
    where: { organization_id: orgId, cycle_number: cycleNumber },
    select: {
      leave_application_id: true,
      leave_reason: true,
      status: true,
      applied_at: true,
      tbl_user_tbl_membership_leave_application_user_idTotbl_user: {
        select: { user_id: true, f_name: true, l_name: true, email: true },
      },
    },
    orderBy: { applied_at: 'desc' },
  });

  return rows.map((r) => {
    const u = r.tbl_user_tbl_membership_leave_application_user_idTotbl_user;
    return {
      leave_application_id: r.leave_application_id,
      member_id: r.leave_application_id,
      f_name: u.f_name ?? null,
      l_name: u.l_name ?? null,
      reason: r.leave_reason,
      status: r.status ?? 'Pending',
      submitted_at: r.applied_at?.toISOString() ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// 8. Term payments
// ---------------------------------------------------------------------------

export async function getTermPayments(orgId: number, orgVersionId: number) {
  const rows = await prisma.tbl_term_payments.findMany({
    where: { organization_id: orgId, organization_version_id: orgVersionId },
    select: {
      payment_id: true,
      payment_status: true,
      verified_at: true,
      tbl_user_tbl_term_payments_user_idTotbl_user: {
        select: { user_id: true, f_name: true, l_name: true },
      },
      tbl_academic_term: { select: { term_name: true } },
      tbl_transaction: { select: { amount: true } },
    },
    orderBy: { payment_id: 'asc' },
  });

  return rows.map((r) => {
    const u = r.tbl_user_tbl_term_payments_user_idTotbl_user;
    return {
      payment_id: r.payment_id,
      member_id: r.payment_id,
      f_name: u.f_name ?? null,
      l_name: u.l_name ?? null,
      term: r.tbl_academic_term.term_name,
      amount: Number(r.tbl_transaction.amount),
      status: r.payment_status ?? 'Pending',
      paid_at: r.verified_at?.toISOString() ?? null,
    };
  });
}

// ===========================================================================
// MUTATION MODELS
// ===========================================================================

// ---------------------------------------------------------------------------
// Officers — add
// ---------------------------------------------------------------------------

export async function addExecutiveMember(params: {
  userId: string;
  orgId: number;
  orgVersionId: number;
  cycleNumber: number;
  roleTitle: string;
  rankId: number;
}) {
  const { userId, orgId, orgVersionId, cycleNumber, roleTitle, rankId } = params;

  // Find or create the executive role with this title in this cycle
  let execRole = await prisma.tbl_executive_role.findFirst({
    where: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      role_title: roleTitle,
    },
    select: { executive_role_id: true },
  });

  if (!execRole) {
    execRole = await prisma.tbl_executive_role.create({
      data: {
        organization_id: orgId,
        cycle_number: cycleNumber,
        role_title: roleTitle,
        rank_id: rankId,
      },
      select: { executive_role_id: true },
    });
  }

  return prisma.tbl_organization_members.create({
    data: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      user_id: userId,
      org_version_id: orgVersionId,
      member_type: 'Executive',
      status: 'Active',
      executive_role_id: execRole.executive_role_id,
    },
    select: { member_id: true },
  });
}

// ---------------------------------------------------------------------------
// Officers — update
// ---------------------------------------------------------------------------

export async function updateExecutiveMember(params: {
  memberId: number;
  orgId: number;
  orgVersionId: number;
  cycleNumber: number;
  roleTitle: string;
  rankId: number;
}) {
  const { memberId, orgId, orgVersionId, cycleNumber, roleTitle, rankId } =
    params;

  // Find or create the target role
  let execRole = await prisma.tbl_executive_role.findFirst({
    where: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      role_title: roleTitle,
    },
    select: { executive_role_id: true },
  });

  if (!execRole) {
    execRole = await prisma.tbl_executive_role.create({
      data: {
        organization_id: orgId,
        cycle_number: cycleNumber,
        role_title: roleTitle,
        rank_id: rankId,
      },
      select: { executive_role_id: true },
    });
  }

  return prisma.tbl_organization_members.update({
    where: { member_id: memberId },
    data: { executive_role_id: execRole.executive_role_id },
    select: { member_id: true },
  });
}

// ---------------------------------------------------------------------------
// Officers — archive
// ---------------------------------------------------------------------------

export async function archiveExecutiveMember(params: {
  memberId: number;
  archivedBy: string;
}) {
  const { memberId, archivedBy } = params;

  const member = await prisma.tbl_organization_members.findUnique({
    where: { member_id: memberId },
    select: {
      organization_id: true,
      cycle_number: true,
      user_id: true,
      member_type: true,
      executive_role_id: true,
    },
  });
  if (!member) throw new Error('MEMBER_NOT_FOUND');

  await prisma.$transaction([
    prisma.tbl_archived_organization_members.create({
      data: {
        member_id: memberId,
        organization_id: member.organization_id,
        cycle_number: member.cycle_number,
        user_id: member.user_id,
        member_type: member.member_type ?? 'Executive',
        executive_role_id: member.executive_role_id ?? undefined,
        archived_by: archivedBy,
      },
    }),
    prisma.tbl_organization_members.delete({
      where: { member_id: memberId },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Committees — create
// ---------------------------------------------------------------------------

export async function createCommittee(params: {
  orgId: number;
  cycleNumber: number;
  name: string;
  description?: string;
}) {
  const { orgId, cycleNumber, name, description } = params;

  const committee = await prisma.tbl_committee.create({
    data: {
      organization_id: orgId,
      cycle_number: cycleNumber,
      name,
      description: description ?? null,
      // Auto-create Head and Officer roles
      tbl_committee_role: {
        createMany: {
          data: [
            { role_name: 'Committee_Head' },
            { role_name: 'Committee_Officer' },
          ],
        },
      },
    },
    select: { committee_id: true },
  });

  return committee;
}

// ---------------------------------------------------------------------------
// Committees — update
// ---------------------------------------------------------------------------

export async function updateCommittee(params: {
  committeeId: number;
  name: string;
  description?: string;
}) {
  return prisma.tbl_committee.update({
    where: { committee_id: params.committeeId },
    data: {
      name: params.name,
      description: params.description ?? undefined,
    },
    select: { committee_id: true },
  });
}

// ---------------------------------------------------------------------------
// Committees — archive (→ tbl_archived_committees)
// ---------------------------------------------------------------------------

export async function archiveCommittee(params: {
  committeeId: number;
  archivedBy: string;
  reason?: string;
}) {
  const { committeeId, archivedBy, reason } = params;

  const committee = await prisma.tbl_committee.findUnique({
    where: { committee_id: committeeId },
    select: {
      organization_id: true,
      cycle_number: true,
      name: true,
      description: true,
      created_at: true,
    },
  });
  if (!committee) throw new Error('COMMITTEE_NOT_FOUND');

  await prisma.$transaction([
    prisma.tbl_archived_committees.create({
      data: {
        original_committee_id: committeeId,
        organization_id: committee.organization_id,
        cycle_number: committee.cycle_number,
        name: committee.name,
        description: committee.description ?? undefined,
        created_at: committee.created_at ?? new Date(),
        archived_by: archivedBy,
        reason: reason ?? null,
      },
    }),
    // Cascade will remove committee_members and committee_roles
    prisma.tbl_committee.delete({ where: { committee_id: committeeId } }),
  ]);
}

// ---------------------------------------------------------------------------
// Committee members — add
// ---------------------------------------------------------------------------

export async function addCommitteeMember(params: {
  userId: string;
  committeeId: number;
  roleInCommittee: string; // 'Committee Head' | 'Committee Officer'
}) {
  const { userId, committeeId, roleInCommittee } = params;

  // Normalize role to Prisma enum value
  const roleEnum =
    roleInCommittee.toLowerCase().includes('head')
      ? 'Committee_Head'
      : 'Committee_Officer';

  const role = await prisma.tbl_committee_role.findFirst({
    where: { committee_id: committeeId, role_name: roleEnum },
    select: { committee_role_id: true },
  });

  return prisma.tbl_committee_members.create({
    data: {
      committee_id: committeeId,
      user_id: userId,
      committee_role_id: role?.committee_role_id ?? null,
    },
    select: { committee_member_id: true },
  });
}

// ---------------------------------------------------------------------------
// Committee members — update
// ---------------------------------------------------------------------------

export async function updateCommitteeMember(params: {
  committeeMemberId: number;
  newCommitteeId: number;
  roleInCommittee: string;
}) {
  const { committeeMemberId, newCommitteeId, roleInCommittee } = params;

  const roleEnum =
    roleInCommittee.toLowerCase().includes('head')
      ? 'Committee_Head'
      : 'Committee_Officer';

  const role = await prisma.tbl_committee_role.findFirst({
    where: { committee_id: newCommitteeId, role_name: roleEnum },
    select: { committee_role_id: true },
  });

  return prisma.tbl_committee_members.update({
    where: { committee_member_id: committeeMemberId },
    data: {
      committee_id: newCommitteeId,
      committee_role_id: role?.committee_role_id ?? null,
    },
    select: { committee_member_id: true },
  });
}

// ---------------------------------------------------------------------------
// Committee members — archive (delete)
// ---------------------------------------------------------------------------

export async function archiveCommitteeMember(committeeMemberId: number) {
  return prisma.tbl_committee_members.delete({
    where: { committee_member_id: committeeMemberId },
    select: { committee_member_id: true },
  });
}

// ---------------------------------------------------------------------------
// Regular members — archive
// ---------------------------------------------------------------------------

export async function archiveOrganizationMember(params: {
  memberId: number;
  archivedBy: string;
}) {
  const { memberId, archivedBy } = params;

  const member = await prisma.tbl_organization_members.findUnique({
    where: { member_id: memberId },
    select: {
      organization_id: true,
      cycle_number: true,
      user_id: true,
      member_type: true,
      executive_role_id: true,
    },
  });
  if (!member) throw new Error('MEMBER_NOT_FOUND');

  await prisma.$transaction([
    prisma.tbl_archived_organization_members.create({
      data: {
        member_id: memberId,
        organization_id: member.organization_id,
        cycle_number: member.cycle_number,
        user_id: member.user_id,
        member_type: member.member_type ?? 'Member',
        executive_role_id: member.executive_role_id ?? undefined,
        archived_by: archivedBy,
      },
    }),
    prisma.tbl_organization_members.delete({
      where: { member_id: memberId },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Regular Members — restore
// ---------------------------------------------------------------------------

export async function restoreOrganizationMember(params: {
  archivedId: number;
  orgVersionId: number;
}) {
  const { archivedId, orgVersionId } = params;

  const archived = await prisma.tbl_archived_organization_members.findUnique({
    where: { archived_id: archivedId },
  });
  if (!archived) throw new Error('MEMBER_NOT_FOUND');

  await prisma.$transaction([
    prisma.tbl_organization_members.create({
      data: {
        organization_id: archived.organization_id,
        cycle_number: archived.cycle_number,
        user_id: archived.user_id,
        org_version_id: orgVersionId,
        member_type: archived.member_type,
        executive_role_id: archived.executive_role_id ?? undefined,
        status: 'Active',
      },
    }),
    prisma.tbl_archived_organization_members.delete({
      where: { archived_id: archivedId },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Membership applications — approve
// ---------------------------------------------------------------------------

export async function approveMembershipApplication(params: {
  applicationId: number;
  orgId: number;
  orgVersionId: number;
  cycleNumber: number;
  remarks?: string;
  reviewedBy: string;
}) {
  const {
    applicationId,
    orgId,
    orgVersionId,
    cycleNumber,
    remarks,
    reviewedBy,
  } = params;

  const app = await prisma.tbl_membership_application.findUnique({
    where: { application_id: applicationId },
    select: { user_id: true, status: true },
  });
  if (!app) throw new Error('APPLICATION_NOT_FOUND');
  if (app.status !== 'Pending') throw new Error('APPLICATION_NOT_PENDING');

  await prisma.$transaction([
    prisma.tbl_membership_application.update({
      where: { application_id: applicationId },
      data: {
        status: 'Approved',
        remarks: remarks ?? null,
        reviewed_by: reviewedBy,
        reviewed_at: new Date(),
      },
    }),
    prisma.tbl_organization_members.create({
      data: {
        organization_id: orgId,
        cycle_number: cycleNumber,
        user_id: app.user_id,
        org_version_id: orgVersionId,
        member_type: 'Member',
        status: 'Active',
      },
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Membership applications — reject
// ---------------------------------------------------------------------------

export async function rejectMembershipApplication(params: {
  applicationId: number;
  remarks?: string;
  reviewedBy: string;
}) {
  const { applicationId, remarks, reviewedBy } = params;

  const app = await prisma.tbl_membership_application.findUnique({
    where: { application_id: applicationId },
    select: { status: true },
  });
  if (!app) throw new Error('APPLICATION_NOT_FOUND');
  if (app.status !== 'Pending') throw new Error('APPLICATION_NOT_PENDING');

  return prisma.tbl_membership_application.update({
    where: { application_id: applicationId },
    data: {
      status: 'Rejected',
      remarks: remarks ?? null,
      reviewed_by: reviewedBy,
      reviewed_at: new Date(),
    },
    select: { application_id: true },
  });
}
