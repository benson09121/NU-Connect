-- Migration: Add document tracking columns to tbl_application
-- Purpose: Track document generation status for real-time frontend updates
-- Date: 2025-01-XX

USE nuconnect;

-- Add document tracking columns
ALTER TABLE tbl_application 
ADD COLUMN docx_path VARCHAR(500) NULL COMMENT 'Path to generated DOCX file',
ADD COLUMN pdf_path VARCHAR(500) NULL COMMENT 'Path to generated PDF file',
ADD COLUMN docx_generated_at TIMESTAMP NULL COMMENT 'Timestamp when DOCX was generated',
ADD COLUMN pdf_generated_at TIMESTAMP NULL COMMENT 'Timestamp when PDF was generated',
ADD COLUMN document_generation_status ENUM('pending', 'processing', 'completed', 'failed') 
    DEFAULT 'pending' 
    COMMENT 'Status of document generation process';

-- Add index for faster queries
CREATE INDEX idx_document_status ON tbl_application(document_generation_status);

-- Verify columns were added
DESCRIBE tbl_application;

-- Example query to check document status
-- SELECT 
--     application_id,
--     submitted_org_name,
--     document_generation_status,
--     docx_path,
--     pdf_path,
--     docx_generated_at,
--     pdf_generated_at
-- FROM tbl_application
-- WHERE application_id = ?;
