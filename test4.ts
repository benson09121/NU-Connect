import { prisma } from './config/db'; prisma.tbl_logs.findMany({ where: { AND: [{}] } }).then(res => console.log('LOGS:', res.length)).catch(console.error).finally(() => process.exit(0));
