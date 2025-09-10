const transactionModel = require('../models/transactionModel');
const { publishToChannel, subscribeToChannel } = require('./sseController');
const path = require('path');
const fs = require('fs');
const pool = require('../../config/db');

function unwrapSPResult(row) {
  if (row == null) return null;
  if (Array.isArray(row)) {
    // handle nested arrays from older model shapes
    if (Array.isArray(row[0])) return row[0][0] || null;
    return row[0] || null;
  }
  return row;
}

function sanitizeOrgId(orgId) {
  return String(orgId).replace(/[^0-9]/g, '');
}

async function create(req, res) {
  try {
    const {
      payer_name,
      payee_name,
      transaction_type_code,
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      receipt_no,
      category_code,
      event_id,
      payer_name_override,
      event_remarks,
      organization_id,
      cycle_number
    } = req.body;

    // Handle file upload (proof_image)
    let proofImagePath = null;
    if (req.files && req.files.proof_image) {
      const file = req.files.proof_image;
      const ext = path.extname(file.name).toLowerCase();

      console.log('Uploaded file extension:', ext);

      const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];
      if (!allowedExt.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type' });
      }

      let relPath, absPath;
      if (organization_id) {
        const safeOrgId = sanitizeOrgId(organization_id);
        if (!safeOrgId) return res.status(400).json({ message: 'Invalid organization_id' });
        const safeName = `proof-${Date.now()}${ext}`;
        const orgDir = path.join('/app/organizations', safeOrgId, 'transactions');
        if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
        absPath = path.join(orgDir, safeName);
        relPath = path.posix.join('organizations', safeOrgId, 'transactions', safeName);
      } else {
        // For SDAO/system users, store in a generic system directory
        const sysDir = path.join('/app/organizations', 'system', 'transactions');
        if (!fs.existsSync(sysDir)) fs.mkdirSync(sysDir, { recursive: true });
        const safeName = `proof-${Date.now()}${ext}`;
        absPath = path.join(sysDir, safeName);
        relPath = path.posix.join('organizations', 'system', 'transactions', safeName);
      }
      fs.writeFileSync(absPath, file.data);
      proofImagePath = relPath;
    }

    const txn = await transactionModel.createTransaction({
      user_email: req.user?.email || null,
      payer_name,
      payee_name,
      transaction_type_code,
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      receipt_no,
      category_code,
      event_id,
      payer_name_override,
      event_remarks,
      organization_id,
      cycle_number
    }, proofImagePath);

    publishToChannel('transactions', { type: 'created', data: txn });
    if (txn && txn.transaction_id) {
      publishToChannel(`transactions:${txn.transaction_id}`, { type: 'created', data: txn });
    }

    res.status(201).json(txn);
  } catch (e) {
    console.error('[transactions.create]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

// controllers/transactions.js (update)
async function update(req, res) {
  try {
    const {
      transaction_id,
      payment_description,
      amount,
      status,
      proof_image,            // explicit path (optional)
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks,
      organization_id,        // preferred for pathing when uploading a new file
      remove_proof_image      // flag to remove existing file+db (true/1/'true')
    } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ message: 'transaction_id required' });
    }

    // ---- helpers (same behavior as create) ----
    const sanitizeOrgId = (id) => {
      if (id === null || id === undefined) return null;
      
      // Convert to string and trim
      let s = String(id).trim();
      
      // If it's already a clean number, return it
      if (/^\d+$/.test(s)) {
        return s;
      }
      
      // Extract only digits
      const digits = s.replace(/[^0-9]/g, '');
      
      // Return null if no digits found, otherwise return the first numeric part
      if (!digits.length) return null;
      
      // Take only the first sequence of digits to prevent concatenation
      const firstNumber = digits.match(/^\d+/);
      return firstNumber ? firstNumber[0] : null;
    };

    const buildOrgTxnPaths = (safeOrgId, filename) => {
      if (safeOrgId) {
        const dir = path.join('/app/organizations', safeOrgId, 'transactions');
        const rel = path.posix.join('organizations', safeOrgId, 'transactions', filename);
        return { absDir: dir, relPath: rel, absPath: path.join(dir, filename) };
      } else {
        const dir = path.join('/app/organizations', 'system', 'transactions');
        const rel = path.posix.join('organizations', 'system', 'transactions', filename);
        return { absDir: dir, relPath: rel, absPath: path.join(dir, filename) };
      }
    };

    // ---- fetch existing transaction (for current image & deriving org) ----
    let current = { proof_image: null };
    let derivedOrgId = null;
    try {
      const conn = await pool.getConnection();
      try {
        const [curRows] = await conn.query(
          'SELECT proof_image FROM tbl_transaction WHERE transaction_id = ?',
          [transaction_id]
        );
        if (curRows.length) current = curRows[0];

        // derive org_id if not provided:
        if (!organization_id) {
          // 1) membership link
          const [mRows] = await conn.query(
            'SELECT organization_id FROM tbl_transaction_membership WHERE transaction_id = ? LIMIT 1',
            [transaction_id]
          );
          if (mRows.length && mRows[0].organization_id != null) {
            derivedOrgId = mRows[0].organization_id;
          } else {
            // 2) event link → event org
            const [eRows] = await conn.query(
              `SELECT e.organization_id
                 FROM tbl_transaction_event te
                 JOIN tbl_event e ON e.event_id = te.event_id
                WHERE te.transaction_id = ? LIMIT 1`,
              [transaction_id]
            );
            if (eRows.length && eRows[0].organization_id != null) {
              derivedOrgId = eRows[0].organization_id;
            }
          }
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      console.warn('[transactions.update] Could not fetch current/derive org:', err.message);
    }

    // choose org for STORAGE (same as create)
    const chosenOrgId = organization_id ?? derivedOrgId ?? null;
    const safeOrgId = sanitizeOrgId(chosenOrgId);

    // ----- FILE HANDLING (KEEP / REPLACE / REMOVE) -----
    let proofImagePath = undefined; // undefined => "no change" to DB
    const removeFlag =
      remove_proof_image === true ||
      remove_proof_image === 1 ||
      remove_proof_image === '1' ||
      (typeof remove_proof_image === 'string' && remove_proof_image.toLowerCase() === 'true');

    // REPLACE: new upload takes priority
    if (req.files && req.files.proof_image) {
      const file = req.files.proof_image;
      const ext = path.extname(file.name).toLowerCase().trim();
      const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];

      if (!allowedExt.includes(ext)) {
        return res.status(400).json({
          message: 'Invalid file type. Allowed: jpg, jpeg, png, gif, pdf, webp',
        });
      }

      // delete old first (best-effort)
      if (current?.proof_image) {
        try {
          const oldFilePath = path.join('/app', current.proof_image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log('[transactions.update] Removed old proof image:', oldFilePath);
          }
        } catch (deleteErr) {
          console.warn('[transactions.update] Failed to delete old proof image:', deleteErr.message);
        }
      }

      // save new using the SAME directory logic as "create"
      const filename = `proof-${Date.now()}${ext}`;
      const { absDir, absPath, relPath } = buildOrgTxnPaths(safeOrgId, filename);
      try {
        if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
        fs.writeFileSync(absPath, file.data);
        proofImagePath = relPath;
        console.log('[transactions.update] Saved new proof image:', absPath);
      } catch (saveErr) {
        console.error('[transactions.update] Failed to save uploaded file:', saveErr);
        return res.status(500).json({ message: 'Failed to save uploaded file' });
      }
    }
    // REMOVE: explicit request
    else if (removeFlag) {
      if (current?.proof_image) {
        try {
          const oldFilePath = path.join('/app', current.proof_image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log('[transactions.update] Removed proof image per request:', oldFilePath);
          }
        } catch (deleteErr) {
          console.warn('[transactions.update] Failed to delete proof image:', deleteErr.message);
        }
      }
      proofImagePath = null; // set column to NULL
    }
    // KEEP / CHANGE-BY-PATH: client provided a path string explicitly
    else if (proof_image !== undefined && proof_image !== null) {
      // if changed, delete the previous file
      if (current?.proof_image && current.proof_image !== proof_image) {
        try {
          const oldFilePath = path.join('/app', current.proof_image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log('[transactions.update] Removed old proof image (path changed):', oldFilePath);
          }
        } catch (deleteErr) {
          console.warn('[transactions.update] Failed to delete old proof image:', deleteErr.message);
        }
      }
      // trust the provided path (e.g., moving between orgs is out-of-scope here)
      proofImagePath = proof_image;
    }
    // else: no change

    console.log('[transactions.update] Proof image handling:', {
      orgForStorage: safeOrgId ?? 'system',
      hasNewFile: !!(req.files && req.files.proof_image),
      removeRequested: removeFlag,
      proofImageFromBody: proof_image,
      finalProofImagePath: proofImagePath,
      currentProofImage: current?.proof_image,
    });

    // Execute SP (tri-state handled in proc with removeFlag + p_proof_image)
    const raw = await transactionModel.updateTransaction({
      transaction_id,
      user_email: req.user.email,
      payment_description,
      amount,
      status,
      proof_image: proofImagePath ?? null, // null/''/path → proc decides with removeFlag
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks,
      remove_proof_image: removeFlag,
    });

    const payload = unwrapSPResult(raw);

    // Publish real-time update
    try {
      publishToChannel('transactions', {
        operation: 'UPDATE',
        data: payload,
        user: req.user?.email || null,
        timestamp: new Date(),
      });
      if (payload?.transaction_id) {
        publishToChannel(`transactions:${payload.transaction_id}`, {
          operation: 'UPDATE',
          data: payload,
          user: req.user?.email || null,
          timestamp: new Date(),
        });
      }
    } catch (pubErr) {
      console.warn('[transactions.update] publish error:', pubErr.message);
    }

    return res.json(payload);
  } catch (e) {
    console.error('[transactions.update]', e);
    return res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function archive(req,res){
  try{
    const { transaction_id, reason } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });
    const raw = await transactionModel.archiveTransaction({
      transaction_id,
      user_email: req.user.email,
      reason
    });

    const payload = unwrapSPResult(raw);

    // Publish real-time event
    try {
      publishToChannel('transactions', {
        operation: 'ARCHIVE',
        data: payload,
        user: req.user?.email || null,
        timestamp: new Date()
      });
    } catch (pubErr) {
      console.warn('[transactions.archive] publish error:', pubErr.message);
    }

    res.json(payload);
  } catch(e){
    console.error('[transactions.archive]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function unarchive(req,res){
  try{
    const { transaction_id } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });
    const raw = await transactionModel.unarchiveTransaction({
      transaction_id,
      user_email: req.user.email
    });

    const payload = unwrapSPResult(raw);

    // Publish real-time event
    try {
      publishToChannel('transactions', {
        operation: 'UNARCHIVE',
        data: payload,
        user: req.user?.email || null,
        timestamp: new Date()
      });
    } catch (pubErr) {
      console.warn('[transactions.unarchive] publish error:', pubErr.message);
    }

    res.json(payload);
  } catch(e){
    console.error('[transactions.unarchive]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getOne(req,res){
  try{
    const { id } = req.params;
    const row = await transactionModel.getTransaction(id);
    if(!row) return res.status(404).json({ message:'Not found' });

    // Optionally subscribe to updates for this resource
    const { sessionId } = req.query;
    if (sessionId) {
      subscribeToChannel(sessionId, `transactions:${id}`);
    }

    res.json(row);
  } catch(e){
    console.error('[transactions.getOne]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function list(req,res){
  try{
    const {
      email,
      status,
      include_archived,
      event_id,
      organization_id,
      transaction_type_code,
      category_code,
      sessionId
    } = req.query;

    // Allow client to subscribe to general transactions channel
    if (sessionId) {
      subscribeToChannel(sessionId, 'transactions');
    }

    const rows = await transactionModel.getTransactions({
      user_email: email || null,
      status: status || null,
      include_archived: include_archived === 'true',
      event_id: event_id ? Number(event_id) : null,
      organization_id: organization_id ? Number(organization_id) : null,
      transaction_type_code: transaction_type_code || null,
      category_code: category_code || null
    });
    res.json(rows);
  } catch(e){
    console.error('[transactions.list]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getTransactionTypes(req,res){
  try{
    const rows = await transactionModel.getTransactionTypes();
    res.json(rows);
  } catch(e){
    console.error('[transactions.getTransactionTypes]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getPaymentTypes(req,res){
  try{
    const rows = await transactionModel.getPaymentTypes();
    res.json(rows);
  } catch(e){
    console.error('[transactions.getPaymentTypes]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getFinancialCategories(req,res){
  try{
    const rows = await transactionModel.getFinancialCategories();
    res.json(rows);
  } catch(e){
    console.error('[transactions.getFinancialCategories]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getTransactionFile(req, res) {
  try {
    const { organization_id, filename } = req.params;

    if (!organization_id || !filename) {
      return res.status(400).json({ message: 'Organization ID and filename are required' });
    }

    // Security: validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    let protectedPath;
    if (organization_id === 'system') {
      // SDAO/system files
      protectedPath = `/protected-transactions/system/transactions/${filename}`;
    } else {
      // Regular organization files
      protectedPath = `/protected-transactions/${organization_id}/transactions/${filename}`;
    }

    res.set('X-Accel-Redirect', protectedPath);
    res.end();
  } catch (e) {
    console.error('[transactions.getTransactionFile]', e);
    res.status(500).json({ message: e.message });
  }
}

async function getTransactionsByOrganization(req, res) {
  try {
    const { organization_id } = req.params;
    const { sessionId } = req.query;

    if (!organization_id) {
      return res.status(400).json({ message: 'Organization ID is required' });
    }

    // Subscribe to real-time updates for this organization's transactions
    if (sessionId) {
      subscribeToChannel(sessionId, `transactions:organization:${organization_id}`);
    }

    const rows = await transactionModel.getTransactionsByOrganization(organization_id);
    res.json(rows);
  } catch (e) {
    console.error('[transactions.getTransactionsByOrganization]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

module.exports = {
  create,
  update,
  archive,
  unarchive,
  getOne,
  list,
  getPaymentTypes,
  getFinancialCategories,
  getTransactionTypes,
  getTransactionFile,
  getTransactionsByOrganization
};