/**
 * web/models/createOrgModel.ts
 *
 * Prisma-based queries for the Create Organization flow (V2).
 *
 * Replaces the old stored procedures:
 *   CheckOrganizationName, CheckOrganizationEmails, GetProgram,
 *   GetAllExecutiveRanks, GetSpecificApplication, GetOrganizationDetails,
 *   CreateOrganizationApplication
 *
 * Endpoints:
 *   POST   /api/web/organizations/applications                → submit application
 *   GET    /api/web/organizations/check-name?name=             → validate name
 *   POST   /api/web/organizations/check-emails                 → validate emails
 *   GET    /api/web/programs                                   → colleges + programs
 *   GET    /api/web/organizations/executive-ranks              → rank hierarchy
 *   GET    /api/web/organizations/applications/:id             → application details (AppDetails + resubmit pre-fill)
 *   GET    /api/web/organizations/:id/details?org_version_id=  → load org for renewal
 *   GET    /api/web/organizations/applications/:id/logo        → serve logo file
 *   GET    /api/web/organizations/applications/:id/requirements/:file → serve requirement file
 */

import { prisma } from '../../config/db';
import { resolveUser } from './organizationsPageModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgramItem {
  abbreviation: string | null;
  program_name: string | null;
}

export interface CollegePrograms {
  abbreviation: string;
  college_name: string;
  program: ProgramItem[];
}

export interface RankItem {
  rank_id: number;
  rank_name: string;
  rank_number: number;
}

export interface SubmitApplicationInput {
  organization: {
    organization_name: string;
    organization_description: string;
    require_membership_fee: boolean;
    fee_duration: string | null;
    fee_amount: number;
    category: string;
    department: string[];
    is_resubmission?: boolean;
    is_renewal?: boolean;
    organization_logo: string; // generated filename
  };
  executives: {
    f_name: string;
    l_name: string;
    role_name: string;
    rank_number: number;
    nu_email: string;
  }[];
  requirements: {
    requirement_id: number;
    requirement_path: string;
    original_name?: string;
  }[];
  applicant_email: string;
}

// ---------------------------------------------------------------------------
// 1. Validate Organization Name
// ---------------------------------------------------------------------------

export async function checkOrganizationName(name: string): Promise<boolean> {
  const existing = await prisma.tbl_organization.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { organization_id: true },
  });
  return existing !== null;
}

// ---------------------------------------------------------------------------
// 2. Validate Executive Emails
// ---------------------------------------------------------------------------

/**
 * Returns emails that are NOT available (i.e. already assigned as execs
 * in another organization, or belong to non-student roles).
 *
 * When `president_email` is provided (renewal flow), the check is scoped
 * to the president's organization; otherwise it checks globally.
 */
export async function checkOrganizationEmails(
  emails: string[],
  presidentEmail: string | null,
): Promise<string[]> {
  const unavailable: Set<string> = new Set();

  // Normalise to lowercase
  const normalised = emails.map((e) => e.toLowerCase().trim());

  if (!presidentEmail) {
    // --- NEW APPLICATION FLOW ---

    // 1) Non-student users
    const nonStudents = await prisma.tbl_user.findMany({
      where: {
        email: { in: normalised, mode: 'insensitive' },
        tbl_role: { role_name: { not: 'Student' } },
      },
      select: { email: true },
    });
    nonStudents.forEach((u) => unavailable.add(u.email.toLowerCase()));

    // 2) Active executives in any organisation
    const execs = await prisma.tbl_organization_members.findMany({
      where: {
        member_type: 'Executive',
        status: 'Active',
        tbl_user: { email: { in: normalised, mode: 'insensitive' } },
      },
      select: { tbl_user: { select: { email: true } } },
    });
    execs.forEach((m) => unavailable.add(m.tbl_user.email.toLowerCase()));
  } else {
    // --- RENEWAL FLOW ---

    // Find the president's org
    const presidentUser = await prisma.tbl_user.findFirst({
      where: { email: { equals: presidentEmail, mode: 'insensitive' } },
      select: { user_id: true },
    });

    let presidentOrgId: number | null = null;
    if (presidentUser) {
      const membership = await prisma.tbl_organization_members.findFirst({
        where: {
          user_id: presidentUser.user_id,
          member_type: 'Executive',
          status: 'Active',
        },
        select: { organization_id: true },
      });
      presidentOrgId = membership?.organization_id ?? null;
    }

    if (presidentOrgId === null) {
      // Cannot determine checker's org — treat all as unavailable
      return normalised;
    }

    // Execs in OTHER organisations → unavailable
    const otherOrgExecs = await prisma.tbl_organization_members.findMany({
      where: {
        member_type: 'Executive',
        status: 'Active',
        organization_id: { not: presidentOrgId },
        tbl_user: { email: { in: normalised, mode: 'insensitive' } },
      },
      select: { tbl_user: { select: { email: true } } },
    });
    otherOrgExecs.forEach((m) => unavailable.add(m.tbl_user.email.toLowerCase()));
  }

  return Array.from(unavailable);
}

