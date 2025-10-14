-- Migration: Add stored procedures for approving and rejecting post-event requirements
-- Date: 2025-10-14
-- Description: Adds ApprovePostEventRequirement and RejectPostEventRequirement procedures
--              to enable SDAO staff to approve or reject submitted post-event requirements

USE db_nuconnect;

-- Drop existing procedures if they exist
DROP PROCEDURE IF EXISTS ApprovePostEventRequirement;
DROP PROCEDURE IF EXISTS RejectPostEventRequirement;

-- Create ApprovePostEventRequirement procedure
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApprovePostEventRequirement(
    IN p_submission_id INT,
    IN p_user_email VARCHAR(100),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_approver_id VARCHAR(200);
    DECLARE v_current_status ENUM('Pending', 'Approved', 'Rejected', 'Viewed');
    DECLARE v_event_id INT;
    DECLARE v_organization_id INT;
    DECLARE v_requirement_id INT;

    -- Get user_id from email
    SELECT user_id INTO v_approver_id
      FROM tbl_user 
     WHERE email = p_user_email 
     LIMIT 1;
    
    IF v_approver_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;

    -- Get current status and details
    SELECT status, event_id, organization_id, requirement_id
      INTO v_current_status, v_event_id, v_organization_id, v_requirement_id
      FROM tbl_event_requirement_submissions
     WHERE submission_id = p_submission_id
     LIMIT 1;
    
    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission not found';
    END IF;

    -- Only allow approval from Pending or Viewed status
    IF v_current_status NOT IN ('Pending', 'Viewed') THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Submission cannot be approved from current status';
    END IF;

    -- Update status to Approved
    UPDATE tbl_event_requirement_submissions
       SET status = 'Approved',
           viewed_by = v_approver_id,
           viewed_at = CURRENT_TIMESTAMP
     WHERE submission_id = p_submission_id;

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Approved post-event requirement submission #', p_submission_id),
        'POST_EVENT_REQUIREMENT_APPROVED',
        JSON_OBJECT(
            'submission_id', p_submission_id,
            'approved_by', v_approver_id,
            'previous_status', v_current_status,
            'event_id', v_event_id,
            'organization_id', v_organization_id,
            'requirement_id', v_requirement_id,
            'remarks', p_remarks
        ),
        CONCAT('/event-requirements/submissions/', p_submission_id),
        NULL
    );

    -- Return updated submission
    SELECT 
        ers.submission_id,
        ers.event_id,
        e.title AS event_title,
        ers.event_application_id,
        ers.requirement_id,
        req.requirement_name,
        ers.status,
        ers.file_path,
        ers.submitted_by,
        CONCAT(u.f_name, ' ', u.l_name) AS submitted_by_name,
        ers.submitted_at,
        ers.viewed_by,
        CONCAT(v.f_name, ' ', v.l_name) AS approved_by_name,
        ers.viewed_at AS approved_at,
        ers.organization_id,
        ers.cycle_number
    FROM tbl_event_requirement_submissions ers
    LEFT JOIN tbl_event e ON ers.event_id = e.event_id
    LEFT JOIN tbl_event_application_requirement req ON ers.requirement_id = req.requirement_id
    LEFT JOIN tbl_user u ON ers.submitted_by = u.user_id
    LEFT JOIN tbl_user v ON ers.viewed_by = v.user_id
    WHERE ers.submission_id = p_submission_id;
END$$
DELIMITER ;

-- Create RejectPostEventRequirement procedure
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectPostEventRequirement(
    IN p_submission_id INT,
    IN p_user_email VARCHAR(100),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_rejector_id VARCHAR(200);
    DECLARE v_current_status ENUM('Pending', 'Approved', 'Rejected', 'Viewed');
    DECLARE v_event_id INT;
    DECLARE v_organization_id INT;
    DECLARE v_requirement_id INT;

    -- Get user_id from email
    SELECT user_id INTO v_rejector_id
      FROM tbl_user 
     WHERE email = p_user_email 
     LIMIT 1;
    
    IF v_rejector_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;

    -- Get current status and details
    SELECT status, event_id, organization_id, requirement_id
      INTO v_current_status, v_event_id, v_organization_id, v_requirement_id
      FROM tbl_event_requirement_submissions
     WHERE submission_id = p_submission_id
     LIMIT 1;
    
    IF v_current_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission not found';
    END IF;

    -- Only allow rejection from Pending or Viewed status
    IF v_current_status NOT IN ('Pending', 'Viewed') THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Submission cannot be rejected from current status';
    END IF;

    -- Update status to Rejected
    UPDATE tbl_event_requirement_submissions
       SET status = 'Rejected',
           viewed_by = v_rejector_id,
           viewed_at = CURRENT_TIMESTAMP
     WHERE submission_id = p_submission_id;

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Rejected post-event requirement submission #', p_submission_id, 
               IF(p_remarks IS NOT NULL, CONCAT(' - Reason: ', p_remarks), '')),
        'POST_EVENT_REQUIREMENT_REJECTED',
        JSON_OBJECT(
            'submission_id', p_submission_id,
            'rejected_by', v_rejector_id,
            'previous_status', v_current_status,
            'event_id', v_event_id,
            'organization_id', v_organization_id,
            'requirement_id', v_requirement_id,
            'remarks', p_remarks
        ),
        CONCAT('/event-requirements/submissions/', p_submission_id),
        NULL
    );

    -- Return updated submission
    SELECT 
        ers.submission_id,
        ers.event_id,
        e.title AS event_title,
        ers.event_application_id,
        ers.requirement_id,
        req.requirement_name,
        ers.status,
        ers.file_path,
        ers.submitted_by,
        CONCAT(u.f_name, ' ', u.l_name) AS submitted_by_name,
        ers.submitted_at,
        ers.viewed_by,
        CONCAT(v.f_name, ' ', v.l_name) AS rejected_by_name,
        ers.viewed_at AS rejected_at,
        ers.organization_id,
        ers.cycle_number
    FROM tbl_event_requirement_submissions ers
    LEFT JOIN tbl_event e ON ers.event_id = e.event_id
    LEFT JOIN tbl_event_application_requirement req ON ers.requirement_id = req.requirement_id
    LEFT JOIN tbl_user u ON ers.submitted_by = u.user_id
    LEFT JOIN tbl_user v ON ers.viewed_by = v.user_id
    WHERE ers.submission_id = p_submission_id;
END$$
DELIMITER ;

-- Verification queries
SELECT 'Migration completed successfully!' AS status;

-- Show the created procedures
SHOW PROCEDURE STATUS WHERE Db = 'db_nuconnect' 
  AND Name IN ('ApprovePostEventRequirement', 'RejectPostEventRequirement');
