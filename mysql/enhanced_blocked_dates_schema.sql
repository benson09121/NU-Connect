-- ===================================================================
-- ENHANCED SDAO BLOCKED DATES SYSTEM - DATABASE SCHEMA DESIGN
-- ===================================================================

-- 1. Enhance existing blocked period table with additional features
ALTER TABLE tbl_blocked_period 
ADD COLUMN blocked_period_type ENUM('University Event', 'Maintenance', 'Holiday', 'Exam Period', 'Custom') DEFAULT 'Custom' AFTER reason,
ADD COLUMN priority_level ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium' AFTER blocked_period_type,
ADD COLUMN affects_all_venues BOOLEAN DEFAULT TRUE AFTER priority_level,
ADD COLUMN description TEXT NULL AFTER affects_all_venues,
ADD COLUMN notification_sent BOOLEAN DEFAULT FALSE AFTER description,
ADD COLUMN auto_created BOOLEAN DEFAULT FALSE AFTER notification_sent,
ADD COLUMN parent_blocked_period_id INT NULL AFTER auto_created,
ADD CONSTRAINT fk_parent_blocked_period FOREIGN KEY (parent_blocked_period_id) REFERENCES tbl_blocked_period(blocked_period_id) ON DELETE CASCADE;

-- 2. Create blocked period venue restrictions (for partial venue blocking)
CREATE TABLE tbl_blocked_period_venue (
    blocked_venue_id INT AUTO_INCREMENT PRIMARY KEY,
    blocked_period_id INT NOT NULL,
    venue_name VARCHAR(255) NOT NULL,
    venue_type ENUM('Indoor', 'Outdoor', 'Auditorium', 'Classroom', 'Laboratory', 'Other') DEFAULT 'Other',
    building VARCHAR(100) NULL,
    floor VARCHAR(50) NULL,
    capacity INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blocked_period_id) REFERENCES tbl_blocked_period(blocked_period_id) ON DELETE CASCADE,
    INDEX idx_blocked_venue_period (blocked_period_id),
    INDEX idx_blocked_venue_name (venue_name)
);

