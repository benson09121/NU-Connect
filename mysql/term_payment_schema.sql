-- ===================================================================
-- TERM-BASED PAYMENT SYSTEM - DATABASE SCHEMA DESIGN
-- ===================================================================

-- Note: "Per Term" already exists in the system, we're enhancing it
-- No changes needed to tbl_organization.membership_fee_type enum

-- 1. Create academic term management table
CREATE TABLE tbl_academic_term (
    term_id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year VARCHAR(20) NOT NULL, -- e.g., "2024-2025"
    term_name VARCHAR(50) NOT NULL, -- e.g., "1st Term", "2nd Term", "Summer"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE, -- Only one active term at a time
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    UNIQUE KEY unique_active_term (is_active, academic_year), -- Ensure only one active per year
    INDEX idx_term_dates (start_date, end_date),
    INDEX idx_term_year (academic_year)
);

-- 2. Create term-based payment configuration per organization
CREATE TABLE tbl_organization_term_config (
    config_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    term_id INT NOT NULL,
    fee_amount DECIMAL(10,2) NOT NULL CHECK (fee_amount >= 0),
    is_required BOOLEAN DEFAULT TRUE, -- Some terms might be optional
    auto_generate_payment BOOLEAN DEFAULT TRUE, -- Auto-create payment records for members
    grace_period_days INT DEFAULT 30, -- Days before payment becomes overdue
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (term_id) REFERENCES tbl_academic_term(term_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    UNIQUE KEY unique_org_term_config (organization_id, cycle_number, term_id),
    INDEX idx_org_term (organization_id, term_id)
);

-- 3. Create individual term-based payment records
CREATE TABLE tbl_membership_term_payment (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    term_id INT NOT NULL,
    amount_due DECIMAL(10,2) NOT NULL CHECK (amount_due >= 0),
    payment_status ENUM('Pending', 'Paid', 'Overdue', 'Waived', 'Cancelled') DEFAULT 'Pending',
    due_date DATE NOT NULL,
    paid_date DATETIME NULL,
    transaction_id INT NULL, -- Links to tbl_transaction when paid
    waived_by VARCHAR(200) NULL,
    waived_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (term_id) REFERENCES tbl_academic_term(term_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE SET NULL,
    FOREIGN KEY (waived_by) REFERENCES tbl_user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    UNIQUE KEY unique_user_term_payment (organization_id, cycle_number, user_id, term_id),
    INDEX idx_payment_status (payment_status),
    INDEX idx_payment_due_date (due_date),
    INDEX idx_payment_user (user_id),
    INDEX idx_payment_org_term (organization_id, term_id)
);

-- 4. Create view for term-based payment analytics
CREATE VIEW vw_term_payment_overview AS
SELECT 
    mtp.payment_id,
    mtp.organization_id,
    o.name as organization_name,
    mtp.cycle_number,
    mtp.user_id,
    CONCAT(u.f_name, ' ', u.l_name) as member_name,
    u.email as member_email,
    mtp.term_id,
    aterm.academic_year,
    aterm.term_name,
    aterm.start_date as term_start,
    aterm.end_date as term_end,
    mtp.amount_due,
    mtp.payment_status,
    mtp.due_date,
    mtp.paid_date,
    mtp.transaction_id,
    CASE 
        WHEN mtp.payment_status = 'Paid' THEN 0
        WHEN mtp.payment_status = 'Pending' AND mtp.due_date >= CURDATE() THEN 0
        WHEN mtp.payment_status = 'Pending' AND mtp.due_date < CURDATE() THEN DATEDIFF(CURDATE(), mtp.due_date)
        ELSE 0
    END as days_overdue,
    mtp.created_at as payment_created,
    mtp.updated_at as payment_updated
FROM tbl_membership_term_payment mtp
JOIN tbl_organization o ON mtp.organization_id = o.organization_id
JOIN tbl_user u ON mtp.user_id = u.user_id
JOIN tbl_academic_term aterm ON mtp.term_id = aterm.term_id;

-- 6. Add indexes for performance optimization
CREATE INDEX idx_term_payment_analytics ON tbl_membership_term_payment (organization_id, term_id, payment_status, due_date);
CREATE INDEX idx_organization_term_analytics ON tbl_organization_term_config (organization_id, term_id, is_required);

-- 7. Create triggers for term payment automation
DELIMITER $$

-- Trigger to auto-update overdue payments
CREATE TRIGGER tr_update_overdue_payments
AFTER UPDATE ON tbl_academic_term
FOR EACH ROW
BEGIN
    -- Update payment status to overdue for pending payments past due date
    UPDATE tbl_membership_term_payment 
    SET payment_status = 'Overdue', updated_at = CURRENT_TIMESTAMP
    WHERE payment_status = 'Pending' 
    AND due_date < CURDATE()
    AND term_id = NEW.term_id;
END$$

-- Trigger to prevent deletion of terms with payments
CREATE TRIGGER tr_prevent_term_deletion_with_payments
BEFORE DELETE ON tbl_academic_term
FOR EACH ROW
BEGIN
    DECLARE payment_count INT DEFAULT 0;
    
    SELECT COUNT(*) INTO payment_count
    FROM tbl_membership_term_payment 
    WHERE term_id = OLD.term_id;
    
    IF payment_count > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Cannot delete term with existing payment records. Archive term instead.';
    END IF;
END$$

DELIMITER ;

-- 8. Sample data for academic terms
INSERT INTO tbl_academic_term (academic_year, term_name, start_date, end_date, is_active, created_by) VALUES
('2024-2025', '1st Term', '2024-08-15', '2024-12-15', TRUE, 'system'),
('2024-2025', '2nd Term', '2025-01-15', '2025-05-15', FALSE, 'system'),
('2024-2025', 'Summer', '2025-06-01', '2025-07-31', FALSE, 'system');

-- 9. Add configuration table for payment settings
CREATE TABLE tbl_term_payment_settings (
    setting_id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- Default payment settings
INSERT INTO tbl_term_payment_settings (setting_key, setting_value, description, updated_by) VALUES
('default_grace_period_days', '30', 'Default grace period before payment becomes overdue', 'system'),
('auto_generate_payments', 'true', 'Automatically generate payment records for new terms', 'system'),
('payment_reminder_days', '7,3,1', 'Days before due date to send payment reminders (comma-separated)', 'system'),
('max_fee_amount', '5000.00', 'Maximum allowed term fee amount', 'system');

-- ===================================================================
-- END OF TERM PAYMENT SYSTEM SCHEMA
-- ===================================================================