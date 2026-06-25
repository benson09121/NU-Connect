import { Request, Response } from 'express';
const orgModel = require('../models/organizationsModel.js');
import { prisma } from '../../config/db';

export async function getOrgPermissions(req: Request, res: Response) {
  try {
    const data = await orgModel.getOrganizationPermissions();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getCommitteeRoles(req: Request, res: Response) {
  try {
    const { organization_id, organization_version_id } = req.query;
    const data = await orgModel.getOrganizationCommitteeRoles(organization_id, organization_version_id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getExecutiveRoles(req: Request, res: Response) {
  try {
    const { organization_id, organization_version_id } = req.query;
    const data = await orgModel.getOrganizationExecutives(organization_id, organization_version_id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMemberOverrides(req: Request, res: Response) {
  try {
    const { organization_id, organization_version_id } = req.query;
    const data = await orgModel.getMemberPermissionOverrides(organization_id, organization_version_id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getEmailSuggestions(req: Request, res: Response) {
  try {
    const { organization_id, organization_version_id, pattern } = req.query;
    const data = await orgModel.getEmailSuggestionOverride(organization_id, organization_version_id, pattern);
    res.json({ success: true, data }); 
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateCommitteePermissions(req: Request, res: Response) {
  try {
    const { committee_role_id, role_type, permissions } = req.body;
    
    const role = await prisma.tbl_committee_role.findUnique({ 
      where: { committee_role_id: Number(committee_role_id) } 
    });
    
    if (!role) {
      res.status(404).json({ error: "Committee role not found" });
      return;
    }

    const mappedRole = role_type === "head" ? "Committee Head" : "Committee Officer";
    const result = await orgModel.updateCommitteePermissions(role.committee_id, mappedRole, permissions);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateExecutivePermissions(req: Request, res: Response) {
  try {
    const { executive_id, permissions } = req.body;
    const result = await orgModel.updateExecutivePermissions(executive_id, permissions);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function addOverridePermission(req: Request, res: Response) {
  try {
    const { email, permissions, organization_id, organization_version_id } = req.body;
    const action_by_email = (req as any).user?.email || "system";
    const result = await orgModel.addMemberPermissionOverride(email, permissions, organization_id, organization_version_id, action_by_email);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateMemberPermissions(req: Request, res: Response) {
  try {
    const { member_id, organization_id, organization_version_id, permission_lists } = req.body;
    const action_by_email = (req as any).user?.email || "system";
    const result = await orgModel.updateMemberPermissionOverride(member_id, organization_id, organization_version_id, permission_lists, action_by_email);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function removeMemberPermissions(req: Request, res: Response) {
  try {
    const { member_id, organization_id, organization_version_id } = req.body;
    const action_by_email = (req as any).user?.email || "system";
    const result = await orgModel.removeMemberPermissionOverride(member_id, organization_id, organization_version_id, action_by_email);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
