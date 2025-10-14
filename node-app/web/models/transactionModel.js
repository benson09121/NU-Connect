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
      cycle_number,
      org_version_id,
      remarks
    } = data;

    const [rows] = await conn.query(
      'CALL CreateTransaction(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);',
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
        cycle_number || null,
        org_version_id || null,
        remarks || null
      ]
    );
    return firstRowFromSP(rows);
  } finally {
    conn.release();
  }
}

// models/transactionModel.js
async function updateTransaction(params) {
  const conn = await pool.getConnection();
  try {
    const {
      transaction_id,
      user_email,
      payer_name = null,
      payee_name = null,
      transaction_type_code = null,      // NEW: Allow changing transaction type
      payment_type_code = null,          // NEW: Allow changing payment type
      payment_description = null,
      amount = null,
      status = null,
      transaction_date = null,           // NEW: Allow changing transaction date
      proof_image = null,
      receipt_no = null,
      category_code = null,
      payer_name_override = null,
      event_remarks = null,
      organization_id = null,            // NEW: Allow changing organization
      cycle_number = null,               // NEW: Allow changing cycle
      org_version_id = null,
      remove_proof_image = 0,
      remarks = null
    } = params;

    const removeFlag =
      remove_proof_image === true ||
      remove_proof_image === 1 ||
      remove_proof_image === '1' ||
      (typeof remove_proof_image === 'string' && remove_proof_image.toLowerCase() === 'true')
        ? 1 : 0;

    const sql = `CALL UpdateTransaction(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const safeParams = [
      transaction_id || null,
      user_email || null,
      payer_name,
      payee_name,
      transaction_type_code,
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      proof_image,
      receipt_no,
      category_code,
      payer_name_override,
      event_remarks,
      organization_id,
      cycle_number,
      org_version_id,
      removeFlag,
      remarks
    ];

    console.log('[transactionModel.updateTransaction] SQL:', sql);
    console.log('[transactionModel.updateTransaction] Params:', safeParams);

    const [results] = await conn.query(sql, safeParams);
    return results;
  } catch (error) {
    console.error('[transactionModel.updateTransaction] Error:', error);
    throw error;
  } finally {
    conn.release();
  }
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

async function approveTransaction(params) {
  const conn = await pool.getConnection();
  try {
    const {
      transaction_id,
      organization_id,
      organization_version_id,
      category,
      user_email
    } = params;

    const [rows] = await conn.query(
      'CALL ApproveTransaction(?, ?, ?, ?, ?);',
      [transaction_id, organization_id, organization_version_id, category, user_email]
    );
    
    return firstRowFromSP(rows);
  } finally {
    conn.release();
  }
}

async function updateAttendance(transaction_id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'CALL ApproveTransactionPayment(?);',
      [transaction_id]
    );
    return rows[0];
  } finally {
    conn.release();
  }
}

async function getTransactionAuditTrail(transaction_id) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'CALL GetTransactionAuditTrail(?);',
      [transaction_id]
    );
    return rows[0] || [];
  } finally {
    conn.release();
  }
}

async function getAllTransactionAudits(limit = 50, offset = 0) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      'CALL GetAllTransactionAudits(?, ?);',
      [limit, offset]
    );
    return rows[0] || [];
  } finally {
    conn.release();
  }
}

module.exports = {
  createTransaction,
  updateTransaction,
  archiveTransaction,
  updateAttendance,
  approveTransaction,
  unarchiveTransaction,
  getTransaction,
  getTransactions,
  getPaymentTypes,
  getFinancialCategories,
  getTransactionTypes,
  getTransactionsByOrganization,
  getTransactionAuditTrail,
  getAllTransactionAudits
};