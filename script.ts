import { prisma } from './config/db'; prisma.tbl_logs.count().then(console.log).finally(() => process.exit(0));