// ---------------------------------------------------------------------------
// 3. Get Programs (Colleges + Programs)
// ---------------------------------------------------------------------------

export async function getPrograms(): Promise<CollegePrograms[]> {
  const colleges = await prisma.tbl_college.findMany({
    where: { status: 'Active' },
    orderBy: { name: 'asc' },
    select: {
      abbreviation: true,
      name: true,
      tbl_program: {
        where: { status: 'Active' },
        orderBy: { name: 'asc' },
        select: {
          abbreviation: true,
          name: true,
        },
      },
    },
  });

  return colleges.map((c) => ({
    abbreviation: c.abbreviation,
    college_name: c.name,
    program: c.tbl_program.map((p) => ({
      abbreviation: p.abbreviation,
      program_name: p.name,
    })),
  }));
}

// ---------------------------------------------------------------------------
// 4. Get Executive Ranks
// ---------------------------------------------------------------------------

export async function getExecutiveRanks(): Promise<RankItem[]> {
  const ranks = await prisma.tbl_executive_rank.findMany({
    orderBy: { rank_level: 'asc' },
    select: {
      rank_id: true,
      rank_level: true,
      default_title: true,
    },
  });

  return ranks.map((r) => ({
    rank_id: r.rank_id,
    rank_name: r.default_title,
    rank_number: r.rank_level,
  }));
}

// ---------------------------------------------------------------------------
// 5. Get Application for Resubmission
// ---------------------------------------------------------------------------

