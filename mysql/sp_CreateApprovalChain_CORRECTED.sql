-- This file contains the CORRECTED sp_CreateApprovalChain procedure
-- It uses application_id instead of org_version_id
-- Copy this procedure into init.sql to replace the old one

DELIMITER //
DROP PROCEDURE IF EXISTS sp_CreateApprovalChain//
CREATE PROCEDURE sp_CreateApprovalChain(
    IN p_application_id INT,
    IN p_initiated_by VARCHAR(200)
)
BEGIN
    DECLARE v_period_id INT;
    DECLARE v_category VARCHAR(50);
    DECLARE v_base_program_id INT;
    DECLARE v_college_id INT;
    DECLARE v_program_chair_id VARCHAR(200);
    DECLARE v_dean_id VARCHAR(200);
    DECLARE v_sdao_rank2_id VARCHAR(200);
    DECLARE v_sdao_rank1_id VARCHAR(200);
    DECLARE v_academic_director_id VARCHAR(200);
    DECLARE v_approval_order INT DEFAULT 0;
    DECLARE v_program_chair_role_id INT;
    DECLARE v_dean_role_id INT;
    DECLARE v_sdao_role_id INT;
    DECLARE v_faculty_role_id INT DEFAULT 7;
    DECLARE v_director_role_id INT;
    
    -- Get application details
    SELECT a.period_id, ov.category, a.base_program_id
    INTO v_period_id, v_category, v_base_program_id
    FROM tbl_application a
    LEFT JOIN tbl_organization_version ov ON a.org_version_id = ov.org_version_id
    WHERE a.application_id = p_application_id
    LIMIT 1;
    
    -- Get college_id from program
    SELECT college_id INTO v_college_id
    FROM tbl_program
    WHERE program_id = v_base_program_id;
    
    -- Get role IDs
    SELECT role_id INTO v_program_chair_role_id FROM tbl_role WHERE role_name LIKE '%Chair%' LIMIT 1;
    SELECT role_id INTO v_dean_role_id FROM tbl_role WHERE role_name LIKE '%Dean%' LIMIT 1;
    SELECT role_id INTO v_sdao_role_id FROM tbl_role WHERE role_name LIKE '%SDAO%' LIMIT 1;
    SELECT role_id INTO v_director_role_id FROM tbl_role WHERE role_name LIKE '%Academic Director%' OR role_name LIKE '%Director%' LIMIT 1;
    
    -- Auto-select approvers
    SELECT user_id INTO v_program_chair_id 
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    WHERE u.program_id = v_base_program_id
        AND (r.role_name LIKE '%Chair%' OR r.role_name LIKE '%Coordinator%')
        AND u.status = 'Active'
    LIMIT 1;
    
    SELECT dean_user_id INTO v_dean_id
    FROM tbl_college_dean
    WHERE college_id = v_college_id AND is_active = TRUE
    LIMIT 1;
    
    SELECT user_id INTO v_sdao_rank2_id
    FROM tbl_user u
    JOIN tbl_sdao_approver sa ON u.user_id = sa.user_id
    WHERE sa.sdao_rank = 2
        AND u.status = 'Active'
    LIMIT 1;
    
    SELECT user_id INTO v_sdao_rank1_id
    FROM tbl_user u
    JOIN tbl_sdao_approver sa ON u.user_id = sa.user_id
    WHERE sa.sdao_rank = 1
        AND u.status = 'Active'
    LIMIT 1;
    
    SELECT user_id INTO v_academic_director_id
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    WHERE (r.role_name LIKE '%Academic Director%' OR r.role_name LIKE '%Director%')
        AND u.status = 'Active'
    LIMIT 1;
    
    -- Clear existing chain (if any)
    DELETE FROM tbl_organization_approval_chain WHERE application_id = p_application_id;
    
    -- Build approval chain based on category
    IF v_category = 'Co-Curricular' THEN
        -- Co-Curricular Chain: Program Chair → Dean → SDAO Rank 2 → SDAO Rank 1 → SDAO Rank 2 (Final) → Academic Director
        -- NOTE: Adviser is NOT included in approval process
        
        -- Step 1: Program Chair
        IF v_program_chair_id IS NOT NULL THEN
            SET v_approval_order = v_approval_order + 1;
            INSERT INTO tbl_organization_approval_chain 
                (application_id, period_id, approver_user_id, approver_role_id, approval_order, status)
            VALUES 
                (p_application_id, v_period_id, v_program_chair_id, v_program_chair_role_id, v_approval_order, 'Pending');
        END IF;
        
        -- Step 2: Dean
        IF v_dean_id IS NOT NULL THEN
            SET v_approval_order = v_approval_order + 1;
            INSERT INTO tbl_organization_approval_chain 
                (application_id, period_id, approver_user_id, approver_role_id, approval_order, status)
            VALUES 
                (p_application_id, v_period_id, v_dean_id, v_dean_role_id, v_approval_order, 'Pending');
        END IF;
        
    ELSE
        -- Extra-Curricular Chain: (Faculty will be added via submitFacultySelection) → SDAO → Director
        -- NOTE: Adviser is NOT included in approval process
        -- Initial chain is empty, faculty selection will add first approvers
        SET v_approval_order = 0;
    END IF;
    
    -- Common approvers for both categories (SDAO → Academic Director)
    -- Step: SDAO Rank 2 (First appearance)
    IF v_sdao_rank2_id IS NOT NULL THEN
        SET v_approval_order = v_approval_order + 1;
        INSERT INTO tbl_organization_approval_chain 
            (application_id, period_id, approver_user_id, approver_role_id, approval_order, status)
        VALUES 
            (p_application_id, v_period_id, v_sdao_rank2_id, v_sdao_role_id, v_approval_order, 'Pending');
    END IF;
    
    -- Step: SDAO Rank 1
    IF v_sdao_rank1_id IS NOT NULL THEN
        SET v_approval_order = v_approval_order + 1;
        INSERT INTO tbl_organization_approval_chain 
            (application_id, period_id, approver_user_id, approver_role_id, approval_order, status)
        VALUES 
            (p_application_id, v_period_id, v_sdao_rank1_id, v_sdao_role_id, v_approval_order, 'Pending');
    END IF;
    
    -- Step: SDAO Rank 2 Final (same person as first SDAO) - MARKED AS FINAL APPROVAL
    IF v_sdao_rank2_id IS NOT NULL THEN
        SET v_approval_order = v_approval_order + 1;
        INSERT INTO tbl_organization_approval_chain 
            (application_id, period_id, approver_user_id, approver_role_id, approval_order, is_final_approval, status)
        VALUES 
            (p_application_id, v_period_id, v_sdao_rank2_id, v_sdao_role_id, v_approval_order, TRUE, 'Pending');
    END IF;
    
    -- Step: Academic Director - MARKED AS FINAL APPROVAL
    IF v_academic_director_id IS NOT NULL THEN
        SET v_approval_order = v_approval_order + 1;
        INSERT INTO tbl_organization_approval_chain 
            (application_id, period_id, approver_user_id, approver_role_id, approval_order, is_final_approval, status)
        VALUES 
            (p_application_id, v_period_id, v_academic_director_id, COALESCE(v_director_role_id, v_sdao_role_id), v_approval_order, TRUE, 'Pending');
    END IF;
    
    -- Return result
    SELECT 
        'success' as status,
        v_approval_order as chain_count,
        v_category as category,
        p_application_id as application_id,
        'Approval chain created successfully' as message;
END//
DELIMITER ;
