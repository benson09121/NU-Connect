import { prisma } from '../config/db';

async function main() {
  const attendances = await prisma.tbl_event_attendance.findMany({
    where: { event_id: 2 }
  });
  console.log(JSON.stringify(attendances, null, 2));
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
