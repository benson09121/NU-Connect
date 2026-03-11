/**
 * web/models/permissionModel.ts
 *
 * Prisma-based permission queries.
 *
 * Permission layers (lowest → highest precedence):
 *  1. System role permissions  – tbl_user.role_id → tbl_role_permission → tbl_permission
 *  2. Executive rank permissions  – org membership → executive_role → executive_rank → tbl_rank_permission
 *  3. Executive individual permissions – tbl_executive_member_permission (per membership record)
 *  4. Committee role permissions – tbl_committee_members → tbl_committee_role → tbl_committee_role_permission
 *  5. Member overrides  – tbl_member_permission_override (is_allowed=true|false) — HIGHEST PRECEDENCE inside an org
 *
 * Returned shape:
 * {
 *   userId: string,
 *   globalPermissions: string[],          // from system role
 *   organizations: {
 *     [orgId]: {
 *       organizationId: number,
 *       permissions: string[],            // rank + individual (before overrides applied)
 *       grantedOverrides: string[],       // explicitly added
 *       deniedOverrides: string[],        // explicitly removed
 *       resolved: string[],              // final set after applying overrides
 *     }
 *   },
 *   committeePermissions: {
 *     [orgId]: {
 *       [committeeId]: string[]
 *     }
 *   },
 *   allResolved: string[],               // union of global + all org resolved (for fast lookups without context)
 * }
 */

import { prisma } from "../../config/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgMeta {
  member_id: number | null;
  member_type: string;
  executive_role_id: number | null;
  role_title: string | null;
  rank_level: number | null;
}

export interface OrgEntry {
  organizationId: number;
  permissions: string[] | Set<string>;
  grantedOverrides: string[];
  deniedOverrides: string[];
  resolved: string[];
  meta: OrgMeta;
}

export interface PermissionBundle {
  userId: string;
  email: string;
  f_name: string;
  l_name: string;
  program_id: number | null;
  role: {
    id: number;
    name: string | null;
    is_approver: boolean;
  };
  globalPermissions: string[];
  organizations: Record<string, OrgEntry>;
  committeePermissions: Record<string, Record<string, string[]>>;
  allResolved: string[];
}

