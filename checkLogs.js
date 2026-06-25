const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function main() { 
  const count = await prisma.tbl_logs.count(); 
  console.log('Log count:', count); 
} 
main().catch(console.error).finally(() => process.exit(0));
