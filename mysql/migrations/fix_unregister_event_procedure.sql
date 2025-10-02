-- ================================================================
-- MIGRATION: Fix UnRegisterEvent Stored Procedure
-- Date: October 3, 2025
-- Issue: Parameter shadowing causing all registrations to be deleted
-- ================================================================

-- Drop the buggy procedure
DROP PROCEDURE IF EXISTS UnRegisterEvent;

-- Create the fixed procedure with proper parameter naming
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnRegisterEvent(IN
    p_event_id INT,
    p_user_id VARCHAR(200)
)
BEGIN
    -- Select the record first for real-time updates
    SELECT
        ea.attendance_id as id,
        ea.event_id,
        ea.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        ea.status AS attendance_status,
        te.remarks,
        ea.time_in,
        ea.time_out,
        ea.created_at AS registration_date,
        t.transaction_id,
        t.amount,
        tt.label AS transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_user u ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id 
    LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id AND ea.user_id = t.user_id
    LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    WHERE ea.event_id = p_event_id AND ea.user_id = p_user_id;

    -- Then delete the record (now using proper parameter names)
    DELETE FROM tbl_event_attendance 
    WHERE event_id = p_event_id AND user_id = p_user_id;
END $$
DELIMITER ;

-- ================================================================
-- VERIFICATION QUERY
-- Run this to check the procedure was created correctly:
-- ================================================================

-- SHOW CREATE PROCEDURE UnRegisterEvent;

-- ================================================================
-- TEST PROCEDURE (Optional - run in development only)
-- ================================================================

-- Before testing:
-- 1. Insert test registrations:
-- INSERT INTO tbl_event_attendance (event_id, user_id, status, created_at) 
-- VALUES 
--   (1, 'test_user_1', 'Registered', NOW()),
--   (1, 'test_user_2', 'Registered', NOW()),
--   (1, 'test_user_3', 'Registered', NOW());

-- 2. Check all registrations exist:
-- SELECT * FROM tbl_event_attendance WHERE event_id = 1;
-- Expected: 3 rows

-- 3. Cancel one user's registration:
-- CALL UnRegisterEvent(1, 'test_user_1');

-- 4. Verify only that user was removed:
-- SELECT * FROM tbl_event_attendance WHERE event_id = 1;
-- Expected: 2 rows (test_user_2 and test_user_3 still there)

-- 5. Cleanup:
-- DELETE FROM tbl_event_attendance WHERE event_id = 1;

-- ================================================================
-- ROLLBACK (if needed)
-- ================================================================

-- If you need to rollback to the old (buggy) version:
-- DROP PROCEDURE IF EXISTS UnRegisterEvent;

-- DELIMITER $$
-- CREATE DEFINER='admin'@'%' PROCEDURE UnRegisterEvent(IN
--     event_id INT,
--     user_id VARCHAR(200)
-- )
-- BEGIN
--     SELECT ... WHERE ea.event_id = event_id AND ea.user_id = user_id;
--     DELETE FROM tbl_event_attendance WHERE event_id = event_id AND user_id = user_id;
-- END $$
-- DELIMITER ;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
