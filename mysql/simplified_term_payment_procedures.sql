-- ===================================================================
-- SIMPLIFIED TERM PAYMENT SYSTEM - STORED PROCEDURES
-- ===================================================================

DELIMITER $$

-- 1. Get current active term using date ranges
DROP PROCEDURE IF EXISTS GetCurrentActiveTerm$$
CREATE DEFINER='admin'@'%' PROCEDURE GetCurrentActiveTerm()
BEGIN
    SELECT 
        term_id,
        academic_year,
        term_name,
        start_date,
        end_date,
        is_active,
        created_at,
        DATE(NOW()) BETWEEN start_date AND end_date as is_current_term
    FROM tbl_academic_term 
    WHERE DATE(NOW()) BETWEEN start_date AND end_date
    ORDER BY start_date DESC
    LIMIT 1;
END$$

-- 2. Get user term payments for organization
DROP PROCEDURE IF EXISTS GetUserTermPayments$$
CREATE DEFINER='admin'@'%' PROCEDURE GetUserTermPayments(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT
)
BEGIN
    SELECT 
        mtp.payment_id,
        mtp.organization_id,
        mtp.user_id,
        mtp.term_id,
        mtp.amount_due,
        mtp.payment_status,
        mtp.due_date,
        mtp.paid_date,
        mtp.created_at,
        mtp.updated_at,
        at.term_name,
        at.academic_year,
        at.start_date,
        at.end_date,
        o.name as organization_name,
        o.membership_fee_amount,
        o.membership_fee_type
    FROM tbl_membership_term_payment mtp
    JOIN tbl_academic_term at ON mtp.term_id = at.term_id
    JOIN tbl_organization o ON mtp.organization_id = o.organization_id
    WHERE mtp.user_id = p_user_id 
    AND mtp.organization_id = p_organization_id
    ORDER BY mtp.created_at DESC;
END$$

-- 3. Create term payment with transaction
DROP PROCEDURE IF EXISTS CreateTermPaymentWithTransaction$$
CREATE DEFINER='admin'@'%' PROCEDURE CreateTermPaymentWithTransaction(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_term_id INT,
    IN p_receipt_path VARCHAR(500)
)
BEGIN
    DECLARE v_payment_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_receipt_no VARCHAR(20);
    DECLARE v_amount DECIMAL(10,2);
    DECLARE v_term_name VARCHAR(50);
    DECLARE v_due_date DATE;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Get organization fee amount
    SELECT membership_fee_amount INTO v_amount 
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;

    -- Get term details
    SELECT term_name, end_date INTO v_term_name, v_due_date
    FROM tbl_academic_term 
    WHERE term_id = p_term_id;

    -- Create payment record
    INSERT INTO tbl_membership_term_payment (
        organization_id,
        user_id,
        term_id,
        amount_due,
        payment_status,
        due_date,
        created_at
    ) VALUES (
        p_organization_id,
        p_user_id,
        p_term_id,
        v_amount,
        'Pending',
        v_due_date,
        NOW()
    );

    SET v_payment_id = LAST_INSERT_ID();

    -- Generate receipt number
    SET v_receipt_no = CONCAT('PAY', LPAD(v_payment_id, 6, '0'));

    -- Create transaction record
    INSERT INTO tbl_transaction (
        payment_id,
        amount,
        transaction_type,
        payment_method,
        transaction_status,
        receipt_no,
        proof_of_payment,
        created_at
    ) VALUES (
        v_payment_id,
        v_amount,
        'Term Payment',
        'Bank Transfer',
        'Pending',
        v_receipt_no,
        p_receipt_path,
        NOW()
    );

    SET v_transaction_id = LAST_INSERT_ID();

    -- Update payment with transaction ID
    UPDATE tbl_membership_term_payment 
    SET transaction_id = v_transaction_id
    WHERE payment_id = v_payment_id;

    COMMIT;

    -- Return results
    SELECT 
        v_payment_id as payment_id,
        v_transaction_id as transaction_id,
        v_receipt_no as receipt_no,
        v_amount as amount,
        v_term_name as term_name,
        v_due_date as due_date,
        'Payment created successfully' as message;
