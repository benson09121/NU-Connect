import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter } as any);

const logos = [
  { org_version_id: 1, logo_path: 'jbecp_logo.jpg' },
  { org_version_id: 2, logo_path: 'isite_logo.jpg' },
  { org_version_id: 3, logo_path: 'microsoft_logo.jpg' },
  { org_version_id: 4, logo_path: 'jpcs_logo.jpg' },
];

(async () => {
  for (const l of logos) {
    await prisma.tbl_organization_version.update({
      where: { org_version_id: l.org_version_id },
      data: { logo_path: l.logo_path },
    });
    console.log(`✓  version ${l.org_version_id} → logo_path = "${l.logo_path}"`);
  }
  await prisma.$disconnect();
  console.log('Done.');
})();
