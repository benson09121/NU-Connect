-- Migration: Allow Event Creation with Submitted Requirements (Any Status)
-- Date: 2025-10-14
-- Description: Updates GetAddEventStatus procedure to allow organizations to add new events
--              when all post-event requirements are submitted (regardless of approval status),
--              not just when they are approved.

USE db_nuconnect;

DROP PROCEDURE IF EXISTS GetAddEventStatus;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAddEventStatus(
    IN p_org_name VARCHAR(200)
)
BEGIN
    DECLARE v_org_id INT;
    DECLARE v_event_id INT;
    DECLARE v_event_status VARCHAR(20);
    DECLARE v_cycle_number INT;
    DECLARE v_post_req_count INT DEFAULT 0;
    DECLARE v_post_req_approved INT DEFAULT 0;
    DECLARE v_can_add_event BOOLEAN DEFAULT 0;

    -- Get organization_id
    SELECT organization_id INTO v_org_id
    FROM tbl_organization
    WHERE name = p_org_name
    LIMIT 1;

    -- Get most recent event for this org
    SELECT event_id, status, cycle_number
      INTO v_event_id, v_event_status, v_cycle_number
      FROM tbl_event
     WHERE organization_id = v_org_id
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_event_id IS NULL THEN
        -- No event yet, allow add
        SELECT
            NULL AS id,
            (SELECT MAX(cycle_number) FROM tbl_renewal_cycle WHERE organization_id = v_org_id) AS cycle_number,
            1 AS can_add_event;
    ELSE
        -- Count post-event requirements for this org
        SELECT COUNT(*) INTO v_post_req_count
        FROM tbl_event_application_requirement r
        WHERE r.is_applicable_to = 'post-event';

        -- Count submitted post-event requirement submissions for this event (any status: Pending, Viewed, Approved, Rejected)
        SELECT COUNT(DISTINCT ers.requirement_id) INTO v_post_req_approved
        FROM tbl_event_requirement_submissions ers
        JOIN tbl_event_application_requirement r ON ers.requirement_id = r.requirement_id
        WHERE ers.event_id = v_event_id
          AND r.is_applicable_to = 'post-event';
          -- Removed status check - now accepts any submitted requirement regardless of approval status

        -- Allow add if last event is Rejected OR all post-event requirements are submitted (regardless of approval status)
        IF v_event_status = 'Rejected' OR v_post_req_count = v_post_req_approved THEN
            SET v_can_add_event = 1;
        ELSE
            SET v_can_add_event = 0;
        END IF;

        SELECT
            v_event_id AS id,
            v_cycle_number AS cycle_number,
            v_can_add_event AS can_add_event;
    END IF;
END$$
DELIMITER ;

-- Verification query
SELECT 'Migration completed successfully!' AS status;

-- Show the updated procedure
SHOW PROCEDURE STATUS WHERE Db = 'db_nuconnect' AND Name = 'GetAddEventStatus';
