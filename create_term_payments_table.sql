-- Create the missing tbl_term_payments table
USE db_nuconnect;

-- Drop if exists to avoid conflicts
DROP TABLE IF EXISTS tbl_term_payments;

-- Individual Member Term Payments (Simplified)
CREATE TABLE tbl_term_payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(200) NOT NULL,
    organization_id INT NOT NULL,
    organization_version_id INT NOT NULL,
    term_id INT NOT NULL,
    transaction_id INT NOT NULL,  -- Required reference to transaction for payment details
    payment_status ENUM('Pending', 'Paid', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    verified_by VARCHAR(200) NULL,
    verified_at TIMESTAMP NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_version_id) REFERENCES tbl_organization_version(organization_version_id) ON DELETE CASCADE,
    FOREIGN KEY (term_id) REFERENCES tbl_academic_term(term_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    
    UNIQUE KEY unique_member_term_payment (user_id, organization_id, organization_version_id, term_id),
    INDEX idx_term_payments_user_org (user_id, organization_id, organization_version_id),
    INDEX idx_term_payments_term (term_id),
    INDEX idx_term_payments_status (payment_status),
    INDEX idx_term_payments_transaction (transaction_id)
);

-- Recreate the view
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
    pt.label as payment_method,
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