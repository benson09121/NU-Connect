import { prisma } from '../../config/db';

export interface TransactionFilters {
  user_email?: string | null;
  status?: string | null;
  include_archived?: boolean;
  event_id?: number | null;
  organization_id?: number | null;
  transaction_type_code?: string | null;
  category_code?: string | null;
}

interface TransactionMutationInput {
  transaction_id?: number;
  user_email?: string | null;
  payer_name?: string | null;
  payee_name?: string | null;
  transaction_type_code?: string | null;
  payment_type_code?: string | null;
  payment_description?: string | null;
  amount?: number | string | null;
  status?: string | null;
  transaction_date?: string | Date | null;
  proof_image?: string | null;
  receipt_no?: string | null;
  category_code?: string | null;
  event_id?: number | null;
  payer_name_override?: string | null;
  event_remarks?: string | null;
  organization_id?: number | null;
  cycle_number?: number | null;
  org_version_id?: number | null;
  remarks?: string | null;
  reason?: string | null;
}

type LegacyTxRow = Record<string, unknown>;

type CanonicalTransactionType = 'INCOME' | 'EXPENSE';

function normalizeStatus(value: unknown): 'Pending' | 'Completed' | 'Failed' {
  const s = String(value ?? 'Pending').trim();
  if (s === 'Completed') return 'Completed';
  if (s === 'Failed') return 'Failed';
  return 'Pending';
}

function canonicalTypeLabel(code: CanonicalTransactionType): string {
  return code === 'INCOME' ? 'Income' : 'Expense';
}

function toCanonicalType(code?: string | null, categoryKind?: string | null): CanonicalTransactionType {
  const kind = String(categoryKind ?? '').trim().toUpperCase();
  if (kind === 'INCOME' || kind === 'EXPENSE') return kind as CanonicalTransactionType;

  const raw = String(code ?? '').trim().toUpperCase();
  if (raw === 'EXPENSE' || raw === 'FINE') return 'EXPENSE';
  if (raw === 'INCOME' || raw === 'MEMBERSHIP' || raw === 'EVENT' || raw === 'OTHER') return 'INCOME';

  return 'INCOME';
}

function mapTxRow(tx: any): LegacyTxRow {
  const membership = tx.tbl_transaction_membership ?? null;
  const renewalCycle = membership?.tbl_renewal_cycle ?? null;
  const txEvent = tx.tbl_transaction_event ?? null;
  const event = txEvent?.tbl_event ?? null;

  const organization_id = membership?.organization_id ?? event?.organization_id ?? null;
  const cycle_number = membership?.cycle_number ?? event?.cycle_number ?? null;
  const organization_version_id = tx.org_version_id ?? renewalCycle?.org_version_id ?? null;

  const canonicalTypeCode = toCanonicalType(tx.tbl_transaction_type?.code, tx.tbl_financial_category?.kind);

  return {
    transaction_id: tx.transaction_id,
    user_id: tx.user_id ?? null,
    user_email: tx.tbl_user_tbl_transaction_user_idTotbl_user?.email ?? null,
    payer_name: tx.payer_name ?? null,
    payee_name: tx.payee_name ?? null,
    payment_description: tx.payment_description ?? null,
    amount: tx.amount,
    status: normalizeStatus(tx.status),
    transaction_date: tx.transaction_date ?? null,
    receipt_no: tx.receipt_no ?? null,
    proof_image: tx.proof_image ?? null,
    qr_token: tx.qr_token ?? null,
    qr_enabled: tx.qr_enabled ?? null,
    remarks: tx.remarks ?? null,
    archived_at: tx.archived_at ?? null,
    archived_reason: tx.archived_reason ?? null,
    created_at: tx.created_at ?? null,
    updated_at: tx.updated_at ?? null,
    payment_type_code: tx.tbl_payment_type?.code ?? null,
    payment_type_label: tx.tbl_payment_type?.label ?? null,
    method_group: tx.tbl_payment_type?.method_group ?? null,
    transaction_type_code: canonicalTypeCode,
    transaction_type_label: canonicalTypeLabel(canonicalTypeCode),
    category_code: tx.tbl_financial_category?.code ?? null,
    category_label: tx.tbl_financial_category?.label ?? null,
    category_kind: tx.tbl_financial_category?.kind ?? null,
    event_id: txEvent?.event_id ?? null,
    payer_name_override: txEvent?.payer_name_override ?? null,
    event_remarks: txEvent?.remarks ?? null,
    organization_id,
    cycle_number,
    organization_version_id,
    org_version_id: tx.org_version_id ?? null,
  };
}

