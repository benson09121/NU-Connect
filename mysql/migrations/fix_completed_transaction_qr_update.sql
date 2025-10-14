-- ================================================================
-- FIX: Allow QR Token Updates for Completed Transactions
-- ================================================================
-- Issue: When creating a transaction with status "Completed", 
--        the GenerateTransactionQRToken procedure fails because
--        the trigger blocks ALL updates to completed transactions.
-- 
-- Solution: Allow QR token/enabled field updates while still
--           protecting all financial and audit trail data.
-- ================================================================

USE db_nuconnect;

-- Drop the existing trigger
DROP TRIGGER IF EXISTS trg_transaction_before_update;

-- Recreate with QR token exception
DELIMITER $$

CREATE TRIGGER trg_transaction_before_update
BEFORE UPDATE ON tbl_transaction
FOR EACH ROW
BEGIN
    -- Allow QR token updates for Completed transactions (these don't affect financial data)
    -- Check if ONLY qr_token and qr_enabled fields are being updated
    IF OLD.status = 'Completed' THEN
        -- Allow if only QR-related fields are changing
        IF NOT (
            -- All financial/audit fields must remain unchanged
            OLD.user_id <=> NEW.user_id AND
            OLD.payer_name <=> NEW.payer_name AND
            OLD.payee_name <=> NEW.payee_name AND
            OLD.payment_description <=> NEW.payment_description AND
            OLD.amount <=> NEW.amount AND
            OLD.transaction_type_id <=> NEW.transaction_type_id AND
            OLD.payment_type_id <=> NEW.payment_type_id AND
            OLD.category_id <=> NEW.category_id AND
            OLD.org_version_id <=> NEW.org_version_id AND
            OLD.status <=> NEW.status AND
            OLD.transaction_date <=> NEW.transaction_date AND
            OLD.receipt_no <=> NEW.receipt_no AND
            OLD.proof_image <=> NEW.proof_image AND
            OLD.remarks <=> NEW.remarks
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Completed transactions cannot be modified';
        END IF;
    END IF;
    
    -- Validate status transitions (no reverting from terminal states)
    IF OLD.status = 'Failed' AND NEW.status != 'Failed' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Failed transactions cannot be changed';
    END IF;
    
    IF OLD.status = 'Cancelled' AND NEW.status != 'Cancelled' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cancelled transactions cannot be changed';
    END IF;
END$$

DELIMITER ;

-- ================================================================
-- Verification Query
-- ================================================================
-- Run this after applying the migration to verify the trigger exists:
-- SHOW TRIGGERS FROM db_nuconnect WHERE Trigger = 'trg_transaction_before_update';
-- ================================================================
