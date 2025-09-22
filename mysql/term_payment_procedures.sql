-- ===================================================================
-- TERM PAYMENT SYSTEM - STORED PROCEDURES
-- ===================================================================

DELIMITER $$

-- 1. Get current active term
CREATE DEFINER='admin'@'%' PROCEDURE GetCurrentActiveTerm()
BEGIN
    SELECT 
        term_id,
        academic_year,
        term_name,
        start_date,
        end_date,
        is_active,
        created_at
    FROM tbl_academic_term 
    WHERE is_active = TRUE 
    LIMIT 1;
END$$

-- 2. Create term payment record
CREATE DEFINER='admin'@'%' PROCEDURE CreateTermPayment(
    IN p_organization_id INT,
    IN p_cycle_number INT,
    IN p_user_id VARCHAR(200),
    IN p_term_id INT,
    IN p_amount_due DECIMAL(10,2),
    IN p_due_date DATE
)
BEGIN
    DECLARE v_payment_id INT;
    DECLARE v_org_name VARCHAR(255);
    DECLARE v_term_name VARCHAR(50);
    
    -- Validate organization and term exist
    SELECT name INTO v_org_name FROM tbl_organization WHERE organization_id = p_organization_id;
    IF v_org_name IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found';
    END IF;
    
    SELECT term_name INTO v_term_name FROM tbl_academic_term WHERE term_id = p_term_id;
    IF v_term_name IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Term not found';
    END IF;
    
    -- Create payment record
    INSERT INTO tbl_membership_term_payment (
        organization_id, cycle_number, user_id, term_id, 
        amount_due, payment_status, due_date
    ) VALUES (
        p_organization_id, p_cycle_number, p_user_id, p_term_id,
        p_amount_due, 'Pending', p_due_date
    );
    
    SET v_payment_id = LAST_INSERT_ID();
    
    -- Log action
    CALL LogAction(
        p_user_id,
        CONCAT('Created term payment for ', v_org_name, ' - ', v_term_name),
        'TERM_PAYMENT_CREATE',
        JSON_OBJECT(
            'payment_id', v_payment_id,
            'organization_id', p_organization_id,
            'term_id', p_term_id,
            'amount_due', p_amount_due
        ),
        NULL,
        NULL
    );
    
    -- Return created payment details
    SELECT 
        payment_id,
        organization_id,
        cycle_number,
        user_id,
        term_id,
        amount_due,
        payment_status,
        due_date,
        created_at
    FROM tbl_membership_term_payment 
    WHERE payment_id = v_payment_id;
END$$

-- 3. Process term payment transaction
CREATE DEFINER='admin'@'%' PROCEDURE ProcessTermPaymentTransaction(
    IN p_payment_id INT,
    IN p_transaction_id INT,
    IN p_processed_by VARCHAR(200)
)
BEGIN
    DECLARE v_payment_amount DECIMAL(10,2);
    DECLARE v_transaction_amount DECIMAL(10,2);
    DECLARE v_org_id INT;
    DECLARE v_user_id VARCHAR(200);
    
    -- Get payment details
    SELECT amount_due, organization_id, user_id 
    INTO v_payment_amount, v_org_id, v_user_id
    FROM tbl_membership_term_payment 
    WHERE payment_id = p_payment_id;
    
    -- Validate payment exists
    IF v_payment_amount IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment record not found';
    END IF;
    
    -- Get transaction amount
    SELECT amount INTO v_transaction_amount 
    FROM tbl_transaction 
    WHERE transaction_id = p_transaction_id;
    
    -- Validate transaction amount matches payment
    IF v_transaction_amount != v_payment_amount THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Transaction amount does not match payment amount';
    END IF;
    
    -- Update payment status
    UPDATE tbl_membership_term_payment 
    SET 
        payment_status = 'Paid',
        paid_date = CURRENT_TIMESTAMP,
        transaction_id = p_transaction_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE payment_id = p_payment_id;
    
    -- Log action
    CALL LogAction(
        p_processed_by,
        CONCAT('Processed term payment transaction for payment ID: ', p_payment_id),
        'TERM_PAYMENT_PROCESS',
        JSON_OBJECT(
            'payment_id', p_payment_id,
            'transaction_id', p_transaction_id,
            'amount', v_payment_amount
        ),
        NULL,
        NULL
    );
    
    -- Return updated payment details
    SELECT * FROM vw_term_payment_overview WHERE payment_id = p_payment_id;
END$$

