-- QR VERIFICATION SYSTEM DATABASE SCHEMA
-- This file adds QR verification functionality to the NU-Connect system

-- Create the main verification tokens table
CREATE TABLE tbl_transaction_verification (
    verification_id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_id INT NOT NULL,
    jwt_token_id VARCHAR(255) NOT NULL UNIQUE,     -- The 'jti' claim from JWT
    token_hash VARCHAR(255) NOT NULL,              -- SHA-256 of the JWT token
    generated_by VARCHAR(200) NOT NULL,            -- User who generated the QR
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    verification_count INT DEFAULT 0,
    last_verified_at TIMESTAMP NULL,
    last_verified_ip VARCHAR(45) NULL,
    last_verified_user_agent TEXT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP NULL,
    revoked_by VARCHAR(200) NULL,
    revoke_reason VARCHAR(255) NULL,
    
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (generated_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (revoked_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    
    INDEX idx_token_hash (token_hash),
    INDEX idx_jwt_id (jwt_token_id),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_verification_count (verification_count),
    INDEX idx_generated_by (generated_by)
);

-- Update the transaction table to include QR verification fields
ALTER TABLE tbl_transaction 
ADD COLUMN verification_enabled BOOLEAN DEFAULT TRUE COMMENT 'Whether QR verification is enabled for this transaction',
ADD COLUMN verification_token_id VARCHAR(255) NULL COMMENT 'Current active verification token ID',
ADD INDEX idx_verification_token (verification_token_id);

-- Stored Procedure: Generate QR Verification Token
DELIMITER $$
CREATE PROCEDURE GenerateQRVerificationToken(
    IN p_transaction_id INT,
    IN p_jwt_token_id VARCHAR(255),
    IN p_token_hash VARCHAR(255),
    IN p_generated_by VARCHAR(200),
    IN p_expires_at TIMESTAMP
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Revoke any existing active token for this transaction
    UPDATE tbl_transaction_verification 
    SET is_revoked = TRUE, 
        revoked_at = CURRENT_TIMESTAMP,
        revoked_by = p_generated_by,
        revoke_reason = 'Replaced by new token'
    WHERE transaction_id = p_transaction_id 
      AND is_revoked = FALSE
      AND expires_at > CURRENT_TIMESTAMP;
    
    -- Insert new verification token
    INSERT INTO tbl_transaction_verification (
        transaction_id, jwt_token_id, token_hash, 
        generated_by, expires_at
    ) VALUES (
        p_transaction_id, p_jwt_token_id, p_token_hash,
        p_generated_by, p_expires_at
    );
    
    -- Update transaction record
    UPDATE tbl_transaction 
    SET verification_token_id = p_jwt_token_id,
        verification_enabled = TRUE
    WHERE transaction_id = p_transaction_id;
    
    -- Log the action (if LogAction procedure exists)
    -- CALL LogAction(
    --     (SELECT email FROM tbl_user WHERE user_id = p_generated_by),
    --     CONCAT('Generated QR verification token for transaction #', p_transaction_id),
    --     'QR_TOKEN_GENERATED',
    --     JSON_OBJECT(
    --         'transaction_id', p_transaction_id,
    --         'token_id', p_jwt_token_id,
    --         'expires_at', p_expires_at
    --     ),
    --     NULL,
    --     NULL
    -- );
    
    COMMIT;
    
    -- Return the created verification record
    SELECT 
        verification_id, 
        jwt_token_id, 
        expires_at,
        generated_at
    FROM tbl_transaction_verification 
    WHERE jwt_token_id = p_jwt_token_id;
END $$
DELIMITER ;

-- Stored Procedure: Verify QR Token
DELIMITER $$
CREATE PROCEDURE VerifyQRToken(
    IN p_jwt_token_id VARCHAR(255),
    IN p_client_ip VARCHAR(45),
    IN p_user_agent TEXT
)
BEGIN
    DECLARE v_verification_id INT DEFAULT NULL;
    DECLARE v_transaction_id INT DEFAULT NULL;
    DECLARE v_is_revoked BOOLEAN DEFAULT FALSE;
    DECLARE v_expires_at TIMESTAMP DEFAULT NULL;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    
    -- Get verification record
    SELECT verification_id, transaction_id, is_revoked, expires_at
    INTO v_verification_id, v_transaction_id, v_is_revoked, v_expires_at
    FROM tbl_transaction_verification
    WHERE jwt_token_id = p_jwt_token_id;
    
    -- Check if token exists
    IF v_verification_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid verification token';
    END IF;
    
    -- Check if token is revoked
    IF v_is_revoked = TRUE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verification token has been revoked';
    END IF;
    
    -- Check if token is expired
    IF v_expires_at < CURRENT_TIMESTAMP THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Verification token has expired';
    END IF;
    
    -- Update verification stats
    UPDATE tbl_transaction_verification
    SET verification_count = verification_count + 1,
        last_verified_at = CURRENT_TIMESTAMP,
        last_verified_ip = p_client_ip,
        last_verified_user_agent = p_user_agent
    WHERE verification_id = v_verification_id;
    
    COMMIT;
    
    -- Return transaction details with verification info
    SELECT 
        t.transaction_id,
        t.receipt_no,
        t.amount,
        'PHP' AS currency,
        t.transaction_date,
        t.status,
        t.payer_name,
        pt.label AS payment_type,
        tt.label AS transaction_type,
        COALESCE(o.organization_name, 'Unknown') AS organization_name,
        tv.verification_count,
        tv.generated_at AS token_generated_at,
        tv.last_verified_at,
        CURRENT_TIMESTAMP AS verified_at,
        TRUE AS is_authentic
    FROM tbl_transaction t
    JOIN tbl_transaction_verification tv ON t.transaction_id = tv.transaction_id
    LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    LEFT JOIN tbl_organization_version ov ON tm.organization_id = ov.organization_id
    LEFT JOIN tbl_organization o ON ov.organization_id = o.organization_id
    WHERE tv.jwt_token_id = p_jwt_token_id;
END $$
DELIMITER ;

-- Stored Procedure: Revoke QR Token
DELIMITER $$
CREATE PROCEDURE RevokeQRToken(
    IN p_transaction_id INT,
    IN p_revoked_by VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_token_id VARCHAR(255) DEFAULT NULL;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    
    -- Get the current active token
    SELECT jwt_token_id INTO v_token_id
    FROM tbl_transaction_verification
    WHERE transaction_id = p_transaction_id
      AND is_revoked = FALSE
      AND expires_at > CURRENT_TIMESTAMP
    ORDER BY generated_at DESC
    LIMIT 1;
    
    IF v_token_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active verification token found for this transaction';
    END IF;
    
    -- Revoke the token
    UPDATE tbl_transaction_verification
    SET is_revoked = TRUE,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_by = p_revoked_by,
        revoke_reason = p_reason
    WHERE jwt_token_id = v_token_id;
    
    -- Update transaction record
    UPDATE tbl_transaction
    SET verification_token_id = NULL,
        verification_enabled = FALSE
    WHERE transaction_id = p_transaction_id;
    
    COMMIT;
    
    -- Return success info
    SELECT 
        v_token_id AS revoked_token_id,
        CURRENT_TIMESTAMP AS revoked_at,
        p_reason AS reason;
END $$
DELIMITER ;

-- Clean up expired tokens (can be run as a scheduled job)
DELIMITER $$
CREATE PROCEDURE CleanupExpiredQRTokens()
BEGIN
    DECLARE cleaned_count INT DEFAULT 0;
    
    -- Count expired tokens
    SELECT COUNT(*) INTO cleaned_count
    FROM tbl_transaction_verification
    WHERE expires_at < CURRENT_TIMESTAMP
      AND is_revoked = FALSE;
    
    -- Mark expired tokens as revoked
    UPDATE tbl_transaction_verification
    SET is_revoked = TRUE,
        revoked_at = CURRENT_TIMESTAMP,
        revoke_reason = 'Expired automatically'
    WHERE expires_at < CURRENT_TIMESTAMP
      AND is_revoked = FALSE;
    
    -- Update transaction records
    UPDATE tbl_transaction t
    SET verification_token_id = NULL,
        verification_enabled = TRUE  -- Keep enabled, just remove expired token
    WHERE EXISTS (
        SELECT 1 FROM tbl_transaction_verification tv
        WHERE tv.transaction_id = t.transaction_id
          AND tv.expires_at < CURRENT_TIMESTAMP
          AND tv.revoke_reason = 'Expired automatically'
    );
    
    SELECT CONCAT('Cleaned up ', cleaned_count, ' expired QR tokens') AS result;
END $$
DELIMITER ;

-- Optional: Create a view for easy token status checking
CREATE VIEW v_transaction_qr_status AS
SELECT 
    t.transaction_id,
    t.receipt_no,
    t.verification_enabled,
    t.verification_token_id,
    tv.jwt_token_id,
    tv.expires_at,
    tv.is_revoked,
    tv.verification_count,
    tv.last_verified_at,
    CASE 
        WHEN tv.jwt_token_id IS NULL THEN 'No Token'
        WHEN tv.is_revoked = TRUE THEN 'Revoked'
        WHEN tv.expires_at < CURRENT_TIMESTAMP THEN 'Expired'
        ELSE 'Active'
    END AS token_status
FROM tbl_transaction t
LEFT JOIN tbl_transaction_verification tv ON t.verification_token_id = tv.jwt_token_id
ORDER BY t.transaction_id DESC;

-- Grant permissions for the new procedures (adjust user as needed)
-- GRANT EXECUTE ON PROCEDURE GenerateQRVerificationToken TO 'nuconnect_app'@'%';
-- GRANT EXECUTE ON PROCEDURE VerifyQRToken TO 'nuconnect_app'@'%';
-- GRANT EXECUTE ON PROCEDURE RevokeQRToken TO 'nuconnect_app'@'%';
-- GRANT EXECUTE ON PROCEDURE CleanupExpiredQRTokens TO 'nuconnect_app'@'%';

-- Insert some example data (optional - for testing)
-- This would be done by the application, but here for reference
/*
INSERT INTO tbl_transaction_verification (
    transaction_id, 
    jwt_token_id, 
    token_hash, 
    generated_by, 
    expires_at
) VALUES (
    1,  -- Assuming transaction_id 1 exists
    'test-jwt-id-123',
    SHA2('test-jwt-token-hash', 256),
    'admin@nuconnect.app',  -- Assuming this user exists
    DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 YEAR)
);
*/