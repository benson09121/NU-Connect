-- Fix the view to include missing organization_id, organization_version_id and term_id columns
USE db_nuconnect;

DROP VIEW IF EXISTS vw_term_payment_overview;

CREATE VIEW vw_term_payment_overview AS
SELECT 
    tp.payment_id,
    tp.user_id,
    tp.organization_id,
    tp.organization_version_id,
    tp.term_id,
    CONCAT(u.f_name, ' ', u.l_name) as member_name,
    u.email as member_email,
    o.name as organization_name,
    at.term_name,
    at.start_date as term_start,
    at.end_date as term_end,
    t.amount as payment_amount,
    tp.payment_status,
    pt.code as payment_method,
    t.receipt_no as transaction_reference,
    tp.transaction_id,
    t.receipt_no,
    t.transaction_date,
    t.proof_image as receipt_filename,
    CONCAT('/app/organizations/', tp.organization_id, '/', tp.organization_version_id, '/transactions/', t.proof_image) as receipt_url,
    tp.verified_by,
    tp.verified_at,
    tp.notes,
    tp.created_at,
    tp.updated_at
FROM tbl_term_payments tp
JOIN tbl_user u ON tp.user_id = u.user_id
JOIN tbl_organization o ON tp.organization_id = o.organization_id
JOIN tbl_academic_term at ON tp.term_id = at.term_id
JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id;