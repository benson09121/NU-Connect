import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import type { UploadedFile } from 'express-fileupload';
import * as model from '../models/transactionsModel';
import { storage } from '../../config/storage';
import { broadcastToUser } from '../../services/websocketService';
import { notify, logActivity } from '../../services/notificationAndLogService';
const qrVerificationService = require('../../services/qrVerificationService');

function txBaseDir(): string {
  const base = process.env.STORAGE_BASE_PATH ?? path.resolve(__dirname, '..', '..', 'nuconnect-files');
  return path.join(base, 'organizations');
}

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(v: unknown): 'Pending' | 'Completed' | 'Failed' {
  const s = String(v ?? '').trim();
  if (s === 'Completed') return 'Completed';
  if (s === 'Failed') return 'Failed';
  return 'Pending';
}

function mapTransactionRow(row: any) {
  if (!row) return row;
  return {
    transaction_id: row.transaction_id,
    organization_id: row.organization_id ?? null,
    organization_version_id: row.organization_version_id ?? row.org_version_id ?? null,
    transaction_type_code: row.transaction_type_code ?? null,
    payment_type_code: row.payment_type_code ?? null,
    payment_type_label: row.payment_type_label ?? null,
    payment_description: row.payment_description ?? null,
    amount: row.amount != null ? Number(row.amount) : null,
    status: normalizeStatus(row.status),
    transaction_date: row.transaction_date ?? null,
    receipt_no: row.receipt_no ?? null,
    payer_name: row.payer_name ?? null,
    payee_name: row.payee_name ?? null,
    proof_image: row.proof_image ?? null,
    qr_token: row.qr_token ?? null,
    qr_enabled: row.qr_enabled ?? null,
    expense_category: row.expense_category ?? row.category_code ?? null,
    remarks: row.remarks ?? row.event_remarks ?? null,
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    category_code: row.category_code ?? null,
    category_label: row.category_label ?? null,
    category_kind: row.category_kind ?? null,
    cycle_number: row.cycle_number ?? null,
    event_id: row.event_id ?? null,
  };
}

function mapPaymentType(row: any) {
  return {
    payment_type_code: row.payment_type_code ?? row.code ?? null,
    payment_type_label: row.payment_type_label ?? row.label ?? null,
    method_group: row.method_group ?? null,
  };
}

function mapTransactionType(row: any) {
  return {
    transaction_type_code: row.transaction_type_code ?? row.code ?? null,
    transaction_type_label: row.transaction_type_label ?? row.label ?? null,
  };
}

function mapCategory(row: any) {
  return {
    category_code: row.category_code ?? row.code ?? null,
    category_label: row.category_label ?? row.label ?? null,
    kind: row.kind ?? row.category_kind ?? null,
  };
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)),
  ) as T;
}

function toProofMetadata(row: any, uploaded: boolean) {
  const proof = typeof row?.proof_image === 'string' ? row.proof_image : null;
  return {
    proof_image: proof,
    proof_image_filename: proof ? path.basename(proof) : null,
    proof_image_uploaded: uploaded,
  };
}

function removeStoredRelativePath(relativePath?: string | null): void {
  if (!relativePath) return;
  const base = process.env.STORAGE_BASE_PATH ?? path.resolve(__dirname, '..', '..', 'nuconnect-files');
  const absolutePath = path.resolve(base, relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

function saveProofImage(file: UploadedFile, organizationId?: number | null, organizationVersionId?: number | null): string {
  const ext = path.extname(file.name).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];
  if (!allowed.includes(ext)) throw new Error('Invalid file type');

  const safeName = `proof-${Date.now()}${ext}`;
  const orgToken = organizationId ? String(organizationId) : 'system';
  const versionToken = organizationVersionId ? String(organizationVersionId) : 'transactions';
  const dir = organizationId && organizationVersionId
    ? path.join(txBaseDir(), orgToken, versionToken, 'transactions')
    : path.join(txBaseDir(), 'system', 'transactions');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, safeName);
  fs.writeFileSync(abs, file.data);

  if (organizationId && organizationVersionId) {
    return path.posix.join('organizations', orgToken, versionToken, 'transactions', safeName);
  }
  return path.posix.join('organizations', 'system', 'transactions', safeName);
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const rows = await model.getTransactions({
      user_email: (req.query.email as string) || null,
      status: (req.query.status as string) || null,
      include_archived: String(req.query.include_archived ?? '') === 'true',
      event_id: toNum(req.query.event_id),
      organization_id: toNum(req.query.organization_id),
      transaction_type_code: (req.query.transaction_type_code as string) || null,
      category_code: (req.query.category_code as string) || null,
    });

    res.status(200).json(Array.isArray(rows) ? rows.map(mapTransactionRow) : []);
  } catch (error: any) {
    console.error('[transactions.list] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch transactions' });
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'id is required' });
      return;
    }
    const row = await model.getTransaction(id);
    if (!row) {
      res.status(404).json({ message: 'Not found' });
      return;
    }
    res.status(200).json(mapTransactionRow(row));
  } catch (error: any) {
    console.error('[transactions.getOne] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch transaction' });
  }
}

