const pool = require('../../config/db');

function firstRowFromSP(rows) {
  if (rows == null) return null;
  // rows is usually an array where rows[0] is the first result set (an array of rows)
  if (Array.isArray(rows)) {
    if (Array.isArray(rows[0])) return rows[0][0] || null; // single-row resultset
    return rows[0] || null; // defensive fallback
  }
  return rows;
}

async function createTransaction(data){
  const conn = await pool.getConnection();
  try{
    const {
      user_email,
      payer_name,
      payee_name,
      transaction_type_code='INCOME',
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      proof_image,
      meta,
      event_id,
      payer_name_override,
      organization_id,
      cycle_number,
      expense_category,
      reference_doc
    } = data;

    const [rows] = await conn.query(
      'CALL CreateTransaction(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);',
      [
        user_email || null,
        payer_name || null,
        payee_name || null,
        transaction_type_code,
        payment_type_code,
        payment_description,
        amount,
        status || null,
        transaction_date,
        proof_image || null,
        meta ? JSON.stringify(meta) : null,
        event_id || null,
        payer_name_override || null,
        organization_id || null,
        cycle_number || null,
        expense_category || null,
        reference_doc || null
      ]
    );
    return firstRowFromSP(rows);
  } finally {
    conn.release();
  }
}

async function updateTransaction(data){
  const conn = await pool.getConnection();
  try{
    const {
      transaction_id,
      user_email,
      payment_description,
      amount,
      status,
      proof_image,
      meta,
      payer_name,
      payee_name,
      payer_name_override,
      expense_category,
      reference_doc
    } = data;

    const safeProof = (proof_image === undefined || proof_image === '') ? null : proof_image;

    const [rows] = await conn.query(
      'CALL UpdateTransaction(?,?,?,?,?,?,?,?,?,?,?,?);',
      [
        transaction_id,
        user_email,
        payment_description ?? null,
        amount ?? null,
        status ?? null,
        safeProof,
        meta ? JSON.stringify(meta) : null,
        payer_name ?? null,
        payee_name ?? null,
        payer_name_override ?? null,
        expense_category ?? null,
        reference_doc ?? null
      ]
    );
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function archiveTransaction({ transaction_id, user_email, reason, meta }){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL ArchiveTransaction(?,?,?,?);',
      [transaction_id, user_email, reason || 'No reason provided', meta ? JSON.stringify(meta) : null]
    );
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function unarchiveTransaction({ transaction_id, user_email, meta }){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL UnarchiveTransaction(?,?,?);',
      [transaction_id, user_email, meta ? JSON.stringify(meta) : null]
    );
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function getTransaction(id){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query('CALL GetTransaction(?);',[id]);
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function getTransactions(filters){
  const {
    user_email=null,
    status=null,
    include_archived=false,
    event_id=null,
    organization_id=null,
    transaction_type_code=null
  } = filters;
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL GetTransactions(?,?,?,?,?,?);',
      [
        user_email || null,
        status || null,
        include_archived ? 1 : 0,
        event_id || null,
        organization_id || null,
        transaction_type_code || null
      ]
    );
    // list API returns array of rows (keep as array)
    return rows[0] || rows || [];
  } finally { conn.release(); }
}

async function getTransactionTypes(){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query('CALL GetTransactionTypes();');
    return rows[0] || rows || [];
  } finally { conn.release(); }
}

async function getPaymentTypes(){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query('CALL GetPaymentTypes();');
    return rows[0] || rows || [];
  } finally { conn.release(); }
}

module.exports = {
  createTransaction,
  updateTransaction,
  archiveTransaction,
  unarchiveTransaction,
  getTransaction,
  getTransactions,
  getPaymentTypes,
  getTransactionTypes
};