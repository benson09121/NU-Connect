-- ================================================================
-- MIGRATION: Improve ScanTicket Error Messages
-- Date: October 3, 2025
-- Issue: Better error handling for already attended/evaluated users
-- ================================================================

-- Drop the existing procedure
DROP PROCEDURE IF EXISTS ScanTicket;

-- Create improved procedure with better error messages
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ScanTicket(
    IN p_email VARCHAR(100),
    IN p_event_id INT,
    IN p_verifier_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_attendance_id INT;
    DECLARE v_is_authorized BOOLEAN DEFAULT FALSE;
    DECLARE v_event_start_date DATE;
    DECLARE v_event_start_time TIME;
    DECLARE v_event_title VARCHAR(300);
    DECLARE v_event_status VARCHAR(20);
    
    -- Get user ID from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found with the provided email';
    END IF;
    
    -- Get event details using event_id
    SELECT organization_id, start_date, start_time, title, status 
    INTO v_organization_id, v_event_start_date, v_event_start_time, v_event_title, v_event_status
    FROM tbl_event
    WHERE event_id = p_event_id;
    
    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event not found with the provided ID';
    END IF;
    
    -- Check if event is approved
    IF v_event_status != 'Approved' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event is not approved for attendance scanning';
    END IF;
    
    -- Check if event has started (current date/time >= event start date/time)
    IF CURDATE() < v_event_start_date OR 
       (CURDATE() = v_event_start_date AND CURTIME() < v_event_start_time) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event has not started yet. Scanning is not allowed.';
    END IF;
    
    -- Verify scanning user's authority (Executive or Committee Head)
    SELECT EXISTS (
        SELECT 1
        FROM tbl_organization_members om
        JOIN tbl_renewal_cycle rc 
            ON om.organization_id = rc.organization_id 
            AND om.cycle_number = rc.cycle_number
        WHERE om.organization_id = v_organization_id
        AND om.user_id = p_verifier_user_id
        AND om.status = 'Active'
        AND (
            om.member_type = 'Executive'
            OR (
                om.member_type = 'Committee'
                AND EXISTS (
                    SELECT 1
                    FROM tbl_committee_members cm
                    JOIN tbl_committee c ON cm.committee_id = c.committee_id
                    JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
                    WHERE cm.user_id = p_verifier_user_id
                    AND c.organization_id = v_organization_id
                    AND cr.role_name = 'Committee Head'
                )
            )
        )
    ) INTO v_is_authorized;
    
    IF NOT v_is_authorized THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not authorized to verify tickets for this event';
    END IF;
    
    -- Find existing attendance record and check status
    SELECT attendance_id, status INTO v_attendance_id, @current_status
    FROM tbl_event_attendance
    WHERE event_id = p_event_id
    AND user_id = v_user_id
    AND deleted_at IS NULL;
    
    -- Check if user is registered at all
    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No valid registration found for this user and event';
    END IF;
    
    -- Check if user has already attended
    IF @current_status = 'Attended' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User has already been marked as attended for this event';
    END IF;
    
    -- Check if user has already evaluated
    IF @current_status = 'Evaluated' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User has already completed evaluation for this event';
    END IF;
    
    -- Check if user status is Registered or Pending
    IF @current_status NOT IN ('Registered', 'Pending') THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User registration status is not valid for attendance scanning';
    END IF;
    
    -- Update attendance record
    UPDATE tbl_event_attendance
    SET 
        status = 'Attended',
        time_in = NOW()
    WHERE attendance_id = v_attendance_id;
    
    -- Return success message with event details
    SELECT 
        'Ticket scanned successfully' AS message,
        v_event_title AS event_title,
        p_email AS attendee_email,
        NOW() AS scanned_at;
END$$
DELIMITER ;

-- ================================================================
-- VERIFICATION QUERY
-- ================================================================

-- SHOW CREATE PROCEDURE ScanTicket;

-- ================================================================
-- END OF MIGRATION
-- ================================================================
