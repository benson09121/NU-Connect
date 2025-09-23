-- Update payment type labels to match frontend expectations
USE db_nuconnect;

UPDATE tbl_payment_type 
SET label = 'Bank Transfer' 
WHERE code = 'BANK';

-- Verify the update
SELECT * FROM tbl_payment_type;