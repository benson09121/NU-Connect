-- FIX: Update RejectApplication stored procedure to use correct column name
-- Issue: Procedure was trying to update 'comment' column which doesn't exist
-- Solution: Change to 'remarks' column which is the actual column name

USE nuconnect;

DROP PROCEDURE IF EXISTS RejectApplication;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectApplication(
    IN p_application_id INT,
    IN p_approval_id INT,
    IN p_comment TEXT
)
BEGIN
    START TRANSACTION;

    -- FIX: Use 'remarks' instead of 'comment'
    UPDATE tbl_organization_approval_chain
    SET status = 'Rejected',
        remarks = p_comment,
        approved_at = CURRENT_TIMESTAMP
    WHERE chain_id = p_approval_id;

    UPDATE tbl_application
    SET status = 'rejected',
        updated_at = CURRENT_TIMESTAMP
    WHERE application_id = p_application_id;

    COMMIT;

    SELECT 
        oac.chain_id as id,
        oac.approval_order as step,
        r.role_name,
        oac.status,
        u.email,
        u.f_name,
        u.l_name,
        u.user_id,
        oac.remarks,
        oac.approved_at as timestamp
    FROM tbl_organization_approval_chain oac
    JOIN tbl_role r ON oac.approver_role_id = r.role_id
    LEFT JOIN tbl_user u ON oac.approver_user_id = u.user_id
    WHERE oac.chain_id = p_approval_id;
END$$
DELIMITER ;

-- Verify the procedure was created
SELECT 'RejectApplication procedure updated successfully' AS status;