export async function getApplicationDetails(applicationId: number) {
  const app = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    include: {
      tbl_organization_version: {
        include: {
          tbl_organization_version_course: {
            include: {
              tbl_program: {
                select: { program_id: true, abbreviation: true, name: true },
              },
            },
          },
        },
      },
      tbl_application_executives: true,
      tbl_organization_requirement_submission: {
        include: {
          tbl_application_requirement: {
            select: { requirement_name: true },
          },
        },
      },
      tbl_approval_process: {
        include: {
          tbl_user: { select: { f_name: true, l_name: true } },
        },
        orderBy: { step: 'asc' },
      },
      tbl_application_approval_chain: {
        include: {
          tbl_user: { select: { f_name: true, l_name: true, email: true } },
          tbl_role: { select: { role_name: true } },
        },
        orderBy: { approval_order: 'asc' },
      },
      tbl_user_tbl_application_applicant_user_idTotbl_user: {
        select: { f_name: true, l_name: true, email: true },
      },
    },
  });

  if (!app) return null;

  const ov = app.tbl_organization_version;
  const submitter = app.tbl_user_tbl_application_applicant_user_idTotbl_user;

  return {
    application: {
      id: app.application_id,
      application_id: app.application_id,
      organization_id: app.organization_id,
      org_version_id: app.org_version_id,
      period_id: app.period_id,
      application_type: app.application_type,
      current_status: app.status,
      submitted_by: `${submitter.f_name} ${submitter.l_name}`,
      submitter_email: submitter.email,
      submission_date: app.created_at?.toISOString() ?? null,
      is_renewal: app.application_type === 'renewal',
      requirements: app.tbl_organization_requirement_submission.map((rs) => ({
        requirement_id: rs.requirement_id,
        name: rs.tbl_application_requirement?.requirement_name ?? rs.submitted_requirement_title ?? null,
        submitted_file: rs.file_path,
        submitted_at: rs.submitted_at?.toISOString() ?? null,
      })),
    },
    organization: {
      name: ov?.name ?? app.submitted_org_name ?? '',
      description: ov?.description ?? app.description ?? '',
      category: ov?.category ?? app.category ?? null,
      organization_id: app.organization_id,
      org_version_id: app.org_version_id,
      logo_url: ov?.logo_path ?? app.submitted_org_logo ?? null,
      programs:
        ov?.tbl_organization_version_course.map((ovc) => ({
          id: ovc.tbl_program.program_id,
          name: ovc.tbl_program.name,
          abbreviation: ovc.tbl_program.abbreviation,
        })) ?? [],
      membership_info: {
        fee_type: ov?.membership_fee_type ?? null,
        fee_amount: ov?.membership_fee_amount
          ? Number(ov.membership_fee_amount)
          : null,
      },
    },
    leadership: app.tbl_application_executives.map((ae) => ({
      application_executive_id: ae.app_exec_id,
      proposed_name: ae.proposed_name,
      proposed_title: ae.proposed_title,
      proposed_rank_id: ae.proposed_rank_id,
      proposed_email: ae.proposed_email,
    })),
    signatories: app.tbl_application_approval_chain.map((ac) => ({
      chain_id: ac.chain_id,
      approval_order: ac.approval_order,
      signatory_name: `${ac.tbl_user.f_name ?? ''} ${ac.tbl_user.l_name ?? ''}`.trim(),
      signatory_email: ac.tbl_user.email,
      role: ac.tbl_role.role_name,
      status: ac.status,
      is_final_approval: ac.is_final_approval,
      uses_endorsed: ac.uses_endorsed,
      signature_path: ac.signature_path,
      remarks: ac.remarks ?? null,
      endorsed_at: ac.endorsed_at?.toISOString() ?? null,
      received_at: ac.received_at?.toISOString() ?? null,
      signed_at: ac.signed_at?.toISOString() ?? null,
      approved_at: ac.approved_at?.toISOString() ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// 6. Get Organization Details for Renewal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Category enum → display string
// ---------------------------------------------------------------------------
const ORG_CATEGORY_LABEL: Record<string, string> = {
  Co_Curricular_Organization:    'Co-Curricular Organization',
  Extra_Curricular_Organization: 'Extra Curricular Organization',
};

function categoryLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return ORG_CATEGORY_LABEL[raw] ?? raw;
}

export async function getOrganizationDetails(
  organizationId: number,
  orgVersionId: number,
) {
  const ov = await prisma.tbl_organization_version.findUnique({
    where: { org_version_id: orgVersionId },
    include: {
      tbl_organization_version_course: {
        include: {
          tbl_program: { select: { abbreviation: true, name: true } },
        },
      },
      tbl_organization_tbl_organization_version_organization_idTotbl_organization: {
        select: {
          tbl_user_tbl_organization_adviser_idTotbl_user: {
            select: { f_name: true, l_name: true, email: true },
          },
        },
      },
    },
  });

  if (!ov) return null;

  const adviserUser =
    ov.tbl_organization_tbl_organization_version_organization_idTotbl_organization
      ?.tbl_user_tbl_organization_adviser_idTotbl_user ?? null;

  // Find the cycle matching this version to get executives
  const cycle = await prisma.tbl_renewal_cycle.findFirst({
    where: { org_version_id: orgVersionId },
    select: { cycle_number: true, organization_id: true },
  });

  const effectiveOrgId = ov.organization_id ?? organizationId;
  const cycleNumber = cycle?.cycle_number ?? 1;

  // Get executives for this org + cycle
  const executives = await prisma.tbl_organization_members.findMany({
    where: {
      organization_id: effectiveOrgId,
      cycle_number: cycleNumber,
      member_type: 'Executive',
    },
    include: {
      tbl_user: {
        select: { f_name: true, l_name: true, email: true },
      },
      tbl_executive_role: {
        select: { role_title: true, rank_id: true },
      },
    },
  });

  return {
    organization_detail: {
      org_name: ov.name,
      description: ov.description,
      category: categoryLabel(ov.category),
      adviser: adviserUser
        ? {
            f_name: adviserUser.f_name ?? null,
            l_name: adviserUser.l_name ?? null,
            email: adviserUser.email,
          }
        : null,
      programs: ov.tbl_organization_version_course.map((ovc) => ({
        abbreviation: ovc.tbl_program.abbreviation?.toLowerCase() ?? null,
      })),
      membership_info: {
        fee_type: ov.membership_fee_type ?? null,
        fee_amount: ov.membership_fee_amount
          ? Number(ov.membership_fee_amount)
          : 0,
      },
      logo_url: ov.logo_path ?? null,
    },
    executive_members: executives.map((e) => ({
      first_name: e.tbl_user.f_name,
      last_name: e.tbl_user.l_name,
      role_title: e.tbl_executive_role?.role_title ?? null,
      rank_id: e.tbl_executive_role?.rank_id ?? null,
      email: e.tbl_user.email,
    })),
  };
}

// ---------------------------------------------------------------------------
// 7. Get Application Logo Path
// ---------------------------------------------------------------------------

export async function getApplicationLogoPath(
  applicationId: number,
): Promise<string | null> {
  const app = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    select: {
      submitted_org_logo: true,
      tbl_organization_version: {
        select: { logo_path: true },
      },
    },
  });

  if (!app) return null;

  const logoFilename =
    app.tbl_organization_version?.logo_path ?? app.submitted_org_logo;
  if (!logoFilename) return null;

  // Logo lives at: applications/{appId}/logo/{filename}
  return `applications/${applicationId}/logo/${logoFilename}`;
}

// ---------------------------------------------------------------------------
// 8. Submit Application (Transaction)
// ---------------------------------------------------------------------------

/**
 * Maps the frontend fee_duration string ("Semestral", "Annual", "One-time")
 * to the Prisma enum `membership_fee_type`.
 */
function mapFeeType(
  feeDuration: string | null,
  requireFee: boolean,
): 'Per_Term' | 'Whole_Academic_Year' | 'Free' {
  if (!requireFee || !feeDuration) return 'Free';
  const lower = feeDuration.toLowerCase();
  if (lower === 'semestral' || lower === 'per term') return 'Per_Term';
  if (
    lower === 'annual' ||
    lower === 'whole academic year' ||
    lower === 'one-time'
  )
    return 'Whole_Academic_Year';
  return 'Free';
}

/**
 * Maps the frontend category string to the Prisma enum `org_category`.
 */
function mapCategory(
  cat: string,
): 'Co_Curricular_Organization' | 'Extra_Curricular_Organization' {
  if (cat.toLowerCase().includes('extra'))
    return 'Extra_Curricular_Organization';
  return 'Co_Curricular_Organization';
}

export async function submitApplication(input: SubmitApplicationInput) {
  const { organization, executives, requirements, applicant_email } = input;

  // Resolve user
  const user = await resolveUser(applicant_email);

  // Find active period
  const activePeriod = await prisma.tbl_application_period.findFirst({
    where: { is_active: true },
    orderBy: { created_at: 'desc' },
    select: { period_id: true },
  });
  if (!activePeriod) {
    throw new Error('NO_ACTIVE_PERIOD');
  }

  // Determine application type
  let appType: 'new' | 'renewal' = 'new';
  let existingOrgId: number | null = null;
  let cycleNumber = 1;

  if (organization.is_renewal) {
    appType = 'renewal';
    // Find the org where this user is president
    const presidency = await prisma.tbl_organization_members.findFirst({
      where: {
        user_id: user.user_id,
        member_type: 'Executive',
        status: 'Active',
        tbl_executive_role: { rank_id: 1 },
      },
      select: {
        organization_id: true,
        cycle_number: true,
      },
    });
    if (presidency) {
      existingOrgId = presidency.organization_id;
      cycleNumber = presidency.cycle_number;
    }
  }

  // Map fee type
  const feeType = mapFeeType(
    organization.fee_duration,
    organization.require_membership_fee,
  );

  const feeAmount = organization.require_membership_fee
    ? organization.fee_amount
    : null;

  // Look up program IDs from abbreviations
  const programs = await prisma.tbl_program.findMany({
    where: {
      abbreviation: {
        in: organization.department,
        mode: 'insensitive',
      },
    },
    select: { program_id: true },
  });

  // Run everything in a transaction
  return prisma.$transaction(async (tx) => {
    // 1. Create org version
    const orgVersion = await tx.tbl_organization_version.create({
      data: {
        organization_id: existingOrgId,
        base_program_id: user.program_id,
        name: organization.organization_name,
        logo_path: organization.organization_logo,
        description: organization.organization_description,
        category: mapCategory(organization.category),
        membership_fee_type: feeType,
        membership_fee_amount: feeAmount,
        created_by: user.user_id,
        status: 'Pending',
      },
    });

    // 2. Create application
    //    cycle_number + organization_id form the FK to tbl_renewal_cycle.
    //    For NEW apps both are NULL (the cycle is created upon approval).
    //    For RENEWALS they reference the president's current cycle.
    const application = await tx.tbl_application.create({
      data: {
        organization_id: existingOrgId,
        cycle_number: existingOrgId ? cycleNumber : null,
        org_version_id: orgVersion.org_version_id,
        submitted_org_name: organization.organization_name,
        submitted_org_logo: organization.organization_logo,
        description: organization.organization_description,
        category: mapCategory(organization.category),
        base_program_id: user.program_id,
        student_id: user.user_id,
        application_type: appType,
        period_id: activePeriod.period_id,
        applicant_user_id: user.user_id,
        status: 'Pending',
      },
    });

    // 3. Insert executives
    for (const exec of executives) {
      await tx.tbl_application_executives.create({
        data: {
          application_id: application.application_id,
          org_version_id: orgVersion.org_version_id,
          proposed_name: `${exec.f_name} ${exec.l_name}`,
          proposed_email: exec.nu_email.toLowerCase(),
          proposed_title: exec.role_name,
          proposed_rank_id: exec.rank_number,
        },
      });
    }

    // 4. Insert requirement submissions
    for (const req of requirements) {
      // Fetch the requirement title for the snapshot
      const reqInfo = await tx.tbl_application_requirement.findUnique({
        where: { requirement_id: req.requirement_id },
        select: { requirement_name: true },
      });

      await tx.tbl_organization_requirement_submission.create({
        data: {
          application_id: application.application_id,
          requirement_id: req.requirement_id,
          organization_id: existingOrgId,
          cycle_number: existingOrgId ? cycleNumber : null,
          org_version_id: orgVersion.org_version_id,
          file_path: req.requirement_path,
          submitted_by: user.user_id,
          status: 'Pending',
          submitted_requirement_title: reqInfo?.requirement_name ?? null,
        },
      });
    }

    // 5. Insert version courses (department associations)
    if (programs.length > 0) {
      await tx.tbl_organization_version_course.createMany({
        data: programs.map((p) => ({
          org_version_id: orgVersion.org_version_id,
          program_id: p.program_id,
        })),
      });
    }

    return {
      application_id: application.application_id,
      org_version_id: orgVersion.org_version_id,
      organization_name: organization.organization_name,
      status: 'Pending' as const,
      submitted_at: application.created_at?.toISOString() ?? new Date().toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// 9. Resolve Requirement File Path
// ---------------------------------------------------------------------------

/**
 * Given an application ID and stored filename, verify the requirement exists
 * and return the relative storage path.
 *
 * Also returns the application's `applicant_user_id` so the controller can
 * check auth (submitter vs approver vs SDAO).
 */
export async function getRequirementFilePath(
  applicationId: number,
  storedFilename: string,
) {
  // Find the submission row matching this filename
  const submission = await prisma.tbl_organization_requirement_submission.findFirst({
    where: {
      application_id: applicationId,
      file_path: storedFilename,
    },
    select: {
      file_path: true,
      submitted_requirement_title: true,
      tbl_application_requirement: {
        select: { requirement_name: true },
      },
    },
  });

  if (!submission) return null;

  // Also fetch the application to get the applicant for auth checks
  const app = await prisma.tbl_application.findUnique({
    where: { application_id: applicationId },
    select: {
      applicant_user_id: true,
      tbl_approval_process: {
        select: { approver_id: true },
      },
    },
  });

  if (!app) return null;

  return {
    relativePath: `applications/${applicationId}/requirements/${submission.file_path}`,
    storedFilename: submission.file_path,
    requirementName:
      submission.tbl_application_requirement?.requirement_name ??
      submission.submitted_requirement_title ??
      'requirement',
    applicantUserId: app.applicant_user_id,
    approverIds: app.tbl_approval_process.map((ap) => ap.approver_id),
  };
}

// ---------------------------------------------------------------------------
// 10. Get Pending Application for a User
// ---------------------------------------------------------------------------

/**
 * Check if the authenticated user has a pending `tbl_application`.
 * Called from GET /me/permissions so the frontend can redirect if needed.
 *
 * @param email  The user's email (req.user.email)
 * @returns `{ application_id, organization_name, application_type, submitted_at }` or `null`
 */
export async function getPendingApplication(email: string) {
  // Resolve user_id from email
  const user = await prisma.tbl_user.findFirst({
    where: { OR: [{ user_id: email }, { email }] },
    select: { user_id: true },
  });

  if (!user) return null;

  const app = await prisma.tbl_application.findFirst({
    where: {
      applicant_user_id: user.user_id,
      status: 'Pending',
    },
    orderBy: { created_at: 'desc' },
    select: {
      application_id: true,
      submitted_org_name: true,
      application_type: true,
      created_at: true,
    },
  });

  if (!app) return null;

  return {
    application_id: app.application_id,
    organization_name: app.submitted_org_name,
    application_type: app.application_type,
    submitted_at: app.created_at?.toISOString() ?? null,
  };
}

