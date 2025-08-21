const transactionModel = require('../models/transactionModel');

async function create(req,res){
  try{
    // Accept both snake_case and camelCase
    const {
      transaction_type_code = req.body.transactionTypeCode || 'INCOME',
      payment_type_code = req.body.paymentTypeCode,
      payment_description = req.body.paymentDescription,
      amount = req.body.amount,
      status = req.body.status,
      transaction_date = req.body.transactionDate,
      payer_name = req.body.payerName,
      payee_name = req.body.payeeName,
      event_id = req.body.eventId,
      payer_name_override = req.body.payerNameOverride,
      organization_id = req.body.organizationId,
      cycle_number = req.body.cycleNumber,
      proof_image = req.body.proofImage,
      expense_category = req.body.expenseCategory,
      reference_doc = req.body.referenceDoc
    } = req.body;

    const missing = [];
    if(!payment_type_code) missing.push('payment_type_code');
    if(!payment_description) missing.push('payment_description');
    if(amount == null || amount === '') missing.push('amount');
    if(!transaction_date) missing.push('transaction_date');
    if(transaction_type_code === 'EXPENSE' && !expense_category) missing.push('expense_category');
    if(missing.length) return res.status(400).json({ message:'Missing required fields', missing });

    const row = await transactionModel.createTransaction({
      user_email: req.user?.email || null,
      payer_name: transaction_type_code === 'INCOME' ? (payer_name || null) : null,
      payee_name: transaction_type_code === 'EXPENSE' ? (payee_name || null) : null,
      transaction_type_code,
      payment_type_code,
      payment_description,
      amount: Number(amount),
      status,
      transaction_date,
      proof_image: proof_image || null,
      meta:{ origin:'web', action:'create' },
      event_id: transaction_type_code === 'INCOME' ? (event_id || null) : null,
      payer_name_override: transaction_type_code === 'INCOME' ? (payer_name_override || null) : null,
      organization_id: transaction_type_code === 'INCOME' ? (organization_id || null) : null,
      cycle_number: transaction_type_code === 'INCOME' ? (cycle_number || null) : null,
      expense_category: transaction_type_code === 'EXPENSE' ? (expense_category || null) : null,
      reference_doc: transaction_type_code === 'EXPENSE' ? (reference_doc || null) : null
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
      proof_image,
      payer_name,
      payee_name,
      payer_name_override,
      expense_category,
      reference_doc
    } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });

    const row = await transactionModel.updateTransaction({
      transaction_id,
      user_email: req.user.email,
      payment_description,
      amount,
      status,
      proof_image,
      meta:{ origin:'web', action:'update' },
      payer_name,
      payee_name,
      payer_name_override,
      expense_category,
      reference_doc
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

async function unarchive(req,res){
  try{
    const { transaction_id } = req.body;
    if(!transaction_id) return res.status(400).json({ message:'transaction_id required' });
    const row = await transactionModel.unarchiveTransaction({
      transaction_id,
      user_email: req.user.email,
      meta:{ origin:'web', action:'unarchive' }
    });
    res.json(row);
  } catch(e){
    console.error('[transactions.unarchive]', e);
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
    const {
      email,
      status,
      include_archived,
      event_id,
      organization_id,
      transaction_type_code
    } = req.query;
    const rows = await transactionModel.getTransactions({
      user_email: email || null,
      status: status || null,
      include_archived: include_archived === 'true',
      event_id: event_id ? Number(event_id) : null,
      organization_id: organization_id ? Number(organization_id) : null,
      transaction_type_code: transaction_type_code || null
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

module.exports = {
  create,
  update,
  archive,
  unarchive,
  getOne,
  list,
  getPaymentTypes,
  getTransactionTypes
};