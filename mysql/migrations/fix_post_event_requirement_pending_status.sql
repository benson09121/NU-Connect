-- ================================================================
-- FIX: Post-Event Requirements Should Start as "Pending"
-- ================================================================
-- Issue: Post-event requirements were automatically set to "Approved"
--        status, preventing proper review workflow.
-- 
-- Solution: Set status to "Pending" when submitted, allowing SDAO
--           to review and mark as "Viewed" before approval.
-- ================================================================

USE db_nuconnect;

-- Drop and recreate the procedure
DROP PROCEDURE IF EXISTS UploadOrUpdatePostEventRequirement;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UploadOrUpdatePostEventRequirement(
    IN p_event_id INT,
    IN p_event_application_id INT,
    IN p_requirement_id INT,
    IN p_cycle_number INT,
    IN p_organization_id INT,
    IN p_file_path VARCHAR(255),
    IN p_submitted_by VARCHAR(200)
)
BEGIN
    DECLARE v_event_application_id INT;
    DECLARE v_submission_id INT;

    -- Lookup event_application_id if not provided
    IF p_event_application_id IS NULL OR p_event_application_id = 0 THEN
        SELECT event_application_id INTO v_event_application_id
        FROM tbl_event_application
        WHERE proposed_event_id = p_event_id
        LIMIT 1;
    ELSE
        SET v_event_application_id = p_event_application_id;
    END IF;

    -- Check if a submission already exists for this event, requirement, and user
    SELECT submission_id INTO v_submission_id
    FROM tbl_event_requirement_submissions
    WHERE event_id = p_event_id
      AND event_application_id = v_event_application_id
      AND requirement_id = p_requirement_id
      AND submitted_by = p_submitted_by
    LIMIT 1;

    IF v_submission_id IS NOT NULL THEN
        -- Update the existing submission with Pending status for re-review
        UPDATE tbl_event_requirement_submissions
        SET file_path = p_file_path,
            submitted_at = CURRENT_TIMESTAMP,
            status = 'Pending',
            viewed_by = NULL,
            viewed_at = NULL
        WHERE submission_id = v_submission_id;
    ELSE
        -- Insert a new submission with status 'Pending' awaiting review
        INSERT INTO tbl_event_requirement_submissions (
            event_id,
            event_application_id,
            requirement_id,
            cycle_number,
            organization_id,
            file_path,
            submitted_by,
            status
        ) VALUES (
            p_event_id,
            v_event_application_id,
            p_requirement_id,
            p_cycle_number,
            p_organization_id,
            p_file_path,
            p_submitted_by,
            'Pending'
        );
    END IF;
END$$
DELIMITER ;

-- ================================================================
-- Verification Query
-- ================================================================
-- Run this to check the procedure was updated:
-- SHOW CREATE PROCEDURE UploadOrUpdatePostEventRequirement;
-- ================================================================