async function getUserIdByEmail(email?: string | null): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.tbl_user.findFirst({
    where: { email },
    select: { user_id: true },
  });
  if (!user) {
    throw new Error('User not found');
  }
  return user.user_id;
}

function parseNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseAmountOrNull(value: unknown): number | null {
  const n = parseNumberOrNull(value);
  return n == null ? null : Number(n.toFixed(2));
}

async function resolveOrgVersionId(organizationId?: number | null, cycleNumber?: number | null): Promise<number | null> {
  if (!organizationId || !cycleNumber) return null;
  const cycle = await prisma.tbl_renewal_cycle.findFirst({
    where: {
      organization_id: organizationId,
      cycle_number: cycleNumber,
    },
    select: { org_version_id: true },
  });
  return cycle?.org_version_id ?? null;
}

export async function resolveOrganizationVersionId(
  organizationId?: number | null,
  cycleNumber?: number | null,
): Promise<number | null> {
  if (!organizationId) return null;

  const fromCycle = await resolveOrgVersionId(organizationId, cycleNumber ?? null);
  if (fromCycle) return fromCycle;

  const latest = await prisma.tbl_organization_version.findFirst({
    where: {
      organization_id: organizationId,
      archived_at: null,
    },
    orderBy: { created_at: 'desc' },
    select: { org_version_id: true },
  });

  return latest?.org_version_id ?? null;
}

async function createAuditTrail(args: {
  transactionId: number;
  actionType: 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'UNARCHIVE' | 'COMPLETE';
  changedBy?: string | null;
  oldStatus?: 'Pending' | 'Completed' | 'Failed' | null;
  newStatus?: 'Pending' | 'Completed' | 'Failed' | null;
  oldAmount?: number | null;
  newAmount?: number | null;
  oldPaymentTypeId?: number | null;
  newPaymentTypeId?: number | null;
  oldCategoryId?: number | null;
  newCategoryId?: number | null;
  oldProofImage?: string | null;
  newProofImage?: string | null;
  reason?: string | null;
}) {
  await prisma.tbl_transaction_audit_trail.create({
    data: {
      transaction_id: args.transactionId,
      action_type: args.actionType,
      changed_by: args.changedBy ?? null,
      old_status: args.oldStatus ?? null,
      new_status: args.newStatus ?? null,
      old_amount: args.oldAmount ?? null,
      new_amount: args.newAmount ?? null,
      old_payment_type_id: args.oldPaymentTypeId ?? null,
      new_payment_type_id: args.newPaymentTypeId ?? null,
      old_category_id: args.oldCategoryId ?? null,
      new_category_id: args.newCategoryId ?? null,
      old_proof_image: args.oldProofImage ?? null,
      new_proof_image: args.newProofImage ?? null,
      reason: args.reason ?? null,
    },
  });
}

async function getTypeIdByCode(code?: string | null): Promise<number | null> {
  if (!code) return null;
  const canonical = toCanonicalType(code);
  const row = await prisma.tbl_transaction_type.upsert({
    where: { code: canonical },
    update: { label: canonicalTypeLabel(canonical) },
    create: { code: canonical, label: canonicalTypeLabel(canonical) },
    select: { transaction_type_id: true },
  });
  return row.transaction_type_id;
}

async function getCategoryIdByCode(code?: string | null): Promise<number | null> {
  if (!code) return null;
  const row = await prisma.tbl_financial_category.findFirst({
    where: { code },
    select: { category_id: true },
  });
  if (!row) {
    throw new Error('Category not found');
  }
  return row.category_id;
}

