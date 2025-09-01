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

async function createTransaction(data, proofImagePath = null) {
  const conn = await pool.getConnection();
  try {
    const {
      user_email,
      payer_name,
      payee_name,
      transaction_type_code = 'INCOME',
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
        proofImagePath || null,
        receipt_no || null,
        category_code || null,
        event_id || null,
        payer_name_override || null,
        event_remarks || null,
        organization_id || null,
        cycle_number || null
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
      receipt_no,
      category_code,
      payer_name,
      payee_name,
      payer_name_override,
      event_remarks
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
        receipt_no ?? null,
        category_code ?? null,
        payer_name ?? null,
        payee_name ?? null,
        payer_name_override ?? null,
        event_remarks ?? null
      ]
    );
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function archiveTransaction({ transaction_id, user_email, reason }){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL ArchiveTransaction(?,?,?);',
      [transaction_id, user_email, reason || 'No reason provided']
    );
    return firstRowFromSP(rows);
  } finally { conn.release(); }
}

async function unarchiveTransaction({ transaction_id, user_email }){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL UnarchiveTransaction(?,?);',
      [transaction_id, user_email]
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
    transaction_type_code=null,
    category_code=null
  } = filters;
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL GetTransactions(?,?,?,?,?,?,?);',
      [
        user_email || null,
        status || null,
        include_archived ? 1 : 0,
        event_id || null,
        organization_id || null,
        transaction_type_code || null,
        category_code || null
      ]
    );
    // list API returns array of rows (keep as array)
    return rows[0] || rows || [];
  } finally { conn.release(); }
}

async function getTransactionsByOrganization(organization_id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('CALL GetTransactionsByOrganization(?);', [organization_id]);
    return rows[0];
  } finally {
    conn.release();
  }
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

async function getFinancialCategories(){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query('CALL GetFinancialCategories();');
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
  getFinancialCategories,
  getTransactionTypes,
  getTransactionsByOrganization
};