-- 4. Generate term payments for all organization members
CREATE DEFINER='admin'@'%' PROCEDURE GenerateTermPaymentsForOrganization(
    IN p_organization_id INT,
    IN p_cycle_number INT,
    IN p_term_id INT
)
BEGIN
    DECLARE v_fee_amount DECIMAL(10,2);
    DECLARE v_grace_period_days INT;
    DECLARE v_due_date DATE;
    DECLARE v_term_start DATE;
    
    -- Get term configuration
    SELECT fee_amount, grace_period_days 
    INTO v_fee_amount, v_grace_period_days
    FROM tbl_organization_term_config 
    WHERE organization_id = p_organization_id 
    AND term_id = p_term_id;
    
    IF v_fee_amount IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Term configuration not found for organization';
    END IF;
    
    -- Get term start date for due date calculation
    SELECT start_date INTO v_term_start 
    FROM tbl_academic_term 
    WHERE term_id = p_term_id;
    
    -- Calculate due date (term start + grace period)
    SET v_due_date = DATE_ADD(v_term_start, INTERVAL v_grace_period_days DAY);
    
    -- Insert payment records for all organization members
    INSERT INTO tbl_membership_term_payment (
        organization_id, cycle_number, user_id, term_id, 
        amount_due, payment_status, due_date
    )
    SELECT 
        p_organization_id,
        p_cycle_number,
        om.user_id,
        p_term_id,
        v_fee_amount,
        'Pending',
        v_due_date
    FROM tbl_organization_member om
    WHERE om.organization_id = p_organization_id
    AND om.status = 'Active'
    AND NOT EXISTS (
        SELECT 1 FROM tbl_membership_term_payment mtp
        WHERE mtp.organization_id = p_organization_id
        AND mtp.cycle_number = p_cycle_number
        AND mtp.user_id = om.user_id
        AND mtp.term_id = p_term_id
    );
    
    -- Return count of generated payments
    SELECT ROW_COUNT() as payments_generated;
END$$

-- 5. Get term payment analytics for organization
CREATE DEFINER='admin'@'%' PROCEDURE GetTermPaymentAnalytics(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        COUNT(*) as total_members,
        SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN payment_status = 'Overdue' THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN payment_status = 'Paid' THEN amount_due ELSE 0 END) as total_paid_amount,
        SUM(CASE WHEN payment_status != 'Paid' THEN amount_due ELSE 0 END) as total_outstanding_amount,
        ROUND(
            (SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2
        ) as payment_completion_percentage
    FROM tbl_membership_term_payment
    WHERE organization_id = p_organization_id
    AND term_id = p_term_id;
END$$

-- 6. Get member payment history
CREATE DEFINER='admin'@'%' PROCEDURE GetMemberTermPaymentHistory(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT DEFAULT NULL
)
BEGIN
    SELECT 
        mtp.payment_id,
        o.name as organization_name,
        o.organization_id,
        at.academic_year,
        at.term_name,
        mtp.amount_due,
        mtp.payment_status,
        mtp.due_date,
        mtp.paid_date,
        mtp.created_at,
        CASE 
            WHEN mtp.payment_status = 'Paid' THEN 0
            WHEN mtp.payment_status = 'Pending' AND mtp.due_date >= CURDATE() THEN 0
            WHEN mtp.payment_status = 'Pending' AND mtp.due_date < CURDATE() THEN DATEDIFF(CURDATE(), mtp.due_date)
            ELSE 0
        END as days_overdue
    FROM tbl_membership_term_payment mtp
    JOIN tbl_organization o ON mtp.organization_id = o.organization_id
    JOIN tbl_academic_term at ON mtp.term_id = at.term_id
    WHERE mtp.user_id = p_user_id
    AND (p_organization_id IS NULL OR mtp.organization_id = p_organization_id)
    ORDER BY at.academic_year DESC, at.start_date DESC, o.name;
END$$

-- 7. Update overdue payments status
CREATE DEFINER='admin'@'%' PROCEDURE UpdateOverdueTermPayments()
BEGIN
    DECLARE v_updated_count INT DEFAULT 0;
    
    UPDATE tbl_membership_term_payment 
    SET 
        payment_status = 'Overdue',
        updated_at = CURRENT_TIMESTAMP
    WHERE payment_status = 'Pending' 
    AND due_date < CURDATE();
    
    SET v_updated_count = ROW_COUNT();
    
    -- Log action if any payments were updated
    IF v_updated_count > 0 THEN
        CALL LogAction(
            'system',
            CONCAT('Updated ', v_updated_count, ' term payments to overdue status'),
            'TERM_PAYMENT_OVERDUE_UPDATE',
            JSON_OBJECT('updated_count', v_updated_count),
            NULL,
            NULL
        );
    END IF;
    
    SELECT v_updated_count as overdue_payments_updated;
END$$

DELIMITER ;

-- ===================================================================
-- END OF TERM PAYMENT SYSTEM PROCEDURES
-- ===================================================================