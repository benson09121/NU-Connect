import { PrismaClient } from './lib/generated/prisma/client';
const prisma = new PrismaClient();
async function run() {
    const txTypes = await prisma.tbl_transaction_type.findMany();
    console.log("Transaction Types:", txTypes);
    const payTypes = await prisma.tbl_payment_type.findMany();
    console.log("Payment Types:", payTypes);
    await prisma.$disconnect();
}
run().catch(console.error);
