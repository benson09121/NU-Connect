const pool = require('../../config/db');

async function createTransaction(data){
  const conn = await pool.getConnection();
  try{
    const {
      user_email,
      payer_name,
      payment_type_code,
      payment_description,
      amount,
      status,
      transaction_date,
      transaction_time,
      receipt_no,
      proof_image,
      meta,
      event_id,
      payer_name_override,
      organization_id,
      cycle_number
    } = data;
    const [rows] = await conn.query(
      'CALL CreateTransaction(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);',
      [
        user_email || null,
        payer_name || null,
        payment_type_code,
        payment_description,
        amount,
        status || null,
        transaction_date,
        transaction_time,
        receipt_no,
        proof_image || null,
        meta ? JSON.stringify(meta) : null,
        event_id || null,
        payer_name_override || null,
        organization_id || null,
        cycle_number || null
      ]
    );
    return rows[0];
  } finally { conn.release(); }
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
      receipt_no,
      proof_image,
      meta,
      payer_name,
      payer_name_override
    } = data;
    const [rows] = await conn.query(
      'CALL UpdateTransaction(?,?,?,?,?,?,?,?,?,?);',
      [
        transaction_id,
        user_email,
        payment_description || null,
        amount || null,
        status || null,
        receipt_no || null,
        proof_image || null,
        meta ? JSON.stringify(meta) : null,
        payer_name || null,
        payer_name_override || null
      ]
    );
    return rows[0];
  } finally { conn.release(); }
}

async function archiveTransaction({ transaction_id, user_email, reason, meta }){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL ArchiveTransaction(?,?,?,?);',
      [transaction_id, user_email, reason || 'No reason provided', meta ? JSON.stringify(meta) : null]
    );
    return rows[0];
  } finally { conn.release(); }
}

async function getTransaction(id){
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query('CALL GetTransaction(?);',[id]);
    return rows[0];
  } finally { conn.release(); }
}

async function getTransactions(filters){
  const {
    user_email=null,
    status=null,
    include_archived=false,
    event_id=null,
    organization_id=null
  } = filters;
  const conn = await pool.getConnection();
  try{
    const [rows] = await conn.query(
      'CALL GetTransactions(?,?,?,?,?);',
      [user_email || null, status || null, include_archived ? 1 : 0, event_id || null, organization_id || null]
    );
    return rows[0];
  } finally { conn.release(); }
}

module.exports = {
  createTransaction,
  updateTransaction,
  archiveTransaction,
  getTransaction,
  getTransactions
};