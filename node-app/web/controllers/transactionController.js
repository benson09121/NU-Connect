const transactionModel = require('../models/transactionModel');
const { publishToChannel, subscribeToChannel } = require('./sseController');
const path = require('path');
const fs = require('fs');

function unwrapSPResult(row) {
  if (row == null) return null;
  if (Array.isArray(row)) {
    // handle nested arrays from older model shapes
    if (Array.isArray(row[0])) return row[0][0] || null;
    return row[0] || null;
  }
  return row;
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
      const safeName = `proof-${Date.now()}${ext}`;
      const orgDir = path.join('/app/organizations', String(organization_id), 'transactions');
      if (!fs.existsSync(orgDir)) fs.mkdirSync(orgDir, { recursive: true });
      proofImagePath = path.join(orgDir, safeName);
      fs.writeFileSync(proofImagePath, file.data);
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
      receipt_no, // can be blank/null, SP will generate if needed
      category_code,
      event_id,
      payer_name_override,
      event_remarks,
      organization_id,
      cycle_number
    }, proofImagePath);

    // Real-time publish
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

async function getByOrganization(req, res) {
  try {
    const { organization_id } = req.query;
    if (!organization_id) return res.status(400).json({ message: 'organization_id is required' });
    const txns = await transactionModel.getTransactionsByOrganization(organization_id);
    res.json(txns);
  } catch (e) {
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function update(req,res){
  try{
    const {
      transaction_id,
      payment_description,
      amount,
      status,
      proof_image,
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks
    } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });

    const raw = await transactionModel.updateTransaction({
      transaction_id,
      user_email: req.user.email,
      payment_description,
      amount,
      status,
      proof_image,
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
  } catch(e){
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

    // Use NGINX internal redirect for protected file serving
    const protectedPath = `/protected-transactions/${organization_id}/transactions/${filename}`;
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