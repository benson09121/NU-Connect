import 'dotenv/config';
import { PrismaClient } from '../lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Fixing event attendance status for evaluators...');

  const evaluations = await prisma.tbl_evaluation.findMany({
    select: { user_id: true, event_id: true }
  });

  console.log(`Found ${evaluations.length} evaluations.`);

  let updated = 0;
  for (const ev of evaluations) {
    const result = await prisma.tbl_event_attendance.updateMany({
      where: {
        user_id: ev.user_id,
        event_id: ev.event_id,
        status: 'Attended'
      },
      data: {
        status: 'Evaluated'
      }
    });
    updated += result.count;
  }

  console.log(`Updated ${updated} attendance records to 'Evaluated'.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
