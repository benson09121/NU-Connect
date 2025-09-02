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

async function update(req, res) {
  try {
    const {
      transaction_id,
      payment_description,
      amount,
      status,
      proof_image, // may be a string path or undefined
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks,
      organization_id, // needed for file path if uploading new file
      remove_proof_image // flag to indicate if proof image should be removed
    } = req.body;

    if (!transaction_id) return res.status(400).json({ message: 'transaction_id required' });

    // Fetch current transaction for existing proof_image path
    let currentTransaction = null;
    try {
      const conn = await pool.getConnection();
      try {
        const [currentRows] = await conn.query(
          'SELECT proof_image FROM tbl_transaction WHERE transaction_id = ?',
          [transaction_id]
        );
        if (currentRows.length > 0) {
          currentTransaction = currentRows[0];
        }
      } finally {
        conn.release();
      }
    } catch (err) {
      console.warn('Could not fetch current transaction:', err.message);
    }

    // Handle file upload and removal logic
    let proofImagePath = proof_image ?? null; // default to provided value

    // Remove proof image if requested
    if (remove_proof_image === true || remove_proof_image === 'true') {
      if (currentTransaction?.proof_image) {
        try {
          const oldFilePath = path.join('/app', currentTransaction.proof_image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log('Removed old proof image:', oldFilePath);
          }
        } catch (deleteErr) {
          console.warn('Failed to delete old proof image:', deleteErr.message);
        }
      }
      proofImagePath = null;
    }
    // If new file is uploaded, handle upload and remove old file
    else if (req.files && req.files.proof_image) {
      const file = req.files.proof_image;
      const ext = path.extname(file.name).toLowerCase().trim();
      const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];
      if (!allowedExt.includes(ext)) {
        return res.status(400).json({ message: 'Invalid file type. Allowed: jpg, jpeg, png, gif, pdf, webp' });
      }

      // Remove old file if it exists
      if (currentTransaction?.proof_image) {
        try {
          const oldFilePath = path.join('/app', currentTransaction.proof_image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log('Removed old proof image:', oldFilePath);
          }
        } catch (deleteErr) {
          console.warn('Failed to delete old proof image:', deleteErr.message);
        }
      }

      // Save new file
      let relPath, absPath;
      if (organization_id) {
        const safeOrgId = String(organization_id).replace(/[^0-9]/g, '');
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
      console.log('Saved new proof image:', absPath);
    }
    // If no new file and no removal flag, keep existing proof_image path
    else if (!proof_image && currentTransaction?.proof_image) {
      proofImagePath = currentTransaction.proof_image;
    }

    const raw = await transactionModel.updateTransaction({
      transaction_id,
      user_email: req.user.email,
      payment_description,
      amount,
      status,
      proof_image: proofImagePath,
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks
    });

    const payload = unwrapSPResult(raw);

    // Publish real-time event
    try {
      publishToChannel('transactions', {
        operation: 'UPDATE',
        data: payload,
        user: req.user?.email || null,
        timestamp: new Date()
      });
    } catch (pubErr) {
      console.warn('[transactions.update] publish error:', pubErr.message);
    }

    res.json(payload);
  } catch (e) {
    console.error('[transactions.update]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
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
  getTransactionFile
};