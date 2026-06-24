import { prisma } from '../../config/db';

export async function getUserTermPayments(userId: string, organizationId?: number) {
  return prisma.tbl_term_payments.findMany({
    where: {
      user_id: userId,
      ...(organizationId ? { organization_id: organizationId } : {}),
    },
    include: {
      tbl_academic_term: true,
      tbl_organization: true,
      tbl_transaction: true,
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function createTermPaymentWithTransaction(
  userId: string,
  organizationId: number,
  termId: number,
  proofImage: string
) {
  return prisma.$transaction(async (tx) => {
    // 1. Get organization and membership details
    const org = await tx.tbl_organization.findUnique({
      where: { organization_id: organizationId },
    });

    if (!org || !org.current_org_version_id) {
      throw new Error('Organization not found');
    }

    const membership = await tx.tbl_organization_members.findFirst({
      where: {
        user_id: userId,
        organization_id: organizationId,
        status: 'Active',
      },
    });

    if (!membership) {
      throw new Error('User is not an active member of this organization');
    }

    const currentVersion = await tx.tbl_organization_version.findUnique({
      where: { org_version_id: org.current_org_version_id }
    });

    if (!currentVersion || currentVersion.membership_fee_type !== 'Per_Term' || !currentVersion.membership_fee_amount || currentVersion.membership_fee_amount.toNumber() <= 0) {
      throw new Error('Organization is not configured for Per Term payments');
    }

    // 2. Check if payment already exists
    const existing = await tx.tbl_term_payments.findFirst({
      where: {
        user_id: userId,
        organization_id: organizationId,
        term_id: termId,
      },
    });

    if (existing) {
      throw new Error('Payment for this term already exists');
    }

    const term = await tx.tbl_academic_term.findUnique({ where: { term_id: termId } });
    if (!term) throw new Error('Term not found');

    const user = await tx.tbl_user.findUnique({ where: { user_id: userId } });
    if (!user) throw new Error('User not found');

    const payerName = `${user.f_name} ${user.l_name}`;
    const description = `Term Membership Fee - ${org.name} (${term.term_name})`;

    // 3. Get lookup IDs
    const transactionType = await tx.tbl_transaction_type.findFirst({ where: { code: 'INCOME' } });
    const paymentType = await tx.tbl_payment_type.findFirst({ where: { code: 'UPLOAD_PROOF' } });
    const category = await tx.tbl_financial_category.findFirst({ where: { code: 'MEMBERSHIP', active: true } });

    if (!transactionType || !paymentType || !category) {
      throw new Error('Required financial lookup data not found');
    }

    // 4. Generate receipt number (I-YYYYMM-ORGXXX-123456)
    const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
    const orgToken = `ORG${String(organizationId).padStart(3, '0')}`;
    const random6 = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    const receiptNo = `I-${yyyymm}-${orgToken}-${random6}`;

    // 5. Create Transaction
    const transaction = await tx.tbl_transaction.create({
      data: {
        user_id: userId,
        payer_name: payerName,
        payee_name: org.name,
        payment_description: description,
        amount: currentVersion.membership_fee_amount,
        transaction_type_id: transactionType.transaction_type_id,
        payment_type_id: paymentType.payment_type_id,
        category_id: category.category_id,
        org_version_id: org.current_org_version_id,
        status: 'Pending',
        transaction_date: new Date(),
        receipt_no: receiptNo,
        proof_image: proofImage,
      },
    });

    // 6. Create Transaction Membership link
    await tx.tbl_transaction_membership.create({
      data: {
        transaction_id: transaction.transaction_id,
        organization_id: organizationId,
        cycle_number: 1,
      },
    });

    // 7. Create Term Payment
    const termPayment = await tx.tbl_term_payments.create({
      data: {
        user_id: userId,
        organization_id: organizationId,
        organization_version_id: org.current_org_version_id,
        term_id: termId,
        transaction_id: transaction.transaction_id,
        payment_status: 'Pending',
      },
    });

    return termPayment;
  });
}

export async function updatePaymentReceipt(paymentId: number, receiptPath: string, notes: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.tbl_term_payments.findUnique({
      where: { payment_id: paymentId },
    });
    if (!payment) throw new Error('Payment not found');
    if (payment.user_id !== userId) throw new Error('Unauthorized');

    await tx.tbl_transaction.update({
      where: { transaction_id: payment.transaction_id },
      data: {
        proof_image: receiptPath,
        remarks: notes,
        status: 'Pending',
        updated_at: new Date(),
      },
    });

    return tx.tbl_term_payments.update({
      where: { payment_id: paymentId },
      data: {
        payment_status: 'Pending',
        updated_at: new Date(),
      },
    });
  });
}

export async function getPendingTermPayments(organizationId: number, organizationVersionId?: number) {
  return prisma.tbl_term_payments.findMany({
    where: {
      organization_id: organizationId,
      ...(organizationVersionId ? { organization_version_id: organizationVersionId } : {}),
      payment_status: 'Pending',
    },
    include: {
      tbl_user_tbl_term_payments_user_idTotbl_user: true,
      tbl_academic_term: true,
      tbl_transaction: true,
    },
    orderBy: { created_at: 'asc' },
  });
}

export async function updateTermPaymentStatus(
  paymentId: number,
  status: string,
  verifiedBy: string,
  notes?: string
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.tbl_term_payments.update({
      where: { payment_id: paymentId },
      data: {
        payment_status: status,
        notes: notes,
        verified_by: verifiedBy,
        verified_at: ['Paid', 'Rejected'].includes(status) ? new Date() : undefined,
        updated_at: new Date(),
      },
    });

    const transactionStatus = status === 'Paid' ? 'Completed' : status === 'Rejected' ? 'Failed' : 'Pending';

    await tx.tbl_transaction.update({
      where: { transaction_id: payment.transaction_id },
      data: {
        status: transactionStatus,
        updated_at: new Date(),
      },
    });

    return payment;
  });
}

export async function checkUserTermPaymentStatus(
  userId: string,
  organizationId: number,
  organizationVersionId: number,
  termId: number
) {
  const payments = await prisma.tbl_term_payments.findMany({
    where: {
      user_id: userId,
      organization_id: organizationId,
      organization_version_id: organizationVersionId,
      term_id: termId,
    },
  });

  if (payments.length === 0) return { payment_status: 'No Payment', payment_count: 0 };

  const hasPaid = payments.some((p) => p.payment_status === 'Paid');
  const hasPending = payments.some((p) => p.payment_status === 'Pending');

  return {
    payment_status: hasPaid ? 'Paid' : hasPending ? 'Pending' : 'Not Paid',
    payment_count: payments.length,
  };
}