export async function getTransactionsByOrganization(req: Request, res: Response): Promise<void> {
  try {
    const orgId = Number(req.params.organization_id);
    const versionId = Number(req.params.organization_version_id);
    if (!orgId) {
      res.status(400).json({ message: 'organization_id is required' });
      return;
    }

    const rows = await model.getTransactionsByOrganization(orgId);
    let mapped = Array.isArray(rows) ? rows.map(mapTransactionRow) : [];

    // Deterministic org-version scoping for TanStack contract.
    if (versionId) {
      mapped = mapped.filter((r: any) => Number(r.organization_version_id) === versionId);
    }

    res.status(200).json(mapped);
  } catch (error: any) {
    console.error('[transactions.getTransactionsByOrganization] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch organization transactions' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  let savedProofImagePath: string | null = null;
  let qrTokenGenerated = false;
  try {
    const organizationId = toNum(req.body.organization_id);
    const organizationVersionIdInput = toNum(req.body.organization_version_id);
    const cycleNumber = toNum(req.body.cycle_number);
    const resolvedOrganizationVersionId =
      organizationVersionIdInput ??
      (await model.resolveOrganizationVersionId(organizationId, cycleNumber));

    let proofImagePath: string | null = null;
    const uploaded = req.files?.proof_image as UploadedFile | UploadedFile[] | undefined;
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (file) {
      if (!organizationId || !resolvedOrganizationVersionId) {
        res.status(400).json({
          message: 'Unable to resolve organization_version_id for uploaded proof_image',
          organization_id: organizationId,
          organization_version_id: organizationVersionIdInput,
          resolved_organization_version_id: resolvedOrganizationVersionId,
        });
        return;
      }

      const validBinding = await model.isOrganizationVersionOwnedBy(organizationId, resolvedOrganizationVersionId);
      if (!validBinding) {
        res.status(400).json({
          message: 'organization_version_id does not belong to organization_id',
          organization_id: organizationId,
          organization_version_id: resolvedOrganizationVersionId,
        });
        return;
      }

      proofImagePath = saveProofImage(file, organizationId, resolvedOrganizationVersionId);
      savedProofImagePath = proofImagePath;
    }

    const created = await model.createTransaction(
      {
        user_email: req.user?.email || null,
        payer_name: req.body.payer_name ?? null,
        payee_name: req.body.payee_name ?? null,
        transaction_type_code: req.body.transaction_type_code,
        payment_type_code: req.body.payment_type_code,
        payment_description: req.body.payment_description,
        amount: req.body.amount,
        status: req.body.status,
        transaction_date: req.body.transaction_date,
        receipt_no: req.body.receipt_no ?? null,
        category_code: req.body.category_code ?? null,
        event_id: toNum(req.body.event_id),
        payer_name_override: req.body.payer_name_override ?? null,
        event_remarks: req.body.event_remarks ?? null,
        organization_id: organizationId,
        cycle_number: cycleNumber,
        org_version_id: resolvedOrganizationVersionId,
        remarks: req.body.remarks ?? null,
      },
      proofImagePath,
    );

    try {
      await qrVerificationService.generateVerificationToken(
        created,
        req.user?.user_id || req.user?.email || null,
      );
      qrTokenGenerated = true;
    } catch (qrError: any) {
      console.error('[transactions.create] QR auto-generation failed:', qrError);
    }

    const refreshed = await model.getTransaction(Number((created as any)?.transaction_id));
    const payload = mapTransactionRow(refreshed || created);
    res.status(201).json({
      ...payload,
      ...toProofMetadata(payload, Boolean(file)),
      qr_token_generated: qrTokenGenerated,
    });
  } catch (error: any) {
    try {
      removeStoredRelativePath(savedProofImagePath);
    } catch {}
    console.error('[transactions.create] Error:', error);
    const msg = error?.sqlMessage || error?.message || 'Failed to create transaction';
    res.status(500).json({ message: msg });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  let savedProofImagePath: string | null = null;
  try {
    const transactionId = toNum(req.body.transaction_id);
    if (!transactionId) {
      res.status(400).json({ message: 'transaction_id required' });
      return;
    }

    const current = await model.getTransaction(transactionId);
    if (!current) {
      res.status(404).json({ message: 'Transaction not found' });
      return;
    }

    const organizationId = toNum(req.body.organization_id) ?? toNum(current.organization_id);
    const organizationVersionIdInput = toNum(req.body.organization_version_id);
    const cycleNumber = toNum(req.body.cycle_number ?? current.cycle_number);
    const organizationVersionId =
      organizationVersionIdInput ??
      toNum(current.organization_version_id ?? current.org_version_id) ??
      (await model.resolveOrganizationVersionId(organizationId, cycleNumber));

    const removeFlag =
      req.body.remove_proof_image === true ||
      req.body.remove_proof_image === 1 ||
      req.body.remove_proof_image === '1' ||
      String(req.body.remove_proof_image ?? '').toLowerCase() === 'true';

    let proofImagePath: string | null = typeof current.proof_image === 'string' ? current.proof_image : null;
    const uploaded = req.files?.proof_image as UploadedFile | UploadedFile[] | undefined;
    const file = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (file) {
      if (!organizationId || !organizationVersionId) {
        res.status(400).json({
          message: 'Unable to resolve organization_version_id for uploaded proof_image',
          transaction_id: transactionId,
          organization_id: organizationId,
          organization_version_id: organizationVersionIdInput,
          resolved_organization_version_id: organizationVersionId,
        });
        return;
      }

      const validBinding = await model.isOrganizationVersionOwnedBy(organizationId, organizationVersionId);
      if (!validBinding) {
        res.status(400).json({
          message: 'organization_version_id does not belong to organization_id',
          transaction_id: transactionId,
          organization_id: organizationId,
          organization_version_id: organizationVersionId,
        });
        return;
      }

      if (current.organization_id && Number(current.organization_id) !== Number(organizationId)) {
        res.status(400).json({
          message: 'organization_id does not match transaction ownership',
          transaction_id: transactionId,
          expected_organization_id: current.organization_id,
          provided_organization_id: organizationId,
        });
        return;
      }

      if (current.organization_version_id && Number(current.organization_version_id) !== Number(organizationVersionId)) {
        res.status(400).json({
          message: 'organization_version_id does not match transaction ownership',
          transaction_id: transactionId,
          expected_organization_version_id: current.organization_version_id,
          provided_organization_version_id: organizationVersionId,
        });
        return;
      }

      proofImagePath = saveProofImage(file, organizationId, organizationVersionId);
      savedProofImagePath = proofImagePath;
    } else if (removeFlag) {
      proofImagePath = null;
    } else if (req.body.proof_image !== undefined) {
      proofImagePath = req.body.proof_image || null;
    }

    const raw = await model.updateTransaction({
      transaction_id: transactionId,
      user_email: req.user?.email,
      payer_name: req.body.payer_name ?? null,
      payee_name: req.body.payee_name ?? null,
      transaction_type_code: req.body.transaction_type_code ?? null,
      payment_type_code: req.body.payment_type_code ?? null,
      payment_description: req.body.payment_description ?? null,
      amount: req.body.amount ?? null,
      status: req.body.status ?? null,
      transaction_date: req.body.transaction_date ?? null,
      proof_image: proofImagePath,
      receipt_no: req.body.receipt_no ?? null,
      category_code: req.body.category_code ?? null,
      payer_name_override: req.body.payer_name_override ?? null,
      event_remarks: req.body.event_remarks ?? null,
      organization_id: organizationId,
      cycle_number: toNum(req.body.cycle_number),
      org_version_id: organizationVersionId,
      remove_proof_image: removeFlag,
      remarks: req.body.remarks ?? null,
    });

    const payload = Array.isArray(raw) ? (Array.isArray(raw[0]) ? raw[0][0] : raw[0]) : raw;
    const mapped = mapTransactionRow(payload);
    res.status(200).json({
      ...mapped,
      ...toProofMetadata(mapped, Boolean(file)),
    });
  } catch (error: any) {
    try {
      removeStoredRelativePath(savedProofImagePath);
    } catch {}
    console.error('[transactions.update] Error:', error);
    if (error?.code === 'P2002') {
      res.status(409).json({
        message: 'Duplicate receipt number. Provide a unique receipt_no or leave it blank.',
        field: 'receipt_no',
      });
      return;
    }
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to update transaction' });
  }
}

export async function archive(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = toNum(req.body.transaction_id);
    if (!transactionId) {
      res.status(400).json({ message: 'transaction_id required' });
      return;
    }

    const row = await model.archiveTransaction({
      transaction_id: transactionId,
      user_email: String(req.user?.email ?? ''),
      reason: String(req.body.reason ?? 'No reason provided'),
    });

    res.status(200).json(mapTransactionRow(row));
  } catch (error: any) {
    console.error('[transactions.archive] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to archive transaction' });
  }
}

export async function unarchive(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = toNum(req.body.transaction_id);
    if (!transactionId) {
      res.status(400).json({ message: 'transaction_id required' });
      return;
    }

    const row = await model.unarchiveTransaction({
      transaction_id: transactionId,
      user_email: String(req.user?.email ?? ''),
    });

    res.status(200).json(mapTransactionRow(row));
  } catch (error: any) {
    console.error('[transactions.unarchive] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to unarchive transaction' });
  }
}

