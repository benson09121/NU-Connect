-- ===================================================================
-- MOBILE TERM PAYMENT SUBMISSIONS TABLE
-- ===================================================================
-- This table is specifically for mobile payment submissions with screenshots
-- Different from tbl_membership_term_payment which is for regular membership fees

CREATE TABLE IF NOT EXISTS tbl_term_payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id VARCHAR(200) NOT NULL,
    organization_id INT NOT NULL,
    term_id INT NOT NULL,
    amount_due DECIMAL(10,2) NOT NULL,
    payment_status ENUM('Pending', 'Approved', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    payment_date TIMESTAMP NULL,
    screenshot_path VARCHAR(500) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(200) NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (term_id) REFERENCES tbl_academic_term(term_id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    INDEX idx_payment_status (payment_status),
    INDEX idx_payment_date (payment_date),
    INDEX idx_user_payments (user_id, payment_status),
    INDEX idx_org_payments (organization_id, payment_status)
);

-- Note: tbl_academic_term already exists in init.sql, no need to recreate

-- Insert sample payment data for testing (optional - can be uncommented if needed)
-- INSERT INTO tbl_term_payments (user_id, organization_id, term_id, amount_due, payment_status, screenshot_path, notes) VALUES
-- ('test@example.com', 1, 1, 500.00, 'Pending', '/uploads/screenshot1.jpg', 'Payment for 1st term membership'),
-- ('test2@example.com', 1, 1, 500.00, 'Approved', '/uploads/screenshot2.jpg', 'Payment for 1st term membership');