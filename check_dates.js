const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.tbl_event.findMany({
    select: { title: true, start_date: true, end_date: true }
  });
  console.log(events);
}
main().finally(() => prisma.$disconnect());
