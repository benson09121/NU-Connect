import 'dotenv/config';
import { prisma } from './config/db';
import { getAllUserPermissions } from './web/models/permissionModel';
const { getAllEvents } = require('./mobile/models/eventModel');

async function main() {
  const email = 's00001@students.nu.edu.ph';
  console.log(`Checking user: ${email}`);
  
  const bundle = await getAllUserPermissions(email);
  
  const orgIds = Object.keys(bundle.organizations || {})
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

  const uniqueOrgIds = [...new Set(orgIds)];

  let orgRows = [];
  if (uniqueOrgIds.length) {
      orgRows = await prisma.tbl_organization.findMany({
          where: { organization_id: { in: uniqueOrgIds } },
          select: { organization_id: true, name: true },
      });
  }

  const orgNameMap = new Map(orgRows.map((org) => [org.organization_id, org.name]));

  const organizations = Object.values(bundle.organizations || {}).map((orgEntry: any) => ({
      organization_id: orgEntry.organizationId,
      organization_name: orgNameMap.get(orgEntry.organizationId) || '',
      permissions: orgEntry.resolved || [],
  }));

  console.log('Organizations:', JSON.stringify(organizations, null, 2));
  
  const events = await getAllEvents(organizations);
  console.log('Events length:', events.length);
}

main().finally(() => prisma.$disconnect());
