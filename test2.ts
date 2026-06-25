import { prisma } from './config/db'; prisma.tbl_logs.count().then(c => console.log('COUNT:', c)).catch(console.error).finally(() => process.exit(0));