export interface SystemPermission {
  permission_id: number;
  permission_name: string;
  scope: string;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch every permission a user holds, across all layers.
 * @param userId  – tbl_user.user_id or email
 * @returns PermissionBundle
 */
export async function getAllUserPermissions(
  userId: string,
): Promise<PermissionBundle> {
  // ── 1. System role permissions ─────────────────────────────────────────────
  // Support lookup by user_id (primary key) OR by email (unique).
  // authMiddleware passes email as userId when no explicit user_id is in the JWT.
  const userWithRole = await prisma.tbl_user.findFirst({
    where: {
      OR: [{ user_id: userId }, { email: userId }],
    },
    select: {
      user_id: true,
      email: true,
      f_name: true,
      l_name: true,
      program_id: true,
      role_id: true,
      tbl_role: {
        select: {
          role_id: true,
          role_name: true,
          is_approver: true,
          tbl_role_permission: {
            select: {
              tbl_permission: {
                select: {
                  permission_id: true,
                  permission_name: true,
                  scope: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!userWithRole) throw new Error(`User not found: ${userId}`);

  // Use the actual DB primary key for all subsequent queries
  const resolvedUserId = userWithRole.user_id;
  const resolvedFirstName = userWithRole.f_name;
  const resolvedLastName = userWithRole.l_name;


  const globalPermissions = (
    userWithRole.tbl_role?.tbl_role_permission ?? []
  ).map((rp) => rp.tbl_permission.permission_name);

  // ── 2 + 3 + 5. Org-scoped permissions ──────────────────────────────────────
  const orgMemberships = await prisma.tbl_organization_members.findMany({
    where: {
      user_id: resolvedUserId,
      status: "Active",
    },
    select: {
      member_id: true,
      organization_id: true,
      cycle_number: true,
      member_type: true,
      executive_role_id: true,

      // Layer 2: rank-based permissions
      tbl_executive_role: {
        select: {
          rank_id: true,
          role_title: true,
          tbl_executive_rank: {
            select: {
              rank_level: true,
              default_title: true,
              tbl_rank_permission: {
                select: {
                  tbl_permission: {
                    select: {
                      permission_id: true,
                      permission_name: true,
                      scope: true,
                    },
                  },
                },
              },
            },
          },
        },
      },

      // Layer 3: individual member permissions
      tbl_executive_member_permission: {
        select: {
          tbl_permission: {
            select: { permission_id: true, permission_name: true, scope: true },
          },
        },
      },

      // Layer 5: overrides (grant/deny)
      tbl_member_permission_override: {
        select: {
          is_allowed: true,
          tbl_permission: {
            select: { permission_id: true, permission_name: true, scope: true },
          },
        },
      },
    },
  });

  // ── 4. Committee permissions ────────────────────────────────────────────────
  const committeeMemberships = await prisma.tbl_committee_members.findMany({
    where: { user_id: resolvedUserId },
    select: {
      committee_member_id: true,
      committee_id: true,
      tbl_committee: {
        select: { organization_id: true },
      },
      tbl_committee_role: {
        select: {
          committee_role_id: true,
          role_name: true,
          tbl_committee_role_permission: {
            select: {
              tbl_permission: {
                select: {
                  permission_id: true,
                  permission_name: true,
                  scope: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // ── 2b. Adviser-linked organisations ────────────────────────────────────
  // Advisers are NOT in tbl_organization_members — they are linked via
  // tbl_organization.adviser_id.  We query those orgs and inject them into
  // the bundle so the frontend sees the adviser's org-level context.
  const advisedOrgs = await prisma.tbl_organization.findMany({
    where: { adviser_id: resolvedUserId },
    select: { organization_id: true },
  });

  // View-only permission set an adviser gets for each advised org
  const ADVISER_ORG_PERMISSIONS = [
    'VIEW_ORGANIZATION',
    'VIEW_COMMITTEE',
    'VIEW_EVALUATION',
    'VIEW_EVENT',
    'VIEW_APPLICATION',
    'VIEW_LOGS',
    'VIEW_TRANSACTIONS',
  ];

  // ── Build organization permission map ──────────────────────────────────────
  const organizations: Record<
    string,
    OrgEntry & { permissions: Set<string> | string[] }
  > = {};

  // Seed with adviser-linked orgs first (membership loop may override later)
  for (const advised of advisedOrgs) {
    const orgId = String(advised.organization_id);
    if (!organizations[orgId]) {
      organizations[orgId] = {
        organizationId: advised.organization_id,
        permissions: new Set<string>(ADVISER_ORG_PERMISSIONS),
        grantedOverrides: [],
        deniedOverrides: [],
        resolved: [],
        meta: {
          member_id: null,
          member_type: 'Adviser',
          executive_role_id: null,
          role_title: 'Adviser',
          rank_level: null,
        },
      };
    }
  }

  for (const membership of orgMemberships) {
    const orgId = String(membership.organization_id);

    if (!organizations[orgId]) {
      organizations[orgId] = {
        organizationId: membership.organization_id,
        permissions: new Set<string>(),
        grantedOverrides: [],
        deniedOverrides: [],
        resolved: [],
        meta: {
          member_id: membership.member_id,
          member_type: membership.member_type,
          executive_role_id: membership.executive_role_id ?? null,
          role_title: membership.tbl_executive_role?.role_title ?? null,
          rank_level:
            membership.tbl_executive_role?.tbl_executive_rank?.rank_level ??
            null,
        },
      };
    }

    const entry = organizations[orgId];
    const permSet = entry.permissions as Set<string>;

    // Layer 2: rank permissions
    const rankPermissions =
      membership.tbl_executive_role?.tbl_executive_rank?.tbl_rank_permission ??
      [];
    for (const rp of rankPermissions) {
      permSet.add(rp.tbl_permission.permission_name);
    }

    // Layer 3: individual member permissions
    for (const ep of membership.tbl_executive_member_permission) {
      permSet.add(ep.tbl_permission.permission_name);
    }

    // Layer 5: overrides
    for (const override of membership.tbl_member_permission_override) {
      const pName = override.tbl_permission.permission_name;
      if (override.is_allowed) {
        entry.grantedOverrides.push(pName);
      } else {
        entry.deniedOverrides.push(pName);
      }
    }
  }

  // Resolve final per-org permission set
  for (const orgId of Object.keys(organizations)) {
    const entry = organizations[orgId];
    const permSet = entry.permissions as Set<string>;
    const base = new Set<string>([...permSet, ...entry.grantedOverrides]);
    for (const denied of entry.deniedOverrides) {
      base.delete(denied);
    }
    entry.resolved = [...base];
    entry.permissions = [...permSet]; // convert Set → Array for serialisation
  }

  // ── Build committee permission map ─────────────────────────────────────────
  const committeePermissions: Record<string, Record<string, string[]>> = {};

  for (const cm of committeeMemberships) {
    const orgId = String(cm.tbl_committee.organization_id);
    const committeeId = String(cm.committee_id);
    const perms = (
      cm.tbl_committee_role?.tbl_committee_role_permission ?? []
    ).map((crp) => crp.tbl_permission.permission_name);

    if (!committeePermissions[orgId]) committeePermissions[orgId] = {};
    if (!committeePermissions[orgId][committeeId])
      committeePermissions[orgId][committeeId] = [];

    committeePermissions[orgId][committeeId].push(...perms);
  }

  // ── allResolved: union of global + every org resolved ──────────────────────
  const allResolved = new Set<string>(globalPermissions);
  for (const orgId of Object.keys(organizations)) {
    for (const p of organizations[orgId].resolved) allResolved.add(p);
  }
  for (const orgId of Object.keys(committeePermissions)) {
    for (const committeeId of Object.keys(committeePermissions[orgId])) {
      for (const p of committeePermissions[orgId][committeeId])
        allResolved.add(p);
    }
  }

  return {
    userId: resolvedUserId,
    email: userWithRole.email,
    f_name: resolvedFirstName,
    l_name: resolvedLastName,
    program_id: userWithRole.program_id ?? null,
    role: {
      id: userWithRole.role_id,
      name: userWithRole.tbl_role?.role_name ?? null,
      is_approver: userWithRole.tbl_role?.is_approver ?? false
    },
    globalPermissions,
    organizations: organizations as Record<string, OrgEntry>,
    committeePermissions,
    allResolved: [...allResolved],
  };
}

/**
 * Quick check: does a user have a specific permission, optionally within an org context?
 *
 * @param userId
 * @param permissionName
 * @param organizationId  - Provide to check org-scoped permissions too
 * @returns Promise<boolean>
 */
export async function userHasPermission(
  userId: string,
  permissionName: string,
  organizationId: number | null = null,
): Promise<boolean> {
  const bundle = await getAllUserPermissions(userId);

  // Always check global first
  if (bundle.globalPermissions.includes(permissionName)) return true;

  if (organizationId !== null) {
    const orgEntry = bundle.organizations[String(organizationId)];
    if (orgEntry?.resolved.includes(permissionName)) return true;

    // Committee-level
    const orgCommittees =
      bundle.committeePermissions[String(organizationId)] ?? {};
    for (const perms of Object.values(orgCommittees)) {
      if (perms.includes(permissionName)) return true;
    }
  } else {
    // Check in any org if no specific context
    for (const orgEntry of Object.values(bundle.organizations)) {
      if (orgEntry.resolved.includes(permissionName)) return true;
    }
  }

  return false;
}

/**
 * Fetch all permissions that exist in the system (master list).
 * Useful for admin UIs and permission management.
 * @returns Promise<SystemPermission[]>
 */
export async function getAllSystemPermissions(): Promise<SystemPermission[]> {
  return prisma.tbl_permission.findMany({
    orderBy: [{ scope: "asc" }, { permission_name: "asc" }],
    select: {
      permission_id: true,
      permission_name: true,
      scope: true,
      created_at: true,
    },
  });
}
