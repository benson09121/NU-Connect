const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.tbl_event_attendance.findMany().then(rows => console.log(JSON.stringify(rows, null, 2))).catch(console.error).finally(() => prisma.$disconnect());
