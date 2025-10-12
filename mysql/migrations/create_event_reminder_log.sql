-- Migration: Add Event Reminder Tracking Table
-- Purpose: Track which email reminders have been sent to prevent duplicates
-- Date: 2025-10-12

-- Create event reminder log table
CREATE TABLE IF NOT EXISTS tbl_event_reminder_log (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    reminder_type ENUM('week_before', 'day_before', 'day_of') NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recipient_email VARCHAR(255) NOT NULL,
    
    -- Indexes for performance
    INDEX idx_event_user (event_id, user_id),
    INDEX idx_reminder_type (reminder_type),
    INDEX idx_sent_at (sent_at),
    
    -- Unique constraint to prevent duplicate reminders
    UNIQUE KEY unique_reminder (event_id, user_id, reminder_type),
    
    -- Foreign keys
    CONSTRAINT fk_reminder_event 
        FOREIGN KEY (event_id) 
        REFERENCES tbl_event(event_id) 
        ON DELETE CASCADE,
    
    CONSTRAINT fk_reminder_user 
        FOREIGN KEY (user_id) 
        REFERENCES tbl_user(user_id) 
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment to table
ALTER TABLE tbl_event_reminder_log 
COMMENT = 'Tracks automated event reminder emails sent to participants';

-- Optional: Create a view for easy reminder monitoring
CREATE OR REPLACE VIEW vw_event_reminders AS
SELECT 
    erl.log_id,
    erl.event_id,
    e.title AS event_title,
    e.start_date,
    e.start_time,
    erl.user_id,
    u.email,
    CONCAT(u.f_name, ' ', u.l_name) AS participant_name,
    erl.reminder_type,
    erl.sent_at,
    CASE erl.reminder_type
        WHEN 'week_before' THEN '1 Week Before'
        WHEN 'day_before' THEN '1 Day Before'
        WHEN 'day_of' THEN 'Day Of Event'
    END AS reminder_description
FROM tbl_event_reminder_log erl
INNER JOIN tbl_event e ON erl.event_id = e.event_id
INNER JOIN tbl_user u ON erl.user_id = u.user_id
ORDER BY erl.sent_at DESC;

-- Optional: Procedure to clean up old reminder logs (older than 1 year)
DELIMITER //

CREATE PROCEDURE CleanupOldReminderLogs()
BEGIN
    DECLARE deleted_count INT DEFAULT 0;
    
    DELETE FROM tbl_event_reminder_log
    WHERE sent_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
    
    SET deleted_count = ROW_COUNT();
    
    SELECT CONCAT('Cleaned up ', deleted_count, ' old reminder logs') AS result;
END //

DELIMITER ;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT ON tbl_event_reminder_log TO 'your_app_user'@'%';

-- Verification queries
SELECT 
    'tbl_event_reminder_log' AS table_name,
    COUNT(*) AS row_count,
    MAX(sent_at) AS last_reminder_sent
FROM tbl_event_reminder_log;

-- Show table structure
DESCRIBE tbl_event_reminder_log;