END$$

-- 4. Update term payment receipt
DROP PROCEDURE IF EXISTS UpdateTermPaymentReceipt$$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTermPaymentReceipt(
    IN p_payment_id INT,
    IN p_receipt_path VARCHAR(500),
    IN p_notes TEXT,
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_transaction_id INT;
    DECLARE v_receipt_no VARCHAR(20);
    
    -- Get or create transaction
    SELECT transaction_id INTO v_transaction_id
    FROM tbl_membership_term_payment
    WHERE payment_id = p_payment_id AND user_id = p_user_id;
    
    IF v_transaction_id IS NULL THEN
        -- Generate receipt number
        SET v_receipt_no = CONCAT('PAY', LPAD(p_payment_id, 6, '0'));
        
        -- Create new transaction
        INSERT INTO tbl_transaction (
            payment_id,
            amount,
            transaction_type,
            payment_method,
            transaction_status,
            receipt_no,
            proof_of_payment,
            notes,
            created_at
        ) 
        SELECT 
            p_payment_id,
            mtp.amount_due,
            'Term Payment',
            'Bank Transfer',
            'Pending',
            v_receipt_no,
            p_receipt_path,
            p_notes,
            NOW()
        FROM tbl_membership_term_payment mtp
        WHERE mtp.payment_id = p_payment_id;
        
        SET v_transaction_id = LAST_INSERT_ID();
        
        -- Update payment with transaction ID
        UPDATE tbl_membership_term_payment 
        SET transaction_id = v_transaction_id
        WHERE payment_id = p_payment_id;
    ELSE
        -- Update existing transaction
        UPDATE tbl_transaction
        SET 
            proof_of_payment = p_receipt_path,
            notes = p_notes,
            updated_at = NOW()
        WHERE transaction_id = v_transaction_id;
        
        SELECT receipt_no INTO v_receipt_no
        FROM tbl_transaction
        WHERE transaction_id = v_transaction_id;
    END IF;
    
    -- Return transaction details
    SELECT 
        v_transaction_id as transaction_id,
        v_receipt_no as receipt_no,
        'Receipt updated successfully' as message;
END$$

-- 5. Generate term payments for organization
DROP PROCEDURE IF EXISTS GenerateTermPaymentsForSpecificOrganization$$
CREATE DEFINER='admin'@'%' PROCEDURE GenerateTermPaymentsForSpecificOrganization(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    DECLARE v_count INT DEFAULT 0;
    DECLARE v_fee_amount DECIMAL(10,2);
    DECLARE v_due_date DATE;
    DECLARE v_current_term_id INT;
    
    -- Get current term if not provided
    IF p_term_id IS NULL THEN
        SELECT term_id, end_date INTO v_current_term_id, v_due_date
        FROM tbl_academic_term 
        WHERE DATE(NOW()) BETWEEN start_date AND end_date
        LIMIT 1;
        
        IF v_current_term_id IS NULL THEN
            SELECT 'ERROR' as status, 'No active term found' as result;
            LEAVE;
        END IF;
        
        SET p_term_id = v_current_term_id;
    ELSE
        SELECT end_date INTO v_due_date
        FROM tbl_academic_term 
        WHERE term_id = p_term_id;
    END IF;
    
    -- Get organization fee
    SELECT membership_fee_amount INTO v_fee_amount
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;
    
    -- Generate payments for all active members
    INSERT INTO tbl_membership_term_payment (
        organization_id,
        user_id,
        term_id,
        amount_due,
        payment_status,
        due_date,
        created_at
    )
    SELECT 
        p_organization_id,
        om.user_id,
        p_term_id,
        v_fee_amount,
        'Pending',
        v_due_date,
        NOW()
    FROM tbl_organization_member om
    WHERE om.organization_id = p_organization_id
    AND om.membership_status = 'Active'
    AND NOT EXISTS (
        SELECT 1 FROM tbl_membership_term_payment mtp
        WHERE mtp.organization_id = p_organization_id
        AND mtp.user_id = om.user_id
        AND mtp.term_id = p_term_id
    );
    
    SET v_count = ROW_COUNT();
    
    SELECT 'SUCCESS' as status, CONCAT(v_count, ' payment records generated') as result;
END$$

-- 6. Check user term payment status
DROP PROCEDURE IF EXISTS CheckUserTermPaymentStatus$$
CREATE DEFINER='admin'@'%' PROCEDURE CheckUserTermPaymentStatus(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        mtp.payment_id,
        mtp.payment_status,
        mtp.amount_due,
        mtp.due_date,
        mtp.paid_date,
        mtp.created_at,
        at.term_name,
        CASE 
            WHEN mtp.payment_status = 'Paid' THEN 'Paid'
            WHEN mtp.payment_status = 'Pending' AND mtp.due_date >= CURDATE() THEN 'Due'
            WHEN mtp.payment_status = 'Pending' AND mtp.due_date < CURDATE() THEN 'Overdue'
            ELSE mtp.payment_status
        END as status_description,
        DATEDIFF(CURDATE(), mtp.due_date) as days_overdue
    FROM tbl_membership_term_payment mtp
    JOIN tbl_academic_term at ON mtp.term_id = at.term_id
    WHERE mtp.user_id = p_user_id
    AND mtp.organization_id = p_organization_id
    AND mtp.term_id = p_term_id;
END$$

-- 7. Get pending term payments
DROP PROCEDURE IF EXISTS GetPendingTermPayments$$
CREATE DEFINER='admin'@'%' PROCEDURE GetPendingTermPayments(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        mtp.payment_id,
        mtp.organization_id,
        mtp.user_id,
        mtp.term_id,
        mtp.amount_due,
        mtp.payment_status,
        mtp.due_date,
        mtp.created_at,
        CONCAT(u.f_name, ' ', u.l_name) as member_name,
        u.email as member_email,
        at.term_name,
        t.proof_of_payment,
        t.receipt_no,
        t.notes
    FROM tbl_membership_term_payment mtp
    JOIN tbl_user u ON mtp.user_id = u.user_id
    JOIN tbl_academic_term at ON mtp.term_id = at.term_id
    LEFT JOIN tbl_transaction t ON mtp.transaction_id = t.transaction_id
    WHERE mtp.organization_id = p_organization_id
    AND mtp.payment_status = 'Pending'
    AND (p_term_id IS NULL OR mtp.term_id = p_term_id)
    AND mtp.transaction_id IS NOT NULL
    ORDER BY mtp.created_at DESC;
END$$

-- 8. Update term payment status
DROP PROCEDURE IF EXISTS UpdateTermPaymentStatus$$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTermPaymentStatus(
    IN p_payment_id INT,
    IN p_status VARCHAR(20),
    IN p_verified_by VARCHAR(200)
)
BEGIN
    DECLARE v_affected_rows INT;
    
    UPDATE tbl_membership_term_payment 
    SET 
        payment_status = p_status,
        paid_date = CASE WHEN p_status = 'Paid' THEN NOW() ELSE paid_date END,
        updated_at = NOW()
    WHERE payment_id = p_payment_id;
    
    SET v_affected_rows = ROW_COUNT();
    
    -- Also update transaction status if exists
    UPDATE tbl_transaction t
    JOIN tbl_membership_term_payment mtp ON t.transaction_id = mtp.transaction_id
    SET t.transaction_status = CASE 
        WHEN p_status = 'Paid' THEN 'Completed'
        WHEN p_status = 'Rejected' THEN 'Failed'
        ELSE 'Pending'
    END
    WHERE mtp.payment_id = p_payment_id;
    
    SELECT v_affected_rows as affected_rows;
END$$

DELIMITER ;