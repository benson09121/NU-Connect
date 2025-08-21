const transactionModel = require('../models/transactionModel');

function normTime(t){
  if(!t) return null;
  return t.length === 5 ? t + ':00' : t;
}

async function create(req,res){
  try{
    const {
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      transaction_time,
      receipt_no,
      payer_name,
      event_id,
      payer_name_override,
      organization_id,
      cycle_number
    } = req.body;

    if(!payment_type_code || !payment_description || !amount || !transaction_date || !transaction_time || !receipt_no){
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const row = await transactionModel.createTransaction({
      user_email: req.user?.email || null,
      payer_name: req.user?.email ? null : (payer_name || null),
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      transaction_time: normTime(transaction_time),
      receipt_no,
      proof_image: req.body.proof_image || null,
      meta: { origin:'web', action:'create' },
      event_id: event_id || null,
      payer_name_override: payer_name_override || null,
      organization_id: organization_id || null,
      cycle_number: cycle_number || null
    });

    res.status(201).json(row);
  } catch(e){
    console.error('[transactions.create]', e);
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
      receipt_no,
      proof_image,
      payer_name,
      payer_name_override
    } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });

    const row = await transactionModel.updateTransaction({
      transaction_id,
      user_email: req.user.email,
      payment_description,
      amount,
      status,
      receipt_no,
      proof_image,
      meta:{ origin:'web', action:'update' },
      payer_name,
      payer_name_override
    });
    res.json(row);
  } catch(e){
    console.error('[transactions.update]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function archive(req,res){
  try{
    const { transaction_id, reason } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });
    const row = await transactionModel.archiveTransaction({
      transaction_id,
      user_email: req.user.email,
      reason,
      meta:{ origin:'web', action:'archive' }
    });
    res.json(row);
  } catch(e){
    console.error('[transactions.archive]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function getOne(req,res){
  try{
    const { id } = req.params;
    const row = await transactionModel.getTransaction(id);
    if(!row || row.length===0) return res.status(404).json({ message:'Not found' });
    res.json(row[0]);
  } catch(e){
    console.error('[transactions.getOne]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

async function list(req,res){
  try{
    const { email, status, include_archived, event_id, organization_id } = req.query;
    const rows = await transactionModel.getTransactions({
      user_email: email || null,
      status: status || null,
      include_archived: include_archived === 'true',
      event_id: event_id ? Number(event_id) : null,
      organization_id: organization_id ? Number(organization_id) : null
    });
    res.json(rows);
  } catch(e){
    console.error('[transactions.list]', e);
    res.status(500).json({ message: e.sqlMessage || e.message });
  }
}

module.exports = { create, update, archive, getOne, list };