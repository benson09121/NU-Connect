-- ========================================
-- ENDORSED STATUS MIGRATION SCRIPT
-- ========================================
-- Run this AFTER deploying the new schema if you have existing data

USE nuconnect_db;

-- Step 1: Add new columns if they don't exist (for existing databases)
-- ========================================

-- Check if columns exist, add if not
SET @dbname = 'nuconnect_db';
SET @tablename = 'tbl_organization_approval_chain';
SET @columnname = 'uses_endorsed';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 'Column uses_endorsed already exists' AS msg;",
  "ALTER TABLE tbl_organization_approval_chain ADD COLUMN uses_endorsed BOOLEAN DEFAULT FALSE COMMENT 'TRUE for Dean, Program Chair, and Extra-Curricular Faculty' AFTER is_final_approval;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add endorsed_at column
SET @columnname = 'endorsed_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 'Column endorsed_at already exists' AS msg;",
  "ALTER TABLE tbl_organization_approval_chain ADD COLUMN endorsed_at TIMESTAMP NULL COMMENT 'When approver clicked Endorse' AFTER signature_path;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Step 2: Update status ENUM to include 'Endorsed'
-- ========================================

ALTER TABLE tbl_organization_approval_chain
MODIFY COLUMN status ENUM('Pending', 'Endorsed', 'Received', 'Signed', 'Approved') DEFAULT 'Pending'
COMMENT 'Pending → Endorsed (Dean/ProgramChair/Faculty) OR Received (others) OR Approved (final)';

SELECT 'Status ENUM updated to include Endorsed' AS msg;

-- Step 3: Set uses_endorsed = TRUE for specific roles
-- ========================================

-- Update Dean approvals
UPDATE tbl_organization_approval_chain
SET uses_endorsed = TRUE
WHERE approver_role_id IN (
    SELECT role_id FROM tbl_role WHERE role_name LIKE '%Dean%'
);

SELECT CONCAT('Updated ', ROW_COUNT(), ' Dean approvals') AS msg;

-- Update Program Chair approvals
UPDATE tbl_organization_approval_chain
SET uses_endorsed = TRUE
WHERE approver_role_id IN (
    SELECT role_id FROM tbl_role WHERE role_name LIKE '%Program Chair%'
);

SELECT CONCAT('Updated ', ROW_COUNT(), ' Program Chair approvals') AS msg;

-- Update Faculty approvals for Extra-Curricular
-- NOTE: Adjust this query based on your specific criteria for Extra-Curricular Faculty
UPDATE tbl_organization_approval_chain
SET uses_endorsed = TRUE
WHERE approver_role_id IN (
    SELECT role_id FROM tbl_role WHERE role_name LIKE '%Faculty%'
)
AND approval_order IN (1, 2); -- Assuming Faculty in orders 1-2 are Extra-Curricular

SELECT CONCAT('Updated ', ROW_COUNT(), ' Faculty approvals') AS msg;

-- Step 4: Verification
-- ========================================

SELECT 
    'VERIFICATION RESULTS' AS summary,
    COUNT(*) as total_chains,
    SUM(CASE WHEN uses_endorsed = TRUE THEN 1 ELSE 0 END) as uses_endorsed_count,
    SUM(CASE WHEN uses_endorsed = FALSE THEN 1 ELSE 0 END) as uses_received_count,
    SUM(CASE WHEN is_final_approval = TRUE THEN 1 ELSE 0 END) as final_approval_count
FROM tbl_organization_approval_chain;

SELECT 
    r.role_name,
    COUNT(*) as approval_count,
    SUM(CASE WHEN ac.uses_endorsed = TRUE THEN 1 ELSE 0 END) as endorsed_count,
    SUM(CASE WHEN ac.is_final_approval = TRUE THEN 1 ELSE 0 END) as final_count
FROM tbl_organization_approval_chain ac
JOIN tbl_role r ON ac.approver_role_id = r.role_id
GROUP BY r.role_name
ORDER BY r.role_name;

SELECT '========================================' AS separator;
SELECT 'MIGRATION COMPLETE!' AS status;
SELECT 'Check the results above to verify the changes' AS note;
SELECT '========================================' AS separator;
