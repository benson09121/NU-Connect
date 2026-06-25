import 'dotenv/config';
import { prisma } from './config/db';
import { buildSessionPayload } from './mobile/controllers/authController';

async function main() {
  const payload = await buildSessionPayload('javierbb@students.nu-dasma.edu.ph');
  console.log(JSON.stringify(payload?.user, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