-- 3. Create blocked period categories for better organization
CREATE TABLE tbl_blocked_period_category (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    category_color VARCHAR(7) DEFAULT '#FF0000', -- Hex color for UI display
    default_priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    requires_approval BOOLEAN DEFAULT FALSE,
    auto_notify_organizations BOOLEAN DEFAULT TRUE,
    description TEXT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- Add category reference to blocked periods
ALTER TABLE tbl_blocked_period 
ADD COLUMN category_id INT NULL AFTER parent_blocked_period_id,
ADD CONSTRAINT fk_blocked_period_category FOREIGN KEY (category_id) REFERENCES tbl_blocked_period_category(category_id) ON DELETE SET NULL;

-- 4. Create recurring blocked periods template
CREATE TABLE tbl_blocked_period_template (
    template_id INT AUTO_INCREMENT PRIMARY KEY,
    template_name VARCHAR(255) NOT NULL,
    category_id INT NULL,
    blocked_period_type ENUM('University Event', 'Maintenance', 'Holiday', 'Exam Period', 'Custom') DEFAULT 'Custom',
    priority_level ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    reason VARCHAR(255) NOT NULL,
    description TEXT NULL,
    duration_days INT NOT NULL DEFAULT 1,
    affects_all_venues BOOLEAN DEFAULT TRUE,
    recurrence_type ENUM('None', 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom') DEFAULT 'None',
    recurrence_interval INT DEFAULT 1, -- Every X days/weeks/months/years
    recurrence_days VARCHAR(20) NULL, -- For weekly: 'MON,WED,FRI', etc.
    recurrence_end_date DATE NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (category_id) REFERENCES tbl_blocked_period_category(category_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    INDEX idx_template_recurrence (recurrence_type, is_active)
);

-- 5. Create blocked period notifications
CREATE TABLE tbl_blocked_period_notification (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    blocked_period_id INT NOT NULL,
    notification_type ENUM('Creation', 'Update', 'Reminder', 'Cancellation') DEFAULT 'Creation',
    recipient_type ENUM('All Organizations', 'Specific Organizations', 'SDAO Only', 'All Users') DEFAULT 'All Organizations',
    message_title VARCHAR(255) NOT NULL,
    message_content TEXT NOT NULL,
    scheduled_send_time DATETIME NULL,
    sent_at DATETIME NULL,
    send_status ENUM('Pending', 'Sent', 'Failed', 'Cancelled') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (blocked_period_id) REFERENCES tbl_blocked_period(blocked_period_id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    INDEX idx_notification_status (send_status, scheduled_send_time)
);

-- 6. Create affected events tracking
CREATE TABLE tbl_blocked_period_affected_event (
    affected_event_id INT AUTO_INCREMENT PRIMARY KEY,
    blocked_period_id INT NOT NULL,
    event_id INT NOT NULL,
    organization_id INT NOT NULL,
    conflict_type ENUM('Full Overlap', 'Partial Overlap', 'Venue Conflict') DEFAULT 'Full Overlap',
    original_start_date DATE NOT NULL,
    original_end_date DATE NOT NULL,
    original_venue VARCHAR(255) NULL,
    resolution_status ENUM('Pending', 'Rescheduled', 'Cancelled', 'Approved Exception') DEFAULT 'Pending',
    resolution_notes TEXT NULL,
    resolved_at DATETIME NULL,
    resolved_by VARCHAR(200) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blocked_period_id) REFERENCES tbl_blocked_period(blocked_period_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES tbl_user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_affected_event_status (resolution_status),
    INDEX idx_affected_event_org (organization_id)
);

-- 7. Create enhanced view for blocked periods analytics
CREATE VIEW vw_blocked_period_analytics AS
SELECT 
    bp.blocked_period_id,
    bp.start_date,
    bp.end_date,
    bp.reason,
    bp.blocked_period_type,
    bp.priority_level,
    bp.affects_all_venues,
    bp.description,
    bp.auto_created,
    bp.created_at,
    bp.created_by,
    CONCAT(u.f_name, ' ', u.l_name) as created_by_name,
    bpc.category_name,
    bpc.category_color,
    DATEDIFF(bp.end_date, bp.start_date) + 1 as duration_days,
    CASE 
        WHEN bp.start_date > CURDATE() THEN 'Upcoming'
        WHEN bp.start_date <= CURDATE() AND bp.end_date >= CURDATE() THEN 'Active'
        WHEN bp.end_date < CURDATE() THEN 'Past'
    END as status,
    (SELECT COUNT(*) FROM tbl_blocked_period_venue bpv WHERE bpv.blocked_period_id = bp.blocked_period_id) as restricted_venues_count,
    (SELECT COUNT(*) FROM tbl_blocked_period_affected_event bpae WHERE bpae.blocked_period_id = bp.blocked_period_id) as affected_events_count,
    (SELECT COUNT(*) FROM tbl_blocked_period_affected_event bpae WHERE bpae.blocked_period_id = bp.blocked_period_id AND bpae.resolution_status = 'Pending') as pending_conflicts_count
FROM tbl_blocked_period bp
LEFT JOIN tbl_user u ON bp.created_by = u.user_id
LEFT JOIN tbl_blocked_period_category bpc ON bp.category_id = bpc.category_id
WHERE bp.archived_at IS NULL;

-- 8. Create indexes for performance optimization
CREATE INDEX idx_blocked_period_dates ON tbl_blocked_period (start_date, end_date, archived_at);
CREATE INDEX idx_blocked_period_type_priority ON tbl_blocked_period (blocked_period_type, priority_level);
CREATE INDEX idx_blocked_period_status ON tbl_blocked_period (archived_at, auto_created);

-- 9. Sample blocked period categories
INSERT INTO tbl_blocked_period_category (category_name, category_color, default_priority, requires_approval, auto_notify_organizations, description, created_by) VALUES
('University Events', '#1976D2', 'High', FALSE, TRUE, 'Official university-wide events and ceremonies', 'system'),
('Maintenance', '#FF9800', 'Medium', FALSE, TRUE, 'Scheduled maintenance and facility repairs', 'system'),
('Holidays', '#4CAF50', 'Low', FALSE, TRUE, 'National and university holidays', 'system'),
('Exam Periods', '#F44336', 'Critical', FALSE, TRUE, 'Midterm and final examination periods', 'system'),
('Emergency', '#D32F2F', 'Critical', FALSE, TRUE, 'Emergency situations requiring immediate venue closure', 'system');

-- 10. Create trigger to automatically check for event conflicts
DELIMITER $$

CREATE TRIGGER tr_check_event_conflicts_on_blocked_period
AFTER INSERT ON tbl_blocked_period
FOR EACH ROW
BEGIN
    -- Find conflicting events and add them to affected events table
    INSERT INTO tbl_blocked_period_affected_event (
        blocked_period_id, event_id, organization_id, conflict_type,
        original_start_date, original_end_date, original_venue
    )
    SELECT 
        NEW.blocked_period_id,
        e.event_id,
        e.organization_id,
        CASE 
            WHEN e.start_date >= NEW.start_date AND e.end_date <= NEW.end_date THEN 'Full Overlap'
            WHEN (NEW.affects_all_venues = FALSE AND EXISTS (
                SELECT 1 FROM tbl_blocked_period_venue bpv 
                WHERE bpv.blocked_period_id = NEW.blocked_period_id 
                AND bpv.venue_name = e.venue
            )) THEN 'Venue Conflict'
            ELSE 'Partial Overlap'
        END,
        e.start_date,
        e.end_date,
        e.venue
    FROM tbl_event e
    WHERE e.status NOT IN ('Archived', 'Cancelled')
    AND (
        (e.start_date BETWEEN NEW.start_date AND NEW.end_date) OR
        (e.end_date BETWEEN NEW.start_date AND NEW.end_date) OR
        (e.start_date <= NEW.start_date AND e.end_date >= NEW.end_date)
    )
    AND (
        NEW.affects_all_venues = TRUE OR
        EXISTS (
            SELECT 1 FROM tbl_blocked_period_venue bpv 
            WHERE bpv.blocked_period_id = NEW.blocked_period_id 
            AND bpv.venue_name = e.venue
        )
    );
END$$

-- Trigger to prevent creating events during blocked periods
CREATE TRIGGER tr_prevent_event_during_blocked_period
BEFORE INSERT ON tbl_event
FOR EACH ROW
BEGIN
    DECLARE v_blocked_count INT DEFAULT 0;
    DECLARE v_blocked_reason VARCHAR(255);
    
    -- Check for conflicts with blocked periods
    SELECT COUNT(*), GROUP_CONCAT(bp.reason SEPARATOR ', ')
    INTO v_blocked_count, v_blocked_reason
    FROM tbl_blocked_period bp
    WHERE bp.archived_at IS NULL
    AND (
        (NEW.start_date BETWEEN bp.start_date AND bp.end_date) OR
        (NEW.end_date BETWEEN bp.start_date AND bp.end_date) OR
        (NEW.start_date <= bp.start_date AND NEW.end_date >= bp.end_date)
    )
    AND (
        bp.affects_all_venues = TRUE OR
        EXISTS (
            SELECT 1 FROM tbl_blocked_period_venue bpv 
            WHERE bpv.blocked_period_id = bp.blocked_period_id 
            AND bpv.venue_name = NEW.venue
        )
    );
    
    IF v_blocked_count > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = CONCAT('Event cannot be scheduled during blocked period: ', v_blocked_reason);
    END IF;
END$$

DELIMITER ;

-- 11. Create settings for blocked periods system
CREATE TABLE tbl_blocked_period_settings (
    setting_id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- Default blocked period settings
INSERT INTO tbl_blocked_period_settings (setting_key, setting_value, description, updated_by) VALUES
('auto_notify_organizations', 'true', 'Automatically notify organizations when blocked periods are created', 'system'),
('notification_advance_days', '7', 'Days in advance to send notifications about upcoming blocked periods', 'system'),
('allow_event_exceptions', 'false', 'Allow SDAO to approve event exceptions during blocked periods', 'system'),
('max_blocked_period_duration', '365', 'Maximum allowed duration in days for a single blocked period', 'system'),
('require_approval_critical', 'true', 'Require additional approval for critical priority blocked periods', 'system');

-- ===================================================================
-- END OF ENHANCED SDAO BLOCKED DATES SYSTEM SCHEMA
-- ===================================================================