const txInclude = {
  tbl_payment_type: { select: { code: true, label: true, method_group: true } },
  tbl_transaction_type: { select: { code: true, label: true } },
  tbl_financial_category: { select: { code: true, label: true, kind: true } },
  tbl_user_tbl_transaction_user_idTotbl_user: { select: { email: true } },
  tbl_transaction_event: {
    select: {
      event_id: true,
      payer_name_override: true,
      remarks: true,
      tbl_event: { select: { organization_id: true, cycle_number: true } },
    },
  },
  tbl_transaction_membership: {
    select: {
      organization_id: true,
      cycle_number: true,
      tbl_renewal_cycle: { select: { org_version_id: true } },
    },
  },
} as const;

export async function createTransaction(data: Record<string, unknown>, proofImagePath: string | null) {
  const input = data as TransactionMutationInput;
  const userId = await getUserIdByEmail(input.user_email ?? null);

  const transactionTypeId = await getTypeIdByCode(input.transaction_type_code ?? null);
  if (!transactionTypeId) throw new Error('Transaction type is required');

  const paymentType = await prisma.tbl_payment_type.findFirst({
    where: { code: input.payment_type_code ?? undefined },
    select: { payment_type_id: true },
  });
  if (!paymentType) throw new Error('Payment type is required');

  const categoryId = await getCategoryIdByCode(input.category_code ?? null);

  const amount = parseAmountOrNull(input.amount);
  if (amount == null) throw new Error('Amount is required');

  const txDate = parseDateOrNull(input.transaction_date);
  if (!txDate) throw new Error('transaction_date is required');

  const resolvedOrgVersion =
    parseNumberOrNull(input.org_version_id) ??
    (await resolveOrgVersionId(parseNumberOrNull(input.organization_id), parseNumberOrNull(input.cycle_number)));

  const created = await prisma.tbl_transaction.create({
    data: {
      user_id: userId,
      payer_name: input.payer_name ?? null,
      payee_name: input.payee_name ?? null,
      payment_description: String(input.payment_description ?? '').trim(),
      amount,
      transaction_type_id: transactionTypeId,
      payment_type_id: paymentType.payment_type_id,
      category_id: categoryId,
      org_version_id: resolvedOrgVersion,
      status: normalizeStatus(input.status ?? 'Pending'),
      transaction_date: txDate,
      proof_image: proofImagePath,
      receipt_no: input.receipt_no ?? null,
      remarks: input.remarks ?? null,
    },
  });

  const eventId = parseNumberOrNull(input.event_id);
  if (eventId) {
    await prisma.tbl_transaction_event.create({
      data: {
        transaction_id: created.transaction_id,
        event_id: eventId,
        payer_name_override: input.payer_name_override ?? null,
        remarks: input.event_remarks ?? null,
      },
    });
  } else {
    const organizationId = parseNumberOrNull(input.organization_id);
    const cycleNumber = parseNumberOrNull(input.cycle_number);
    if (organizationId && cycleNumber) {
      await prisma.tbl_transaction_membership.create({
        data: {
          transaction_id: created.transaction_id,
          organization_id: organizationId,
          cycle_number: cycleNumber,
        },
      });
    }
  }

  await createAuditTrail({
    transactionId: created.transaction_id,
    actionType: 'CREATE',
    changedBy: userId,
    newStatus: normalizeStatus(created.status),
    newAmount: Number(created.amount),
    newPaymentTypeId: created.payment_type_id,
    newCategoryId: created.category_id ?? null,
    newProofImage: created.proof_image ?? null,
  });

  return getTransaction(created.transaction_id);
}