export async function getPaymentTypes(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await model.getPaymentTypes();
    res.status(200).json(Array.isArray(rows) ? rows.map(mapPaymentType) : []);
  } catch (error: any) {
    console.error('[transactions.getPaymentTypes] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch payment types' });
  }
}

export async function getTransactionTypes(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await model.getTransactionTypes();
    res.status(200).json(Array.isArray(rows) ? rows.map(mapTransactionType) : []);
  } catch (error: any) {
    console.error('[transactions.getTransactionTypes] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch transaction types' });
  }
}

export async function getFinancialCategories(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await model.getFinancialCategories();
    res.status(200).json(Array.isArray(rows) ? rows.map(mapCategory) : []);
  } catch (error: any) {
    console.error('[transactions.getFinancialCategories] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch financial categories' });
  }
}

export async function getTransactionFile(req: Request, res: Response): Promise<void> {
  try {
    const { organization_id, organization_version_id, filename } = req.params;
    if (!organization_id || !organization_version_id) {
      res.status(400).json({ message: 'Organization ID and organization version ID are required' });
      return;
    }

    const queryPath = typeof req.query.path === 'string' ? req.query.path : null;
    const encodedInput = queryPath ?? filename ?? '';
    const decodedInput = decodeURIComponent(String(encodedInput));
    const safeFilename = path.basename(decodedInput);

    const expectedPrefix = organization_id === 'system'
      ? 'organizations/system/transactions/'
      : `organizations/${organization_id}/${organization_version_id}/transactions/`;

    const normalizedDecoded = decodedInput.replace(/^\/+/, '');
    const candidatePaths = [
      normalizedDecoded.startsWith('organizations/') ? normalizedDecoded : null,
      normalizedDecoded.includes('/transactions/') ? normalizedDecoded : null,
      `${expectedPrefix}${safeFilename}`,
    ].filter(Boolean) as string[];

    const uniqueCandidates = Array.from(new Set(candidatePaths));

    const outOfScope = uniqueCandidates.some((p) => !p.startsWith(expectedPrefix));
    if (outOfScope && organization_id !== 'system') {
      res.status(403).json({
        message: 'Forbidden file path for organization/version scope',
        organization_id,
        organization_version_id,
        expected_prefix: expectedPrefix,
        attempted_paths: uniqueCandidates,
      });
      return;
    }

    let file: any = null;
    let resolvedPath: string | null = null;
    for (const candidate of uniqueCandidates) {
      try {
        file = await storage.resolve(candidate);
        resolvedPath = candidate;
        break;
      } catch {
        continue;
      }
    }

    if (!file || !resolvedPath) {
      res.status(404).json({
        message: 'File not found',
        organization_id,
        organization_version_id,
        expected_prefix: expectedPrefix,
        attempted_paths: uniqueCandidates,
      });
      return;
    }

    if (file.type === 'local') {
      res.sendFile(file.absolutePath);
    } else {
      res.redirect(302, file.url);
    }
  } catch (error: any) {
    console.error('[transactions.getTransactionFile] Error:', error);
    res.status(500).json({ message: error?.message || 'Failed to fetch transaction file' });
  }
}

