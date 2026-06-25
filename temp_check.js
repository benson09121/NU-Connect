const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fixing event attendance status for evaluators...');

  // Get all evaluators
  const evaluations = await prisma.tbl_evaluation.findMany({
    select: { user_id: true, event_id: true }
  });

  console.log(`Found ${evaluations.length} evaluations.`);

  let updated = 0;
  for (const ev of evaluations) {
    // Update the attendance record for this user and event to "Evaluated"
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