export async function updateTransaction(data: Record<string, unknown>) {
  const input = data as TransactionMutationInput;
  const txId = parseNumberOrNull(input.transaction_id);
  if (!txId) throw new Error('transaction_id required');

  const existing = await prisma.tbl_transaction.findUnique({
    where: { transaction_id: txId },
    include: txInclude,
  });
  if (!existing) throw new Error('Transaction not found');

  const actorUserId = await getUserIdByEmail(input.user_email ?? null);

  const nextTypeId = input.transaction_type_code
    ? await getTypeIdByCode(input.transaction_type_code)
    : existing.transaction_type_id;

  const nextPaymentTypeId = input.payment_type_code
    ? (
        await prisma.tbl_payment_type.findFirst({
          where: { code: input.payment_type_code },
          select: { payment_type_id: true },
        })
      )?.payment_type_id ?? existing.payment_type_id
    : existing.payment_type_id;

  const nextCategoryId = input.category_code
    ? await getCategoryIdByCode(input.category_code)
    : existing.category_id;

  const providedOrgId = parseNumberOrNull(input.organization_id);
  const providedCycle = parseNumberOrNull(input.cycle_number);
  const existingMembership = existing.tbl_transaction_membership;

  const effectiveOrgId = providedOrgId ?? existingMembership?.organization_id ?? null;
  const effectiveCycle = providedCycle ?? existingMembership?.cycle_number ?? null;

  const resolvedOrgVersion =
    parseNumberOrNull(input.org_version_id) ??
    existing.org_version_id ??
    (await resolveOrgVersionId(effectiveOrgId, effectiveCycle));

  const nextAmount = parseAmountOrNull(input.amount) ?? Number(existing.amount);
  const nextDate = parseDateOrNull(input.transaction_date) ?? existing.transaction_date;
  const nextStatus = input.status ? normalizeStatus(input.status) : normalizeStatus(existing.status);

  const nextProofImage =
    input.proof_image === undefined
      ? existing.proof_image
      : (input.proof_image as string | null);

  const normalizedReceiptNo =
    input.receipt_no === undefined
      ? existing.receipt_no
      : String(input.receipt_no ?? '').trim() || null;

  await prisma.tbl_transaction.update({
    where: { transaction_id: txId },
    data: {
      payer_name: input.payer_name ?? existing.payer_name,
      payee_name: input.payee_name ?? existing.payee_name,
      payment_description: input.payment_description ?? existing.payment_description,
      amount: nextAmount,
      transaction_type_id: nextTypeId ?? existing.transaction_type_id,
      payment_type_id: nextPaymentTypeId,
      category_id: nextCategoryId,
      org_version_id: resolvedOrgVersion,
      status: nextStatus,
      transaction_date: nextDate,
      proof_image: nextProofImage,
      receipt_no: normalizedReceiptNo,
      remarks: input.remarks ?? existing.remarks,
    },
  });

  const eventId = parseNumberOrNull((input as any).event_id);
  if (eventId || existing.tbl_transaction_event) {
    const effectiveEventId = eventId ?? existing.tbl_transaction_event?.event_id;
    if (effectiveEventId) {
      await prisma.tbl_transaction_event.upsert({
        where: { transaction_id: txId },
        update: {
          event_id: effectiveEventId,
          payer_name_override: input.payer_name_override ?? existing.tbl_transaction_event?.payer_name_override ?? null,
          remarks: input.event_remarks ?? existing.tbl_transaction_event?.remarks ?? null,
        },
        create: {
          transaction_id: txId,
          event_id: effectiveEventId,
          payer_name_override: input.payer_name_override ?? null,
          remarks: input.event_remarks ?? null,
        },
      });
      await prisma.tbl_transaction_membership.deleteMany({ where: { transaction_id: txId } });
    }
  } else if (effectiveOrgId && effectiveCycle) {
    await prisma.tbl_transaction_membership.upsert({
      where: { transaction_id: txId },
      update: {
        organization_id: effectiveOrgId,
        cycle_number: effectiveCycle,
      },
      create: {
        transaction_id: txId,
        organization_id: effectiveOrgId,
        cycle_number: effectiveCycle,
      },
    });
    await prisma.tbl_transaction_event.deleteMany({ where: { transaction_id: txId } });
  }

  await createAuditTrail({
    transactionId: txId,
    actionType: 'UPDATE',
    changedBy: actorUserId,
    oldStatus: normalizeStatus(existing.status),
    newStatus: nextStatus,
    oldAmount: Number(existing.amount),
    newAmount: nextAmount,
    oldPaymentTypeId: existing.payment_type_id,
    newPaymentTypeId: nextPaymentTypeId,
    oldCategoryId: existing.category_id ?? null,
    newCategoryId: nextCategoryId ?? null,
    oldProofImage: existing.proof_image ?? null,
    newProofImage: nextProofImage ?? null,
  });

  return getTransaction(txId);
}

