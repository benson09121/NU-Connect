import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.tbl_user.findMany({ take: 1 });
  if (users.length > 0) {
    const user = users[0];
    
    // Create a dummy log if none exists
    const count = await prisma.tbl_logs.count();
    if (count === 0) {
      await prisma.tbl_logs.create({
        data: {
          user_id: user.user_id,
          user_email: user.email,
          full_name: `${user.first_name} ${user.last_name}`,
          action: 'System initialized successfully',
          action_type: 'system_init',
          entity_type: 'system',
          entity_id: 1,
          meta_data: { note: 'This is a system generated log to test the activity logs page' }
        }
      });
      console.log('Created dummy log!');
    }
    
    console.log(`There are now ${await prisma.tbl_logs.count()} logs in the database.`);
  } else {
    console.log('No users found to attach log to.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
