-- Fix InitiateApprovalProcess Procedure - Co-Curricular Organization Bug
-- Issue: Column names had typos causing SQL errors when creating approvals
-- Fixed: application_t ype -> application_type, subm itted_org_name -> submitted_org_name

USE nuconnect_db;

DROP PROCEDURE IF EXISTS InitiateApprovalProcess;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE InitiateApprovalProcess(
    IN p_application_id INT,
    IN p_initiated_by VARCHAR(200)
)
BEGIN
    -- All DECLARE statements must come first in MySQL stored procedures
    DECLARE v_period_id INT;
    DECLARE v_application_type ENUM('new', 'renewal');
    DECLARE v_role_id INT;
    DECLARE v_hierarchy_order INT;
    DECLARE v_approver_id VARCHAR(200);
    DECLARE v_done BOOLEAN DEFAULT FALSE;
    DECLARE v_first_step BOOLEAN DEFAULT TRUE;
    DECLARE v_initiator_email VARCHAR(100);
    DECLARE v_last_approval_id INT;
    DECLARE v_last_approver_email VARCHAR(100);
    DECLARE v_submitted_org_name VARCHAR(255);
    DECLARE v_url VARCHAR(512);
    DECLARE v_org_category ENUM('Co-Curricular Organization','Extra Curricular Organization') DEFAULT 'Co-Curricular Organization';
    
    -- Cursor declaration with ALL roles (filtering happens in the loop)
    DECLARE role_cursor CURSOR FOR
        SELECT role_id, hierarchy_order
        FROM tbl_role
        WHERE is_approver = TRUE
          AND hierarchy_order IS NOT NULL
        ORDER BY hierarchy_order;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    -- Get period, application type, and organization category FIRST
    -- FIXED: Removed spaces from column names (application_t ype -> application_type, subm itted_org_name -> submitted_org_name)
    SELECT a.period_id, a.application_type, a.submitted_org_name, 
           COALESCE(ov.category, 'Co-Curricular Organization') as category
    INTO v_period_id, v_application_type, v_submitted_org_name, v_org_category
    FROM tbl_application a
    LEFT JOIN tbl_organization_version ov ON a.org_version_id = ov.org_version_id
    WHERE a.application_id = p_application_id
    LIMIT 1;

    SET v_url = CONCAT('/organizations/app-details/', p_application_id, '/', COALESCE(v_submitted_org_name, ''));

    -- Get initiator email for optional logging
    SELECT email INTO v_initiator_email FROM tbl_user WHERE user_id = p_initiated_by LIMIT 1;

    OPEN role_cursor;

    approval_loop: LOOP
        FETCH role_cursor INTO v_role_id, v_hierarchy_order;
        IF v_done THEN
            LEAVE approval_loop;
        END IF;

        -- Skip Program Chair (hierarchy_order = 2) and Dean (hierarchy_order = 3) 
        -- for Extra Curricular organizations
        IF v_org_category = 'Extra Curricular Organization' 
           AND v_hierarchy_order IN (2, 3) THEN
            ITERATE approval_loop; -- Skip this iteration and continue with next role
        END IF;

        -- For the first step (adviser role), handle differently based on application type
        IF v_first_step THEN
            -- For NEW applications: Use the actual adviser who submitted the application (p_initiated_by)
            -- For RENEWAL applications: Use the specific adviser of the organization
            IF v_application_type = 'new' THEN
                SET v_approver_id = p_initiated_by; -- Use the adviser who submitted
            ELSE
                -- For renewal, use the specific adviser of the organization being renewed
                SET v_approver_id = (
                    SELECT o.adviser_id
                    FROM tbl_application a
                    JOIN tbl_organization o ON a.organization_id = o.organization_id
                    WHERE a.application_id = p_application_id
                      AND o.adviser_id IS NOT NULL
                      AND EXISTS (
                          SELECT 1 FROM tbl_user u 
                          WHERE u.user_id = o.adviser_id 
                            AND u.role_id = v_role_id 
                            AND u.status = 'Active'
                      )
                    LIMIT 1
                );
            END IF;
        ELSE
            -- For subsequent steps, use the standard role-based selection
            SET v_approver_id = (
                SELECT user_id
                FROM tbl_user
                WHERE role_id = v_role_id
                  AND status = 'Active'
                LIMIT 1
            );
        END IF;

        IF v_approver_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM tbl_approval_process ap
                WHERE ap.application_id = p_application_id
                  AND ap.period_id = v_period_id
                  AND ap.approval_role_id = v_role_id
            ) THEN
                IF v_first_step THEN
                    -- For NEW applications: Auto-approve the adviser who submitted
                    -- For RENEWAL applications: Set as pending for adviser to approve
                    INSERT INTO tbl_approval_process (
                        application_id,
                        period_id,
                        approver_id,
                        approval_role_id,
                        application_type,
                        status,
                        step
                    ) VALUES (
                        p_application_id,
                        v_period_id,
                        v_approver_id,
                        v_role_id,
                        v_application_type,
                        CASE WHEN v_application_type = 'new' THEN 'Approved' ELSE 'Pending' END,
                        v_hierarchy_order
                    );
                    SET v_first_step = FALSE;
                ELSE
                    INSERT INTO tbl_approval_process (
                        application_id,
                        period_id,
                        approver_id,
                        approval_role_id,
                        application_type,
                        status,
                        step
                    ) VALUES (
                        p_application_id,
                        v_period_id,
                        v_approver_id,
                        v_role_id,
                        v_application_type,
                        'Pending',
                        v_hierarchy_order
                    );
                END IF;
            END IF;
        END IF;
    END LOOP approval_loop;

    CLOSE role_cursor;

    INSERT INTO tbl_application_approval (application_id, approval_id)
    SELECT p_application_id, ap.approval_id
    FROM tbl_approval_process ap
    LEFT JOIN tbl_application_approval aa
      ON aa.application_id = p_application_id
     AND aa.approval_id = ap.approval_id
    WHERE ap.application_id = p_application_id
      AND ap.period_id = v_period_id
      AND aa.approval_id IS NULL;

    SELECT approval_id, approver_id
    INTO v_last_approval_id, v_approver_id
    FROM tbl_approval_process
    WHERE application_id = p_application_id
      AND period_id = v_period_id
      AND status = 'Pending'
    ORDER BY step ASC
    LIMIT 1;

    IF EXISTS (
        SELECT 1 FROM tbl_approval_process 
        WHERE application_id = p_application_id
          AND period_id = v_period_id
          AND approver_id IS NOT NULL
    ) THEN
        UPDATE tbl_application 
        SET status = 'Pending'
        WHERE application_id = p_application_id;
    ELSE
        UPDATE tbl_application 
        SET status = 'Rejected'
        WHERE application_id = p_application_id;
    END IF;
END$$
DELIMITER ;

-- Test the fix (optional - remove in production)
SELECT 'InitiateApprovalProcess procedure has been fixed!' as Status;