export async function archiveTransaction(data: { transaction_id: number; user_email: string; reason?: string }) {
  const actor = await getUserIdByEmail(data.user_email);
  const existing = await prisma.tbl_transaction.findUnique({ where: { transaction_id: data.transaction_id } });
  if (!existing) throw new Error('Transaction not found');

  await prisma.tbl_transaction.update({
    where: { transaction_id: data.transaction_id },
    data: {
      archived_at: new Date(),
      archived_by: actor,
      archived_reason: data.reason ?? 'No reason provided',
    },
  });

  await createAuditTrail({
    transactionId: data.transaction_id,
    actionType: 'ARCHIVE',
    changedBy: actor,
    oldStatus: normalizeStatus(existing.status),
    newStatus: normalizeStatus(existing.status),
    reason: data.reason ?? 'No reason provided',
  });

  return getTransaction(data.transaction_id);
}

export async function unarchiveTransaction(data: { transaction_id: number; user_email: string }) {
  const actor = await getUserIdByEmail(data.user_email);
  const existing = await prisma.tbl_transaction.findUnique({ where: { transaction_id: data.transaction_id } });
  if (!existing) throw new Error('Transaction not found');

  await prisma.tbl_transaction.update({
    where: { transaction_id: data.transaction_id },
    data: {
      archived_at: null,
      archived_by: null,
      archived_reason: null,
    },
  });

  await createAuditTrail({
    transactionId: data.transaction_id,
    actionType: 'UNARCHIVE',
    changedBy: actor,
    oldStatus: normalizeStatus(existing.status),
    newStatus: normalizeStatus(existing.status),
  });

  return getTransaction(data.transaction_id);
}

export async function getTransaction(id: number) {
  const tx = await prisma.tbl_transaction.findUnique({
    where: { transaction_id: id },
    include: txInclude,
  });
  return tx ? mapTxRow(tx) : null;
}

