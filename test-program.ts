import 'dotenv/config';
import { prisma } from './config/db';

async function main() {
  const user = await prisma.tbl_user.findUnique({
    where: { email: 'javierbb@students.nu-dasma.edu.ph' },
    include: {
      tbl_program_tbl_user_program_idTotbl_program: {
        select: {
          name: true,
        },
      },
    },
  });
  console.log(JSON.stringify(user, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
