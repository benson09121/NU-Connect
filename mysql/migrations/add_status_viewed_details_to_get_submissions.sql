-- Migration: Add status and viewed details to GetEventRequirementSubmissionsByOrganization
-- Date: 2025-10-14
-- Purpose: Include submission status, viewer information, and viewed timestamp in organization submissions query

USE db_nuconnect;

-- Drop existing procedure
DROP PROCEDURE IF EXISTS GetEventRequirementSubmissionsByOrganization;

-- Recreate procedure with status and viewed details
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventRequirementSubmissionsByOrganization(
    IN p_organization_id INT
)
BEGIN
    SELECT
        ers.submission_id,
        ers.event_id,
        e.title AS event_title,
        ers.event_application_id,
        ers.cycle_number,
        ers.organization_id,
        o.name AS organization_name,
        ers.requirement_id,
        req.requirement_name,
        req.is_applicable_to,
        ers.file_path,
        ers.submitted_by,
        u.f_name AS submitted_by_first_name,
        u.l_name AS submitted_by_last_name,
        u.email AS submitted_by_email,
        ers.submitted_at,
        ers.status,
        ers.viewed_by,
        viewer.f_name AS viewed_by_first_name,
        viewer.l_name AS viewed_by_last_name,
        viewer.email AS viewed_by_email,
        ers.viewed_at
    FROM tbl_event_requirement_submissions ers
    LEFT JOIN tbl_event e ON ers.event_id = e.event_id
    LEFT JOIN tbl_organization o ON ers.organization_id = o.organization_id
    LEFT JOIN tbl_event_application_requirement req ON ers.requirement_id = req.requirement_id
    LEFT JOIN tbl_user u ON ers.submitted_by = u.user_id
    LEFT JOIN tbl_user viewer ON ers.viewed_by = viewer.user_id
    WHERE ers.organization_id = p_organization_id
    ORDER BY ers.submitted_at DESC;
END$$
DELIMITER ;

-- Verify the procedure was created
SELECT 
    ROUTINE_NAME,
    ROUTINE_TYPE,
    DEFINER,
    LAST_ALTERED
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'db_nuconnect'
  AND ROUTINE_NAME = 'GetEventRequirementSubmissionsByOrganization';