export async function getTransactions(filters: TransactionFilters) {
  const userId = await getUserIdByEmail(filters.user_email ?? null);
  const transactionTypeId = await getTypeIdByCode(filters.transaction_type_code ?? null);
  const categoryId = await getCategoryIdByCode(filters.category_code ?? null);

  const where: any = {
    ...(filters.include_archived ? {} : { archived_at: null }),
    ...(userId ? { user_id: userId } : {}),
    ...(filters.status ? { status: normalizeStatus(filters.status) } : {}),
    ...(transactionTypeId ? { transaction_type_id: transactionTypeId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(filters.event_id ? { tbl_transaction_event: { is: { event_id: filters.event_id } } } : {}),
    ...(filters.organization_id
      ? {
          OR: [
            { tbl_transaction_membership: { is: { organization_id: filters.organization_id } } },
            { tbl_transaction_event: { is: { tbl_event: { is: { organization_id: filters.organization_id } } } } },
          ],
        }
      : {}),
  };

  const rows = await prisma.tbl_transaction.findMany({
    where,
    include: txInclude,
    orderBy: { created_at: 'desc' },
  });

  return rows.map(mapTxRow);
}

export async function getTransactionsByOrganization(organizationId: number) {
  const rows = await prisma.tbl_transaction.findMany({
    where: {
      OR: [
        { tbl_transaction_membership: { is: { organization_id: organizationId } } },
        { tbl_transaction_event: { is: { tbl_event: { is: { organization_id: organizationId } } } } },
      ],
    },
    include: txInclude,
    orderBy: { created_at: 'desc' },
  });

  return rows.map(mapTxRow);
}

export async function getTransactionTypes() {
  const canonical: CanonicalTransactionType[] = ['INCOME', 'EXPENSE'];

  // Ensure canonical rows exist in DB, even if legacy seed inserted non-canonical values.
  await Promise.all(
    canonical.map((code) =>
      prisma.tbl_transaction_type.upsert({
        where: { code },
        update: { label: canonicalTypeLabel(code) },
        create: { code, label: canonicalTypeLabel(code) },
      }),
    ),
  );

  return canonical.map((code) => ({
    transaction_type_id: null,
    code,
    label: canonicalTypeLabel(code),
  }));
}

export async function getPaymentTypes() {
  return prisma.tbl_payment_type.findMany({
    select: {
      payment_type_id: true,
      code: true,
      label: true,
      method_group: true,
    },
    orderBy: { label: 'asc' },
  });
}

export async function getFinancialCategories() {
  return prisma.tbl_financial_category.findMany({
    where: { active: true },
    select: {
      category_id: true,
      code: true,
      label: true,
      kind: true,
      parent_category_id: true,
      active: true,
    },
    orderBy: [{ kind: 'asc' }, { label: 'asc' }],
  });
}

export async function isOrganizationVersionOwnedBy(organizationId: number, organizationVersionId: number): Promise<boolean> {
  const row = await prisma.tbl_organization_version.findUnique({
    where: { org_version_id: organizationVersionId },
    select: { organization_id: true },
  });

  if (!row?.organization_id) return false;
  return Number(row.organization_id) === Number(organizationId);
}

export async function approveTransaction(data: {
  transaction_id: number;
  organization_id: number;
  organization_version_id?: number | null;
  category: string;
  user_email: string;
}) {
  const actor = await getUserIdByEmail(data.user_email);
  const existing = await prisma.tbl_transaction.findUnique({ where: { transaction_id: data.transaction_id } });
  if (!existing) throw new Error('Transaction not found');

  const action = String(data.category ?? '').trim().toUpperCase();
  const nextStatus = action === 'DISAPPROVE' ? 'Failed' : 'Completed';

  await prisma.tbl_transaction.update({
    where: { transaction_id: data.transaction_id },
    data: {
      status: nextStatus,
      ...(data.organization_version_id ? { org_version_id: data.organization_version_id } : {}),
    },
  });

  await createAuditTrail({
    transactionId: data.transaction_id,
    actionType: nextStatus === 'Completed' ? 'COMPLETE' : 'UPDATE',
    changedBy: actor,
    oldStatus: normalizeStatus(existing.status),
    newStatus: nextStatus,
  });

  return getTransaction(data.transaction_id);
}

export async function updateAttendance(transactionId: number, status: 'Registered' | 'Rejected' = 'Registered') {
  const tx = await prisma.tbl_transaction.findUnique({
    where: { transaction_id: transactionId },
    include: {
      tbl_transaction_event: {
        select: {
          event_id: true,
        },
      },
    },
  });

  if (!tx?.tbl_transaction_event || !tx.user_id) return [];

  await prisma.tbl_event_attendance.updateMany({
    where: {
      event_id: tx.tbl_transaction_event.event_id,
      user_id: tx.user_id,
    },
    data: {
      transaction_id: transactionId,
      status,
      updated_at: new Date(),
    },
  });

  return [];
}

export async function getTransactionAuditTrail(transactionId: number) {
  return prisma.tbl_transaction_audit_trail.findMany({
    where: { transaction_id: transactionId },
    include: {
      tbl_user: {
        select: {
          user_id: true,
          email: true,
          f_name: true,
          l_name: true,
        },
      },
    },
    orderBy: { changed_at: 'desc' },
  });
}

export async function getAllTransactionAudits(limit: number, offset: number) {
  return prisma.tbl_transaction_audit_trail.findMany({
    take: limit,
    skip: offset,
    include: {
      tbl_user: {
        select: {
          user_id: true,
          email: true,
          f_name: true,
          l_name: true,
        },
      },
      tbl_transaction: {
        select: {
          transaction_id: true,
          receipt_no: true,
          status: true,
        },
      },
    },
    orderBy: { changed_at: 'desc' },
  });
}
