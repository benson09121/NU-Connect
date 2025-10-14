-- FIX: Add 'Rejected' to status ENUM in tbl_organization_approval_chain
-- Issue: RejectApplication procedure tries to set status='Rejected' but ENUM doesn't include it
-- Solution: Alter table to add 'Rejected' to the status ENUM

USE nuconnect;

-- Add 'Rejected' to the status ENUM
ALTER TABLE tbl_organization_approval_chain 
MODIFY COLUMN status ENUM('Pending', 'Endorsed', 'Received', 'Signed', 'Approved', 'Rejected') 
DEFAULT 'Pending' 
COMMENT 'Pending → Endorsed (Dean/ProgramChair/Faculty) OR Received (others) OR Approved (final) OR Rejected';

-- Verify the change
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'nuconnect'
  AND TABLE_NAME = 'tbl_organization_approval_chain'
  AND COLUMN_NAME = 'status';

SELECT 'Status ENUM updated successfully - Rejected value added' AS status;