export async function approveTransaction(req: Request, res: Response): Promise<void> {
  try {
    const transactionId = toNum(req.body.transaction_id);
    const orgId = toNum(req.body.organization_id);
    const orgVersionId = toNum(req.body.organization_version_id);
    const category = String(req.body.category ?? '').trim().toUpperCase();

    if (!transactionId || !orgId || !category) {
      res.status(400).json({ message: 'Missing required fields: transaction_id, organization_id, category' });
      return;
    }

    if (!['APPROVE', 'DISAPPROVE'].includes(category)) {
      res.status(400).json({ message: 'category must be APPROVE or DISAPPROVE' });
      return;
    }

    const row = await model.approveTransaction({
      transaction_id: transactionId,
      organization_id: orgId,
      organization_version_id: orgVersionId,
      category,
      user_email: String(req.user?.email ?? ''),
    });

    const isApproved = category === 'APPROVE';

    if ((row as any)?.event_id) {
      try {
        await model.updateAttendance(transactionId, isApproved ? 'Registered' : 'Rejected');
      } catch (_) {}

      try {
        const mapped = mapTransactionRow(row as any);
        const payload = {
          eventId: Number((row as any)?.event_id),
          transactionId,
          studentStatus: isApproved ? 'Registered' : 'Rejected',
          paymentStatus: mapped.status,
          updatedAt: new Date().toISOString(),
        };

        const targetUserId = String((row as any)?.user_email || (row as any)?.user_id || '').trim();
        const targetAppUserId = String((row as any)?.user_id || '').trim();

        if (targetUserId) {
          broadcastToUser(targetUserId, 'events:payment-status:changed', payload);
          broadcastToUser(targetUserId, 'events:registration:changed', {
            operation: 'PAYMENT_STATUS_UPDATED',
            event_id: Number((row as any)?.event_id),
            user_id: targetUserId,
            status: payload.studentStatus,
            transaction_id: transactionId,
          });
        }

        if (targetAppUserId && targetAppUserId !== 'undefined' && targetAppUserId !== 'null') {
          await notify({
            recipientIds: [targetAppUserId],
            title: isApproved ? 'Payment Approved' : 'Payment Disapproved',
            message: isApproved 
              ? `Your payment for the event has been approved. You are now registered and can view your ticket.`
              : `Your payment for the event was disapproved. Please check with the organization.`,
            type: 'event_payment',
            entityType: 'event',
            entityId: Number((row as any)?.event_id)
          });
        }
      } catch (emitErr: any) {
        console.warn('[transactions.approve] websocket emit skipped:', emitErr?.message || emitErr);
      }
    }

    const message = category === 'DISAPPROVE'
      ? 'Transaction disapproved successfully'
      : 'Transaction approved successfully';

    res.status(200).json({ success: true, message, data: mapTransactionRow(row) });
  } catch (error: any) {
    console.error('[transactions.approve] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to approve transaction' });
  }
}

export async function getTransactionAuditTrail(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ message: 'transaction_id required' });
      return;
    }
    const rows = await model.getTransactionAuditTrail(id);
    res.status(200).json(toJsonSafe(Array.isArray(rows) ? rows : []));
  } catch (error: any) {
    console.error('[transactions.getTransactionAuditTrail] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch transaction audit trail' });
  }
}

export async function getAllTransactionAudits(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const rows = await model.getAllTransactionAudits(limit, offset);
    res.status(200).json(toJsonSafe(Array.isArray(rows) ? rows : []));
  } catch (error: any) {
    console.error('[transactions.getAllTransactionAudits] Error:', error);
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to fetch transaction audits' });
  }
}
