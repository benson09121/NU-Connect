CREATE USER IF NOT EXISTS 'admin'@'%' IDENTIFIED BY 'admin';
GRANT ALL PRIVILEGES ON db_nuconnect.* TO 'admin'@'%';
-- GRANT EVENT ON db_nuconnect.* TO 'admin'@'%';
FLUSH PRIVILEGES;

-- GRANT EVENT ON *.* TO 'root'@'%';
FLUSH PRIVILEGES;

-- Sets the Timezone to GMT+08 Timezone for the Pilipinas! 
SET GLOBAL time_zone = '+08:00';
SET GLOBAL event_scheduler = ON;

DROP DATABASE IF EXISTS db_nuconnect;
CREATE DATABASE db_nuconnect;
USE db_nuconnect;
CREATE TABLE tbl_role(
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    is_approver BOOLEAN DEFAULT FALSE,
    hierarchy_order INT UNIQUE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tbl_college(
    college_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    abbreviation VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tbl_program(
    program_id INT PRIMARY KEY AUTO_INCREMENT,
    college_id INT NOT NULL,
    name VARCHAR(200) UNIQUE,
    abbreviation VARCHAR(20) UNIQUE,
    FOREIGN KEY (college_id) REFERENCES tbl_college(college_id) ON DELETE CASCADE
);

CREATE TABLE tbl_user(
    user_id VARCHAR(200) UNIQUE NOT NULL PRIMARY KEY,
    f_name VARCHAR(50) NULL,
    l_name VARCHAR(50) NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    program_id INT NULL,
    role_id INT NOT NULL,
    profile_picture VARCHAR(255),
    status ENUM('Active', 'Pending', 'Archive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255),
    unarchived_at TIMESTAMP NULL,
    unarchived_by VARCHAR(200) NULL,
    FOREIGN KEY (role_id) REFERENCES tbl_role(role_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (unarchived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_user_application (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    role_id INT NOT NULL,
    program_id INT NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rejected_reason TEXT NULL,
    rejected_at TIMESTAMP NULL,
    rejected_by VARCHAR(200) NULL,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    FOREIGN KEY (role_id) REFERENCES tbl_role(role_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id),
    FOREIGN KEY (rejected_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_permission(
    permission_id INT AUTO_INCREMENT PRIMARY KEY,
    permission_name VARCHAR(200) UNIQUE NOT NULL,
    scope ENUM('Global', 'SDAO', 'Organization', "Approver") DEFAULT 'Global',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tbl_role_permission(
    role_permission_id INT AUTO_INCREMENT PRIMARY KEY,
    role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES tbl_role(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

CREATE TABLE tbl_organization (
    organization_id INT AUTO_INCREMENT PRIMARY KEY,
    adviser_id VARCHAR(200) NOT NULL,
    current_org_version_id INT NOT NULL,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    base_program_id INT NULL, -- NULL meaning open to all
    logo VARCHAR(255),
    status ENUM('Pending', 'Approved', 'Rejected', 'Renewal', 'Archived') DEFAULT 'Pending',
    membership_fee_type ENUM('Per Term', 'Whole Academic Year', 'Free') NOT NULL DEFAULT 'Free',
    category ENUM('Co-Curricular Organization', 'Extra Curricular Organization') DEFAULT 'Co-Curricular Organization',
    membership_fee_amount DECIMAL(10,2) NULL,
    is_recruiting BOOLEAN DEFAULT TRUE,
    is_open_to_all_courses BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Archive / unarchive audit columns
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    unarchived_at TIMESTAMP NULL,
    unarchived_by VARCHAR(200) NULL,
    unarchived_reason VARCHAR(255) NULL,

    -- foreign keys (ensure tbl_user exists before running)
    FOREIGN KEY (adviser_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (unarchived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_organization_version (
    org_version_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NULL,            -- null for proposals before org exists
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NULL,
    logo_path VARCHAR(500) NULL,
    description TEXT NULL,
    base_program_id INT NULL,
    membership_fee_type ENUM('Per Term', 'Whole Academic Year', 'Free') DEFAULT 'Free',
    category ENUM('Co-Curricular Organization','Extra Curricular Organization') DEFAULT 'Co-Curricular Organization',
    membership_fee_amount DECIMAL(10,2) NULL,
    is_recruiting BOOLEAN DEFAULT TRUE,
    is_open_to_all_courses BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(200) NOT NULL,   -- applicant or user who created the version
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_from DATE NULL,
    valid_to DATE NULL,

    -- Archive / unarchive audit columns for version snapshots (optional audit)
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    unarchived_at TIMESTAMP NULL,
    unarchived_by VARCHAR(200) NULL,
    unarchived_reason VARCHAR(255) NULL,

    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (unarchived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE SET NULL
);

-- Add circular FKs after both tables exist
ALTER TABLE tbl_organization
    ADD CONSTRAINT fk_org_current_version FOREIGN KEY (current_org_version_id)
        REFERENCES tbl_organization_version(org_version_id) ON UPDATE CASCADE;

ALTER TABLE tbl_organization_version
    ADD CONSTRAINT fk_org_version_org FOREIGN KEY (organization_id)
        REFERENCES tbl_organization(organization_id) ON DELETE SET NULL;

CREATE TABLE tbl_renewal_cycle (
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    start_date DATE NOT NULL DEFAULT (CURRENT_DATE),
    president_id VARCHAR(200) NOT NULL,
    org_version_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, cycle_number),
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (president_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL
);

CREATE TABLE tbl_organization_course(
	organization_id INT NOT NULL,
    program_id INT NOT NULL,
    PRIMARY KEY (organization_id,program_id),
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id) ON DELETE CASCADE	
);

CREATE TABLE tbl_organization_version_course (
    org_version_course_id INT AUTO_INCREMENT PRIMARY KEY,
    org_version_id INT NOT NULL,
    program_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE CASCADE,
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id) ON DELETE CASCADE,
    UNIQUE KEY ux_orgversion_program (org_version_id, program_id)
);

CREATE TABLE tbl_executive_rank (
    rank_id INT AUTO_INCREMENT PRIMARY KEY,
    rank_level INT UNIQUE NOT NULL,
    default_title VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tbl_executive_role (
    executive_role_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    role_title VARCHAR(100) NOT NULL,  -- e.g., 'President', 'Vice-President'
    rank_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (rank_id) REFERENCES tbl_executive_rank(rank_id)
);

CREATE TABLE tbl_rank_permission (
    rank_id INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (rank_id, permission_id),
    FOREIGN KEY (rank_id) REFERENCES tbl_executive_rank(rank_id),
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id)
);

CREATE TABLE tbl_organization_members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    org_version_id INT NULL,
    member_type ENUM('Member', 'Executive', 'Committee') DEFAULT 'Member',
    status ENUM('Active', 'Pending', 'Archived') DEFAULT 'Active',
    executive_role_id INT DEFAULT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (executive_role_id) REFERENCES tbl_executive_role (executive_role_id) ON DELETE SET NULL,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL
);



CREATE TABLE tbl_application_period (
    period_id INT AUTO_INCREMENT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_application (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NULL, -- Existing org for renewals
    cycle_number INT NULL, -- Existing org for renewals
    org_version_id INT NULL,
    submitted_org_name VARCHAR(255) NULL,
    submitted_org_logo VARCHAR(500) NULL,
    application_type ENUM('new', 'renewal') NOT NULL,
    period_id INT NOT NULL,
    applicant_user_id VARCHAR(200) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending', -- use capitalized values everywhere
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE SET NULL ,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL,
    FOREIGN KEY (period_id) REFERENCES tbl_application_period(period_id),
    FOREIGN KEY (applicant_user_id) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_application_executives (
    app_exec_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    org_version_id INT NULL,      -- the version that carries the proposed name/logo
    proposed_user_id VARCHAR(200) NULL, -- if user exists in system (may be NULL for external nominees)
    proposed_name VARCHAR(255) NULL,    -- store a copy of the name/email/title proposed
    proposed_email VARCHAR(255) NULL,
    proposed_title VARCHAR(100) NULL,   -- e.g. President, VP
    proposed_rank_id INT NULL,          -- map to rank definitions if you want
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id) ON DELETE CASCADE,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id),
    FOREIGN KEY (proposed_user_id) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_membership_application (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(200),
    reviewed_at TIMESTAMP NULL,
    remarks TEXT NULL,
    FOREIGN KEY (organization_id, cycle_number) 
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id),
    FOREIGN KEY (reviewed_by) REFERENCES tbl_user(user_id)
);

-- Custom Questions Configuration
CREATE TABLE tbl_membership_question (
    question_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('text', 'multiple_choice', 'checkbox', 'file_upload') 
        DEFAULT 'text',
    is_required BOOLEAN DEFAULT TRUE,
    options JSON NULL,  -- For multiple choice options
    FOREIGN KEY (organization_id, cycle_number) 
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number)
);

-- Application Responses
CREATE TABLE tbl_membership_response (
    response_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    question_id INT NOT NULL,
    response_value TEXT NOT NULL,
    FOREIGN KEY (application_id) 
        REFERENCES tbl_membership_application(application_id),
    FOREIGN KEY (question_id) 
        REFERENCES tbl_membership_question(question_id)
);

CREATE TABLE tbl_executive_member_permission (
    executive_permission_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    organization_id INT NULL,  -- references tbl_organization_members
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id) REFERENCES tbl_organization_members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

CREATE TABLE tbl_committee (
    committee_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
);

CREATE TABLE tbl_committee_members(
    committee_member_id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    role ENUM('Committee Head', 'Committee Officer') DEFAULT 'Committee Officer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES tbl_committee(committee_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_committee_role (
    committee_role_id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    role_name VARCHAR(100) NOT NULL,  -- e.g., 'Committee Head', 'Committee Member'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES tbl_committee(committee_id) ON DELETE CASCADE
);

CREATE TABLE tbl_committee_role_permission (
    committee_role_permission_id INT AUTO_INCREMENT PRIMARY KEY,
    committee_role_id INT NOT NULL,
    permission_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_role_id) REFERENCES tbl_committee_role(committee_role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

CREATE TABLE tbl_archived_organization_members (
    archived_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    member_type ENUM('Member', 'Executive', 'Committee') NOT NULL,
    executive_role_id INT DEFAULT NULL,
    committee_id INT DEFAULT NULL,
    committee_role ENUM('Committee Head', 'Committee Officer') DEFAULT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by VARCHAR(200) NOT NULL, 
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id),
    FOREIGN KEY (executive_role_id) REFERENCES tbl_executive_role(executive_role_id)
);

CREATE TABLE tbl_archived_committees (
    archive_id INT AUTO_INCREMENT PRIMARY KEY,
    original_committee_id INT NOT NULL,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by VARCHAR(200) NOT NULL,
    reason VARCHAR(255),
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id)
);



CREATE TABLE tbl_event (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NULL,
    cycle_number INT NULL,
    event_type ENUM('Organization', 'SDAO', 'System') DEFAULT 'Organization',
    user_id VARCHAR(200) NOT NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    image TEXT NULL,
    venue_type ENUM('Face to face', 'Online') DEFAULT 'face to face',
    venue VARCHAR(200) NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', "Archived") DEFAULT 'Pending',
    type ENUM("Paid","Free"),
    is_open_to ENUM("Members only", "Open to all", "NU Students only") DEFAULT "Members only",
    fee INT NULL,
    capacity INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    certificate VARCHAR(1000) DEFAULT NULL,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    INDEX idx_event_type (event_type),
    INDEX idx_org_cycle (organization_id, cycle_number),
    INDEX idx_dates (start_date, end_date),
    INDEX idx_status (status)
);

-- Trigger to validate event data before insert
DELIMITER $$
CREATE TRIGGER trg_event_validate_before_insert
    BEFORE INSERT ON tbl_event
    FOR EACH ROW
BEGIN
    -- For Organization events, both organization_id and cycle_number must be NOT NULL
    IF NEW.event_type = 'Organization' THEN
        IF NEW.organization_id IS NULL OR NEW.cycle_number IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization events must have both organization_id and cycle_number';
        END IF;
        
        -- Validate that the organization_id and cycle_number combination exists in tbl_renewal_cycle
        IF NOT EXISTS (
            SELECT 1 FROM tbl_renewal_cycle 
            WHERE organization_id = NEW.organization_id 
            AND cycle_number = NEW.cycle_number
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid organization_id and cycle_number combination';
        END IF;
    END IF;
    
    -- For SDAO and System events, organization_id and cycle_number should be NULL
    IF NEW.event_type IN ('SDAO', 'System') THEN
        SET NEW.organization_id = NULL;
        SET NEW.cycle_number = NULL;
    END IF;
    
    -- Validate date range
    IF NEW.start_date > NEW.end_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start date cannot be after end date';
    END IF;
    
    -- Validate time range for same-day events
    IF NEW.start_date = NEW.end_date AND NEW.start_time >= NEW.end_time THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start time must be before end time for same-day events';
    END IF;
END$$

-- Trigger to validate event data before update
CREATE TRIGGER trg_event_validate_before_update
    BEFORE UPDATE ON tbl_event
    FOR EACH ROW
BEGIN
    -- For Organization events, both organization_id and cycle_number must be NOT NULL
    IF NEW.event_type = 'Organization' THEN
        IF NEW.organization_id IS NULL OR NEW.cycle_number IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization events must have both organization_id and cycle_number';
        END IF;
        
        -- Validate that the organization_id and cycle_number combination exists in tbl_renewal_cycle
        IF NOT EXISTS (
            SELECT 1 FROM tbl_renewal_cycle 
            WHERE organization_id = NEW.organization_id 
            AND cycle_number = NEW.cycle_number
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid organization_id and cycle_number combination';
        END IF;
    END IF;
    
    -- For SDAO and System events, organization_id and cycle_number should be NULL
    IF NEW.event_type IN ('SDAO', 'System') THEN
        SET NEW.organization_id = NULL;
        SET NEW.cycle_number = NULL;
    END IF;
    
    -- Validate date range
    IF NEW.start_date > NEW.end_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start date cannot be after end date';
    END IF;
    
    -- Validate time range for same-day events
    IF NEW.start_date = NEW.end_date AND NEW.start_time >= NEW.end_time THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start time must be before end time for same-day events';
    END IF;
END$$
DELIMITER ;

CREATE TABLE tbl_blocked_period (
    blocked_period_id INT AUTO_INCREMENT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_event_application (
    event_application_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    proposed_event_id INT NULL, -- Will be populated after approval
    applicant_user_id VARCHAR(200) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', 'Revision') DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number) 
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (applicant_user_id) REFERENCES tbl_user(user_id),
    FOREIGN KEY (proposed_event_id) REFERENCES tbl_event(event_id)
);

CREATE TABLE tbl_event_application_requirement (
    requirement_id INT AUTO_INCREMENT PRIMARY KEY,
    requirement_name VARCHAR(255) NOT NULL,
    is_applicable_to ENUM('pre-event', 'post-event') DEFAULT 'pre-event',
    file_path VARCHAR(255) NULL,
    status ENUM('active', 'archived') DEFAULT 'active',
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);
-- 3. Event Application Approval Process
CREATE TABLE tbl_event_approval_process (
    event_approval_id INT AUTO_INCREMENT PRIMARY KEY,
    event_application_id INT NOT NULL,
    approver_id VARCHAR(200) NOT NULL,
    approval_role_id INT NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    comment TEXT,
    step_number INT NOT NULL,
    approved_at TIMESTAMP NULL,
    FOREIGN KEY (event_application_id) 
        REFERENCES tbl_event_application(event_application_id),
    FOREIGN KEY (approver_id) REFERENCES tbl_user(user_id),
    FOREIGN KEY (approval_role_id) REFERENCES tbl_role(role_id)
);

CREATE TABLE tbl_event_requirement_submissions (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    event_application_id INT,
    requirement_id INT NOT NULL,
    cycle_number INT NOT NULL,
    status enum('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    organization_id INT NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    submitted_by VARCHAR(200) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id),
    FOREIGN KEY (event_application_id) REFERENCES tbl_event_application(event_application_id),
    FOREIGN KEY (requirement_id) REFERENCES tbl_event_application_requirement(requirement_id),
    FOREIGN KEY (submitted_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
);

CREATE TABLE tbl_event_course(
	event_id INT NOT NULL,
	program_id INT NOT NULL,
    PRIMARY KEY (event_id, program_id),
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id)
);

CREATE TABLE tbl_event_attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    status ENUM('Pending', 'Registered', 'Evaluated', 'Attended', 'Rejected') NOT NULL,
    time_in DATETIME DEFAULT NULL,
    time_out DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_certificate_template (
    template_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL UNIQUE, 
    template_path VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_event_certificate (
    certificate_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    template_id INT NOT NULL,
    certificate_path VARCHAR(255) NOT NULL,
    verification_code VARCHAR(36) UNIQUE NOT NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (template_id) REFERENCES tbl_certificate_template(template_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_cert (event_id, user_id) -- One cert per user per event
);

CREATE TABLE tbl_project_heads (
    project_head_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    event_id INT NOT NULL,
    role_type ENUM('Executive', 'Committee') NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE
);

CREATE TABLE tbl_evaluation_question_group (
    group_id INT AUTO_INCREMENT PRIMARY KEY,
    group_title VARCHAR(255) NOT NULL,
    group_description TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE tbl_evaluation_question (
    question_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type ENUM('textbox', 'likert_4') NOT NULL,
    is_required BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (group_id) REFERENCES tbl_evaluation_question_group(group_id)
);

CREATE TABLE tbl_event_evaluation_config (
    event_id INT NOT NULL,
    group_id INT NOT NULL,
    PRIMARY KEY (event_id, group_id),
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES tbl_evaluation_question_group(group_id)
);

CREATE TABLE tbl_event_evaluation_settings (
    event_id INT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    start_time TIME NOT NULL,
    end_time TIME NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE
);

CREATE TABLE tbl_evaluation (
    evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id),
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_evaluation_response (
    response_id INT AUTO_INCREMENT PRIMARY KEY,
    evaluation_id INT NOT NULL,
    question_id INT NOT NULL,
    response_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluation_id) REFERENCES tbl_evaluation(evaluation_id)
);

CREATE TABLE tbl_approval_process(
    approval_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    period_id INT NULL,
    -- organization_id INT NOT NULL, -- REMOVED
    approver_id VARCHAR(200) NOT NULL,
    approval_role_id INT NOT NULL,
    application_type ENUM('new', 'renewal') NOT NULL DEFAULT 'new',
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    comment TEXT,
    step INT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id) ON DELETE CASCADE,
    FOREIGN KEY (period_id) REFERENCES tbl_application_period(period_id) ON DELETE CASCADE,
    -- FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE, -- REMOVED
    FOREIGN KEY (approver_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (approval_role_id) REFERENCES tbl_role(role_id) ON DELETE CASCADE
);

CREATE TABLE tbl_application_approval (
    application_id INT NOT NULL,
    approval_id INT NOT NULL,
    PRIMARY KEY (application_id, approval_id),
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id),
    FOREIGN KEY (approval_id) REFERENCES tbl_approval_process(approval_id)
);

CREATE TABLE tbl_application_requirement (
    requirement_id INT AUTO_INCREMENT PRIMARY KEY,
    requirement_name VARCHAR(255) NOT NULL,
    is_applicable_to ENUM('new', 'renew', 'both') DEFAULT 'new',
    file_path VARCHAR(255) NULL,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_organization_requirement_submission (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT,
    requirement_id INT NOT NULL,
    cycle_number INT NULL,
    organization_id INT NULL,
    org_version_id INT NULL,
    file_path VARCHAR(255) NOT NULL,
    submitted_by VARCHAR(200) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
    submitted_requirement_title VARCHAR(255) NULL,
    submitted_requirement_hash VARCHAR(64) NULL,
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id),
    FOREIGN KEY (requirement_id) REFERENCES tbl_application_requirement(requirement_id),
    FOREIGN KEY (submitted_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    CONSTRAINT fk_org_req_sub_version FOREIGN KEY (org_version_id)
        REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL
);

-- Notifications Table: Stores the core notification details
CREATE TABLE tbl_notification (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id VARCHAR(200) DEFAULT NULL,  
    entity_type ENUM('user', 'organization', 'event', 'transaction', 'system', 'approval', 'general') NOT NULL,
    entity_id INT DEFAULT NULL,      
    title VARCHAR(255) NOT NULL,          
    message TEXT NOT NULL,              
    url VARCHAR(255) DEFAULT NULL,
    action VARCHAR(100) DEFAULT NULL,     
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tbl_notification_recipient (
    notification_recipient_id INT AUTO_INCREMENT PRIMARY KEY,
    notification_id INT NOT NULL,        
    recipient_email VARCHAR(100) NOT NULL,   
    is_read BOOLEAN DEFAULT FALSE,         
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notification_id) REFERENCES tbl_notification(notification_id) ON DELETE CASCADE
);

    -- Improved table for logs
CREATE TABLE tbl_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(200) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type TEXT NOT NULL,
    redirect_url VARCHAR(500) DEFAULT NULL,
    file_path TEXT DEFAULT NULL, -- can store JSON array as string
    meta_data JSON DEFAULT NULL, -- flexible key-value storage
    type VARCHAR(100) DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_transaction_type (
    transaction_type_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,   -- e.g. 'INCOME', 'EXPENSE'
    label VARCHAR(100) NOT NULL         -- e.g. 'Income', 'Expense'
);

CREATE TABLE tbl_payment_type (
    payment_type_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, 
    label VARCHAR(100) NOT NULL, 
    category VARCHAR(50) NOT NULL 
);

CREATE TABLE tbl_transaction (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(200) NULL,          -- optional (payer or payee depending on type)
    payer_name VARCHAR(255) NULL,       -- for external/anonymous payers
    payee_name VARCHAR(255) NULL,       -- useful for expenses (who was paid)
    payment_description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,

    transaction_type_id INT NOT NULL,   -- income or expense
    payment_type_id INT NOT NULL,       -- cash, gcash, bank, etc.

    status ENUM('Pending', 'Completed', 'Failed') DEFAULT 'Pending',
    transaction_date DATE NOT NULL,
    receipt_no VARCHAR(100) NULL,       -- optional for expense
    proof_image VARCHAR(500) DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,

    -- archive/unarchive metadata
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    unarchived_at TIMESTAMP NULL,
    unarchived_by VARCHAR(200) NULL,

    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (payment_type_id) REFERENCES tbl_payment_type(payment_type_id) ON UPDATE CASCADE,
    FOREIGN KEY (transaction_type_id) REFERENCES tbl_transaction_type(transaction_type_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_transaction_membership (
    transaction_id INT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
    -- user_id is still enforced through tbl_transaction (not NULL in this context)
);

CREATE TABLE tbl_transaction_event (
    transaction_id INT PRIMARY KEY,
    event_id INT NOT NULL,
    remarks VARCHAR(255) DEFAULT NULL,
    payer_name_override VARCHAR(255) NULL, -- specific to event transactions if anonymous
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE
);

CREATE TABLE tbl_transaction_expense (
    transaction_id INT PRIMARY KEY,
    expense_category VARCHAR(100) NOT NULL,  -- e.g. Supplies, Logistics, Food
    reference_doc VARCHAR(255) NULL,        -- invoice, OR number, etc.
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE
);

-- PROCEDURES
use db_nuconnect;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE LogAction(
    IN p_user_email VARCHAR(100),
    IN p_action TEXT,
    IN p_type VARCHAR(100),
    IN p_meta_data JSON,
    IN p_redirect_url VARCHAR(500),
    IN p_file_path TEXT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User email not found for logging';
    END IF;
    INSERT INTO tbl_logs(user_id, action_type, type, meta_data, redirect_url, file_path)
    VALUES (v_user_id, p_action, p_type, p_meta_data, p_redirect_url, p_file_path);
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateNotification(
    IN p_title VARCHAR(255),
    IN p_message TEXT,
    IN p_url VARCHAR(255), -- can be NULL
    IN p_entity_type ENUM('user', 'organization', 'event', 'transaction', 'system', 'approval', 'general'),
    IN p_entity_id INT,
    IN p_sender_id VARCHAR(200),
    IN p_recipient_emails JSON,
    IN p_action VARCHAR(100)
)
BEGIN
    DECLARE v_notification_id INT DEFAULT 0;
    DECLARE v_recipient_count INT DEFAULT 0;
    DECLARE v_email VARCHAR(100);
    DECLARE i INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO tbl_notification (
        sender_id,
        entity_type,
        entity_id,
        title,
        message,
        url,
        action,
        created_at
    ) VALUES (
        p_sender_id,
        p_entity_type,
        p_entity_id,
        p_title,
        p_message,
        p_url,
        p_action,
        NOW()
    );

    SET v_notification_id = LAST_INSERT_ID();

    SET v_recipient_count = JSON_LENGTH(p_recipient_emails);
    WHILE i < v_recipient_count DO
        SET v_email = JSON_UNQUOTE(JSON_EXTRACT(p_recipient_emails, CONCAT('$[', i, ']')));
        IF v_email IS NOT NULL AND v_email <> '' THEN
            INSERT INTO tbl_notification_recipient (
                notification_id,
                recipient_email,
                is_read,
                created_at
            ) VALUES (
                v_notification_id,
                v_email,
                FALSE,
                NOW()
            );
        END IF;
        SET i = i + 1;
    END WHILE;

    COMMIT;

    SELECT v_notification_id AS notification_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllEvents(IN p_user_id VARCHAR(200))
BEGIN
    DECLARE v_program_id INT;
    
    -- Get user's program
    SELECT program_id INTO v_program_id 
    FROM tbl_user 
    WHERE user_id = p_user_id;

    -- Get all organizations the user belongs to
    WITH UserOrganizations AS (
        SELECT organization_id 
        FROM tbl_organization_members 
        WHERE user_id = p_user_id
        
        UNION
        
        SELECT c.organization_id 
        FROM tbl_committee_members cm
        JOIN tbl_committee c ON cm.committee_id = c.committee_id
        WHERE cm.user_id = p_user_id
    )
    
    SELECT
        e.event_id,
        e.title,
        e.user_id AS organizer_id,
        o.name AS organization_name,
        e.description,
        e.venue,
        e.start_time,
        e.end_time,
        e.start_date,
        e.end_date,
        e.created_at,
        e.status,
        e.type,
        -- Use e.is_open_to ENUM for access_type
        CASE 
            WHEN e.is_open_to = 'Open to all' THEN 'Open to All'
            ELSE 'Restricted'
        END AS access_type,
        COALESCE(e.fee, 0) AS event_fee,
        e.capacity,
        CASE 
            WHEN TIMESTAMP(e.end_date, e.end_time) < CURRENT_TIMESTAMP THEN 'Ended'
            ELSE 'Upcoming'
        END AS event_status,
        e.certificate AS certificate_available
    FROM tbl_event e
    INNER JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN UserOrganizations uo ON e.organization_id = uo.organization_id
    WHERE e.status = 'Approved'
      AND (
          e.is_open_to = 'Open to all'
          OR EXISTS (
              SELECT 1 
              FROM tbl_event_course ec 
              WHERE ec.event_id = e.event_id 
                AND ec.program_id = v_program_id
          )
          OR uo.organization_id IS NOT NULL
      )
    ORDER BY 
        CASE 
            WHEN TIMESTAMP(e.end_date, e.end_time) < CURRENT_TIMESTAMP THEN 1 
            ELSE 0 
        END,
        e.start_date ASC,
        e.start_time ASC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEmail(
    IN p_email VARCHAR(100)
)
BEGIN
    SELECT * FROM tbl_user WHERE email = p_email;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSpecificEvent(
IN eventId INT, 
   userId VARCHAR(200)
)
BEGIN
SELECT a.event_id, 
a.title,
a.description,
c.name as organization_name,
a.venue, 
a.start_time, 
a.end_time, 
a.status, 
a.type, 
a.start_date,
a.end_date,
COALESCE(b.status, "Not Registered") as student_status
FROM tbl_event a
LEFT JOIN tbl_event_attendance b ON a.event_id = b.event_id AND b.user_id = userId
LEFT JOIN tbl_organization c ON a.organization_id = c.organization_id
WHERE a.event_id = eventId;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventAttendees(
	IN eventId INT
)
BEGIN
	SELECT a.event_id, b.f_name, b.l_name, a.status
FROM tbl_event_attendance a 
LEFT JOIN tbl_user b ON a.user_id = b.user_id
WHERE a.status = "Registered" AND a.event_id = eventId;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateEvent(IN
    p_user_id VARCHAR(200),
    p_title VARCHAR(300),
    p_description TEXT,
    p_venue_type ENUM('Face to face', 'Online'),
    p_venue VARCHAR(200),
    p_start_date DATE,
    p_end_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_organization_id INT,
    p_cycle_number INT,
    p_event_type ENUM('Organization', 'SDAO', 'System'),
    p_status ENUM('Pending', 'Approved', 'Rejected', 'Archived'),
    p_type ENUM('Paid', 'Free'),
    p_is_open_to ENUM('Members only', 'Open to all', 'NU Students only'),
    p_fee INT,
    p_capacity INT
)
BEGIN
    DECLARE v_base_program_id INT;
    DECLARE v_event_id INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Only check organization constraints for Organization events
    IF p_event_type = 'Organization' THEN
        SELECT base_program_id INTO v_base_program_id 
        FROM tbl_organization 
        WHERE organization_id = p_organization_id;

        IF p_is_open_to = 'Members only' AND v_base_program_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot create restricted event for open organization';
        END IF;
        
        -- Validate that organization_id and cycle_number combination exists
        IF NOT EXISTS (
            SELECT 1 FROM tbl_renewal_cycle 
            WHERE organization_id = p_organization_id 
            AND cycle_number = p_cycle_number
        ) THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Invalid organization_id and cycle_number combination';
        END IF;
    END IF;
 
    INSERT INTO tbl_event (
        organization_id,
        cycle_number,
        event_type,
        user_id,
        title,
        description,
        venue_type,
        venue,
        start_date,
        end_date,
        start_time,
        end_time,
        status,
        type,
        is_open_to,
        fee,
        capacity
    ) VALUES (
        CASE WHEN p_event_type = 'Organization' THEN p_organization_id ELSE NULL END,
        CASE WHEN p_event_type = 'Organization' THEN p_cycle_number ELSE NULL END,
        p_event_type,
        p_user_id,
        p_title,
        p_description,
        p_venue_type,
        p_venue,
        p_start_date,
        p_end_date,
        p_start_time,
        p_end_time,
        p_status,
        p_type,
        p_is_open_to,
        p_fee,
        p_capacity
    );
    
    SET v_event_id = LAST_INSERT_ID();

    -- Only create course associations for organization events with restricted access
    IF p_event_type = 'Organization' AND p_is_open_to = 'Members only' THEN
        INSERT INTO tbl_event_course (event_id, program_id)
        SELECT v_event_id, program_id
        FROM (
            SELECT base_program_id AS program_id
            FROM tbl_organization
            WHERE organization_id = p_organization_id
            UNION
            SELECT program_id
            FROM tbl_organization_course
            WHERE organization_id = p_organization_id
        ) AS org_courses;
    END IF;

    COMMIT;
    SELECT * FROM tbl_event WHERE event_id = v_event_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RegisterEvent(IN
	event_id INT,   
    user_id VARCHAR(200)
)
BEGIN
INSERT INTO tbl_event_attendance (event_id, user_id, status) 
VALUES (event_id, user_id, "Registered");
SELECT * FROM tbl_event_attendance WHERE attendance_id = LAST_INSERT_ID();
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckEventRegistration(IN
	event_id INT,
    user_id VARCHAR(200)
)
BEGIN
SELECT * FROM tbl_event_attendance a WHERE a.event_id = event_id AND a.user_id = user_id;
END $$
DELIMITER ;

DROP PROCEDURE IF EXISTS GetAffectedUsers;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE    EventRegistrations(IN p_user_id VARCHAR(200))
BEGIN
    SELECT 
        ea.attendance_id,
        e.event_id,
        e.title,
        e.start_date,
        e.end_date,
        e.start_time,
        e.venue,
        o.name AS organization_name,
        ea.status,
        ea.created_at AS registration_date
    FROM tbl_event_attendance ea
    INNER JOIN tbl_event e ON ea.event_id = e.event_id
    INNER JOIN tbl_organization o ON e.organization_id = o.organization_id
    WHERE (ea.user_id = p_user_id) AND (ea.status = "Registered" OR ea.status = "Attended")
    ORDER BY e.start_date DESC, e.start_time DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizations(IN p_user_id VARCHAR(200))
BEGIN
    SELECT 
        o.organization_id,
        o.name AS organization_name,
        o.logo,
        o.description AS organization_description,
        o.category AS organization_type,
        o.status, -- Include status for filtering (Active, Archived, etc.)
        o.is_recruiting,
        o.membership_fee_amount,
        (
            -- Count only non-executive Active members
            SELECT COUNT(*) 
            FROM tbl_organization_members om
            WHERE om.organization_id = o.organization_id
              AND om.member_type != 'Executive'
              AND om.status = 'Active'
        ) + (
            -- Count committee members not already counted
            SELECT COUNT(DISTINCT cm.user_id)
            FROM tbl_committee c
            JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
            WHERE c.organization_id = o.organization_id
              AND cm.user_id NOT IN (
                  SELECT user_id 
                  FROM tbl_organization_members 
                  WHERE organization_id = o.organization_id
                    AND status = 'Active'
              )
        ) AS total_members,
        (
            SELECT GROUP_CONCAT(u.profile_picture ORDER BY RAND() SEPARATOR ',')
            FROM (
                SELECT u.profile_picture
                FROM tbl_organization_members om
                JOIN tbl_user u ON om.user_id = u.user_id
                WHERE om.organization_id = o.organization_id
                  AND om.status = 'Active'
                UNION
                SELECT u.profile_picture
                FROM tbl_committee_members cm
                JOIN tbl_user u ON cm.user_id = u.user_id
                JOIN tbl_committee c ON cm.committee_id = c.committee_id
                WHERE c.organization_id = o.organization_id
                LIMIT 4
            ) AS u
        ) AS member_profile_pictures,
        -- Return membership status instead of has_joined
        COALESCE(
            (SELECT om.status 
             FROM tbl_organization_members om 
             WHERE om.organization_id = o.organization_id 
               AND om.user_id = p_user_id
             LIMIT 1),
            (SELECT IF(COUNT(*) > 0, 'Active', NULL)
             FROM tbl_committee c
             JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
             WHERE c.organization_id = o.organization_id
               AND cm.user_id = p_user_id
            ),
            'Not Member'
        ) AS membership_status,
        (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'event_id', e.event_id,
                'event_start_date', e.start_date,
                'event_end_date', e.end_date,
                'event_title', e.title,
                'start_time', e.start_time,
                'end_time', e.end_time,
                'venue', e.venue,
                'attendee_images', (
                    SELECT GROUP_CONCAT(u.profile_picture ORDER BY RAND() SEPARATOR ',')
                    FROM (
                        SELECT u.profile_picture
                        FROM tbl_event_attendance ea
                        JOIN tbl_user u ON ea.user_id = u.user_id
                        WHERE ea.event_id = e.event_id
                        AND ea.status = 'Registered'
                        LIMIT 4
                    ) AS u
                ),
                'total_attendees', (
                    SELECT COUNT(*)
                    FROM tbl_event_attendance
                    WHERE event_id = e.event_id
                    AND status = 'Registered'
                )
            ))
            FROM tbl_event e
            WHERE e.organization_id = o.organization_id
            AND e.status = 'Approved'
            AND e.start_date >= CURDATE()
            ORDER BY e.start_date ASC
            LIMIT 5
        ) AS upcoming_events,
        (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'role_name', er.role_title,
                'f_name', u.f_name,
                'l_name', u.l_name,
                'profile_picture', u.profile_picture
            ))
            FROM tbl_organization_members om
            JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
            JOIN tbl_user u ON om.user_id = u.user_id
            WHERE om.organization_id = o.organization_id
            AND om.member_type = 'Executive'
            AND om.status = 'Active'
        ) AS officers
    FROM tbl_organization o
    ORDER BY o.category, o.name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetUpcomingEvents(IN p_user_id VARCHAR(200))
BEGIN
    WITH UserOrganizations AS (
        SELECT organization_id 
        FROM tbl_organization_members 
        WHERE user_id = p_user_id
        
        UNION
        
        SELECT c.organization_id 
        FROM tbl_committee_members cm
        JOIN tbl_committee c ON cm.committee_id = c.committee_id
        WHERE cm.user_id = p_user_id
    )
    
    SELECT 
        e.event_id,
        e.title AS event_title,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.venue,
        o.name AS organization_name,
        o.logo AS organization_logo,
        (
            SELECT GROUP_CONCAT(profile_picture ORDER BY RAND() SEPARATOR ',')
            FROM (
                SELECT u.profile_picture
                FROM tbl_event_attendance ea
                JOIN tbl_user u ON ea.user_id = u.user_id
                WHERE ea.event_id = e.event_id
                AND ea.status = 'Registered'
                ORDER BY RAND()
                LIMIT 4
            ) AS random_attendees
        ) AS attendee_profile_pictures,
        (
            SELECT COUNT(*) 
            FROM tbl_event_attendance 
            WHERE event_id = e.event_id
            AND status = 'Registered'
        ) AS total_attendees
    FROM tbl_event e
    JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN UserOrganizations uo ON e.organization_id = uo.organization_id
    WHERE e.status = 'Approved'
      AND e.start_date >= CURDATE()
      AND (
          e.is_open_to = 'Open to all'
          OR uo.organization_id IS NOT NULL
      )
    ORDER BY e.start_date ASC, e.start_time ASC
    LIMIT 5;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetUserOrganization(IN p_user_id VARCHAR(200))
BEGIN
    SELECT DISTINCT
        o.organization_id,
        o.name AS organization_name,
        o.logo,
        COALESCE(
            GROUP_CONCAT(
                CASE 
                    WHEN om.member_type = 'Executive' THEN er.role_title
                    WHEN cm.role IS NOT NULL THEN CONCAT('Committee ', cm.role)
                    ELSE om.member_type
                END
                SEPARATOR ', '
            ),
            'Member'
        ) AS user_position
    FROM tbl_organization o
    LEFT JOIN tbl_organization_members om 
        ON o.organization_id = om.organization_id 
        AND om.user_id = p_user_id
    LEFT JOIN tbl_executive_role er 
        ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_committee_members cm 
        ON cm.user_id = p_user_id
        AND cm.committee_id IN (
            SELECT committee_id 
            FROM tbl_committee 
            WHERE organization_id = o.organization_id
        )
    WHERE om.user_id = p_user_id
       OR cm.user_id = p_user_id
    GROUP BY o.organization_id, o.name, o.logo
    ORDER BY o.name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddCertificateTemplate(IN
    p_event_id INT,
    p_template_path VARCHAR(255),
    p_uploaded_by VARCHAR(200)
)
BEGIN
    IF EXISTS (SELECT 1 FROM tbl_certificate_template WHERE event_id = p_event_id) THEN
        UPDATE tbl_certificate_template 
        SET template_path = p_template_path,
            uploaded_by = p_uploaded_by,
            created_at = CURRENT_TIMESTAMP
        WHERE event_id = p_event_id;
    ELSE
        INSERT INTO tbl_certificate_template (event_id, template_path, uploaded_by)
        VALUES (p_event_id, p_template_path, p_uploaded_by);
    END IF;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddGeneratedCertificate(IN
    p_event_id INT,
    p_user_id VARCHAR(200),
    p_template_id INT,
    p_certificate_path VARCHAR(255),
    p_verification_code VARCHAR(36)
)
BEGIN

    INSERT INTO tbl_event_certificate (event_id, user_id, template_id, certificate_path, verification_code)
    VALUES (p_event_id, p_user_id, p_template_id, p_certificate_path, p_verification_code);

END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetCertificateTemplate(IN
    p_event_id INT
)
BEGIN
    
    SELECT * FROM tbl_certificate_template WHERE event_id = p_event_id;
    
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEvaluationQuestions(IN p_event_id INT)
BEGIN
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'group_id', g.group_id,
            'group_title', g.group_title,
            'questions', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'question_id', q.question_id,
                        'question_text', q.question_text,
                        'question_type', q.question_type,
                        'is_required', q.is_required
                    )
                )
                FROM tbl_evaluation_question q
                WHERE q.group_id = g.group_id
            )
        )
    ) AS evaluation_form
    FROM tbl_evaluation_question_group g
    WHERE g.group_id IN (
        SELECT group_id 
        FROM tbl_event_evaluation_config 
        WHERE event_id = p_event_id
    )
    AND g.is_active = TRUE;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE SubmitEvaluation(IN p_json_data JSON)
BEGIN
    DECLARE v_evaluation_id INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_event_id INT;
    DECLARE v_question_count INT;
    DECLARE v_counter INT DEFAULT 0;
    DECLARE v_question_id INT;
    DECLARE v_answer TEXT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Extract basic information
    SET v_user_id = JSON_UNQUOTE(JSON_EXTRACT(p_json_data, '$.user_id'));
    SET v_event_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_json_data, '$.event_id')) AS UNSIGNED);

    -- Create evaluation record
    INSERT INTO tbl_evaluation (event_id, user_id)
    VALUES (v_event_id, v_user_id);
    SET v_evaluation_id = LAST_INSERT_ID();

    -- Process Likert Scale Answers
    SET v_question_count = JSON_LENGTH(p_json_data, '$.likert_scale');
    WHILE v_counter < v_question_count DO
        SET v_question_id = CAST(
            JSON_UNQUOTE(JSON_EXTRACT(p_json_data, 
                CONCAT('$.likert_scale[', v_counter, '].question_id')))
            AS UNSIGNED
        );
        SET v_answer = JSON_UNQUOTE(JSON_EXTRACT(p_json_data, 
            CONCAT('$.likert_scale[', v_counter, '].answer')));
        
        INSERT INTO tbl_evaluation_response (evaluation_id, question_id, response_value)
        VALUES (v_evaluation_id, v_question_id, v_answer);
        
        SET v_counter = v_counter + 1;
    END WHILE;

    -- Process Text Answers
    SET v_counter = 0;
    SET v_question_count = JSON_LENGTH(p_json_data, '$.text_answers');
    WHILE v_counter < v_question_count DO
        SET v_question_id = CAST(
            JSON_UNQUOTE(JSON_EXTRACT(p_json_data, 
                CONCAT('$.text_answers[', v_counter, '].question_id')))
            AS UNSIGNED
        );
        SET v_answer = JSON_UNQUOTE(JSON_EXTRACT(p_json_data, 
            CONCAT('$.text_answers[', v_counter, '].answer')));
        
        INSERT INTO tbl_evaluation_response (evaluation_id, question_id, response_value)
        VALUES (v_evaluation_id, v_question_id, v_answer);
        
        SET v_counter = v_counter + 1;
    END WHILE;

    COMMIT;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetUserPermissions(IN p_user_email VARCHAR(200))
BEGIN
    SELECT JSON_OBJECT(
        'f_name', u.f_name,
        'l_name', u.l_name,
        'role', r.role_name,
        'email', u.email,
        'program_id', p.program_id,
        'program_name', p.name,
        'permissions', COALESCE(
            (
                SELECT JSON_ARRAYAGG(permission_name)
                FROM (
                    SELECT DISTINCT permission_name
                    FROM (
                        -- Base role permissions
                        SELECT p.permission_name
                        FROM tbl_role_permission rp
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE rp.role_id = u.role_id

                        UNION ALL

                        -- Executive role permissions through ranks
                        SELECT p.permission_name
                        FROM tbl_organization_members om
                        JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
                        JOIN tbl_rank_permission rp ON er.rank_id = rp.rank_id
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE om.user_id = u.user_id

                        UNION ALL

                        -- Committee role permissions
                        SELECT p.permission_name
                        FROM tbl_committee_members cm
                        JOIN tbl_committee c ON cm.committee_id = c.committee_id
                        JOIN tbl_committee_role cr ON c.committee_id = cr.committee_id
                        JOIN tbl_committee_role_permission crp ON cr.committee_role_id = crp.committee_role_id
                        JOIN tbl_permission p ON crp.permission_id = p.permission_id
                        WHERE cm.user_id = u.user_id
                    ) AS all_permissions
                ) AS distinct_permissions
            ),
            JSON_ARRAY()
        ),
        'organizations', COALESCE(
            (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'name', orgs.name,
                    'logo', orgs.logo,
                    'status', orgs.status,
                    'organization_id', orgs.organization_id,
                    'current_org_version_id', orgs.current_org_version_id
                ))
                FROM (


                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id
                    FROM tbl_organization o
                    WHERE o.adviser_id = u.user_id

                    UNION

                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id
                    FROM tbl_organization_members om
                    JOIN tbl_renewal_cycle rc ON om.organization_id = rc.organization_id 
                        AND om.cycle_number = rc.cycle_number
                    JOIN tbl_organization o ON om.organization_id = o.organization_id
                    WHERE om.user_id = u.user_id
                ) AS orgs
            ),
            JSON_ARRAY()
        ),
        'pending_application', (
            SELECT JSON_OBJECT(
                'application_id', a.application_id,
                'organization_name', v.name
            )
            FROM tbl_application a
            JOIN tbl_organization_version v ON a.org_version_id = v.org_version_id
            WHERE a.applicant_user_id = u.user_id AND (a.status = 'Pending' OR a.status = 'Rejected') 
            ORDER BY a.created_at DESC
            LIMIT 1
        )
    ) AS user_info
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.email = p_user_email;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE HandleLogin(
    IN p_email VARCHAR(50),
    IN p_f_name VARCHAR(50),
    IN p_l_name VARCHAR(50)
)
BEGIN
    DECLARE v_existing_user_id VARCHAR(200);
    DECLARE v_student_role_id INT;
    DECLARE v_current_status ENUM('Pending', 'Active', 'Suspended');
    DECLARE v_current_role_id INT;
    DECLARE v_is_student BOOLEAN DEFAULT FALSE;
    DECLARE v_conflict_user_email VARCHAR(50);

    -- Get student role ID
    SELECT role_id INTO v_student_role_id 
    FROM tbl_role 
    WHERE LOWER(role_name) = 'student';

    -- Get existing user details by email
    SELECT user_id, status, role_id 
    INTO v_existing_user_id, v_current_status, v_current_role_id
    FROM tbl_user 
    WHERE email = p_email;

    -- Check if student
    IF v_current_role_id IS NOT NULL THEN
        SET v_is_student = (v_current_role_id = v_student_role_id);
    END IF;

    -- Scenario 1: Existing user found by email
    IF v_existing_user_id IS NOT NULL THEN
        -- For any user in pending status: activate and update names
        IF v_current_status = 'Pending' THEN
            UPDATE tbl_user 
            SET 
                f_name = p_f_name,
                l_name = p_l_name,
                status = 'Active'
            WHERE user_id = v_existing_user_id;
        ELSE
            -- Only update names if changed
            UPDATE tbl_user 
            SET 
                f_name = p_f_name,
                l_name = p_l_name
            WHERE user_id = v_existing_user_id
            AND (f_name != p_f_name OR l_name != p_l_name);
        END IF;
    ELSE
        -- New user: create as active student with UUID as user_id
        SET @new_uuid = UUID();
        INSERT INTO tbl_user (
            user_id,
            f_name,
            l_name,
            email,
            role_id,
            status
        ) VALUES (
            @new_uuid,
            p_f_name,
            p_l_name,
            p_email,
            v_student_role_id,
            'Active'
        );
        SET v_existing_user_id = @new_uuid;
    END IF;

    CALL GetUserPermissions(p_email);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetManagedAccounts()
BEGIN
    DECLARE student_role_id INT;

    SELECT role_id INTO student_role_id 
    FROM tbl_role 
    WHERE LOWER(role_name) = 'student';

    SELECT u.user_id as id,
           CONCAT(u.f_name, ' ', u.l_name) as name,
           u.email,
           p.name as program,
           r.role_name as role,
           u.status,
           u.created_at,
           u.updated_at,
           u.archived_at
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.role_id != student_role_id;

END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddManagedAccount(
    IN p_email VARCHAR(100),
    IN p_role_name VARCHAR(100),
    IN p_program_id INT,
    IN p_created_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_role_id INT;
    DECLARE v_existing_user INT DEFAULT 0;
    DECLARE student_role_id INT;
    DECLARE v_created_by_id VARCHAR(200);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Get creator user_id for logging
    SELECT user_id INTO v_created_by_id FROM tbl_user WHERE email = p_created_by_email LIMIT 1;
    IF v_created_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Creator user not found';
    END IF;

    SELECT role_id INTO student_role_id 
    FROM tbl_role 
    WHERE LOWER(role_name) = 'student';
    
    -- Get role ID from role name
    SELECT role_id INTO v_role_id 
    FROM tbl_role 
    WHERE role_name = p_role_name;

    IF v_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Invalid role specified';
    END IF;

    -- Check if user exists
    SELECT COUNT(*) INTO v_existing_user
    FROM tbl_user 
    WHERE email = p_email;

    IF v_existing_user > 0 THEN
        -- Update existing account
        UPDATE tbl_user
        SET role_id = v_role_id,
            program_id = p_program_id,
            status = 'Active',
            archived_at = NULL,
            archived_by = NULL,
            archived_reason = NULL,
            unarchived_at = CASE WHEN status = 'Archive' THEN CURRENT_TIMESTAMP ELSE unarchived_at END,
            unarchived_by = CASE WHEN status = 'Archive' THEN v_created_by_id ELSE unarchived_by END,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = p_email;

        -- Log the update using LogAction
        CALL LogAction(
            p_created_by_email,
            CONCAT('Updated managed account for ', p_email),
            'account',
            JSON_OBJECT('role_name', p_role_name, 'program_id', p_program_id, 'target_email', p_email),
            NULL,
            NULL
        );
    ELSE
        -- Create new pending account
        INSERT INTO tbl_user (
            user_id,
            email,
            role_id,
            program_id,
            status
        ) VALUES (
            UUID(),
            p_email,
            v_role_id,
            p_program_id,
            'Pending'
        );

        -- Log the creation using LogAction
        CALL LogAction(
            p_created_by_email,
            CONCAT('Created managed account for ', p_email),
            'account',
            JSON_OBJECT('role_name', p_role_name, 'program_id', p_program_id, 'target_email', p_email),
            NULL,
            NULL
        );
    END IF;
    
    COMMIT;

    SELECT u.user_id as id,
           CONCAT(u.f_name, ' ', u.l_name) as name,
           u.email,
           p.name as program,
           r.role_name as role,
           u.status,
           u.created_at,
           u.updated_at,
           u.archived_at,
           u.archived_by,
           u.archived_reason,
           u.unarchived_at,
           u.unarchived_by
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.role_id != student_role_id AND u.email = p_email;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateManagedAccount(
    IN p_user_id VARCHAR(200),
    IN p_role_name VARCHAR(100),
    IN p_program_name VARCHAR(100), -- Can now be NULL
    IN p_status ENUM('Active', 'Pending', 'Archive'),
    IN p_updated_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_role_id INT;
    DECLARE v_program_id INT;
    DECLARE v_email VARCHAR(100);
    DECLARE v_updated_by_id VARCHAR(200);
    DECLARE v_current_status ENUM('Active', 'Pending', 'Archive');

    -- Get updater user_id for logging
    SELECT user_id INTO v_updated_by_id FROM tbl_user WHERE email = p_updated_by_email LIMIT 1;
    IF v_updated_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Updater user not found';
    END IF;

    -- Get current email and status for logging
    SELECT email, status INTO v_email, v_current_status FROM tbl_user WHERE user_id = p_user_id;
    
    IF v_email IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User not found';
    END IF;

    -- Get role ID from role name
    SELECT role_id INTO v_role_id 
    FROM tbl_role 
    WHERE role_name = p_role_name;

    IF v_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Invalid role specified';
    END IF;

    -- Handle program_id logic with NULL support
    IF p_program_name IS NULL OR p_program_name = 'not_applicable' OR TRIM(p_program_name) = '' THEN
        SET v_program_id = NULL;
    ELSE
        SELECT program_id INTO v_program_id
        FROM tbl_program
        WHERE name = p_program_name;

        IF v_program_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid program specified';
        END IF;
    END IF;

    -- Update with proper archiving metadata
    UPDATE tbl_user
    SET 
        role_id = v_role_id,
        program_id = v_program_id,
        status = p_status,
        archived_at = CASE WHEN p_status = 'Archive' AND v_current_status != 'Archive' THEN CURRENT_TIMESTAMP ELSE archived_at END,
        archived_by = CASE WHEN p_status = 'Archive' AND v_current_status != 'Archive' THEN v_updated_by_id ELSE archived_by END,
        archived_reason = CASE WHEN p_status = 'Archive' AND v_current_status != 'Archive' THEN 'Status updated to Archive' ELSE archived_reason END,
        unarchived_at = CASE WHEN p_status != 'Archive' AND v_current_status = 'Archive' THEN CURRENT_TIMESTAMP ELSE unarchived_at END,
        unarchived_by = CASE WHEN p_status != 'Archive' AND v_current_status = 'Archive' THEN v_updated_by_id ELSE unarchived_by END,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Log the update using LogAction
    CALL LogAction(
        p_updated_by_email,
        CONCAT('Updated managed account for ', v_email),
        'account',
        JSON_OBJECT(
            'role_name', p_role_name, 
            'program_name', COALESCE(p_program_name, 'No Program'), 
            'status', p_status,
            'target_email', v_email,
            'previous_status', v_current_status
        ),
        NULL,
        NULL
    );

    SELECT u.user_id as id,
           CONCAT(u.f_name, ' ', u.l_name) as name,
           u.email,
           COALESCE(p.name, 'No Program') as program,
           r.role_name as role,
           u.status,
           u.created_at,
           u.updated_at,
           u.archived_at,
           u.archived_by,
           u.archived_reason,
           u.unarchived_at,
           u.unarchived_by
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.user_id = p_user_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteManagedAccount(
    IN p_email VARCHAR(100),
    IN p_archived_by_email VARCHAR(100),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE user_count INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_archived_by_id VARCHAR(200);
    
    -- Get archiver user_id
    SELECT user_id INTO v_archived_by_id FROM tbl_user WHERE email = p_archived_by_email LIMIT 1;
    IF v_archived_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Archiver user not found';
    END IF;
    
    -- Check if the user exists
    SELECT COUNT(*) INTO user_count
    FROM tbl_user 
    WHERE email = p_email;

    IF user_count = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found';
    ELSE
        -- Get the user_id to log the action properly
        SELECT user_id INTO v_user_id
        FROM tbl_user
        WHERE email = p_email;

        -- Archive the user with full metadata
        UPDATE tbl_user
        SET 
            status = 'Archive',
            archived_at = CURRENT_TIMESTAMP,
            archived_by = v_archived_by_id,
            archived_reason = COALESCE(p_reason, 'Manual archive via DeleteManagedAccount'),
            unarchived_at = NULL,
            unarchived_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = p_email;

        -- Log the archiving using LogAction
        CALL LogAction(
            p_archived_by_email,
            CONCAT('Archived managed account for ', p_email),
            'account',
            JSON_OBJECT('reason', COALESCE(p_reason, 'Manual archive'), 'target_email', p_email),
            NULL,
            NULL
        );
    END IF;

    SELECT u.user_id as id,
           CONCAT(u.f_name, ' ', u.l_name) as name,
           u.email,
           p.name as program,
           r.role_name as role,
           u.status,
           u.created_at,
           u.updated_at,
           u.archived_at,
           u.archived_by,
           u.archived_reason,
           u.unarchived_at,
           u.unarchived_by
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.email = p_email;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveManagedAccount(
    IN p_user_id VARCHAR(200),
    IN p_unarchived_by_email VARCHAR(100)
)
BEGIN
    DECLARE user_count INT;
    DECLARE v_email VARCHAR(100);
    DECLARE v_unarchived_by_id VARCHAR(200);

    -- Get unarchiver user_id
    SELECT user_id INTO v_unarchived_by_id FROM tbl_user WHERE email = p_unarchived_by_email LIMIT 1;
    IF v_unarchived_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unarchiver user not found';
    END IF;

    -- Check if user exists and get email (FIXED: separate queries)
    SELECT COUNT(*) INTO user_count FROM tbl_user WHERE user_id = p_user_id;
    
    IF user_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;
    
    -- Get email separately
    SELECT email INTO v_email FROM tbl_user WHERE user_id = p_user_id;

    -- Unarchive user with full metadata
    UPDATE tbl_user
    SET 
        status = 'Active',
        archived_at = NULL,
        archived_by = NULL,
        archived_reason = NULL,
        unarchived_at = CURRENT_TIMESTAMP,
        unarchived_by = v_unarchived_by_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Log the action using LogAction
    CALL LogAction(
        p_unarchived_by_email,
        CONCAT('Unarchived managed account for ', v_email),
        'account',
        JSON_OBJECT('reason', 'Manual unarchive', 'target_email', v_email),
        NULL,
        NULL
    );

    SELECT u.user_id as id,
           CONCAT(u.f_name, ' ', u.l_name) as name,
           u.email,
           p.name as program,
           r.role_name as role,
           u.status,
           u.created_at,
           u.updated_at,
           u.archived_at,
           u.archived_by,
           u.archived_reason,
           u.unarchived_at,
           u.unarchived_by
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.user_id = p_user_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetRequirements()
BEGIN 

	SELECT  
    requirement_id as id,
    requirement_name,
    is_applicable_to,
    file_path,
    created_by,
    created_at,
    updated_at
    FROM tbl_application_requirement;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetRequirementsFiltered(
    IN p_type VARCHAR(10)  -- 'new' | 'renew' | NULL
)
BEGIN
    DECLARE v_type VARCHAR(10);
    SET v_type = LOWER(TRIM(p_type));
    IF v_type = '' THEN SET v_type = NULL; END IF;
    IF v_type IS NOT NULL AND v_type NOT IN ('new','renew') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid type filter (expected new or renew)';
    END IF;

    SELECT
        requirement_id AS id,
        requirement_name,
        is_applicable_to,
        file_path,
        created_by,
        created_at,
        updated_at
    FROM tbl_application_requirement
    WHERE
        v_type IS NULL
        OR is_applicable_to = 'both'
        OR is_applicable_to = v_type
    ORDER BY requirement_name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddRequirement(
    IN p_requirement_name VARCHAR(255),
    IN p_is_applicable_to ENUM('new','renew','both'),
    IN p_file_path VARCHAR(255),
    IN p_created_by VARCHAR(200)
)
BEGIN
    DECLARE v_last_id INT;

    IF p_requirement_name IS NULL OR TRIM(p_requirement_name) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement name required';
    END IF;

    IF p_is_applicable_to IS NULL OR p_is_applicable_to = '' THEN
        SET p_is_applicable_to = 'new';
    END IF;

    IF p_is_applicable_to NOT IN ('new','renew','both') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid is_applicable_to value';
    END IF;

    INSERT INTO tbl_application_requirement(
        requirement_name,
        is_applicable_to,
        file_path,
        created_by
    ) VALUES(
        p_requirement_name,
        p_is_applicable_to,
        NULLIF(p_file_path,''),
        p_created_by
    );

    SET v_last_id = LAST_INSERT_ID();

    SELECT
        requirement_id AS id,
        requirement_name,
        is_applicable_to,
        file_path,
        created_by,
        created_at,
        updated_at
    FROM tbl_application_requirement
    WHERE requirement_id = v_last_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSpecificRequirement(IN
	p_requirement_id INT
)
BEGIN 

	SELECT * FROM tbl_application_requirement WHERE requirement_id = p_requirement_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteRequirement(
    IN p_requirement_id INT
)
BEGIN
    SELECT requirement_id as id,
    requirement_name,
    is_applicable_to,
    file_path,
    created_by,
    created_at,
    updated_at 
    FROM tbl_application_requirement WHERE requirement_id = p_requirement_id;

    DELETE FROM tbl_application_requirement WHERE requirement_id = p_requirement_id;
END $$

DELIMITER ;

DELIMITER $$
CREATE PROCEDURE UpdateRequirement(
    IN p_requirement_id INT,
    IN p_requirement_name VARCHAR(255),
    IN p_is_applicable_to_in VARCHAR(10),
    IN p_file_path_in VARCHAR(255)
)
BEGIN
    IF p_requirement_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement id required';
    END IF;
    IF p_requirement_name IS NULL OR TRIM(p_requirement_name) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Requirement name required';
    END IF;

    SET @norm_type = LOWER(TRIM(p_is_applicable_to_in));
    IF @norm_type IS NULL OR @norm_type = '' THEN
        SET @norm_type = NULL;
    ELSEIF @norm_type NOT IN ('new','renew','both') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid is_applicable_to value';
    END IF;

    UPDATE tbl_application_requirement
    SET
        requirement_name = p_requirement_name,
        is_applicable_to = COALESCE(@norm_type, is_applicable_to),
        file_path = COALESCE(NULLIF(p_file_path_in,''), file_path),
        updated_at = CURRENT_TIMESTAMP
    WHERE requirement_id = p_requirement_id;

    SELECT
        requirement_id AS id,
        requirement_name,
        is_applicable_to,
        file_path,
        created_by,
        created_at,
        updated_at
    FROM tbl_application_requirement
    WHERE requirement_id = p_requirement_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddApplicationPeriod(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_created_by VARCHAR(200)
)
BEGIN
    DECLARE v_period_id INT;
    DECLARE v_creator_email VARCHAR(100);
    DECLARE v_admin_emails JSON;

    -- Get creator email for logging
    SELECT email INTO v_creator_email FROM tbl_user WHERE user_id = p_created_by LIMIT 1;
    
    INSERT INTO tbl_application_period (
        start_date, 
        end_date, 
        start_time, 
        end_time,
        created_by
    ) VALUES (
        p_start_date, 
        p_end_date, 
        p_start_time, 
        p_end_time,
        p_created_by
    );

    SET v_period_id = LAST_INSERT_ID();

    -- Get all admin emails for notification
    SELECT JSON_ARRAYAGG(email) INTO v_admin_emails
    FROM tbl_user
    WHERE role_id IN (2, 3, 4) AND status = 'Active'; 

    -- Create user-friendly notification
    CALL CreateNotification(
        'New Application Period Available',
        CONCAT('Organizations can now submit applications from ', DATE_FORMAT(p_start_date, '%M %d, %Y at %h:%i %p'), ' until ', DATE_FORMAT(p_end_date, '%M %d, %Y at %h:%i %p'), '. Please inform your organizations about this opportunity.'),
        NULL,               -- url (nullable)
        'system',           -- entity_type
        v_period_id,        -- entity_id
        p_created_by,       -- sender_id
        v_admin_emails,     -- recipient_emails (JSON)
        'application_period_opened'
    );

    -- Log with user-friendly message
    CALL LogAction(
        v_creator_email,
        CONCAT('Created new application period: ', DATE_FORMAT(p_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(p_end_date, '%M %d, %Y')),
        'Application Period Management',
        JSON_OBJECT(
            'period_id', v_period_id,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'start_time', p_start_time,
            'end_time', p_end_time,
            'action', 'Created application period for organization applications'
        ),
        CONCAT('/admin/application-periods/', v_period_id),
        NULL
    );

    SELECT
        period_id as id,
        start_date,
        end_date,
        start_time,
        end_time
    FROM tbl_application_period WHERE period_id = v_period_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetActiveApplicationPeriod()
BEGIN
  DECLARE currentDate DATE;
  DECLARE currentTime TIME;
  
  SET currentDate = CURDATE();
  SET currentTime = CURTIME();

  SELECT period_id as id,
         start_date,
         end_date,
         start_time,
         end_time
  FROM tbl_application_period
  WHERE is_active = 1
  ORDER BY created_at DESC
  LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateApplicationPeriod(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_period_id INT,
    IN p_updated_by VARCHAR(200)
)
BEGIN
    DECLARE v_updater_email VARCHAR(100);
    DECLARE v_admin_emails JSON;
    DECLARE v_old_start_date DATE;
    DECLARE v_old_end_date DATE;

    -- Get old values for comparison
    SELECT start_date, end_date INTO v_old_start_date, v_old_end_date
    FROM tbl_application_period WHERE period_id = p_period_id;

    -- Get updater email for logging
    SELECT email INTO v_updater_email FROM tbl_user WHERE user_id = p_updated_by LIMIT 1;

    UPDATE tbl_application_period
    SET start_date = p_start_date,
        end_date = p_end_date,
        start_time = p_start_time,
        end_time = p_end_time,
        updated_at = CURRENT_TIMESTAMP
    WHERE period_id = p_period_id;

    -- Get all admin emails for notification
    SELECT JSON_ARRAYAGG(email) INTO v_admin_emails
    FROM tbl_user
    WHERE role_id IN (2, 3, 4) AND status = 'Active';

    -- Create user-friendly notification
    CALL CreateNotification(
        'Application Period Schedule Updated',
        CONCAT('The application period has been rescheduled. New dates: ', DATE_FORMAT(p_start_date, '%M %d, %Y at %h:%i %p'), ' until ', DATE_FORMAT(p_end_date, '%M %d, %Y at %h:%i %p'), '. Please notify organizations of this change.'),
        NULL,               -- url (nullable)
        'system',           -- entity_type
        p_period_id,        -- entity_id
        p_updated_by,       -- sender_id
        v_admin_emails,     -- recipient_emails (JSON)
        'application_period_modified'
    );

    -- Log with user-friendly message
    CALL LogAction(
        v_updater_email,
        CONCAT('Updated application period schedule from ', DATE_FORMAT(v_old_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(v_old_end_date, '%M %d, %Y'), ' to ', DATE_FORMAT(p_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(p_end_date, '%M %d, %Y')),
        'Application Period Management',
        JSON_OBJECT(
            'period_id', p_period_id,
            'previous_dates', CONCAT(DATE_FORMAT(v_old_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(v_old_end_date, '%M %d, %Y')),
            'new_dates', CONCAT(DATE_FORMAT(p_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(p_end_date, '%M %d, %Y')),
            'action', 'Modified application period schedule'
        ),
        CONCAT('/admin/application-periods/', p_period_id),
        NULL
    );

    SELECT  
        period_id as id,
        start_date,
        end_date,
        start_time,
        end_time
    FROM tbl_application_period WHERE period_id = p_period_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE InitiateApprovalProcess(
    IN p_application_id INT,
    IN p_initiated_by VARCHAR(200)
)
BEGIN
    -- Declarations
    DECLARE v_period_id INT;
    DECLARE v_application_type ENUM('new', 'renewal');
    DECLARE v_role_id INT;
    DECLARE v_hierarchy_order INT;
    DECLARE v_approver_id VARCHAR(200);
    DECLARE v_done BOOLEAN DEFAULT FALSE;
    DECLARE v_first_step BOOLEAN DEFAULT TRUE;
    DECLARE v_initiator_email VARCHAR(100);
    DECLARE v_last_approval_id INT;
    DECLARE v_last_approver_email VARCHAR(100);
    DECLARE v_submitted_org_name VARCHAR(255);
    DECLARE v_url VARCHAR(512);

    -- Cursor and handler declarations
    DECLARE role_cursor CURSOR FOR
        SELECT role_id, hierarchy_order
        FROM tbl_role
        WHERE is_approver = TRUE
          AND hierarchy_order IS NOT NULL
        ORDER BY hierarchy_order;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    -- Get period and application type
    SELECT a.period_id, a.application_type, a.submitted_org_name
    INTO v_period_id, v_application_type, v_submitted_org_name
    FROM tbl_application a
    WHERE a.application_id = p_application_id
    LIMIT 1;

    SET v_url = CONCAT('/organizations/app-details/', p_application_id, '/', COALESCE(v_submitted_org_name, ''));

    -- Get initiator email for optional logging
    SELECT email INTO v_initiator_email FROM tbl_user WHERE user_id = p_initiated_by LIMIT 1;

    OPEN role_cursor;

    approval_loop: LOOP
        FETCH role_cursor INTO v_role_id, v_hierarchy_order;
        IF v_done THEN
            LEAVE approval_loop;
        END IF;

        SET v_approver_id = (
            SELECT user_id
            FROM tbl_user
            WHERE role_id = v_role_id
              AND status = 'Active'
            LIMIT 1
        );

        IF v_approver_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM tbl_approval_process ap
                WHERE ap.application_id = p_application_id
                  AND ap.period_id = v_period_id
                  AND ap.approval_role_id = v_role_id
            ) THEN
                IF v_first_step THEN
                    INSERT INTO tbl_approval_process (
                        application_id,
                        period_id,
                        approver_id,
                        approval_role_id,
                        application_type,
                        status,
                        step
                    ) VALUES (
                        p_application_id,
                        v_period_id,
                        v_approver_id,
                        v_role_id,
                        v_application_type,
                        'Approved',
                        v_hierarchy_order
                    );
                    SET v_first_step = FALSE;
                ELSE
                    INSERT INTO tbl_approval_process (
                        application_id,
                        period_id,
                        approver_id,
                        approval_role_id,
                        application_type,
                        status,
                        step
                    ) VALUES (
                        p_application_id,
                        v_period_id,
                        v_approver_id,
                        v_role_id,
                        v_application_type,
                        'Pending',
                        v_hierarchy_order
                    );
                END IF;
            END IF;
        END IF;
    END LOOP approval_loop;

    CLOSE role_cursor;

    INSERT INTO tbl_application_approval (application_id, approval_id)
    SELECT p_application_id, ap.approval_id
    FROM tbl_approval_process ap
    LEFT JOIN tbl_application_approval aa
      ON aa.application_id = p_application_id
     AND aa.approval_id = ap.approval_id
    WHERE ap.application_id = p_application_id
      AND ap.period_id = v_period_id
      AND aa.approval_id IS NULL;

    SELECT approval_id, approver_id
    INTO v_last_approval_id, v_approver_id
    FROM tbl_approval_process
    WHERE application_id = p_application_id
      AND period_id = v_period_id
      AND status = 'Pending'
    ORDER BY step ASC
    LIMIT 1;

    -- IF v_approver_id IS NOT NULL THEN
    --     SELECT email INTO v_last_approver_email FROM tbl_user WHERE user_id = v_approver_id LIMIT 1;
    --     CALL CreateNotification(
    --         CONCAT('Approval Needed: ', COALESCE(v_submitted_org_name, 'Application')),
    --         'A new application is ready for your review. Please check the application documents and provide your approval decision.',
    --         v_url,
    --         'approval',
    --         p_application_id,
    --         p_initiated_by,
    --         JSON_ARRAY(v_last_approver_email),
    --         'approval_required'
    --     );
    -- END IF;

    IF EXISTS (
        SELECT 1 FROM tbl_approval_process 
        WHERE application_id = p_application_id
          AND period_id = v_period_id
          AND approver_id IS NOT NULL
    ) THEN
        UPDATE tbl_application 
        SET status = 'Pending'
        WHERE application_id = p_application_id;
    ELSE
        UPDATE tbl_application 
        SET status = 'Rejected'
        WHERE application_id = p_application_id;
    END IF;
END$$
DELIMITER ;

-- CREATE DEFINER='admin'@'%' PROCEDURE NotiftyApprover(
--     IN p_application_id INT
-- )
-- BEGIN
--  SELECT approval_id, approver_id
--     INTO v_approver_id
--     FROM tbl_approval_process
--     WHERE application_id = p_application_id
--       AND status = 'Pending'
--     ORDER BY step ASC
--     LIMIT 1;


--         SELECT email INTO v_last_approver_email FROM tbl_user WHERE user_id = v_approver_id LIMIT 1;
--         CALL CreateNotification(
--             CONCAT('Approval Needed: ', COALESCE(v_submitted_org_name, 'Application')),
--             'A new application is ready for your review. Please check the application documents and provide your approval decision.',
--             v_url,
--             'approval',
--             p_application_id,
--             p_initiated_by,
--             JSON_ARRAY(v_last_approver_email),
--             'approval_required'
--         );
-- END $$
-- DELIMITER ;


DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE CreateOrganizationApplication(
    IN p_organization   JSON,
    IN p_executives     JSON,
    IN p_requirements   JSON,
    IN p_user_id        VARCHAR(200)
)
BEGIN
    -- Declarations
    DECLARE v_is_resubmission    TINYINT(1) DEFAULT 0;
    DECLARE v_organization_id    INT;
    DECLARE v_program_id         INT;
    DECLARE v_period_id          INT;
    DECLARE v_application_id     INT;
    DECLARE v_president_id       VARCHAR(200) DEFAULT NULL;
    DECLARE v_org_name           VARCHAR(100);
    DECLARE v_logo_filename      VARCHAR(255);
    DECLARE i                    INT DEFAULT 0;
    DECLARE v_requirement_count  INT DEFAULT 0;
    DECLARE v_rank_number        INT;
    DECLARE v_rank_id            INT;
    DECLARE v_error_msg          VARCHAR(255);
    DECLARE v_name_exists        TINYINT(1) DEFAULT 0;
    DECLARE v_fname              VARCHAR(50);
    DECLARE v_lname              VARCHAR(50);
    DECLARE v_role               VARCHAR(100);
    DECLARE v_email              VARCHAR(100);
    DECLARE v_exec_user_id       VARCHAR(200);
    DECLARE v_exec_role_id       INT;
    DECLARE v_req_id             INT;
    DECLARE v_file_path          VARCHAR(255);
    DECLARE v_exec_count         INT DEFAULT 0;
    DECLARE v_cycle_number       INT DEFAULT 1;
    DECLARE v_fee_type           VARCHAR(50) DEFAULT 'Free';
    DECLARE v_fee_amount         DECIMAL(10,2);
    DECLARE v_dept_count         INT DEFAULT 0;

    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Always create a new organization and application. Do not route to resubmission logic here.

    -- Determine fee type safely
    SET @__fee = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_duration'));
    IF @__fee IS NOT NULL AND @__fee != '' AND @__fee IN ('Per Term', 'Whole Academic Year', 'Free') THEN
        SET v_fee_type = @__fee;
    ELSE
        SET v_fee_type = 'Free';
    END IF;

    -- parse fee amount (nullable)
    SET @__fee_amt = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_amount'));
    IF @__fee_amt IS NULL OR @__fee_amt = '' THEN
        SET v_fee_amount = NULL;
    ELSE
        SET v_fee_amount = NULLIF(CAST(@__fee_amt AS DECIMAL(10,2)), 0);
    END IF;

    -- number of executives and program count (defensive)
    SET v_exec_count = COALESCE(JSON_LENGTH(p_executives), 0);
    SET v_dept_count  = COALESCE(JSON_LENGTH(p_organization, '$.programs'), 0);

    START TRANSACTION;

    -- Get user's program
    SELECT program_id INTO v_program_id
    FROM tbl_user
    WHERE user_id = p_user_id;
    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User program not found';
    END IF;

    -- Check organization name uniqueness
    SET v_org_name = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_name'));
    SELECT EXISTS(SELECT 1 FROM tbl_organization WHERE name = v_org_name) INTO v_name_exists;
    IF v_name_exists = 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization name already exists';
    END IF;

    -- Create organization version
    INSERT INTO tbl_organization_version (
        name,
        slug,
        logo_path,
        description,
        base_program_id,
        membership_fee_type,
        membership_fee_amount,
        is_recruiting,
        is_open_to_all_courses,
        category,
        created_by
    ) VALUES (
        v_org_name,
        NULL,
        JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo')),
        JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_description')),
        v_program_id,
        v_fee_type,
        v_fee_amount,
        TRUE,
        FALSE,
        JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.category')),
        p_user_id
    );
    SET @org_version_id = LAST_INSERT_ID();

    -- Insert multiple program associations into tbl_organization_version_course
    SET i = 0;
    WHILE i < v_dept_count DO
        SET @program = JSON_EXTRACT(p_organization, CONCAT('$.programs[', i, ']'));
        SET @program_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(@program, '$.program_id')) AS UNSIGNED);
        IF @program_id IS NOT NULL THEN
            INSERT INTO tbl_organization_version_course (
                org_version_id,
                program_id
            ) VALUES (
                @org_version_id,
                @program_id
            );
        END IF;
        SET i = i + 1;
    END WHILE;

    -- Find active application period
    SELECT period_id INTO v_period_id
    FROM tbl_application_period
    WHERE is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_period_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active application period';
    END IF;

    -- Create application referencing org_version
    INSERT INTO tbl_application (
        org_version_id,
        submitted_org_name,
        submitted_org_logo,
        application_type,
        period_id,
        applicant_user_id,
        status
    ) VALUES (
        @org_version_id,
        v_org_name,
        JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo')),
        'new',
        v_period_id,
        p_user_id,
        'pending'
    );
    SET v_application_id = LAST_INSERT_ID();

    -- Insert proposed executives
    SET i = 0;
    WHILE i < v_exec_count DO
        SET @executive = JSON_EXTRACT(p_executives, CONCAT('$[', i, ']'));
        SET @exec_email = JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.nu_email'));
        SELECT user_id INTO @exec_user_id FROM tbl_user WHERE email = @exec_email LIMIT 1;
        INSERT INTO tbl_application_executives (
            application_id,
            org_version_id,
            proposed_user_id,
            proposed_name,
            proposed_email,
            proposed_title,
            proposed_rank_id
        ) VALUES (
            v_application_id,
            @org_version_id,
            IFNULL(@exec_user_id, NULL),
            CONCAT(JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.f_name')), ' ', JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.l_name'))),
            @exec_email,
            JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.role_name')),
            CAST(JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.rank_number')) AS UNSIGNED)
        );
        SET i = i + 1;
    END WHILE;

    -- Process requirements
    SET v_requirement_count = COALESCE(JSON_LENGTH(p_requirements), 0);
    SET i = 0;
    WHILE i < v_requirement_count DO
        SET @requirement = JSON_EXTRACT(p_requirements, CONCAT('$[', i, ']'));
        SET v_req_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(@requirement, '$.requirement_id')) AS UNSIGNED);
        SET v_file_path = JSON_UNQUOTE(JSON_EXTRACT(@requirement, '$.requirement_path'));
        INSERT INTO tbl_organization_requirement_submission (
            application_id,
            requirement_id,
            organization_id,
            cycle_number,
            org_version_id,
            file_path,
            submitted_by,
            status,
            submitted_requirement_title,
            submitted_requirement_hash
        ) VALUES (
            v_application_id,
            v_req_id,
            NULL,
            v_cycle_number,
            @org_version_id,
            v_file_path,
            p_user_id,
            'Pending',
            (SELECT requirement_name FROM tbl_application_requirement WHERE requirement_id = v_req_id LIMIT 1),
            NULL
        );
        SET i = i + 1;
    END WHILE;

    COMMIT;
    -- Return results
    SELECT
        @org_version_id AS org_version_id,
        v_application_id AS application_id,
        CONCAT(v_org_name, '/logo/', JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo'))) AS logo_path;
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE ResubmitOrganizationApplication(
    IN p_organization   JSON,
    IN p_executives     JSON,
    IN p_requirements   JSON,
    IN p_user_id        VARCHAR(200)
)
BEGIN
    -- Local declarations (all declarations before any statements)
    DECLARE v_organization_id INT;
    DECLARE v_program_id INT;
    DECLARE v_period_id INT;
    DECLARE v_application_id INT;
    DECLARE v_org_name VARCHAR(100);
    DECLARE v_logo_filename VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE v_requirement_count INT DEFAULT 0;
    DECLARE v_req_id INT;
    DECLARE v_file_path VARCHAR(255);
    DECLARE v_cycle_number INT DEFAULT 1;
    DECLARE v_fee_type VARCHAR(50) DEFAULT 'Free';
    DECLARE v_fee_amount DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_tmp_fee_text VARCHAR(255);

    -- Error handler: rollback and re-raise
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Safely parse fee type from JSON
    SET v_tmp_fee_text = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_duration'));
    IF v_tmp_fee_text IS NOT NULL AND v_tmp_fee_text != '' AND v_tmp_fee_text IN ('Per Term', 'Whole Academic Year', 'Free') THEN
        SET v_fee_type = v_tmp_fee_text;
    ELSE
        SET v_fee_type = 'Free';
    END IF;

    -- Safely parse fee amount (nullable, treat 0 as NULL)
    SET v_tmp_fee_text = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_amount'));
    IF v_tmp_fee_text IS NULL OR v_tmp_fee_text = '' THEN
        SET v_fee_amount = NULL;
    ELSE
        SET v_fee_amount = NULLIF(CAST(v_tmp_fee_text AS DECIMAL(10,2)), 0);
    END IF;

    -- Defensive counts
    SET v_requirement_count = COALESCE(JSON_LENGTH(p_requirements), 0);

    START TRANSACTION;

    -- Get user's program (ensure it exists)
    SELECT program_id INTO v_program_id
    FROM tbl_user
    WHERE user_id = p_user_id
    LIMIT 1;
    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User program not found';
    END IF;

    -- Get organization id by name (ensure exists)
    SET v_org_name = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_name'));
    SELECT organization_id INTO v_organization_id
    FROM tbl_organization
    WHERE name = v_org_name
    LIMIT 1;
    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found for resubmission';
    END IF;

    -- Update organization info and set status to Pending
    UPDATE tbl_organization
    SET
        description = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_description')),
        logo = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo')),
        base_program_id = v_program_id,
        status = 'Pending',
        membership_fee_type = v_fee_type,
        membership_fee_amount = v_fee_amount,
        is_recruiting = TRUE,
        is_open_to_all_courses = FALSE,
        category = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.category'))
    WHERE organization_id = v_organization_id;

    SET v_logo_filename = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo'));

    -- Find active application period
    SELECT period_id INTO v_period_id
    FROM tbl_application_period
    WHERE is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_period_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active application period';
    END IF;

    -- Create new application (resubmission treated as 'new' application per original)
    INSERT INTO tbl_application (
        organization_id,
        cycle_number,
        application_type,
        period_id,
        applicant_user_id,
        status
    ) VALUES (
        v_organization_id,
        v_cycle_number,
        'new',
        v_period_id,
        p_user_id,
        'pending'
    );
    SET v_application_id = LAST_INSERT_ID();

    -- Initiate approval and add default membership question
    CALL InitiateApprovalProcess(v_application_id);
    INSERT INTO tbl_membership_question(organization_id, cycle_number, question_text, question_type)
    VALUES (v_organization_id, v_cycle_number, 'What is your reason for joining?', 'text');

    -- Process requirement submissions (if any)
    SET i = 0;
    WHILE i < v_requirement_count DO
        SET @requirement = JSON_EXTRACT(p_requirements, CONCAT('$[', i, ']'));
        SET v_req_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(@requirement, '$.requirement_id')) AS UNSIGNED);
        SET v_file_path = JSON_UNQUOTE(JSON_EXTRACT(@requirement, '$.requirement_path'));
        INSERT INTO tbl_organization_requirement_submission (
            application_id,
            requirement_id,
            cycle_number,
            organization_id,
            file_path,
            submitted_by
        ) VALUES (
            v_application_id,
            v_req_id,
            v_cycle_number,
            v_organization_id,
            v_file_path,
            p_user_id
        );
        SET i = i + 1;
    END WHILE;

    COMMIT;
    
    -- Return results
    SELECT
        v_organization_id AS organization_id,
        v_application_id AS application_id,
        v_org_name AS directory_name,
        CONCAT(v_org_name, '/logo/', v_logo_filename) AS logo_path,
        CONCAT(v_org_name, '/requirements/') AS requirements_dir,
        v_cycle_number AS cycle_number;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetApplication(
    IN p_application_id INT
)
BEGIN
SELECT
    app.application_id as id,
    app.org_version_id,
    ov.name AS organization_name,
    ov.logo_path AS organization_logo,
    ov.description AS organization_description,
    ov.category,
    ov.base_program_id,
    p.name AS program_name,
    ov.membership_fee_type,
    ov.membership_fee_amount,
    ov.is_recruiting,
    ov.is_open_to_all_courses,
    ov.created_at AS organization_created,
    app.submitted_org_name,
    app.submitted_org_logo,
    app.application_type,
    app.period_id,
    app.applicant_user_id,
    app.status AS application_status,
    app.created_at AS application_created,
    app.updated_at AS application_updated
FROM tbl_application app
INNER JOIN tbl_organization_version ov ON app.org_version_id = ov.org_version_id
LEFT JOIN tbl_program p ON ov.base_program_id = p.program_id
WHERE app.application_id = p_application_id;
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEvents()
BEGIN
    SELECT 
        e.event_id as id,
        e.title,
        e.description,
        e.image,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.capacity,
        e.certificate,
        e.fee,
        e.is_open_to,
        e.venue_type,
        e.venue,
        e.organization_id,
        o.name AS organization_name,
        rc.cycle_number,
        e.status,
        e.type,
        e.user_id,
        e.created_at
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id AND e.cycle_number = rc.cycle_number;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckEventTitle(
    IN p_title VARCHAR(300)
)
BEGIN
    DECLARE v_count INT DEFAULT 0;
    
    -- Validate input
    IF p_title IS NULL OR TRIM(p_title) = '' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event title is required';
    END IF;
    
    -- Check if the title exists (case-insensitive)
    SELECT COUNT(*) INTO v_count
    FROM tbl_event
    WHERE LOWER(TRIM(title)) = LOWER(TRIM(p_title))
    AND status != 'Rejected'; -- Only check non-rejected events
    
    -- Return result
    SELECT 
        CASE 
            WHEN v_count > 0 THEN 1
            ELSE 0
        END AS `exists`;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckScheduleConflict(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_venue VARCHAR(200),
    IN p_event_id INT
)
BEGIN
    -- Validate input
    IF p_start_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'start_date, start_time, and end_time are required';
    END IF;
    
    -- Set end_date to start_date if not provided
    IF p_end_date IS NULL THEN
        SET p_end_date = p_start_date;
    END IF;
    
    -- Check for time and date conflicts
    SELECT 
        e.event_id as id,
        e.title,
        e.venue as location,
        CONCAT(e.start_date, ' ', e.start_time) as start_datetime,
        CONCAT(e.end_date, ' ', e.end_time) as end_datetime
    FROM tbl_event e
    WHERE e.status IN ('Approved', 'Pending') -- Only check active events
        AND (p_event_id IS NULL OR e.event_id != p_event_id) -- Exclude current event if updating
        AND (
            -- Date overlap check
            (e.start_date <= p_end_date AND e.end_date >= p_start_date)
        )
        AND (
            -- Time overlap check
            (e.start_time < p_end_time AND e.end_time > p_start_time)
        )
        AND (
            -- Venue conflict check (only for face-to-face events with venue)
            p_venue IS NULL 
            OR e.venue IS NULL 
            OR e.venue_type != 'Face to face'
            OR LOWER(TRIM(e.venue)) = LOWER(TRIM(p_venue))
        )
    ORDER BY e.start_date, e.start_time;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventById(IN p_event_id INT)
BEGIN
SELECT
     e.event_id as id,
        e.title,
        e.description,
        e.image,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.capacity,
        e.certificate,
        e.fee,
        e.is_open_to,
        e.venue_type,
        e.venue,
        e.organization_id,
        o.name AS organization_name,
        rc.cycle_number,
        e.status,
        e.type,
        e.user_id,
        e.created_at
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id AND e.cycle_number = rc.cycle_number
    WHERE e.event_id = p_event_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventAttendeesWithDetails(
    IN p_event_id INT
)
BEGIN
    SELECT
        ea.attendance_id,
        ea.event_id,
        ea.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        ea.status AS attendance_status,
        te.remarks,
        ea.time_in,
        ea.time_out,
        ea.created_at AS registration_date,
        t.transaction_id,
        t.amount,
        t.transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea

    LEFT JOIN tbl_user u ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id AND ea.user_id = (SELECT user_id FROM tbl_transaction WHERE transaction_id = te.transaction_id LIMIT 1)
       LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id
    WHERE ea.event_id = p_event_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventsByStatus(IN p_status VARCHAR(20))
BEGIN
    IF p_status = 'Approved' THEN
        -- Only show upcoming or ongoing approved events
        SELECT
            e.event_id,
            e.title,
            e.description,
            e.start_date,
            e.end_date,
            e.start_time,
            e.end_time,
            e.capacity,
            e.certificate,
            e.fee,
            e.is_open_to,
            e.venue_type,
            e.venue,
            e.organization_id,
            o.name AS organization_name,
            e.status,
            e.type,
            e.user_id,
            e.created_at
        FROM tbl_event e
        JOIN tbl_organization o ON e.organization_id = o.organization_id
        WHERE e.status = 'Approved'
          AND (
            (e.end_date > CURDATE())
            OR (e.end_date = CURDATE() AND e.end_time >= CURTIME())
            OR (e.end_date IS NULL AND e.start_date >= CURDATE())
          );
    ELSE
        -- For Pending or Rejected, show all regardless of date
        SELECT 
            e.event_id,
            e.title,
            e.description,
            e.start_date,
            e.end_date,
            e.start_time,
            e.end_time,
            e.capacity,
            e.certificate,
            e.fee,
            e.is_open_to,
            e.venue_type,
            e.venue,
            e.organization_id,
            o.name AS organization_name,
            e.status,
            e.type,
            e.user_id,
            e.created_at
        FROM tbl_event e
        JOIN tbl_organization o ON e.organization_id = o.organization_id
        WHERE e.status = p_status;
    END IF;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSpecificApplication(
    IN p_user_id VARCHAR(200),
    IN p_organization_name VARCHAR(100),
    IN p_application_id INT
)
BEGIN
    DECLARE v_org_version_id INT;

    -- Get org_version_id from application
    SELECT org_version_id INTO v_org_version_id
    FROM tbl_application
    WHERE application_id = p_application_id;

    -- Main Query: Single JSON Output
    SELECT JSON_OBJECT(
        'organization_version', (
            SELECT JSON_OBJECT(
                'id', v.org_version_id,
                'name', v.name,
                'description', v.description,
                'logo_url', v.logo_path,
                'category', v.category,
                'membership_info', JSON_OBJECT(
                    'fee_type', v.membership_fee_type,
                    'fee_amount', v.membership_fee_amount,
                    'recruiting', v.is_recruiting,
                    'open_courses', v.is_open_to_all_courses
                ),
                'programs', COALESCE(
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.program_id,
                            'name', p.name,
                            'abbreviation', p.abbreviation
                        )
                    )
                    FROM (
                        SELECT prog.program_id, prog.name, prog.abbreviation
                        FROM tbl_organization_version_course ovc
                        JOIN tbl_program prog ON ovc.program_id = prog.program_id
                        WHERE ovc.org_version_id = v.org_version_id
                        UNION
                        SELECT bp.program_id, bp.name, bp.abbreviation
                        FROM tbl_program bp
                        WHERE bp.program_id = v.base_program_id
                    ) p),
                    JSON_ARRAY()
                )
            )
            FROM tbl_organization_version v
            WHERE v.org_version_id = v_org_version_id
        ),
        'application', (
            SELECT JSON_OBJECT(
                'id', a.application_id,
                'current_status', a.status,
                'submission_date', a.created_at,
                'cycle_number', a.cycle_number,
                'submitted_by', CONCAT(u.f_name, ' ', u.l_name),
                'requirements', COALESCE(
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'requirement_id', rs.requirement_id,
                            'name', ar.requirement_name,
                            'submitted_file', rs.file_path,
                            'submitted_at', rs.submitted_at
                        )
                    )
                    FROM tbl_organization_requirement_submission rs
                    JOIN tbl_application_requirement ar 
                        ON rs.requirement_id = ar.requirement_id
                    WHERE rs.application_id = a.application_id),
                    JSON_ARRAY()
                )
            )
            FROM tbl_application a
            LEFT JOIN tbl_user u ON a.applicant_user_id = u.user_id
            WHERE a.application_id = p_application_id
        ),
        'leadership', (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'application_executive_id', ae.app_exec_id,
                    'proposed_user_id', ae.proposed_user_id,
                    'proposed_name', ae.proposed_name,
                    'proposed_email', ae.proposed_email,
                    'proposed_title', ae.proposed_title,
                    'proposed_rank_id', ae.proposed_rank_id
                )
            )
            FROM tbl_application_executives ae
            WHERE ae.application_id = p_application_id
        )
    ) AS result;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetApprovalTimeline(
    IN p_organization_name VARCHAR(100),
    IN p_application_id INT
)
BEGIN
            SELECT 
                ap.approval_id as id,
                ap.step,
                r.role_name,
                ap.status,
                u.email,
                u.f_name,
                u.l_name,
                u.user_id,
                ap.comment,
                ap.timestamp
            FROM tbl_approval_process ap
            JOIN tbl_role r 
                ON ap.approval_role_id = r.role_id
            LEFT JOIN tbl_user u 
                ON ap.approver_id = u.user_id
            WHERE ap.application_id = p_application_id
            ORDER BY ap.step;
END $$
DELIMITER ;
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveApplication(
    IN p_approval_id INT,
    IN p_comment TEXT,
    IN p_organization_id INT,   -- optional override org id
    IN p_application_id INT
)
BEGIN
    -- Top-level declarations (no new/changed columns referenced)
    DECLARE v_step INT;
    DECLARE v_last_step INT;
    DECLARE v_org_version_id INT;
    DECLARE v_existing_org_id INT;
    DECLARE v_new_org_id INT;
    DECLARE v_org_name VARCHAR(255);
    DECLARE v_org_logo VARCHAR(500);
    DECLARE v_org_description TEXT;
    DECLARE v_base_program_id INT;
    DECLARE v_fee_type ENUM('Per Term','Whole Academic Year','Free');
    DECLARE v_fee_amount DECIMAL(10,2);
    DECLARE v_category ENUM('Co-Curricular Organization','Extra Curricular Organization');
    DECLARE v_created_by VARCHAR(200);
    DECLARE v_is_recruiting BOOLEAN;
    DECLARE v_is_open_to_all_courses BOOLEAN;

    -- Transaction error handler: rollback and re-raise the error
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Start transaction
    START TRANSACTION;

    -- 1) Fetch current step for this approval row
    SELECT step INTO v_step
    FROM tbl_approval_process
    WHERE approval_id = p_approval_id
    LIMIT 1;

    -- 2) Determine last step number for the application's approval process
    SELECT MAX(step) INTO v_last_step
    FROM tbl_approval_process
    WHERE application_id = p_application_id;

    -- 3) Mark this approval row as approved and save comment/timestamp
    UPDATE tbl_approval_process
    SET status = 'Approved',
        comment = p_comment,
        timestamp = CURRENT_TIMESTAMP
    WHERE approval_id = p_approval_id;

    -- 4) If this is the final approval step, perform promotion
    IF v_step = v_last_step THEN

        -- Pull application's organization_id (if any) and org_version_id
        SELECT a.organization_id, a.org_version_id
        INTO v_existing_org_id, v_org_version_id
        FROM tbl_application a
        WHERE a.application_id = p_application_id
        LIMIT 1;

        -- Pull the version snapshot fields (the proposed org data) FIRST
        SELECT v.name, v.logo_path, v.description, v.base_program_id,
               v.membership_fee_type, v.membership_fee_amount, v.category,
               v.created_by, v.is_recruiting, v.is_open_to_all_courses
        INTO v_org_name, v_org_logo, v_org_description, v_base_program_id,
             v_fee_type, v_fee_amount, v_category,
             v_created_by, v_is_recruiting, v_is_open_to_all_courses
        FROM tbl_organization_version v
        WHERE v.org_version_id = v_org_version_id
        LIMIT 1;

        -- If caller provided p_organization_id and application has no org, use it
        IF v_existing_org_id IS NULL AND p_organization_id IS NOT NULL THEN
            -- Check if p_organization_id exists in tbl_organization
            IF NOT EXISTS (SELECT 1 FROM tbl_organization WHERE organization_id = p_organization_id) THEN
                -- Insert a minimal row to satisfy FK (adviser_id and name required, others can be NULL/default)
                INSERT INTO tbl_organization (
                    organization_id, adviser_id, name, status, created_at, current_org_version_id
                ) VALUES (
                    p_organization_id, v_created_by, v_org_name, 'Approved', CURRENT_TIMESTAMP, v_org_version_id
                );
            END IF;
            SET v_existing_org_id = p_organization_id;
        END IF;

        -- Ensure base program id variable has sensible value (may be NULL)
        SET v_base_program_id = COALESCE(v_base_program_id, NULL);

        -- Insert or update tbl_organization first to satisfy foreign key constraint for tbl_renewal_cycle
        IF v_existing_org_id IS NOT NULL THEN
            UPDATE tbl_organization
            SET name = v_org_name,
                logo = v_org_logo,
                description = v_org_description,
                base_program_id = v_base_program_id,
                membership_fee_type = v_fee_type,
                membership_fee_amount = v_fee_amount,
                category = v_category,
                adviser_id = v_created_by,
                status = 'Approved',
                is_recruiting = v_is_recruiting,
                is_open_to_all_courses = v_is_open_to_all_courses,
                current_org_version_id = v_org_version_id
            WHERE organization_id = v_existing_org_id;

            SET v_new_org_id = v_existing_org_id;

        ELSE
            -- New organization: insert and set organization_id on version row
            INSERT INTO tbl_organization (
                adviser_id,
                name,
                logo,
                description,
                base_program_id,
                membership_fee_type,
                membership_fee_amount,
                category,
                status,
                is_recruiting,
                is_open_to_all_courses,
                created_at,
                current_org_version_id
            ) VALUES (
                v_created_by,
                v_org_name,
                v_org_logo,
                v_org_description,
                v_base_program_id,
                v_fee_type,
                v_fee_amount,
                v_category,
                'Approved',
                v_is_recruiting,
                v_is_open_to_all_courses,
                CURRENT_TIMESTAMP,
                v_org_version_id
            );

            SET v_new_org_id = LAST_INSERT_ID();

            -- update the organization_version to point to the new org (organization_id exists on version table)
            UPDATE tbl_organization_version
            SET organization_id = v_new_org_id
            WHERE org_version_id = v_org_version_id;
        END IF;

        -- Defensive check: organization_id must exist before renewal cycle insert
        IF v_new_org_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization ID is NULL before renewal cycle insert.';
        END IF;

        -- Now ensure tbl_renewal_cycle row exists for this organization and cycle_number 1
        IF NOT EXISTS (
            SELECT 1 FROM tbl_renewal_cycle
            WHERE organization_id = v_new_org_id AND cycle_number = 1
        ) THEN
            INSERT INTO tbl_renewal_cycle (
                organization_id,
                cycle_number,
                start_date,
                president_id,
                org_version_id,
                created_at
            ) VALUES (
                v_new_org_id,
                1,
                CURRENT_DATE,
                v_created_by,
                v_org_version_id,
                CURRENT_TIMESTAMP
            );
        ELSE
            -- update fields that exist (no updated_at column per schema)
            UPDATE tbl_renewal_cycle
                SET org_version_id = v_org_version_id,
                    president_id = v_created_by
                WHERE organization_id = v_new_org_id AND cycle_number = 1;
        END IF;

        -- Promote proposed executives from application to organization members.
        -- Nested block for cursor declarations to avoid scope problems.
        BEGIN
            -- Declarations must come before any statements in this block
            DECLARE done INT DEFAULT FALSE;
            DECLARE exec_email VARCHAR(255);
            DECLARE exec_user_id VARCHAR(255);
            DECLARE exec_cycle_number INT;
            DECLARE exec_title VARCHAR(100);
            DECLARE exec_name VARCHAR(255);
            DECLARE v_student_role_id INT;
            DECLARE v_rank_id INT;
            DECLARE v_executive_role_id INT;
            DECLARE v_fname VARCHAR(100);
            DECLARE v_lname VARCHAR(100);
            DECLARE v_new_uuid VARCHAR(36);
            DECLARE exec_cursor CURSOR FOR
                SELECT ae.proposed_email, COALESCE(a.cycle_number, 1), ae.proposed_title, ae.proposed_name
                FROM tbl_application_executives ae
                JOIN tbl_application a ON ae.application_id = a.application_id
                WHERE ae.application_id = p_application_id;
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            -- Use scalar subquery for student role id (won't trigger NOT FOUND)
            SET v_student_role_id = (
                SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'student' LIMIT 1
            );
            IF v_student_role_id IS NULL THEN
                SET v_student_role_id = (
                    SELECT role_id FROM tbl_role LIMIT 1
                );
            END IF;

            OPEN exec_cursor;
            exec_loop: LOOP
                FETCH exec_cursor INTO exec_email, exec_cycle_number, exec_title, exec_name;
                IF done THEN
                    LEAVE exec_loop;
                END IF;

                -- normalize exec_email and ensure uniqueness if empty
                IF exec_email IS NULL OR TRIM(exec_email) = '' THEN
                    SET exec_email = CONCAT('pending+', REPLACE(UUID(), '-', ''), '@pending.local');
                END IF;

                -- Try to find an existing user by email using scalar subquery (returns NULL if not found)
                SET exec_user_id = (SELECT user_id FROM tbl_user WHERE email = exec_email LIMIT 1);

                -- If no user found, create a new pending user (generate UUID per insert)
                IF exec_user_id IS NULL THEN
                    SET v_new_uuid = REPLACE(UUID(), '-', '');

                    -- parse provided name into f_name / l_name (exec_name may be NULL)
                    IF exec_name IS NULL OR TRIM(exec_name) = '' THEN
                        SET v_fname = NULL;
                        SET v_lname = NULL;
                    ELSE
                        SET v_fname = SUBSTRING_INDEX(TRIM(exec_name), ' ', 1);
                        SET v_lname = TRIM(SUBSTRING(TRIM(exec_name), CHAR_LENGTH(v_fname) + 2));
                        IF v_lname = '' THEN
                            SET v_lname = NULL;
                        END IF;
                    END IF;

                    INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, status, created_at)
                    VALUES (v_new_uuid, v_fname, v_lname, exec_email, v_base_program_id, v_student_role_id, 'Pending', CURRENT_TIMESTAMP);

                    SET exec_user_id = v_new_uuid;
                END IF;

                -- Find rank_id by exec_title (fallback to first rank if not found) using scalar subquery
                SET v_rank_id = (SELECT rank_id FROM tbl_executive_rank WHERE default_title = exec_title LIMIT 1);
                IF v_rank_id IS NULL THEN
                    SET v_rank_id = (SELECT rank_id FROM tbl_executive_rank LIMIT 1);
                END IF;

                -- Find or insert executive_role row (use scalar subquery to fetch existing id)
                SET v_executive_role_id = (
                    SELECT executive_role_id FROM tbl_executive_role
                    WHERE organization_id = v_new_org_id
                      AND cycle_number = exec_cycle_number
                      AND role_title = exec_title
                      AND rank_id = v_rank_id
                    LIMIT 1
                );

                IF v_executive_role_id IS NULL THEN
                    INSERT INTO tbl_executive_role (
                        organization_id,
                        cycle_number,
                        role_title,
                        rank_id,
                        created_at
                    ) VALUES (
                        v_new_org_id,
                        exec_cycle_number,
                        exec_title,
                        v_rank_id,
                        CURRENT_TIMESTAMP
                    );
                    SET v_executive_role_id = LAST_INSERT_ID();
                END IF;

                -- Insert into organization_members (avoid duplicates)
                IF NOT EXISTS (
                    SELECT 1 FROM tbl_organization_members
                    WHERE organization_id = v_new_org_id
                      AND cycle_number = exec_cycle_number
                      AND user_id = exec_user_id
                ) THEN
                    INSERT INTO tbl_organization_members (
                        organization_id,
                        cycle_number,
                        user_id,
                        member_type,
                        executive_role_id,
                        status,
                        joined_at,
                        org_version_id
                    ) VALUES (
                        v_new_org_id,
                        exec_cycle_number,
                        exec_user_id,
                        'Executive',
                        v_executive_role_id,
                        'Active',
                        CURRENT_TIMESTAMP,
                        v_org_version_id
                    );
                END IF;

            END LOOP exec_loop;
            CLOSE exec_cursor;
        END;

        -- Mark requirement submissions as approved for this application (optional)
        UPDATE tbl_organization_requirement_submission s
        SET s.status = 'Approved'
        WHERE s.application_id = p_application_id;

        -- Update application: set approved status and ensure organization_id is set
        UPDATE tbl_application
        SET status = 'Approved',
            organization_id = v_new_org_id
        WHERE application_id = p_application_id;
    END IF; -- end final-step branch

    -- Commit transaction
    COMMIT;

    -- Return a JSON result combining approval info and organization (if final step)
    SELECT JSON_OBJECT(
        'application', JSON_OBJECT(
            'id', ap.approval_id,
            'step', ap.step,
            'role_name', r.role_name,
            'status', ap.status,
            'email', u.email,
            'f_name', u.f_name,
            'l_name', u.l_name,
            'user_id', u.user_id,
            'comment', ap.comment,
            'timestamp', ap.timestamp
        ),
        'organization',
            CASE WHEN ap.step = v_last_step THEN
                JSON_OBJECT(
                    'id', v_new_org_id,
                    'name', v_org_name,
                    'logo', v_org_logo,
                    'description', v_org_description,
                    'base_program_id', v_base_program_id,
                    'membership_fee_type', v_fee_type,
                    'membership_fee_amount', v_fee_amount,
                    'category', v_category,
                    'adviser_id', v_created_by,
                    'status', 'Approved',
                    'is_recruiting', v_is_recruiting,
                    'is_open_to_all_courses', v_is_open_to_all_courses
                )
            ELSE NULL END,
        'other', JSON_OBJECT(
            'last_step', v_last_step,
            'org_version_id', v_org_version_id,
            'organization_logo', v_org_logo
        )
    ) AS result
    FROM tbl_approval_process ap
    JOIN tbl_role r ON ap.approval_role_id = r.role_id
    LEFT JOIN tbl_user u ON ap.approver_id = u.user_id
    WHERE ap.approval_id = p_approval_id
    LIMIT 1;
END $$
DELIMITER ;



DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectApplication(
    IN p_application_id INT,
    IN p_approval_id INT,
    IN p_comment TEXT
)
BEGIN
    START TRANSACTION;

    UPDATE tbl_approval_process
    SET status = 'Rejected',
        comment = p_comment,
        timestamp = CURRENT_TIMESTAMP
    WHERE approval_id = p_approval_id;

    UPDATE tbl_application
    SET status = 'rejected',
        updated_at = CURRENT_TIMESTAMP
    WHERE application_id = p_application_id;

    COMMIT;

    -- -- NEW: notify stakeholders
    -- CALL NotifyApplicationApprovalChange(p_approval_id, p_application_id);

    SELECT 
        ap.approval_id as id,
        ap.step,
        r.role_name,
        ap.status,
        u.email,
        u.f_name,
        u.l_name,
        u.user_id,
        ap.comment,
        ap.timestamp
    FROM tbl_approval_process ap
    JOIN tbl_role r ON ap.approval_role_id = r.role_id
    LEFT JOIN tbl_user u ON ap.approver_id = u.user_id
    WHERE ap.approval_id = p_approval_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetUpdateApplication(
    IN p_application_id INT
)
BEGIN
    SELECT 
        org.organization_id,
        org.name AS organization_name,
        org.logo AS organization_logo,
        org.status AS organization_status,
        org.category,
        org.base_program_id,
        p.name AS program_name,
        org.membership_fee_type,
        org.membership_fee_amount,
        org.is_recruiting,
        org.is_open_to_all_courses,
        org.created_at AS organization_created,
        app.application_id as id,
        app.cycle_number,
        app.application_type,
        app.period_id,
        app.applicant_user_id,
        app.status AS application_status,
        app.created_at AS application_created,
        app.updated_at AS application_updated
    FROM tbl_organization org
    INNER JOIN tbl_application app 
        ON org.organization_id = app.organization_id
    LEFT JOIN tbl_program p
        ON org.base_program_id = p.program_id
    WHERE app.status = 'Approved' AND app.application_id = p_application_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApprovePaidEventRegistration(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_approver_id VARCHAR(200),
    IN p_remarks VARCHAR(255) -- optional, can be NULL
)
BEGIN
    DECLARE v_attendance_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_final_remarks VARCHAR(255);

    -- Set remarks to 'No Remarks' if NULL or empty
    IF p_remarks IS NULL OR LENGTH(TRIM(p_remarks)) = 0 THEN
        SET v_final_remarks = 'No Remarks';
    ELSE
        SET v_final_remarks = p_remarks;
    END IF;

    -- Find the attendance record
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND user_id = p_user_id
    LIMIT 1;

    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No registration found for this event and user';
    END IF;

    -- Get transaction ID if exists
    SELECT te.transaction_id INTO v_transaction_id
    FROM tbl_transaction_event te
    JOIN tbl_transaction t ON te.transaction_id = t.transaction_id
    WHERE te.event_id = p_event_id AND t.user_id = p_user_id
    LIMIT 1;

    -- Update attendance status
    UPDATE tbl_event_attendance
    SET status = 'Registered'
    WHERE attendance_id = v_attendance_id;

    -- Update transaction status and remarks if exists
    IF v_transaction_id IS NOT NULL THEN
        UPDATE tbl_transaction
        SET status = 'Completed'
        WHERE transaction_id = v_transaction_id;

        UPDATE tbl_transaction_event
        SET remarks = CONCAT('Approved: ', v_final_remarks)
        WHERE transaction_id = v_transaction_id;
    END IF;

    -- Log the approval
    INSERT INTO tbl_logs (user_id, action_type, redirect_url, type)
    VALUES (
        p_approver_id, 
        CONCAT('Approved registration for event ', p_event_id), 
        CONCAT('/event-attendance/', p_event_id), 
        'Attendance Approval'
    );

    SELECT 'Attendance approved successfully' AS message;
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectPaidEventRegistration(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_approver_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_attendance_id INT;
    DECLARE v_transaction_id INT;

    -- Find the attendance record
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND user_id = p_user_id AND deleted_at IS NULL
    LIMIT 1;

    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No registration found for this event and user';
    END IF;

    -- Get transaction ID if exists
    SELECT te.transaction_id INTO v_transaction_id
    FROM tbl_transaction_event te
    JOIN tbl_transaction t ON te.transaction_id = t.transaction_id
    WHERE te.event_id = p_event_id AND t.user_id = p_user_id
    LIMIT 1;

    -- Soft-delete attendance using deleted_at
    UPDATE tbl_event_attendance
    SET deleted_at = NOW(), status = 'Rejected'
    WHERE attendance_id = v_attendance_id;

    -- Update transaction status and remarks if exists
    IF v_transaction_id IS NOT NULL THEN
        UPDATE tbl_transaction
        SET status = 'Failed'
        WHERE transaction_id = v_transaction_id;

        UPDATE tbl_transaction_event
        SET remarks = CONCAT('Rejected: ', p_reason)
        WHERE transaction_id = v_transaction_id;
    END IF;

    -- Log the rejection
    INSERT INTO tbl_logs (user_id, action_type, meta_data, type)
    VALUES (
        p_approver_id, 
        CONCAT('Rejected registration for event ', p_event_id), 
        JSON_OBJECT('user_id', p_user_id, 'reason', p_reason),
        'Attendance Rejection'
    );

    SELECT 'Attendance rejected and soft-deleted successfully' AS message;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationApplications()
BEGIN

    SELECT
        app.application_id as id,
        app.org_version_id,
        ov.name AS organization_name,
        ov.logo_path AS organization_logo,
        ov.description AS organization_description,
        ov.category,
        ov.base_program_id,
        p.name AS program_name,
        ov.membership_fee_type,
        ov.membership_fee_amount,
        ov.is_recruiting,
        ov.is_open_to_all_courses,
        ov.created_at AS organization_created,
        app.submitted_org_name,
        app.submitted_org_logo,
        app.application_type,
        app.period_id,
        app.applicant_user_id,
        app.status AS application_status,
        app.created_at AS application_created,
        app.updated_at AS application_updated
    FROM tbl_application app
    INNER JOIN tbl_organization_version ov ON app.org_version_id = ov.org_version_id
    LEFT JOIN tbl_program p ON ov.base_program_id = p.program_id
    WHERE app.status = 'Pending' OR app.status = 'Rejected'
    ORDER BY 
        CASE app.status 
            WHEN 'Pending' THEN 1 
            WHEN 'Rejected' THEN 2 
            ELSE 3 
        END,
        ov.created_at DESC, 
        app.created_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventStatistics(IN p_event_id INT)
BEGIN
    -- Number of attendees (status = 'Attended')
    SELECT COUNT(*) INTO @attendees_count
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND (status = 'Attended' OR status = 'Evaluated');
    
    -- Number of feedbacks (status = 'Evaluated' or has evaluation)
    SELECT COUNT(DISTINCT ea.user_id) INTO @feedback_count
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_evaluation e ON ea.user_id = e.user_id AND ea.event_id = e.event_id
    WHERE ea.event_id = p_event_id 
    AND (ea.status = 'Evaluated' OR e.evaluation_id IS NOT NULL);
    
    -- Average rating (average of all likert_4 responses)
    SELECT AVG(CAST(response_value AS DECIMAL)) INTO @avg_rating
    FROM tbl_evaluation_response er
    JOIN tbl_evaluation e ON er.evaluation_id = e.evaluation_id
    JOIN tbl_evaluation_question eq ON er.question_id = eq.question_id
    WHERE e.event_id = p_event_id AND eq.question_type = 'likert_4';
    
    -- Average feedback time in seconds
    SELECT AVG(duration_seconds) INTO @avg_feedback_time
    FROM tbl_evaluation
    WHERE event_id = p_event_id;
    
    -- Return all statistics
    SELECT 
        @attendees_count AS attendeesCount,
        @feedback_count AS feedbackCount,
        ROUND(COALESCE(@avg_rating, 0), 2) AS averageRating,
        CONCAT(FLOOR(COALESCE(@avg_feedback_time, 0) / 60), 'm ', 
               MOD(COALESCE(@avg_feedback_time, 0), 60), 's') AS avgFeedbackTime;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventStatsForComponent(IN p_event_id INT)
BEGIN
    DECLARE v_attendees_count INT;
    DECLARE v_feedback_count INT;
    DECLARE v_avg_rating DECIMAL(10,2);
    DECLARE v_avg_feedback_time VARCHAR(20);
    
    -- Get statistics
    CALL GetEventStatistics(p_event_id);
    
    -- Format the results for React component
    SELECT 
        attendeesCount,
        feedbackCount,
        averageRating,
        avgFeedbackTime
    FROM (
        SELECT 
            @attendees_count AS attendeesCount,
            @feedback_count AS feedbackCount,
            ROUND(COALESCE(@avg_rating, 0), 2) AS averageRating,
            CASE 
                WHEN @avg_feedback_time IS NULL THEN '0s'
                WHEN @avg_feedback_time < 60 THEN CONCAT(@avg_feedback_time, 's')
                ELSE CONCAT(FLOOR(@avg_feedback_time / 60), 'm ', MOD(@avg_feedback_time, 60), 's')
            END AS avgFeedbackTime
    ) AS stats;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllEvaluationQuestions()
BEGIN
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'group_id', g.group_id,
            'group_title', g.group_title,
            'group_description', g.group_description,
            'questions', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'question_id', q.question_id,
                        'question_text', q.question_text,
                        'question_type', q.question_type,
                        'is_required', q.is_required
                    )
                )
                FROM tbl_evaluation_question q
                WHERE q.group_id = g.group_id
            )
        )
    ) AS evaluation_form
    FROM tbl_evaluation_question_group g
    WHERE g.is_active = TRUE;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventEvaluationResponses(
    IN p_event_id INT
)
BEGIN
    -- Get all evaluation responses for the specified event
    SELECT 
        u.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS attendee_name,
        qg.group_title,
        q.question_id,
        q.question_text,
        q.question_type,
        r.response_value,
        r.created_at AS response_time,
        e.submitted_at AS evaluation_submission_time
    FROM 
        tbl_evaluation e
    JOIN 
        tbl_user u ON e.user_id = u.user_id
    JOIN 
        tbl_evaluation_response r ON e.evaluation_id = r.evaluation_id
    JOIN 
        tbl_evaluation_question q ON r.question_id = q.question_id
    JOIN 
        tbl_evaluation_question_group qg ON q.group_id = qg.group_id
    WHERE 
        e.event_id = p_event_id
    ORDER BY 
        u.l_name, u.f_name, qg.group_id, q.question_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetLogs(
    IN p_user_id VARCHAR(200),
    IN p_type VARCHAR(100),
    IN p_start_date DATETIME,
    IN p_end_date DATETIME
)
BEGIN
    SELECT 
        l.log_id,
        l.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.profile_picture,
        l.timestamp,
        l.action_type AS action,       -- updated column name
        l.redirect_url,
        l.file_path,
        l.meta_data,
        l.type
    FROM tbl_logs l
    LEFT JOIN tbl_user u ON l.user_id = u.user_id
    WHERE
        (p_user_id IS NULL OR l.user_id = p_user_id)
        AND (p_type IS NULL OR l.type = p_type)
        AND (p_start_date IS NULL OR l.timestamp >= p_start_date)
        AND (p_end_date IS NULL OR l.timestamp <= p_end_date)
    ORDER BY l.timestamp DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckOrganizationName(
    IN p_organization_name VARCHAR(100)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;

    -- Check if organization name exists
    SELECT COUNT(*) INTO v_exists
    FROM tbl_organization
    WHERE name = p_organization_name;

    IF v_exists > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization name already exists. Please choose a different name.';
    END IF;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationByRole(
    IN p_role VARCHAR(100),
    IN p_status VARCHAR(20) -- 'Approved', 'Archived', or NULL for all
)
BEGIN
    SELECT 
        o.organization_id as id,
        o.name AS organization_name,
        o.logo AS organization_logo,
        o.status AS organization_status,
        o.current_org_version_id,
        MAX(c.cycle_number) AS cycle_number,
        o.category,
        p.name AS program_name,
        o.created_at
    FROM tbl_organization o
    LEFT JOIN tbl_program p ON o.base_program_id = p.program_id
    LEFT JOIN tbl_renewal_cycle c ON o.organization_id = c.organization_id
    WHERE (p_status IS NULL OR o.status = p_status)
    GROUP BY o.organization_id
    ORDER BY o.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationByName(
    IN p_organization_name VARCHAR(100)
)
BEGIN
    SELECT 
        o.organization_id AS id,
        o.name AS organization_name,
        o.logo AS organization_logo,
        o.status AS organization_status,
        MAX(c.cycle_number) AS cycle_number,
        o.category,
        p.name AS program_name,
        o.created_at
    FROM tbl_organization o
    LEFT JOIN tbl_program p ON o.base_program_id = p.program_id
    LEFT JOIN tbl_renewal_cycle c ON o.organization_id = c.organization_id
    WHERE o.name = p_organization_name
      AND o.status = 'Approved'
      GROUP BY o.organization_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationUsers(IN p_org_name VARCHAR(255))
BEGIN
SELECT DISTINCT
    u.user_id,
    u.email,
    u.f_name,
    u.l_name,
    p.name AS program_name,
    COALESCE(er.role_title, 'Member') as role,

    (om.member_type = 'Executive') AS is_executive,

    EXISTS (
        SELECT 1
        FROM tbl_committee_members cm
        JOIN tbl_committee c ON cm.committee_id = c.committee_id
        WHERE cm.user_id = u.user_id
          AND c.organization_id = o.organization_id
          AND c.cycle_number = om.cycle_number
    ) AS is_committee
FROM tbl_user u
JOIN tbl_organization_members om ON u.user_id = om.user_id
JOIN tbl_organization o ON om.organization_id = o.organization_id
LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
LEFT JOIN tbl_program p ON u.program_id = p.program_id
WHERE o.name = p_org_name
  AND om.status = 'Active'
ORDER BY u.f_name, u.l_name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSingleOrganizationUser(
    IN p_member_id INT
)
BEGIN
    SELECT DISTINCT
    u.user_id,
    u.email,
    u.f_name,
    u.l_name,
    p.name AS program_name,
    COALESCE(er.role_title, 'Member') as role,
    -- Is Executive Member
    (om.member_type = 'Executive') AS is_executive,
    -- Is Committee Member
    EXISTS (
        SELECT 1
        FROM tbl_committee_members cm
        JOIN tbl_committee c ON cm.committee_id = c.committee_id
        WHERE cm.user_id = u.user_id
          AND c.organization_id = o.organization_id
          AND c.cycle_number = om.cycle_number
    ) AS is_committee
FROM tbl_user u
JOIN tbl_organization_members om ON u.user_id = om.user_id
JOIN tbl_organization o ON om.organization_id = o.organization_id
LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
LEFT JOIN tbl_program p ON u.program_id = p.program_id
WHERE om.member_id = p_member_id;
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllUsers()
BEGIN
    SELECT DISTINCT
        u.user_id,
        u.email,
        u.f_name,
        u.l_name,
        p.name as program_name,
        COALESCE(er.role_title, om.member_type) as role,
        o.name as org_name
    FROM tbl_user u
    LEFT JOIN tbl_organization_members om ON u.user_id = om.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_organization o ON om.organization_id = o.organization_id
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    WHERE u.status = 'Active' AND u.role_id = 1
    ORDER BY u.f_name, u.l_name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSingleUser(
    IN p_member_id INT
)
BEGIN
     SELECT DISTINCT
        u.user_id,
        u.email,
        u.f_name,
        u.l_name,
        p.name as program_name,
        COALESCE(er.role_title, om.member_type) as role,
        o.name as org_name
    FROM tbl_user u
    LEFT JOIN tbl_organization_members om ON u.user_id = om.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_organization o ON om.organization_id = o.organization_id
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    WHERE u.status = 'Active' 
    AND u.role_id = 1
    AND om.member_id = p_member_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationByProgram(
    IN p_program_id INT
)
BEGIN
    SELECT 
        o.organization_id AS id,
        o.name AS organization_name,
        o.logo AS organization_logo,
        o.status AS organization_status,
        o.category,
        p.name AS program_name,
        o.created_at
    FROM tbl_organization o
    LEFT JOIN tbl_program p ON o.base_program_id = p.program_id
    WHERE p.program_id = p_program_id
      AND o.status = 'Approved';
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckOrganizationEmails(
    IN p_emails JSON
)
BEGIN
    -- Returns { unavailable: [email1, email2, ...] }
    -- unavailable if: not student role OR is executive in any org

    DECLARE v_unavailable_emails JSON;

    -- Create a temporary table to hold the emails
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_emails (
        email VARCHAR(255) NOT NULL,
        PRIMARY KEY (email)  -- Ensures uniqueness
    );

    -- Insert from first condition: non-student roles
    INSERT IGNORE INTO temp_emails (email)
    SELECT u.email
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    WHERE 
        JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
        AND LOWER(r.role_name) != 'student';

    -- Insert from second condition: executives
    INSERT IGNORE INTO temp_emails (email)
    SELECT u.email
    FROM tbl_user u
    JOIN tbl_organization_members om ON u.user_id = om.user_id
    WHERE 
        JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
        AND om.member_type = 'Executive';

    -- Aggregate distinct emails
    SELECT COALESCE(JSON_ARRAYAGG(email), JSON_ARRAY())
    INTO v_unavailable_emails
    FROM temp_emails;

    -- Cleanup temporary table
    DROP TEMPORARY TABLE IF EXISTS temp_emails;

    SELECT JSON_OBJECT('unavailable', v_unavailable_emails) AS result;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllEventCertificates(IN
    p_user_id VARCHAR(200))
BEGIN
    SELECT 
        ec.*,
        e.title AS event_title,
        e.certificate AS certificate_type
    FROM tbl_event_certificate ec
    JOIN tbl_event e ON ec.event_id = e.event_id
    WHERE ec.user_id = p_user_id
    ORDER BY ec.issued_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationDetails(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    -- Get the cycle_number for the given org_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT JSON_OBJECT(
        'organization_detail', JSON_OBJECT(
            'id', o.organization_id,
            'org_name', o.name,
            'category', o.category,
            'logo', o.logo,
            'cycle_number', v_cycle_number,
            'description', o.description,
            'adviser', JSON_OBJECT(
                'first_name', adv.f_name,
                'last_name', adv.l_name,
                'email', adv.email
            )
        ),
        'committee_roles', (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'committee_name', c.name,
                'role_name', cr.role_name
            ))
            FROM tbl_committee_role cr
            JOIN tbl_committee c ON cr.committee_id = c.committee_id
            WHERE c.organization_id = p_org_id
                AND c.cycle_number = v_cycle_number
        )
    ) AS result
    FROM tbl_organization o
    JOIN tbl_user adv ON o.adviser_id = adv.user_id
    WHERE o.organization_id = p_org_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationMembers(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    -- Get the cycle_number for the given org_version_id
    DECLARE v_cycle_number INT;
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT 
        om.member_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        om.joined_at
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    WHERE om.organization_id = p_org_id
        AND om.cycle_number = v_cycle_number
        -- Only include Active members
        AND om.status = 'Active'
        -- Exclude Executive members
        AND om.member_type != 'Executive'
        -- Exclude Committee members
        AND NOT EXISTS (
            SELECT 1
            FROM tbl_committee_members cm
            JOIN tbl_committee c ON cm.committee_id = c.committee_id
            WHERE c.organization_id = p_org_id
                AND c.cycle_number = v_cycle_number
                AND cm.user_id = om.user_id
        );
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationOfficers(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    -- Get the cycle_number for the given org_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT 
        u.user_id id,
        u.f_name AS first_name,
        u.l_name AS last_name,
        u.email,
        er.role_title,
        p.name AS program_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE om.organization_id = p_org_id
        AND om.cycle_number = v_cycle_number
        AND om.member_type = 'Executive';
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationQuestion(
    IN p_org_id INT
)
BEGIN
    SELECT * FROM tbl_membership_question WHERE organization_id =p_org_id;
END$$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventApplicationDetails(
    IN p_event_application_id INT
)
BEGIN
    -- Get basic event application information
    SELECT 
        ea.event_application_id,
        ea.organization_id,
        o.name AS organization_name,
        o.adviser_id,
        CONCAT(adviser.f_name, ' ', adviser.l_name) AS adviser_name,
        ea.cycle_number,
        rc.start_date AS cycle_start_date,
        ea.proposed_event_id,
        e.title,
        e.description,
        e.venue_type,
        e.venue,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.status AS event_status,
        e.type,
        e.is_open_to,
        e.fee,
        e.capacity,
        e.created_at AS event_created_at,
        ea.applicant_user_id,
        CONCAT(applicant.f_name, ' ', applicant.l_name) AS applicant_name,
        applicant.email AS applicant_email,
        ea.status AS application_status,
        ea.created_at AS application_created_at,
        ea.updated_at AS application_updated_at
    FROM tbl_event_application ea
    JOIN tbl_organization o ON ea.organization_id = o.organization_id
    LEFT JOIN tbl_event e ON ea.proposed_event_id = e.event_id
    JOIN tbl_renewal_cycle rc ON ea.organization_id = rc.organization_id 
        AND ea.cycle_number = rc.cycle_number
    JOIN tbl_user applicant ON ea.applicant_user_id = applicant.user_id
    JOIN tbl_user adviser ON o.adviser_id = adviser.user_id
    WHERE ea.event_application_id = p_event_application_id;
    
    -- Get all submitted requirements for this application
    SELECT 
        ers.submission_id,
        ers.requirement_id,
        ear.requirement_name,
        ear.is_applicable_to,
        ers.file_path,
        ers.submitted_by,
        CONCAT(u.f_name, ' ', u.l_name) AS submitted_by_name,
        ers.submitted_at
    FROM tbl_event_requirement_submissions ers
    JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    JOIN tbl_user u ON ers.submitted_by = u.user_id
    WHERE ers.event_application_id = p_event_application_id
    ORDER BY ear.is_applicable_to, ear.requirement_name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventApprovalTimeline(
    IN p_event_application_id INT
)
BEGIN
    SELECT 
        eap.event_approval_id as id,
        eap.approver_id as user_id,
        u.f_name,
        u.l_name,
        u.email,
        r.role_name,
        eap.status,
        eap.comment,
        eap.step_number as step,
        eap.approved_at AS timestamp
    FROM tbl_event_approval_process eap
    JOIN tbl_user u ON eap.approver_id = u.user_id
    JOIN tbl_role r ON eap.approval_role_id = r.role_id
    WHERE eap.event_application_id = p_event_application_id
    ORDER BY eap.step_number;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateEventApplication(
    IN p_organization_id INT,
    IN p_cycle_number INT,
    IN p_applicant_user_id VARCHAR(200),
    IN p_event JSON,
    IN p_requirements JSON
)
BEGIN
    DECLARE v_event_application_id INT;
    DECLARE v_event_id INT;
    DECLARE i INT DEFAULT 0;
    DECLARE v_requirement_count INT;
    DECLARE v_req_id INT;
    DECLARE v_file_path VARCHAR(255);
    DECLARE v_error_msg VARCHAR(255);
    DECLARE v_president_id VARCHAR(200);
    DECLARE v_first_step INT;
    DECLARE v_organization_name VARCHAR(100);
    DECLARE v_cycle_number INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Always populate organization name (fixes NULL v_organization_name)
    SELECT name INTO v_organization_name
    FROM tbl_organization
    WHERE organization_id = p_organization_id;

    
        -- Get current president for the organization
        SELECT cycle_number INTO v_cycle_number
        FROM tbl_renewal_cycle
        WHERE organization_id = p_organization_id
        ORDER BY cycle_number DESC
        LIMIT 1;
        
    -- Create event record
    INSERT INTO tbl_event (
        organization_id,
        user_id,
        cycle_number,
        event_type,
        title,
        description,
        image,
        venue_type,
        venue,
        start_date,
        end_date,
        start_time,
        end_time,
        status,
        type,
        is_open_to,
        fee,
        capacity
    ) VALUES (
        p_organization_id,
        p_applicant_user_id,
        v_cycle_number,
        'Organization',
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.title')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.description')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.image')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.venue_type')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.venue')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.start_date')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.end_date')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.start_time')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.end_time')),
        'Pending',
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.type')),
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.is_open_to')),
        CASE
            WHEN JSON_EXTRACT(p_event, '$.fee') IS NULL 
                 OR JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.fee')) = 'null'
                THEN NULL
            ELSE CAST(JSON_EXTRACT(p_event, '$.fee') AS UNSIGNED)
        END,
        CASE
            WHEN JSON_EXTRACT(p_event, '$.capacity') IS NULL 
                 OR JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.capacity')) = 'null'
                THEN NULL
            ELSE CAST(JSON_EXTRACT(p_event, '$.capacity') AS UNSIGNED)
        END
    );

    SET v_event_id = LAST_INSERT_ID();

    -- Create event application record
    INSERT INTO tbl_event_application (
        organization_id,
        cycle_number,
        proposed_event_id,
        applicant_user_id,
        status
    ) VALUES (
        p_organization_id,
        p_cycle_number,
        v_event_id,
        p_applicant_user_id,
        'Pending'
    );

    SET v_event_application_id = LAST_INSERT_ID();

    -- Handle requirements
    SET v_requirement_count = JSON_LENGTH(p_requirements);
    SET i = 0;
    
    WHILE i < v_requirement_count DO
        BEGIN
            DECLARE v_requirement_exists TINYINT(1);
            
            SET v_req_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].requirement_id'))) AS UNSIGNED);
            SET v_file_path = JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].file_path')));
            
            -- Validate requirement exists
            SELECT EXISTS(
                SELECT 1 FROM tbl_event_application_requirement 
                WHERE requirement_id = v_req_id
            ) INTO v_requirement_exists;
            
            IF NOT v_requirement_exists THEN
                SET v_error_msg = CONCAT('Invalid requirement ID: ', v_req_id);
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_error_msg;
            END IF;
            
            -- Store requirement submission
            INSERT INTO tbl_event_requirement_submissions (
                event_id,
                event_application_id,
                requirement_id,
                cycle_number,
                organization_id,
                file_path,
                submitted_by
            ) VALUES (
                v_event_id,
                v_event_application_id,
                v_req_id,
                p_cycle_number,
                p_organization_id,
                v_file_path,
                p_applicant_user_id
            );

            SET i = i + 1;
        END;
    END WHILE;

    -- Initiate approval process
    CALL InitiateEventApprovalProcess(v_event_application_id);

    COMMIT;

    -- -- Create notification and log for new event proposal
    -- CALL NotifyNewEventProposal(
    --     v_event_id,
    --     v_event_application_id,
    --     JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.title')),
    --     p_organization_id,
    --     v_organization_name,
    --     p_applicant_user_id
    -- );

    -- Return success information
    SELECT 
        v_event_id AS event_id,
        v_event_application_id AS event_application_id,
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.title')) AS event_title,
        p_organization_id AS organization_id,
        v_organization_name AS organization_name,
        v_cycle_number AS cycle_number;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE InitiateEventApprovalProcess(IN p_event_application_id INT)
BEGIN
    -- Declare all variables first
    DECLARE v_org_id INT;
    DECLARE v_program_id INT;
    DECLARE v_adviser_id VARCHAR(200);
    DECLARE v_role_id INT;
    DECLARE v_hierarchy_order INT;
    DECLARE v_approver_id VARCHAR(200);
    DECLARE v_done BOOLEAN DEFAULT FALSE;
    DECLARE v_approvers_found INT DEFAULT 0;
    DECLARE v_adviser_role_id INT;

    -- Declare cursor and handler next
    DECLARE role_cursor CURSOR FOR
        SELECT r.role_id, r.hierarchy_order
        FROM tbl_role r
        WHERE r.is_approver = 1
        AND r.hierarchy_order IS NOT NULL
        AND r.hierarchy_order >= 1  -- Include all approver roles
        ORDER BY r.hierarchy_order;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;

    -- Get organization details
    SELECT 
        o.organization_id, 
        o.base_program_id, 
        o.adviser_id
    INTO 
        v_org_id, 
        v_program_id, 
        v_adviser_id
    FROM tbl_event_application ea
    JOIN tbl_organization o ON ea.organization_id = o.organization_id
    WHERE ea.event_application_id = p_event_application_id;

    -- Validate organization exists
    IF v_org_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization not found for this application';
    END IF;

    -- Validate adviser exists
    IF v_adviser_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization has no assigned adviser';
    END IF;

    -- Get adviser's role ID
    SELECT role_id INTO v_adviser_role_id 
    FROM tbl_user 
    WHERE user_id = v_adviser_id;

    OPEN role_cursor;

    -- Process each approval role in hierarchy order
    role_loop: LOOP
        FETCH role_cursor INTO v_role_id, v_hierarchy_order;
        IF v_done THEN
            LEAVE role_loop;
        END IF;

        -- Use nested block for approver lookup
        BEGIN
            DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_approver_id = NULL;
            
            SET v_approver_id = NULL;
            
            -- Find approver based on role type
            IF v_role_id = v_adviser_role_id THEN
                -- Use organization's adviser
                SET v_approver_id = v_adviser_id;
            ELSE
                -- Check if this is a Program Chair role
                IF EXISTS (
                    SELECT 1 FROM tbl_role 
                    WHERE role_id = v_role_id 
                    AND role_name = 'Program Chair'
                ) THEN
                    -- Find program chair for this organization's program
                    SELECT user_id INTO v_approver_id
                    FROM tbl_user
                    WHERE role_id = v_role_id
                    AND program_id = v_program_id
                    AND status = 'Active'
                    LIMIT 1;
                ELSE
                    -- For other roles (OSA Director, etc.)
                    SELECT user_id INTO v_approver_id
                    FROM tbl_user
                    WHERE role_id = v_role_id
                    AND status = 'Active'
                    LIMIT 1;
                END IF;
            END IF;
        END;

        -- Insert approval step if we found an approver
        IF v_approver_id IS NOT NULL THEN
            INSERT INTO tbl_event_approval_process (
                event_application_id,
                approver_id,
                approval_role_id,
                status,
                step_number
            ) VALUES (
                p_event_application_id,
                v_approver_id,
                v_role_id,
                'Pending',  -- All steps start as pending
                v_hierarchy_order
            );
            
            SET v_approvers_found = v_approvers_found + 1;
        END IF;
    END LOOP role_loop;

    CLOSE role_cursor;

    -- Validate we created at least one approval step
    IF v_approvers_found = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No valid approvers found for any approval steps';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveEventApplication(
    IN p_approval_id INT,
    IN p_comment TEXT,
    IN p_event_application_id INT,
    IN p_user_id VARCHAR(200))
BEGIN
    DECLARE v_step_number INT;
    DECLARE v_max_step INT;
    DECLARE v_event_id INT;
    DECLARE v_organization_id INT;
    DECLARE v_event_title VARCHAR(300);
    DECLARE v_end_date DATE;
    DECLARE v_end_time TIME;
    
    -- Update the approval status
    UPDATE tbl_event_approval_process
    SET 
        comment = p_comment,
        status = 'Approved',
        approved_at = CURRENT_TIMESTAMP
    WHERE event_approval_id = p_approval_id;
    
    -- Log the approval action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data
    ) VALUES (
        p_user_id,
        CONCAT('Approved event application step for application ID: ', p_event_application_id),
        'Event Approval',
        JSON_OBJECT(
            'approval_id', p_approval_id,
            'application_id', p_event_application_id,
            'comment', p_comment
        )
    );
    
    -- Get current step number
    SELECT step_number INTO v_step_number
    FROM tbl_event_approval_process
    WHERE event_approval_id = p_approval_id;
    
    -- Get the max step number for this application
    SELECT MAX(step_number) INTO v_max_step
    FROM tbl_event_approval_process
    WHERE event_application_id = p_event_application_id;
    
    -- Check if this is the final approval
    IF v_step_number = v_max_step THEN
        -- Get the proposed event ID and organization ID
        SELECT e.proposed_event_id, e.organization_id, ev.title, ev.end_date, ev.end_time
        INTO v_event_id, v_organization_id, v_event_title, v_end_date, v_end_time
        FROM tbl_event_application e
        LEFT JOIN tbl_event ev ON e.proposed_event_id = ev.event_id
        WHERE e.event_application_id = p_event_application_id;
        
        -- Update event application status
        UPDATE tbl_event_application
        SET status = 'Approved',
            updated_at = CURRENT_TIMESTAMP
        WHERE event_application_id = p_event_application_id;
        
        -- Update the event status if it exists
        IF v_event_id IS NOT NULL THEN
            UPDATE tbl_event
            SET status = 'Approved'
            WHERE event_id = v_event_id;
            
            -- Create evaluation settings with default configuration
            INSERT INTO tbl_event_evaluation_settings (
                event_id,
                start_date,
                start_time,
                is_active
            ) VALUES (
                v_event_id,
                v_end_date,
                v_end_time,
                TRUE
            );
            
            -- Add default evaluation configuration (group 1 - Activity questions)
            INSERT INTO tbl_event_evaluation_config (event_id, group_id)
            VALUES (v_event_id, 1);
            
            -- Log evaluation setup
            INSERT INTO tbl_logs (
                user_id,
                action,
                type,
                meta_data
            ) VALUES (
                p_user_id,
                CONCAT('Added default evaluation configuration for event: ', v_event_title),
                'Event Evaluation Setup',
                JSON_OBJECT(
                    'event_id', v_event_id,
                    'default_group_id', 1
                )
            );
        END IF;
        
        -- Log final approval
        INSERT INTO tbl_logs (
            user_id,
            action,
            type,
            meta_data
        ) VALUES (
            p_user_id,
            CONCAT('Fully approved event application for: ', IFNULL(v_event_title, 'Untitled Event')),
            'Event Final Approval',
            JSON_OBJECT(
                'application_id', p_event_application_id,
                'event_id', IFNULL(v_event_id, 'NULL'),
                'organization_id', v_organization_id
            )
        );
    END IF;

    SELECT 
        eap.event_approval_id as id,
        eap.approver_id as user_id,
        u.f_name,
        u.l_name,
        u.email,
        r.role_name,
        eap.status,
        eap.comment,
        eap.step_number as step,
        eap.approved_at AS timestamp
    FROM tbl_event_approval_process eap
    JOIN tbl_user u ON eap.approver_id = u.user_id
    JOIN tbl_role r ON eap.approval_role_id = r.role_id
    WHERE eap.event_application_id = p_event_application_id
    AND u.user_id = p_user_id
    ORDER BY eap.step_number;
END$$
DELIMITER ;

    DELIMITER $$
    CREATE DEFINER='admin'@'%' PROCEDURE RejectEventApplication(
        IN p_approval_id INT,
        IN p_event_application_id INT,
        IN p_comment TEXT,
        IN p_user_id VARCHAR(200)  -- Added user_id parameter for logging
    )
    BEGIN
        DECLARE v_event_id INT;
        DECLARE v_event_title VARCHAR(300);
        
        START TRANSACTION;
        
        -- Update the approval status
        UPDATE tbl_event_approval_process
        SET 
            status = 'Rejected',
            comment = p_comment,
            approved_at = CURRENT_TIMESTAMP
        WHERE event_approval_id = p_approval_id;
        
        -- Get the proposed event ID and title
        SELECT e.proposed_event_id, ev.title INTO v_event_id, v_event_title
        FROM tbl_event_application e
        LEFT JOIN tbl_event ev ON e.proposed_event_id = ev.event_id
        WHERE e.event_application_id = p_event_application_id;
        
        -- Update event application status
        UPDATE tbl_event_application
        SET status = 'Rejected',
            updated_at = CURRENT_TIMESTAMP
        WHERE event_application_id = p_event_application_id;
        
        -- Update the event status if it exists
        IF v_event_id IS NOT NULL THEN
            UPDATE tbl_event
            SET status = 'Rejected'
            WHERE event_id = v_event_id;
        END IF;
        
        -- Log the rejection
        INSERT INTO tbl_logs (
            user_id,
            action,
            type,
            meta_data
        ) VALUES (
            p_user_id,
            CONCAT('Rejected event application for: ', IFNULL(v_event_title, 'Untitled Event')),
            'Event Rejection',
            JSON_OBJECT(
                'approval_id', p_approval_id,
                'application_id', p_event_application_id,
                'event_id', IFNULL(v_event_id, 'NULL'),
                'comment', p_comment
            )
        );
        COMMIT;
        SELECT 
            eap.event_approval_id as id,
            eap.approver_id as user_id,
            u.f_name,
            u.l_name,
            u.email,
            r.role_name,
            eap.status,
            eap.comment,
            eap.step_number as step,
            eap.approved_at AS timestamp
        FROM tbl_event_approval_process eap
        JOIN tbl_user u ON eap.approver_id = u.user_id
        JOIN tbl_role r ON eap.approval_role_id = r.role_id
        WHERE eap.event_application_id = p_event_application_id
        AND u.user_id = p_user_id
        ORDER BY eap.step_number;
    END$$
    DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventEvaluationFeedbackPeriod(IN p_event_id INT)
BEGIN
    SELECT 
    event_id as id,
    start_date,
    start_time,
    end_date,
    end_time,
    is_active
    FROM tbl_event_evaluation_settings
    WHERE event_id = p_event_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventEvaluationConfig(IN p_event_id INT)
BEGIN
    -- Get evaluation settings
    SELECT
        es.event_id,
        e.title,
        es.start_date AS evaluation_start_date,
        es.end_date AS evaluation_end_date,
        es.start_time AS evaluation_start_time,
        es.end_time AS evaluation_end_time,
        es.is_active
    FROM tbl_event_evaluation_settings es
    JOIN tbl_event e ON es.event_id = e.event_id
    WHERE es.event_id = p_event_id;
    
    -- Get enabled question groups for this event
    SELECT 
        g.group_id,
        g.group_title,
        g.group_description
    FROM tbl_event_evaluation_config ec
    JOIN tbl_evaluation_question_group g ON ec.group_id = g.group_id
    WHERE ec.event_id = p_event_id
    AND g.is_active = TRUE;
    
    -- Get all available question groups (for adding to configuration)
    SELECT 
        group_id,
        group_title,
        group_description
    FROM tbl_evaluation_question_group
    WHERE is_active = TRUE;

    SELECT template_path
    FROM tbl_certificate_template
    WHERE event_id = p_event_id
    LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateEventEvaluationConfig(
    IN p_event_id INT,
    IN p_group_ids JSON,
    IN p_evaluation_end_date DATE,
    IN p_evaluation_end_time TIME,
    IN p_user_id VARCHAR(200))
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE group_count INT;
    DECLARE current_group_id INT;
    
    -- First, clear existing configuration for this event
    DELETE FROM tbl_event_evaluation_config WHERE event_id = p_event_id;
    
    -- Get the count of groups to add
    SET group_count = JSON_LENGTH(p_group_ids);
    
    -- Add each group in the JSON array
    WHILE i < group_count DO
        SET current_group_id = JSON_EXTRACT(p_group_ids, CONCAT('$[', i, ']'));
        
        INSERT INTO tbl_event_evaluation_config (event_id, group_id)
        VALUES (p_event_id, current_group_id);
        
        SET i = i + 1;
    END WHILE;
    
    -- Update evaluation end date/time if provided
    IF p_evaluation_end_date IS NOT NULL AND p_evaluation_end_time IS NOT NULL THEN
        UPDATE tbl_event_evaluation_settings
        SET end_date = p_evaluation_end_date,
            end_time = p_evaluation_end_time
        WHERE event_id = p_event_id;
    END IF;
    
    -- Log the configuration update
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data
    ) VALUES (
        p_user_id,
        CONCAT('Updated evaluation configuration for event ID: ', p_event_id),
        'Event Evaluation Config',
        JSON_OBJECT(
            'event_id', p_event_id,
            'group_ids', p_group_ids,
            'evaluation_end_date', IFNULL(p_evaluation_end_date, 'NULL'),
            'evaluation_end_time', IFNULL(p_evaluation_end_time, 'NULL')
        )
    );
END$$
DELIMITER ;

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
    -- All DECLAREs must be here, before any other statement!
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
        -- Update the existing submission
        UPDATE tbl_event_requirement_submissions
        SET file_path = p_file_path,
            submitted_at = CURRENT_TIMESTAMP
        WHERE submission_id = v_submission_id;
    ELSE
        -- Insert a new submission
        INSERT INTO tbl_event_requirement_submissions (
            event_id,
            event_application_id,
            requirement_id,
            cycle_number,
            organization_id,
            file_path,
            submitted_by
        ) VALUES (
            p_event_id,
            v_event_application_id,
            p_requirement_id,
            p_cycle_number,
            p_organization_id,
            p_file_path,
            p_submitted_by
        );
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventRequirementSubmissions(
    IN p_event_id INT,
    IN p_event_application_id INT,
    IN p_requirement_id INT,
    IN p_submitted_by VARCHAR(200)
)
BEGIN
    SELECT
        ers.submission_id,
        ers.event_id,
        e.title AS event_title,
        ers.event_application_id,
        ea.organization_id,
        ea.cycle_number,
        ers.requirement_id,
        req.requirement_name,
        req.is_applicable_to,
        ers.file_path,
        ers.submitted_by,
        u.f_name,
        u.l_name,
        u.email,
        ers.submitted_at
    FROM tbl_event_requirement_submissions ers
    LEFT JOIN tbl_event_application ea ON ers.event_application_id = ea.event_application_id
    LEFT JOIN tbl_event_application_requirement req ON ers.requirement_id = req.requirement_id
    LEFT JOIN tbl_user u ON ers.submitted_by = u.user_id
    LEFT JOIN tbl_event e ON ers.event_id = e.event_id
    WHERE ers.event_id = p_event_id
      AND (p_event_application_id IS NULL OR ers.event_application_id = p_event_application_id)
      AND (p_requirement_id IS NULL OR ers.requirement_id = p_requirement_id)
      AND (p_submitted_by IS NULL OR ers.submitted_by = p_submitted_by)
    ORDER BY ers.submitted_at DESC;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetActiveApplicationPeriodSimple()
BEGIN
    SELECT *
    FROM tbl_application_period
    WHERE is_active = 1
    ORDER BY created_at DESC
    LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationsByStatus(
    IN p_status ENUM('Pending', 'Approved', 'Rejected', 'Renewal', 'Archived')
)
BEGIN
    SELECT 
        o.organization_id,
        o.adviser_id,
        o.name AS organization_name,
        o.description,
        o.base_program_id,
        o.logo,
        o.status,
        o.membership_fee_type,
        o.membership_fee_amount,
        o.is_recruiting,
        o.is_open_to_all_courses,
        o.category,
        o.created_at,
        -- Main/base program (if any)
        p.program_id AS base_program_id,
        p.name AS base_program_name,
        p.description AS base_program_description,
        -- All additional programs (if any, as JSON array)
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'program_id', pr.program_id,
                    'program_name', pr.name,
                    'program_description', pr.description
                )
            )
            FROM tbl_organization_course oc
            JOIN tbl_program pr ON oc.program_id = pr.program_id
            WHERE oc.organization_id = o.organization_id
        ) AS additional_programs
    FROM tbl_organization o
    LEFT JOIN tbl_program p ON o.base_program_id = p.program_id
    WHERE o.status = p_status
    ORDER BY o.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveOrganization(
    IN p_organization_id INT,
    IN p_user_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    -- Validate inputs
    IF p_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'organization_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;
    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'archive reason required';
    END IF;

    -- Update organization status and archive audit fields
    UPDATE tbl_organization
    SET status = 'Archived',
        archived_at = CURRENT_TIMESTAMP,
        archived_by = p_user_id,
        archived_reason = p_reason,
        -- clear any previous unarchive audit
        unarchived_at = NULL,
        unarchived_by = NULL,
        unarchived_reason = NULL
    WHERE organization_id = p_organization_id;

    -- Lookup user email for LogAction and call stored logger
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN
        SET v_user_email = '';
    END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Archived organization ID ', p_organization_id),
        'organization',
        JSON_OBJECT('organization_id', p_organization_id, 'archived_at', NOW(), 'reason', p_reason),
        CONCAT('/admin/organizations/', p_organization_id),
        NULL
    );

    -- Optionally return the updated row for callers
    SELECT * FROM tbl_organization WHERE organization_id = p_organization_id LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveOrganization(
    IN p_organization_id INT,
    IN p_user_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    IF p_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'organization_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;

    -- Update organization status and set unarchive audit fields. reason may be NULL.
    UPDATE tbl_organization
    SET status = 'Approved',
        unarchived_at = CURRENT_TIMESTAMP,
        unarchived_by = p_user_id,
        unarchived_reason = p_reason
    WHERE organization_id = p_organization_id
      AND status = 'Archived';

    -- Lookup user email for LogAction and call stored logger
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN
        SET v_user_email = '';
    END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Unarchived organization ID ', p_organization_id),
        'organization',
        JSON_OBJECT('organization_id', p_organization_id, 'unarchived_at', NOW(), 'reason', p_reason),
        CONCAT('/admin/organizations/', p_organization_id),
        NULL
    );

    -- Return the updated row for callers
    SELECT * FROM tbl_organization WHERE organization_id = p_organization_id LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE TerminateActiveApplicationPeriod(
    IN p_terminated_by VARCHAR(200)
)
BEGIN
    DECLARE v_period_id INT;
    DECLARE v_terminator_email VARCHAR(100);
    DECLARE v_admin_emails JSON;
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;
    DECLARE v_start_time TIME;
    DECLARE v_end_time TIME;

    -- Find the current active period
    SELECT period_id, start_date, end_date, start_time, end_time
      INTO v_period_id, v_start_date, v_end_date, v_start_time, v_end_time
      FROM tbl_application_period
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 1;

    IF v_period_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active application period found';
    END IF;

    -- Get terminator's email
    SELECT email INTO v_terminator_email FROM tbl_user WHERE user_id = p_terminated_by LIMIT 1;

    -- Mark as inactive
    UPDATE tbl_application_period SET is_active = 0 WHERE period_id = v_period_id;

    -- Get all admin/adviser emails
    SELECT JSON_ARRAYAGG(email) INTO v_admin_emails
    FROM tbl_user
    WHERE role_id IN (2, 3, 4) AND status = 'Active';

    -- Notify (CreateNotification signature: title, message, url, entity_type, entity_id, sender_id, recipient_emails, action)
    CALL CreateNotification(
        'Application Period Closed',
        CONCAT('The application period from ', DATE_FORMAT(v_start_date, '%M %d, %Y at %h:%i %p'), ' to ', DATE_FORMAT(v_end_date, '%M %d, %Y at %h:%i %p'), ' has been closed. No further applications will be accepted.'),
        NULL,               -- url (nullable)
        'system',           -- entity_type
        v_period_id,        -- entity_id
        p_terminated_by,    -- sender_id
        v_admin_emails,     -- recipient_emails (JSON)
        'application_period_terminated'
    );

    -- Log (LogAction signature: p_user_email, p_action, p_type, p_meta_data, p_redirect_url, p_file_path)
    CALL LogAction(
        v_terminator_email,
        CONCAT('Terminated application period: ', DATE_FORMAT(v_start_date, '%M %d, %Y'), ' - ', DATE_FORMAT(v_end_date, '%M %d, %Y')),
        'Application Period Management',
        JSON_OBJECT(
            'period_id', v_period_id,
            'start_date', v_start_date,
            'end_date', v_end_date,
            'start_time', v_start_time,
            'end_time', v_end_time,
            'action', 'Terminated active application period'
        ),
        CONCAT('/admin/application-periods/', v_period_id),
        NULL
    );

    SELECT v_period_id AS terminated_period_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllPeriodsWithApplications()
BEGIN
    SELECT 
        ap.period_id,
        ap.start_date,
        ap.end_date,
        ap.start_time,
        ap.end_time,
        ap.is_active,
        ap.created_by,
        ap.created_at,
        ap.updated_at,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'application_id', a.application_id,
                    'organization_id', a.organization_id,
                    'cycle_number', a.cycle_number,
                    'org_version_id', a.org_version_id,
                    'submitted_org_name', a.submitted_org_name,
                    'submitted_org_logo', a.submitted_org_logo,
                    'application_type', a.application_type,
                    'period_id', a.period_id,
                    'applicant_user_id', a.applicant_user_id,
                    'applicant_email', u.email,
                    'applicant_name', CONCAT(COALESCE(u.f_name,''), ' ', COALESCE(u.l_name,'')),
                    'status', a.status,
                    'created_at', a.created_at,
                    'updated_at', a.updated_at,
                    'organization_name', COALESCE(o.name, v.name, a.submitted_org_name),
                    'organization_logo', COALESCE(o.logo, v.logo_path, a.submitted_org_logo),
                    'category', COALESCE(o.category, v.category)
                )
            )
            FROM tbl_application a
            LEFT JOIN tbl_organization o ON a.organization_id = o.organization_id
            LEFT JOIN tbl_organization_version v ON a.org_version_id = v.org_version_id
            LEFT JOIN tbl_user u ON a.applicant_user_id = u.user_id
            WHERE a.period_id = ap.period_id
        ) AS applications
    FROM tbl_application_period ap
    ORDER BY ap.start_date DESC, ap.period_id DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventRequirements()
BEGIN
    SELECT * FROM tbl_event_application_requirement
    WHERE status = 'active';
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE SaveEventRequirements(
    IN p_user_id VARCHAR(200),
    IN p_requirements JSON
)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE req_count INT;
    DECLARE v_req_id INT;
    DECLARE v_req_name VARCHAR(255);
    DECLARE v_req_type ENUM('pre-event', 'post-event');
    DECLARE v_file_path VARCHAR(255);

    DECLARE done INT DEFAULT FALSE;
    DECLARE del_req_id INT;
    DECLARE del_req_name VARCHAR(255);
    DECLARE del_cursor CURSOR FOR SELECT requirement_id FROM tmp_existing_ids;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    -- 1. Collect all current requirement_ids
    DROP TEMPORARY TABLE IF EXISTS tmp_existing_ids;
    CREATE TEMPORARY TABLE IF NOT EXISTS tmp_existing_ids (requirement_id INT PRIMARY KEY);
    INSERT INTO tmp_existing_ids (requirement_id)
        SELECT requirement_id FROM tbl_event_application_requirement;

    SET req_count = JSON_LENGTH(p_requirements);

    -- 2. Add or update requirements
    WHILE i < req_count DO
        SET v_req_id = JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].requirement_id')));
        SET v_req_name = JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].requirement_name')));
        SET v_req_type = JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].is_applicable_to')));
        SET v_file_path = JSON_UNQUOTE(JSON_EXTRACT(p_requirements, CONCAT('$[', i, '].file_path')));

        IF v_req_id IS NULL OR v_req_id = '' OR v_req_id = 'null' THEN
            -- Add new requirement
            INSERT INTO tbl_event_application_requirement (
                requirement_name, is_applicable_to, file_path, created_by
            ) VALUES (
                v_req_name, v_req_type, v_file_path, p_user_id
            );

            -- Log add
            INSERT INTO tbl_logs (user_id, action_type, type, meta_data)
            VALUES (
                p_user_id,
                CONCAT('Added event requirement: ', v_req_name),
                'event_requirement',
                JSON_OBJECT('requirement_name', v_req_name, 'is_applicable_to', v_req_type)
            );
        ELSE
            -- Update existing requirement
            UPDATE tbl_event_application_requirement
            SET requirement_name = v_req_name,
                is_applicable_to = v_req_type,
                file_path = v_file_path,
                updated_at = CURRENT_TIMESTAMP
            WHERE requirement_id = v_req_id;

            -- Log update
            INSERT INTO tbl_logs (user_id, action_type, type, meta_data)
            VALUES (
                p_user_id,
                CONCAT('Updated event requirement: ', v_req_name),
                'event_requirement',
                JSON_OBJECT('requirement_id', v_req_id, 'requirement_name', v_req_name, 'is_applicable_to', v_req_type)
            );
        END IF;

        -- Remove from deletion candidates
        IF v_req_id IS NOT NULL AND v_req_id != '' THEN
            DELETE FROM tmp_existing_ids WHERE requirement_id = v_req_id;
        END IF;

        SET i = i + 1;
    END WHILE;

    -- 3. Delete requirements not in the new list and log deletions
    OPEN del_cursor;
    del_loop: LOOP
        FETCH del_cursor INTO del_req_id;
        IF done THEN
            LEAVE del_loop;
        END IF;

        -- Get name for logging
        SELECT requirement_name INTO del_req_name FROM tbl_event_application_requirement WHERE requirement_id = del_req_id;

        DELETE FROM tbl_event_application_requirement WHERE requirement_id = del_req_id;

        -- Log deletion
        INSERT INTO tbl_logs (user_id, action_type, type, meta_data)
        VALUES (
            p_user_id,
            CONCAT('Deleted event requirement: ', del_req_name),
            'event_requirement',
            JSON_OBJECT('requirement_id', del_req_id, 'requirement_name', del_req_name)
        );
    END LOOP;
    CLOSE del_cursor;

    DROP TEMPORARY TABLE IF EXISTS tmp_existing_ids;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventEvaluationResponsesByGroup(
    IN p_event_id INT
)
BEGIN
    SELECT 
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'group_title', qg.group_title,
                'group_description', qg.group_description,
                'questions', (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', q.question_id,
                            'question_text', q.question_text,
                            'question_type', q.question_type,
                            'responses', (
                                SELECT JSON_ARRAYAGG(
                                    JSON_OBJECT(
                                        'user_id', u.user_id,
                                        'attendee_name', CONCAT(u.f_name, ' ', u.l_name),
                                        'response_value', r.response_value,
                                        'response_time', r.created_at
                                    )
                                )
                                FROM tbl_evaluation_response r
                                JOIN tbl_evaluation e ON r.evaluation_id = e.evaluation_id
                                JOIN tbl_user u ON e.user_id = u.user_id
                                WHERE r.question_id = q.question_id
                                AND e.event_id = p_event_id
                            )
                        )
                    )
                    FROM tbl_evaluation_question q
                    WHERE q.group_id = qg.group_id
                )
            )
        ) AS evaluation_responses
    FROM 
        tbl_evaluation_question_group qg
    WHERE 
        EXISTS (
            SELECT 1
            FROM tbl_event_evaluation_config ec
            WHERE ec.event_id = p_event_id
            AND ec.group_id = qg.group_id
        )
    ORDER BY 
        qg.group_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationFee(IN
    p_organization_id INT
)
BEGIN
    SELECT membership_fee_amount AS membership_fee FROM tbl_organization WHERE organization_id = p_organization_id;  
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApplyForMembership(
    IN p_org_id INT,
    IN p_user_id VARCHAR(200),
    IN p_payment_data JSON,
    IN p_question_id INT,
    IN p_response_value TEXT
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_fee_type ENUM('Per Term', 'Whole Academic Year', 'Free');
    DECLARE v_fee_amount DECIMAL(10,2);
    DECLARE v_application_id INT;
    DECLARE error_msg TEXT;
    
    -- Get current renewal cycle
    SELECT MAX(cycle_number) INTO v_cycle_number
    FROM tbl_renewal_cycle 
    WHERE organization_id = p_org_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No active renewal cycle found for organization';
    END IF;

    -- Get organization fee details
    SELECT membership_fee_type, membership_fee_amount
    INTO v_fee_type, v_fee_amount
    FROM tbl_organization
    WHERE organization_id = p_org_id;

    -- Validate payment requirements
    IF v_fee_type != 'Free' AND v_fee_amount > 0 THEN
        IF p_payment_data IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Payment is required for this organization';
        END IF;
        
        IF JSON_EXTRACT(p_payment_data, '$.membership_fee') != v_fee_amount THEN
            -- Fixed CONCAT syntax
            SET error_msg = CONCAT('Payment amount does not match organization fee. Required: ', v_fee_amount);
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = error_msg;
        END IF;
    END IF;

    -- Start transaction
    START TRANSACTION;
    
    -- Create membership application
    INSERT INTO tbl_membership_application (
        organization_id, 
        cycle_number, 
        user_id, 
        status
    )
    VALUES (
        p_org_id,
        v_cycle_number,
        p_user_id,
        'Pending'
    );
    
    SET v_application_id = LAST_INSERT_ID();
    
    -- Store custom question response
    INSERT INTO tbl_membership_response (
        application_id,
        question_id,
        response_value
    )
    VALUES (
        v_application_id,
        p_question_id,
        p_response_value
    );
    
    -- Create organization member record
    INSERT INTO tbl_organization_members (
        organization_id,
        cycle_number,
        user_id,
        member_type,
        status
    )
    VALUES (
        p_org_id,
        v_cycle_number,
        p_user_id,
        'Member',
        'Pending'
    );
    
    -- Process payment only if required and payment data exists
    IF p_payment_data IS NOT NULL AND JSON_EXTRACT(p_payment_data, '$.membership_fee') IS NOT NULL THEN
        -- Create transaction
        INSERT INTO tbl_transaction (
            user_id,
            amount,
            transaction_type,
            status,
            proof_image
        )
        VALUES (
            p_user_id,
            v_fee_amount,
            'Membership Fee',
            'Pending',
            JSON_UNQUOTE(JSON_EXTRACT(p_payment_data, '$.payment_proof'))
        );
        
        -- Link transaction to membership
        INSERT INTO tbl_transaction_membership (
            transaction_id,
            organization_id,
            cycle_number
        )
        VALUES (
            LAST_INSERT_ID(),
            p_org_id,
            v_cycle_number
        );
    END IF;
    
    -- Commit transaction
    COMMIT;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationEventApplications(
    IN p_org_name VARCHAR(100)
)
BEGIN
    DECLARE v_organization_id INT;

    -- Lookup organization_id from name
    SELECT organization_id INTO v_organization_id
    FROM tbl_organization
    WHERE name = p_org_name
    LIMIT 1;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Organization not found';
    END IF;

    -- Get all event applications for the organization, with event and applicant details
    SELECT 
        ea.event_application_id,
        ea.organization_id,
        o.name AS organization_name,
        o.adviser_id,
        CONCAT(adviser.f_name, ' ', adviser.l_name) AS adviser_name,
        ea.cycle_number,
        rc.start_date AS cycle_start_date,
        ea.proposed_event_id,
        e.title AS event_title,
        e.description AS event_description,
        e.venue_type,
        e.venue,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.status AS event_status,
        e.type,
        e.is_open_to,
        e.fee,
        e.capacity,
        e.created_at AS event_created_at,
        ea.applicant_user_id,
        CONCAT(applicant.f_name, ' ', applicant.l_name) AS applicant_name,
        applicant.email AS applicant_email,
        ea.status AS application_status,
        ea.created_at AS application_created_at,
        ea.updated_at AS application_updated_at
    FROM tbl_event_application ea
    JOIN tbl_organization o ON ea.organization_id = o.organization_id
    LEFT JOIN tbl_event e ON ea.proposed_event_id = e.event_id
    JOIN tbl_renewal_cycle rc ON ea.organization_id = rc.organization_id 
        AND ea.cycle_number = rc.cycle_number
    JOIN tbl_user applicant ON ea.applicant_user_id = applicant.user_id
    JOIN tbl_user adviser ON o.adviser_id = adviser.user_id
    WHERE ea.organization_id = v_organization_id
    ORDER BY ea.created_at DESC;

    -- Get all submitted requirements/files for all applications of this organization
    SELECT 
        ers.submission_id,
        ers.event_application_id,
        ers.requirement_id,
        ear.requirement_name,
        ear.is_applicable_to,
        ers.file_path,
        ers.submitted_by,
        CONCAT(u.f_name, ' ', u.l_name) AS submitted_by_name,
        ers.submitted_at
    FROM tbl_event_requirement_submissions ers
    JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    JOIN tbl_user u ON ers.submitted_by = u.user_id
    WHERE ers.organization_id = v_organization_id
    ORDER BY ers.event_application_id, ear.is_applicable_to, ear.requirement_name;
END$$
DELIMITER ;

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
        ers.submitted_at
    FROM tbl_event_requirement_submissions ers
    LEFT JOIN tbl_event e ON ers.event_id = e.event_id
    LEFT JOIN tbl_organization o ON ers.organization_id = o.organization_id
    LEFT JOIN tbl_event_application_requirement req ON ers.requirement_id = req.requirement_id
    LEFT JOIN tbl_user u ON ers.submitted_by = u.user_id
    WHERE ers.organization_id = p_organization_id
    ORDER BY ers.submitted_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationDashboardStats(
    IN p_organization_id INT
)
BEGIN
    DECLARE v_current_cycle INT;

    -- Get current cycle
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    -- Total members (excluding executives and committee members)
    SELECT COUNT(*) INTO @total_members
    FROM tbl_organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_current_cycle
      AND om.member_type = 'Member'
      AND NOT EXISTS (
          SELECT 1
          FROM tbl_committee_members cm
          JOIN tbl_committee c ON cm.committee_id = c.committee_id
          WHERE c.organization_id = p_organization_id
            AND c.cycle_number = v_current_cycle
            AND cm.user_id = om.user_id
      );

    -- Total events
    SELECT COUNT(*) INTO @total_events
    FROM tbl_event
    WHERE organization_id = p_organization_id;

    -- Total upcoming events
    SELECT COUNT(*) INTO @total_upcoming_events
    FROM tbl_event
    WHERE organization_id = p_organization_id
      AND start_date >= CURDATE();

    -- Total post-event reports submitted
    SELECT COUNT(*) INTO @total_reports
    FROM tbl_event_requirement_submissions ers
    JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    WHERE ers.organization_id = p_organization_id
      AND ear.is_applicable_to = 'post-event';

    -- Total pre-event requirements submitted
    SELECT COUNT(*) INTO @pre_event_requirements_submitted
    FROM tbl_event_requirement_submissions ers
    JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    WHERE ers.organization_id = p_organization_id
      AND ear.is_applicable_to = 'pre-event';

    -- Return as one row
    SELECT
        @total_members AS total_members,
        @total_events AS total_events,
        @total_reports AS total_reports,
        @pre_event_requirements_submitted AS pre_event_requirements_submitted,
        @total_upcoming_events AS total_upcoming_events;
END$$
DELIMITER ;
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateExecutiveMember(
    IN p_organization_id INT,
    IN p_email VARCHAR(100),
    IN p_program_name VARCHAR(200),
    IN p_role_title VARCHAR(100),
    IN p_rank_level INT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_role_id INT;
    DECLARE v_executive_role_id INT;
    DECLARE v_rank_id INT;
    DECLARE v_organization_exists INT;
    DECLARE v_current_membership INT;
    DECLARE v_program_id INT;
    DECLARE v_member_id INT;
    DECLARE v_current_cycle INT;

    -- Get current cycle number for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    IF v_current_cycle IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for organization';
    END IF;

    -- Look up program_id from program name
    SELECT program_id INTO v_program_id
    FROM tbl_program
    WHERE name = p_program_name
    LIMIT 1;

    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Program not found';
    END IF;

    -- Validate organization exists and is active
    SELECT COUNT(*) INTO v_organization_exists 
    FROM tbl_organization 
    WHERE organization_id = p_organization_id 
    AND status IN ('Approved', 'Renewal');
    
    IF v_organization_exists = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization not found or not active';
    END IF;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id 
    FROM tbl_user 
    WHERE email = p_action_by_email 
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get role_id for 'Student'
    SELECT role_id INTO v_role_id 
    FROM tbl_role 
    WHERE LOWER(role_name) = 'student' 
    LIMIT 1;

    -- Check if user exists
    SELECT user_id INTO v_user_id 
    FROM tbl_user 
    WHERE email = p_email 
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User not found. User must be registered first before becoming an executive.';
    END IF;

    -- Check if user is already a member in this organization and cycle
    SELECT member_id INTO v_member_id
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
    AND cycle_number = v_current_cycle
    AND user_id = v_user_id
    AND status = 'Active';

    IF v_member_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User must be an active member of the organization before becoming an executive';
    END IF;

    -- Check if user is already an executive in this cycle
    SELECT COUNT(*) INTO v_current_membership
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
    AND cycle_number = v_current_cycle
    AND user_id = v_user_id
    AND member_type = 'Executive';

    IF v_current_membership > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User is already an executive member in this cycle';
    END IF;

    -- Update user's program if different
    UPDATE tbl_user 
    SET program_id = v_program_id
    WHERE user_id = v_user_id 
    AND (program_id IS NULL OR program_id != v_program_id);

    -- Get rank_id from the specified rank level
    SELECT rank_id INTO v_rank_id 
    FROM tbl_executive_rank 
    WHERE rank_level = p_rank_level
    LIMIT 1;

    IF v_rank_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Invalid rank level';
    END IF;

    -- Create executive role if not exists (using current cycle)
    SELECT executive_role_id INTO v_executive_role_id
    FROM tbl_executive_role
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND role_title = p_role_title
      AND rank_id = v_rank_id
    LIMIT 1;

    IF v_executive_role_id IS NULL THEN
        INSERT INTO tbl_executive_role (
            organization_id,
            cycle_number,
            role_title,
            rank_id,
            created_at
        ) VALUES (
            p_organization_id,
            v_current_cycle,
            p_role_title,
            v_rank_id,
            CURRENT_TIMESTAMP
        );
        
        SET v_executive_role_id = LAST_INSERT_ID();
    END IF;

    -- Update existing member to Executive status
    UPDATE tbl_organization_members 
    SET 
        member_type = 'Executive',
        executive_role_id = v_executive_role_id
    WHERE member_id = v_member_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id, 
        action, 
        type, 
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Promoted member to executive: ', v_user_id, ' (', p_email, ') as ', p_role_title),
        'executive_member_promotion',
        JSON_OBJECT(
            'organization_id', p_organization_id, 
            'cycle_number', v_current_cycle,
            'user_id', v_user_id, 
            'executive_role_id', v_executive_role_id,
            'role_title', p_role_title,
            'rank_level', p_rank_level,
            'program_id', v_program_id,
            'member_id', v_member_id
        ),
        CURRENT_TIMESTAMP
    );

    -- Return the created executive member data (using current cycle)
    SELECT 
        u.user_id AS id,
        u.f_name AS first_name,
        u.l_name AS last_name,
        u.email,
        er.role_title,
        p.name AS program_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE om.organization_id = p_organization_id
        AND om.cycle_number = v_current_cycle
        AND om.member_type = 'Executive'
        AND om.user_id = v_user_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateExecutiveMember(
    IN p_organization_id INT,
    IN p_email VARCHAR(100),
    IN p_program_name VARCHAR(200),
    IN p_role_title VARCHAR(100),
    IN p_rank_level INT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_role_id INT;
    DECLARE v_rank_id INT;
    DECLARE v_executive_role_id INT;
    DECLARE v_program_id INT;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_current_cycle INT;

    -- Get current cycle number for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    IF v_current_cycle IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for organization';
    END IF;

    -- Look up program_id from program name
    SELECT program_id INTO v_program_id
    FROM tbl_program
    WHERE name = p_program_name
    LIMIT 1;

    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Program not found';
    END IF;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get user_id of executive member
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Executive member not found';
    END IF;

    -- Get role_id for 'Student'
    SELECT role_id INTO v_role_id
    FROM tbl_role
    WHERE LOWER(role_name) = 'student'
    LIMIT 1;

    -- Get rank_id from the specified rank level
    SELECT rank_id INTO v_rank_id
    FROM tbl_executive_rank
    WHERE rank_level = p_rank_level
    LIMIT 1;

    IF v_rank_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid rank level';
    END IF;

    -- Update user program and role if needed
    UPDATE tbl_user
    SET program_id = v_program_id, role_id = v_role_id
    WHERE user_id = v_user_id;

    -- Update executive role or create if not exists (using current cycle)
    SELECT executive_role_id INTO v_executive_role_id
    FROM tbl_executive_role
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND role_title = p_role_title
      AND rank_id = v_rank_id
    LIMIT 1;

    IF v_executive_role_id IS NULL THEN
        INSERT INTO tbl_executive_role (
            organization_id,
            cycle_number,
            role_title,
            rank_id,
            created_at
        ) VALUES (
            p_organization_id,
            v_current_cycle,
            p_role_title,
            v_rank_id,
            CURRENT_TIMESTAMP
        );
        SET v_executive_role_id = LAST_INSERT_ID();
    END IF;

    -- Update organization member's executive role (using current cycle)
    UPDATE tbl_organization_members
    SET executive_role_id = v_executive_role_id
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND user_id = v_user_id
      AND member_type = 'Executive';

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Updated executive member: ', v_user_id, ' (', p_email, ') as ', p_role_title),
        'executive_member_update',
        JSON_OBJECT(
            'organization_id', p_organization_id,
            'cycle_number', v_current_cycle,
            'user_id', v_user_id,
            'executive_role_id', v_executive_role_id,
            'role_title', p_role_title,
            'rank_level', p_rank_level,
            'program_id', v_program_id
        ),
        CURRENT_TIMESTAMP
    );

    -- Return the updated executive member data (using current cycle)
    SELECT 
        u.user_id AS id,
        u.f_name AS first_name,
        u.l_name AS last_name,
        u.email,
        er.role_title,
        p.name AS program_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE om.organization_id = p_organization_id
        AND om.cycle_number = v_current_cycle
        AND om.member_type = 'Executive'
        AND om.user_id = v_user_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveExecutiveMember(
    IN p_organization_id INT,
    IN p_email VARCHAR(100),
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_member_id INT;
    DECLARE v_executive_role_id INT;
    DECLARE v_archived_by VARCHAR(200);
    DECLARE v_current_cycle INT;

    -- Get current cycle number for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    IF v_current_cycle IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for organization';
    END IF;

    -- Get user_id of executive member
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Executive member not found';
    END IF;

    -- Get member_id and executive_role_id (using current cycle)
    SELECT member_id, executive_role_id INTO v_member_id, v_executive_role_id
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND user_id = v_user_id
      AND member_type = 'Executive'
    LIMIT 1;

    IF v_member_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Executive membership not found';
    END IF;

    -- Get user_id of the action performer
    SELECT user_id INTO v_archived_by
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_archived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Return the executive member data before archiving
    SELECT 
        u.user_id AS id,
        u.f_name AS first_name,
        u.l_name AS last_name,
        u.email,
        er.role_title,
        p.name AS program_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE om.organization_id = p_organization_id
        AND om.cycle_number = v_current_cycle
        AND om.member_type = 'Executive'
        AND om.user_id = v_user_id;

    -- Archive the executive member
    INSERT INTO tbl_archived_organization_members (
        member_id,
        organization_id,
        cycle_number,
        user_id,
        member_type,
        executive_role_id,
        archived_by
    ) VALUES (
        v_member_id,
        p_organization_id,
        v_current_cycle,
        v_user_id,
        'Executive',
        v_executive_role_id,
        v_archived_by
    );

    -- Remove from active members
    DELETE FROM tbl_organization_members
    WHERE member_id = v_member_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_archived_by,
        CONCAT('Archived executive member: ', v_user_id, ' (', p_email, ') from org ', p_organization_id),
        'executive_member_archive',
        JSON_OBJECT(
            'organization_id', p_organization_id,
            'cycle_number', v_current_cycle,
            'user_id', v_user_id,
            'member_id', v_member_id,
            'executive_role_id', v_executive_role_id
        ),
        CURRENT_TIMESTAMP
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllPrograms()
BEGIN
    SELECT * FROM tbl_program;
END$$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateCommittee(
    IN p_org_name VARCHAR(100),
    IN p_committee_name VARCHAR(100),
    IN p_description TEXT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_organization_exists INT;
    DECLARE v_committee_exists INT;
    DECLARE v_new_committee_id INT;


    SET @org_id = (SELECT organization_id FROM tbl_organization WHERE name = p_org_name);
    SET @current_cycle = (
        SELECT MAX(cycle_number)
        FROM tbl_renewal_cycle
        WHERE organization_id = @org_id
    );
    -- Validate organization exists and is active
    SELECT COUNT(*) INTO v_organization_exists 
    FROM tbl_organization 
    WHERE organization_id = @org_id
    AND status IN ('Approved', 'Renewal');
    
    IF v_organization_exists = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization not found or not active';
    END IF;
    
    SELECT COUNT(*) INTO v_committee_exists
    FROM tbl_committee
    WHERE organization_id = @org_id
    AND cycle_number = @current_cycle
    AND name = p_committee_name;
    
    IF v_committee_exists > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Committee with this name already exists';
    END IF;

    SELECT user_id INTO v_action_by_user_id 
    FROM tbl_user 
    WHERE email = p_action_by_email 
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    INSERT INTO tbl_committee (
        organization_id,
        cycle_number,
        name,
        description
    ) VALUES (
        @org_id,
        @current_cycle,
        p_committee_name,
        p_description
    );
    
    SET v_new_committee_id = LAST_INSERT_ID();

    -- Log the action
    INSERT INTO tbl_logs (
        user_id, 
        action, 
        type, 
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Created committee: ', p_committee_name),
        'committee_creation',
        JSON_OBJECT(
            'organization_id', @org_id,
            'cycle_number', @current_cycle,
            'committee_id', v_new_committee_id,
            'committee_name', p_committee_name
        ),
        CURRENT_TIMESTAMP
    );
    
    -- Return the new committee ID
    SELECT
        c.committee_id as id,
        c.name AS committee_name,
        c.description,
        c.created_at
    FROM tbl_committee c
    WHERE committee_id = v_new_committee_id;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateCommittee(
    IN p_committee_id INT,
    IN p_new_name VARCHAR(100),
    IN p_new_description TEXT,
    IN p_action_by_email VARCHAR(100))
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_committee_exists INT;
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_current_name VARCHAR(100);
    DECLARE v_current_description TEXT;

    -- Check if committee exists and get current values
   SELECT  
        organization_id, 
        cycle_number, 
        name,
        description
    INTO 
        v_organization_id, 
        v_cycle_number,
        v_current_name,
        v_current_description
    FROM tbl_committee
    WHERE committee_id = p_committee_id;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Committee not found';
    END IF;

    -- Check if new name already exists for this org/cycle
    IF p_new_name IS NOT NULL AND p_new_name <> v_current_name THEN
        SELECT COUNT(*) INTO v_committee_exists
        FROM tbl_committee
        WHERE organization_id = v_organization_id
        AND cycle_number = v_cycle_number
        AND name = p_new_name;
        
        IF v_committee_exists > 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Committee with this name already exists';
        END IF;
    END IF;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id 
    FROM tbl_user 
    WHERE email = p_action_by_email 
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Update the committee
    UPDATE tbl_committee
    SET 
        name = COALESCE(p_new_name, name),
        description = COALESCE(p_new_description, description)
    WHERE committee_id = p_committee_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id, 
        action, 
        type, 
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Updated committee: ', v_current_name, 
               CASE WHEN p_new_name IS NOT NULL AND p_new_name <> v_current_name 
                    THEN CONCAT(' to ', p_new_name) 
                    ELSE '' END),
        'committee_update',
        JSON_OBJECT(
            'committee_id', p_committee_id,
            'old_name', v_current_name,
            'new_name', COALESCE(p_new_name, v_current_name),
            'old_description', v_current_description,
            'new_description', COALESCE(p_new_description, v_current_description),
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number
        ),
        CURRENT_TIMESTAMP
    );
    
    SELECT 
        c.committee_id as id,
        c.name AS committee_name,
        c.description,
        c.created_at
    FROM tbl_committee c
    LEFT JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    WHERE c.organization_id = v_organization_id
    AND c.cycle_number = v_cycle_number
    AND c.committee_id = p_committee_id
    GROUP BY c.committee_id, c.name, c.description, c.created_at
    ORDER BY c.name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveCommittee(
    IN p_committee_id INT,
    IN p_reason VARCHAR(255),
    IN p_archived_by_email VARCHAR(100))
BEGIN
    DECLARE v_archived_by_id VARCHAR(200);
    DECLARE v_committee_exists INT;
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_committee_name VARCHAR(100);
    DECLARE v_committee_description TEXT;
    DECLARE v_created_at TIMESTAMP;
    DECLARE v_member_count INT;

    -- Check if committee exists
    SELECT organization_id, cycle_number, name, description, created_at
    INTO v_organization_id, v_cycle_number, v_committee_name, v_committee_description, v_created_at
    FROM tbl_committee
    WHERE committee_id = p_committee_id;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Committee not found';
    END IF;

    -- Get user_id of the archiver
    SELECT user_id INTO v_archived_by_id 
    FROM tbl_user 
    WHERE email = p_archived_by_email 
    LIMIT 1;

    IF v_archived_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Archiving user not found';
    END IF;

    -- Count members in this committee
    SELECT COUNT(*) INTO v_member_count
    FROM tbl_committee_members
    WHERE committee_id = p_committee_id;

    SELECT 
    c.committee_id as id,
    c.name AS committee_name,
    c.description,
    c.created_at
    FROM tbl_committee c
    WHERE c.committee_id = p_committee_id;


    -- Start transaction
    START TRANSACTION;

    -- 1. Archive the committee FIRST
    INSERT INTO tbl_archived_committees (
        original_committee_id,
        organization_id,
        cycle_number,
        name,
        description,
        created_at,
        archived_at,
        archived_by,
        reason
    ) VALUES (
        p_committee_id,
        v_organization_id,
        v_cycle_number,
        v_committee_name,
        v_committee_description,
        v_created_at,
        CURRENT_TIMESTAMP,
        v_archived_by_id,
        p_reason
    );

    -- 2. Archive committee members (now committee_id is valid in archived_committees)
    INSERT INTO tbl_archived_organization_members (
        member_id,
        organization_id,
        cycle_number,
        user_id,
        member_type,
        committee_id,
        committee_role,
        archived_at,
        archived_by
    )
    SELECT 
        cm.committee_member_id,
        v_organization_id,
        v_cycle_number,
        cm.user_id,
        'Committee',
        p_committee_id,
        cm.role,
        CURRENT_TIMESTAMP,
        v_archived_by_id
    FROM tbl_committee_members cm
    WHERE cm.committee_id = p_committee_id;

    -- 3. Delete committee members
    DELETE FROM tbl_committee_members WHERE committee_id = p_committee_id;

    -- 4. Delete committee roles and permissions
    DELETE crp FROM tbl_committee_role_permission crp
    JOIN tbl_committee_role cr ON crp.committee_role_id = cr.committee_role_id
    WHERE cr.committee_id = p_committee_id;

    -- 5. Delete committee roles
    DELETE FROM tbl_committee_role WHERE committee_id = p_committee_id;

    -- 6. Finally, delete the committee
    DELETE FROM tbl_committee WHERE committee_id = p_committee_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id, 
        action, 
        type, 
        meta_data,
        timestamp
    ) VALUES (
        v_archived_by_id,
        CONCAT('Archived committee: ', v_committee_name, ' (', v_member_count, ' members)'),
        'committee_archive',
        JSON_OBJECT(
            'original_committee_id', p_committee_id,
            'committee_name', v_committee_name,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'member_count', v_member_count,
            'reason', p_reason
        ),
        CURRENT_TIMESTAMP
    );

    COMMIT;
    
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationCommittees(
    IN p_org_id INT,
    IN p_org_version_id INT)
BEGIN

    DECLARE v_cycle_number INT;
    -- Get the cycle_number for the given org_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT 
        c.committee_id as id,
        c.name AS committee_name,
        c.description,
        c.created_at
    FROM tbl_committee c
    LEFT JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    WHERE c.organization_id = p_org_id
    AND c.cycle_number = v_cycle_number
    GROUP BY c.committee_id, c.name, c.description, c.created_at
    ORDER BY c.name;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllCommitteeMembers(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    -- Get the cycle_number for the given org_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cm.role,
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        p.name AS program_name,
        u.status AS user_status
    FROM tbl_committee c
    JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    JOIN tbl_user u ON cm.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE c.organization_id = p_org_id
        AND c.cycle_number = v_cycle_number
    ORDER BY 
        c.organization_id,
        c.cycle_number,
        c.name;
END$$
DELIMITER ;

    DELIMITER $$
    CREATE DEFINER='admin'@'%' PROCEDURE AddCommitteeMember(
        IN p_committee_id INT,
        IN p_user_email VARCHAR(100),
        IN p_role ENUM('Committee Head', 'Committee Officer'),
        IN p_action_by_email VARCHAR(100))
    BEGIN
        DECLARE v_action_by_user_id VARCHAR(200);
        DECLARE v_user_id VARCHAR(200);
        DECLARE v_committee_exists INT;
        DECLARE v_organization_id INT;
        DECLARE v_cycle_number INT;
        DECLARE v_is_member INT;
        DECLARE v_new_member_id INT;

        -- Check if committee exists
        SELECT organization_id, cycle_number 
            INTO v_organization_id, v_cycle_number
            FROM tbl_committee
            WHERE committee_id = p_committee_id;

            IF v_organization_id IS NULL THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Committee not found';
            END IF;

        -- Get user_id of the action performer
        SELECT user_id INTO v_action_by_user_id 
        FROM tbl_user 
        WHERE email = p_action_by_email 
        LIMIT 1;

        IF v_action_by_user_id IS NULL THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Action performer not found';
        END IF;

            -- Get user_id of the member to add
        SELECT user_id INTO v_user_id 
        FROM tbl_user 
        WHERE email = p_user_email 
        LIMIT 1;

        IF v_user_id IS NULL THEN
            -- Insert new user with pending status
            SET v_user_id = CONCAT('usr-', UUID_SHORT());
            INSERT INTO tbl_user (
                user_id,
                email,
                role_id,
                status,
                created_at,
                updated_at
            ) VALUES (
                v_user_id,
                p_user_email,
                (SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'student' LIMIT 1),
                'Pending',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            );
        END IF;

        -- Check if user is already in this committee
        SELECT COUNT(*) INTO v_is_member
        FROM tbl_committee_members
        WHERE committee_id = p_committee_id
        AND user_id = v_user_id;
        
        IF v_is_member > 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'User is already a member of this committee';
        END IF;

        -- Add the committee member
        INSERT INTO tbl_committee_members (
            committee_id,
            user_id,
            role,
            created_at
        ) VALUES (
            p_committee_id,
            v_user_id,
            p_role,
            CURRENT_TIMESTAMP
        );
        
        SET v_new_member_id = LAST_INSERT_ID();

        -- Log the action
        INSERT INTO tbl_logs (
            user_id, 
            action, 
            type, 
            meta_data,
            timestamp
        ) VALUES (
            v_action_by_user_id,
            CONCAT('Added member to committee: ', 
                (SELECT name FROM tbl_committee WHERE committee_id = p_committee_id)),
            'committee_member_add',
            JSON_OBJECT(
                'committee_id', p_committee_id,
                'user_id', v_user_id,
                'role', p_role,
                'organization_id', v_organization_id,
                'cycle_number', v_cycle_number
            ),
            CURRENT_TIMESTAMP
        );
        
        SELECT 
            c.committee_id,
            c.name AS committee_name,
            cm.committee_member_id AS id,
            cm.role,
            cm.created_at AS member_since,
            u.user_id,
            u.f_name,
            u.l_name,
            u.email,
            p.name AS program_name,
            u.status AS user_status,
            om.member_id
        FROM tbl_committee c
        JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
        JOIN tbl_user u ON cm.user_id = u.user_id
        JOIN tbl_organization_members om ON u.user_id = om.user_id
        LEFT JOIN tbl_program p ON u.program_id = p.program_id
        WHERE c.organization_id = v_organization_id
            AND c.cycle_number = v_cycle_number
            AND cm.committee_member_id = v_new_member_id;
    END$$
    DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ScanTicket(
    IN p_email VARCHAR(100),
    IN p_event_title VARCHAR(300),
    IN p_verifier_user_id VARCHAR(200)  -- New parameter for verifier
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_event_id INT;
    DECLARE v_organization_id INT;
    DECLARE v_attendance_id INT;
    DECLARE v_is_authorized BOOLEAN DEFAULT FALSE;
    
    -- Get user ID from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found with the provided email';
    END IF;
    
    -- Get event ID and organization from title
    SELECT event_id, organization_id INTO v_event_id, v_organization_id
    FROM tbl_event
    WHERE title = p_event_title
    AND status = 'Approved';
    
    IF v_event_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Active event not found with the provided title';
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
            om.member_type = 'Executive'  -- Executive members
            OR (
                om.member_type = 'Committee'  -- Committee Heads
                AND EXISTS (
                    SELECT 1
                    FROM tbl_committee_members cm
                    JOIN tbl_committee c ON cm.committee_id = c.committee_id
                    WHERE cm.user_id = p_verifier_user_id
                    AND c.organization_id = v_organization_id
                    AND cm.role = 'Committee Head'
                )
            )
        )
    ) INTO v_is_authorized;
    
    IF NOT v_is_authorized THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not authorized to verify tickets for this event';
    END IF;
    
    -- Find existing attendance record
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = v_event_id
    AND user_id = v_user_id
    AND status IN ('Registered')  -- Only allow scan for these statuses
    AND deleted_at IS NULL;  -- Not deleted
    
    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No valid registration found for this user and event';
    END IF;
    
    -- Update attendance record
    UPDATE tbl_event_attendance
    SET 
        status = 'Attended',
        time_in = NOW()
    WHERE attendance_id = v_attendance_id;
    
    -- Return success message
    SELECT 'Ticket scanned successfully' AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddEventRequirement(
    IN p_requirement_name VARCHAR(255),
    IN p_requirement_type ENUM('pre-event', 'post-event'),
    IN p_savePath VARCHAR(255),  -- Can be NULL
    IN p_created_by VARCHAR(200)
)
BEGIN
    DECLARE v_user_exists INT;

    -- Validate requirement name
    IF TRIM(COALESCE(p_requirement_name, '')) = '' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Requirement name cannot be empty';
    END IF;

    -- Check if creating user exists
    SELECT COUNT(*) INTO v_user_exists
    FROM tbl_user
    WHERE user_id = p_created_by;

    IF v_user_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Creating user does not exist';
    END IF;

    -- Insert the new requirement (allow NULL file_path)
    INSERT INTO tbl_event_application_requirement (
        requirement_name,
        is_applicable_to,
        file_path,
        created_by
    ) VALUES (
        p_requirement_name,
        p_requirement_type,
        NULLIF(p_savePath, ''),  -- Convert empty string to NULL
        p_created_by
    );

    -- Return success message with new ID
    SELECT CONCAT('Requirement added successfully. ID: ', LAST_INSERT_ID()) AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSpecificEventRequirement(
    IN p_requirement_id INT
)
BEGIN
    -- Validate requirement ID
    IF p_requirement_id IS NULL OR p_requirement_id <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid requirement ID';
    END IF;

    -- Get the specific event requirement
    SELECT 
        requirement_id,
        requirement_name,
        is_applicable_to,
        file_path,
        created_by,
        created_at
    FROM tbl_event_application_requirement 
    WHERE requirement_id = p_requirement_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateEventRequirement(
    IN p_requirement_id INT,
    IN p_requirement_name VARCHAR(255),
    IN p_requirement_type ENUM('pre-event', 'post-event'),
    IN p_file_path VARCHAR(255), -- NULL => do not change file_path; '' => set NULL
    IN p_updated_by VARCHAR(200)
)
BEGIN
    DECLARE v_user_exists INT;
    DECLARE v_old_file_path VARCHAR(255);

    -- Validate requirement ID
    IF p_requirement_id IS NULL OR p_requirement_id <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid requirement ID';
    END IF;

    -- Validate requirement name
    IF TRIM(COALESCE(p_requirement_name, '')) = '' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Requirement name cannot be empty';
    END IF;

    -- Check if updating user exists
    SELECT COUNT(*) INTO v_user_exists
    FROM tbl_user
    WHERE user_id = p_updated_by;

    IF v_user_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Updating user does not exist';
    END IF;

    -- Get old file path (if any) and ensure requirement exists
    SELECT file_path INTO v_old_file_path
    FROM tbl_event_application_requirement
    WHERE requirement_id = p_requirement_id;

    IF NOT EXISTS (SELECT 1 FROM tbl_event_application_requirement WHERE requirement_id = p_requirement_id) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event requirement not found';
    END IF;

    -- Update the requirement
    -- Only change file_path when p_file_path IS NOT NULL.
    UPDATE tbl_event_application_requirement 
    SET 
        requirement_name = p_requirement_name,
        is_applicable_to = p_requirement_type,
        updated_at = CURRENT_TIMESTAMP,
        file_path = CASE 
                        WHEN p_file_path IS NULL THEN file_path                      -- keep existing
                        WHEN p_file_path = '' THEN NULL                              -- explicit empty -> NULL
                        ELSE p_file_path                                              -- new filename
                    END
    WHERE requirement_id = p_requirement_id;

    -- Return the old file path and success message
    SELECT 
        p_requirement_id as requirement_id,
        v_old_file_path as old_file_path,
        CONCAT('Event requirement updated successfully. ID: ', p_requirement_id) AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveEventRequirement(
    IN p_requirement_id INT,
    IN p_archived_by VARCHAR(200)
)
BEGIN
    DECLARE v_user_exists INT;
    DECLARE v_requirement_exists INT;
    DECLARE v_requirement_status ENUM('active', 'archived');

    -- Validate requirement ID
    IF p_requirement_id IS NULL OR p_requirement_id <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid requirement ID';
    END IF;

    -- Check if archiving user exists
    SELECT COUNT(*) INTO v_user_exists
    FROM tbl_user
    WHERE user_id = p_archived_by;

    IF v_user_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Archiving user does not exist';
    END IF;

    -- Check if requirement exists
    SELECT COUNT(*) INTO v_requirement_exists
    FROM tbl_event_application_requirement
    WHERE requirement_id = p_requirement_id;

    IF v_requirement_exists = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event requirement not found';
    END IF;

    -- Get current status
    SELECT status INTO v_requirement_status
    FROM tbl_event_application_requirement
    WHERE requirement_id = p_requirement_id;

    -- Check if already archived
    IF v_requirement_status = 'archived' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Event requirement is already archived';
    END IF;

    -- Archive the requirement
    UPDATE tbl_event_application_requirement 
    SET 
        status = 'archived',
        updated_at = CURRENT_TIMESTAMP
    WHERE requirement_id = p_requirement_id;
    
    -- Return success message
    SELECT 
        p_requirement_id as requirement_id,
        CONCAT('Event requirement archived successfully. ID: ', p_requirement_id) AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateCommitteeMember(
    IN p_committee_member_id INT,
    IN p_new_role ENUM('Committee Head', 'Committee Officer'),
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_committee_id INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_old_role ENUM('Committee Head', 'Committee Officer');

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get current member info
    SELECT committee_id, user_id, role INTO v_committee_id, v_user_id, v_old_role
    FROM tbl_committee_members
    WHERE committee_member_id = p_committee_member_id;

    IF v_committee_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Committee member not found';
    END IF;

    -- Update the role
    UPDATE tbl_committee_members
    SET role = p_new_role
    WHERE committee_member_id = p_committee_member_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Updated committee member role: ', v_user_id, ' in committee ', v_committee_id, ' from ', v_old_role, ' to ', p_new_role),
        'committee_member_update',
        JSON_OBJECT(
            'committee_member_id', p_committee_member_id,
            'committee_id', v_committee_id,
            'user_id', v_user_id,
            'old_role', v_old_role,
            'new_role', p_new_role
        ),
        CURRENT_TIMESTAMP
    );

    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cm.role,
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        p.name AS program_name,
        u.status AS user_status
    FROM tbl_committee c
    JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    JOIN tbl_user u ON cm.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE cm.committee_member_id = p_committee_member_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveCommitteeMember(
    IN p_committee_member_id INT,
    IN p_reason VARCHAR(255),
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_committee_id INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_role ENUM('Committee Head', 'Committee Officer');
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get current member info
    SELECT cm.committee_id, cm.user_id, cm.role, c.organization_id, c.cycle_number
    INTO v_committee_id, v_user_id, v_role, v_organization_id, v_cycle_number
    FROM tbl_committee_members cm
    JOIN tbl_committee c ON cm.committee_id = c.committee_id
    WHERE cm.committee_member_id = p_committee_member_id;

    IF v_committee_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Committee member not found';
    END IF;

    -- Archive the member
    INSERT INTO tbl_archived_organization_members (
        member_id,
        organization_id,
        cycle_number,
        user_id,
        member_type,
        committee_id,
        committee_role,
        archived_at,
        archived_by
    ) VALUES (
        p_committee_member_id,
        v_organization_id,
        v_cycle_number,
        v_user_id,
        'Committee',
        v_committee_id,
        v_role,
        CURRENT_TIMESTAMP,
        v_action_by_user_id
    );

    
    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cm.role,
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        p.name AS program_name,
        u.status AS user_status
    FROM tbl_committee c
    JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    JOIN tbl_user u ON cm.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE cm.committee_member_id = p_committee_member_id;

    DELETE FROM tbl_committee_members
    WHERE committee_member_id = p_committee_member_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Archived committee member: ', v_user_id, ' from committee ', v_committee_id),
        'committee_member_archive',
        JSON_OBJECT(
            'committee_member_id', p_committee_member_id,
            'committee_id', v_committee_id,
            'user_id', v_user_id,
            'role', v_role,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'reason', p_reason
        ),
        CURRENT_TIMESTAMP
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetPendingOrganizationMembers(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    -- Get the cycle_number for the given org_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    SELECT
        om.member_id,
        om.organization_id,
        om.cycle_number,
        om.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        u.profile_picture,
        om.member_type,
        om.status,
        ma.application_id,
        ma.status AS application_status,
        ma.applied_at,
        ma.reviewed_by,
        ma.reviewed_at,
        org.membership_fee_type,
        org.membership_fee_amount,
        t.transaction_id,
        t.amount AS paid_amount,
        t.status AS payment_status,
        t.proof_image
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    LEFT JOIN tbl_membership_application ma
        ON om.organization_id = ma.organization_id
        AND om.cycle_number = ma.cycle_number
        AND om.user_id = ma.user_id
    LEFT JOIN tbl_organization org ON om.organization_id = org.organization_id
    LEFT JOIN tbl_transaction_membership tm
        ON tm.organization_id = om.organization_id
        AND tm.cycle_number = om.cycle_number
    LEFT JOIN tbl_transaction t
        ON tm.transaction_id = t.transaction_id
        AND t.user_id = om.user_id
        AND t.transaction_type = 'Membership Fee'
    WHERE om.organization_id = p_org_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Pending'
    ORDER BY om.joined_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveMembershipApplication(
    IN p_application_id INT,
    IN p_reviewer_email VARCHAR(200),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_org_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_reviewer_id VARCHAR(200);

    -- Get application details
    SELECT organization_id, cycle_number, user_id
      INTO v_org_id, v_cycle_number, v_user_id
      FROM tbl_membership_application
     WHERE application_id = p_application_id;

    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_id
      FROM tbl_user
     WHERE email = p_reviewer_email
     LIMIT 1;

    -- Approve application
    UPDATE tbl_membership_application
       SET status = 'Approved',
           reviewed_by = v_reviewer_id,
           reviewed_at = NOW(),
           remarks = p_remarks
     WHERE application_id = p_application_id;

    -- Update member status
    UPDATE tbl_organization_members
       SET status = 'Active'
     WHERE organization_id = v_org_id
       AND cycle_number = v_cycle_number
       AND user_id = v_user_id;

    -- Log the approval
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_reviewer_id,
        CONCAT('Approved membership application ID: ', p_application_id),
        'membership_application_approval',
        JSON_OBJECT(
            'application_id', p_application_id,
            'organization_id', v_org_id,
            'cycle_number', v_cycle_number,
            'member_user_id', v_user_id,
            'remarks', p_remarks
        ),
        NOW()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectMembershipApplication(
    IN p_application_id INT,
    IN p_reviewer_email VARCHAR(200),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_org_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_reviewer_id VARCHAR(200);

    -- Get application details
    SELECT organization_id, cycle_number, user_id
      INTO v_org_id, v_cycle_number, v_user_id
      FROM tbl_membership_application
     WHERE application_id = p_application_id;

    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_id
      FROM tbl_user
     WHERE email = p_reviewer_email
     LIMIT 1;

    -- Reject application
    UPDATE tbl_membership_application
       SET status = 'Rejected',
           reviewed_by = v_reviewer_id,
           reviewed_at = NOW(),
           remarks = p_remarks
     WHERE application_id = p_application_id;

    -- Only archive if member is still pending
    UPDATE tbl_organization_members
       SET status = 'Archived'
     WHERE organization_id = v_org_id
       AND cycle_number = v_cycle_number
       AND user_id = v_user_id
       AND status = 'Pending';

    -- Log the rejection
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_reviewer_id,
        CONCAT('Rejected membership application ID: ', p_application_id),
        'membership_application_rejection',
        JSON_OBJECT(
            'application_id', p_application_id,
            'organization_id', v_org_id,
            'cycle_number', v_cycle_number,
            'member_user_id', v_user_id,
            'remarks', p_remarks
        ),
        NOW()
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddOrganizationMember(
    IN p_org_name VARCHAR(100),
    IN p_email VARCHAR(100),
    IN p_action_by_email VARCHAR(100),
    IN p_program_name VARCHAR(100)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_program_id INT DEFAULT NULL;
    DECLARE v_user_exists INT DEFAULT 0;
    DECLARE v_user_id VARCHAR(200);

    -- Get the user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    -- Get program_id from program name
    SELECT program_id INTO v_program_id
    FROM tbl_program
    WHERE name = p_program_name
    LIMIT 1;

    SET @org_id = (SELECT organization_id FROM tbl_organization WHERE name = p_org_name);
    
    SET @current_cycle = (
        SELECT MAX(cycle_number)
        FROM tbl_renewal_cycle
        WHERE organization_id = @org_id
    );

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Program not found';
    END IF;

    -- Check if user exists by email
    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_email LIMIT 1;
    SET v_user_exists = IFNULL(v_user_id IS NOT NULL, 0);

    -- If user does not exist, create user
    IF v_user_id IS NULL THEN
        SET v_user_id = CONCAT('usr-', UUID_SHORT());
        INSERT INTO tbl_user (
            user_id,
            email,
            role_id,
            program_id,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            p_email,
            (SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'student' LIMIT 1),
            v_program_id,
            'Pending',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    END IF;

    -- Check if renewal cycle exists
    IF NOT EXISTS (
        SELECT 1 FROM tbl_renewal_cycle WHERE organization_id = @org_id AND cycle_number = @current_cycle
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Renewal cycle does not exist';
    END IF;

    -- Prevent duplicate membership
    SELECT COUNT(*) INTO v_exists
    FROM tbl_organization_members
    WHERE organization_id = @org_id 
      AND cycle_number = @current_cycle
      AND user_id = v_user_id;

    IF v_exists > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User is already a member of this organization and cycle';
    END IF;

    -- Insert member (default member_type is 'Member')
    INSERT INTO tbl_organization_members (
        organization_id,
        cycle_number,
        user_id,
        member_type,
        status
    ) VALUES (
        @org_id,
        @current_cycle,
        v_user_id,
        'Member',
        'Active'
    );

    SET @organization_members = LAST_INSERT_ID();

    set @inserted_id = (
        SELECT user_id
        FROM tbl_organization_members
        WHERE member_id = @organization_members
    );

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_action_by_user_id,
        CONCAT('Added organization member: ', v_user_id, ' to org ', @org_id, ' cycle ', @current_cycle),
        'organization_member_add',
        JSON_OBJECT(
            'organization_id', @org_id,
            'cycle_number', @current_cycle,
            'user_id', v_user_id,
            'email', p_email,
            'member_type', 'Member',
            'status', 'Active',
            'program_id', v_program_id,
            'program_name', p_program_name
        ),
        NOW()
    );

            SELECT 
                om.member_id as id,
                u.f_name as first_name,
                u.l_name as last_name,
                u.email,
                om.joined_at,
                om.user_id as user
            FROM tbl_organization_members om
            JOIN tbl_user u ON om.user_id = u.user_id
            WHERE om.organization_id = @org_id
                AND om.cycle_number = @current_cycle
                AND om.status = 'Active'
                AND om.member_type != 'Executive'
                AND NOT EXISTS (
                    SELECT 1
                    FROM tbl_committee_members cm
                    JOIN tbl_committee c ON cm.committee_id = c.committee_id
                    WHERE c.organization_id = @org_id
                        AND c.cycle_number = @current_cycle
                        AND cm.user_id = om.user_id
                )
                AND om.user_id = @inserted_id;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSingleOrganizationMember(
     IN p_member_id INT,
     IN p_org_name VARCHAR(100) 
)
BEGIN

SET @org_id = (SELECT organization_id FROM tbl_organization WHERE name = p_org_name);
    
    SET @current_cycle = (
        SELECT MAX(cycle_number)
        FROM tbl_renewal_cycle
        WHERE organization_id = @org_id
    );
    SELECT 
                om.member_id as id,
                u.f_name as first_name,
                u.l_name as last_name,
                u.email,
                om.joined_at,
                om.user_id as user
            FROM tbl_organization_members om
            JOIN tbl_user u ON om.user_id = u.user_id
            WHERE om.organization_id = @org_id
                AND om.cycle_number = @current_cycle
                AND om.status = 'Active'
                AND om.member_id = p_member_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE EditOrganizationMember(
    IN p_current_email VARCHAR(100),
    IN p_new_email VARCHAR(100),
    IN p_new_program_name VARCHAR(50)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_program_id INT;

    -- Get user_id from the current email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_current_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found';
    END IF;

    -- Look up program_id from program name
    IF p_new_program_name IS NOT NULL AND p_new_program_name != '' THEN
        SELECT program_id INTO v_program_id
        FROM tbl_program
        WHERE name = p_new_program_name
        LIMIT 1;

        IF v_program_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Program name not found';
        END IF;
    ELSE
        SET v_program_id = NULL;
    END IF;

    -- Update user's email and program_id
    UPDATE tbl_user
    SET email = p_new_email,
        program_id = v_program_id
    WHERE user_id = v_user_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveOrganizationMember(
    IN p_member_id INT,
    IN p_archived_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_archived_by VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_member_type ENUM('Member', 'Executive', 'Committee');
    DECLARE v_executive_role_id INT;
    DECLARE v_committee_id INT;
    DECLARE v_committee_role ENUM('Committee Head', 'Committee Officer');

    -- Get user_id of the archiver
    SELECT user_id INTO v_archived_by
    FROM tbl_user
    WHERE email = p_archived_by_email
    LIMIT 1;

    IF v_archived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Archiving user not found';
    END IF;

    -- Get member details
    SELECT 
        om.organization_id,
        om.cycle_number,
        om.user_id,
        om.member_type,
        om.executive_role_id,
        NULL, -- committee_id (not tracked in tbl_organization_members)
        NULL  -- committee_role (not tracked in tbl_organization_members)
    INTO
        v_organization_id,
        v_cycle_number,
        v_user_id,
        v_member_type,
        v_executive_role_id,
        v_committee_id,
        v_committee_role
    FROM tbl_organization_members om
    WHERE om.member_id = p_member_id;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Organization member not found';
    END IF;

    -- Archive the member
    INSERT INTO tbl_archived_organization_members (
        member_id,
        organization_id,
        cycle_number,
        user_id,
        member_type,
        executive_role_id,
        committee_id,
        committee_role,
        archived_at,
        archived_by
    ) VALUES (
        p_member_id,
        v_organization_id,
        v_cycle_number,
        v_user_id,
        v_member_type,
        v_executive_role_id,
        v_committee_id,
        v_committee_role,
        CURRENT_TIMESTAMP,
        v_archived_by
    );

    -- Remove from active members
    DELETE FROM tbl_organization_members
    WHERE member_id = p_member_id;

    -- Log the action
    INSERT INTO tbl_logs (
        user_id,
        action,
        type,
        meta_data,
        timestamp
    ) VALUES (
        v_archived_by,
        CONCAT('Archived organization member: ', v_user_id, ' (member_id ', p_member_id, ') from org ', v_organization_id),
        'organization_member_archive',
        JSON_OBJECT(
            'member_id', p_member_id,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'user_id', v_user_id,
            'member_type', v_member_type,
            'executive_role_id', v_executive_role_id
        ),
        CURRENT_TIMESTAMP
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetPrograms()
BEGIN
    SELECT 
        program_id,
        name,
        abbreviation,
        college_id
    FROM tbl_program
    ORDER BY name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetRoles()
BEGIN
    -- Return all roles
    SELECT 
        role_id,
        role_name
    FROM tbl_role 
    WHERE is_approver = 1
    ORDER BY hierarchy_order;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetProgram()
BEGIN
     SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'college_name', d.name,
            'abbreviation', d.abbreviation,
            'program', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'program_id', p.program_id,
                        'program_name', p.name,
                        'abbreviation', p.abbreviation
                    )
                )
                FROM tbl_program p
                WHERE d.college_id = p.college_id
            )
        )
    ) AS ProgramsList
    FROM tbl_college d;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllPendingUsersAndApplications()
BEGIN
    -- Pending registered users
    SELECT 
        'user' AS source,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        u.program_id,
        p.name AS program_name,
        u.role_id,
        r.role_name,
        u.status,
        u.created_at,
        NULL AS reason,
        NULL AS application_id,
        NULL AS rejected_reason,
        NULL AS rejected_at,
        NULL AS rejected_by_email
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.status = 'Pending' AND u.archived_at IS NULL;

    -- Only pending and rejected applications (not approved)
    SELECT 
        'application' AS source,
        NULL AS user_id,
        NULL AS f_name,
        NULL AS l_name,
        a.email,
        a.program_id,
        p.name AS program_name,
        a.role_id,
        r.role_name,
        a.status,
        a.created_at,
        a.reason,
        a.application_id,
        a.rejected_reason,
        a.rejected_at,
        rej_user.email AS rejected_by_email
    FROM tbl_user_application a
    JOIN tbl_role r ON a.role_id = r.role_id
    LEFT JOIN tbl_program p ON a.program_id = p.program_id
    LEFT JOIN tbl_user rej_user ON a.rejected_by = rej_user.user_id
    WHERE a.archived_at IS NULL 
      AND a.status IN ('Pending')  
    ORDER BY a.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddUserApplication(
    IN p_email VARCHAR(100),
    IN p_role_name VARCHAR(100),
    IN p_program_id INT,
    IN p_reason TEXT
)
BEGIN
    DECLARE v_role_id INT;
    DECLARE v_pending_count INT DEFAULT 0;
    
    -- Get role ID from role name
    SELECT role_id INTO v_role_id 
    FROM tbl_role 
    WHERE role_name = p_role_name;

    IF v_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Invalid role specified';
    END IF;

    -- Check for existing pending application
    SELECT COUNT(*) INTO v_pending_count
    FROM tbl_user_application 
    WHERE email = p_email AND status = 'Pending' AND archived_at IS NULL;

    IF v_pending_count > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'You already have a pending application. Please wait for approval or contact support.';
    END IF;

    -- Archive any old rejected applications for this email
    UPDATE tbl_user_application 
    SET archived_at = CURRENT_TIMESTAMP,
        archived_by = (SELECT user_id FROM tbl_user WHERE email = p_email LIMIT 1)
    WHERE email = p_email AND status = 'Rejected' AND archived_at IS NULL;

    -- Create new application
    INSERT INTO tbl_user_application (
        email,
        role_id,
        program_id,
        reason,
        status
    ) VALUES (
        p_email,
        v_role_id,
        p_program_id,
        p_reason,
        'Pending'
    );

    -- Return the created application
    SELECT 
        a.application_id,
        a.email,
        a.program_id,
        p.name AS program_name,
        a.role_id,
        r.role_name,
        a.reason,
        a.status,
        a.created_at
    FROM tbl_user_application a
    JOIN tbl_role r ON a.role_id = r.role_id
    LEFT JOIN tbl_program p ON a.program_id = p.program_id
    WHERE a.application_id = LAST_INSERT_ID();
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveUserApplication(
    IN p_application_id INT
)
BEGIN
    DECLARE v_email VARCHAR(100);
    DECLARE v_role_id INT;
    DECLARE v_program_id INT;
    DECLARE v_reason TEXT;
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_user_id VARCHAR(200);

    -- Get application details
    SELECT email, role_id, program_id, reason
    INTO v_email, v_role_id, v_program_id, v_reason
    FROM tbl_user_application
    WHERE application_id = p_application_id AND status = 'Pending' AND archived_at IS NULL;

    IF v_email IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application not found or not pending';
    END IF;

    -- Mark application as approved
    UPDATE tbl_user_application
    SET status = 'Approved'
    WHERE application_id = p_application_id;

    -- Check if user already exists
    SELECT COUNT(*) INTO v_exists FROM tbl_user WHERE email = v_email;

    IF v_exists = 0 THEN
        -- Create user with status 'Pending' (will be activated on first login)
        SET v_user_id = CONCAT('pending-', UUID());
        INSERT INTO tbl_user (
            user_id,
            email,
            role_id,
            program_id,
            status
        ) VALUES (
            v_user_id,
            v_email,
            v_role_id,
            v_program_id,
            'Pending'
        );
    ELSE
        -- Update existing user
        UPDATE tbl_user 
        SET role_id = v_role_id,
            program_id = v_program_id,
            status = 'Active',
            archived_at = NULL,
            archived_by = NULL,
            archived_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE email = v_email;
    END IF;

    -- Return the approved application details
    SELECT 
        a.application_id,
        a.email,
        a.program_id,
        p.name AS program_name,
        a.role_id,
        r.role_name,
        a.reason,
        a.status,
        a.created_at
    FROM tbl_user_application a
    JOIN tbl_role r ON a.role_id = r.role_id
    LEFT JOIN tbl_program p ON a.program_id = p.program_id
    WHERE a.application_id = p_application_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectUserApplication(
    IN p_application_id INT,
    IN p_rejected_by_email VARCHAR(100),
    IN p_rejection_reason TEXT
)
BEGIN
    DECLARE v_rejected_by_id VARCHAR(200);
    DECLARE v_email VARCHAR(100);

    -- Get rejector user_id
    SELECT user_id INTO v_rejected_by_id FROM tbl_user WHERE email = p_rejected_by_email LIMIT 1;
    IF v_rejected_by_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Rejector user not found';
    END IF;

    -- Get application email for logging
    SELECT email INTO v_email FROM tbl_user_application WHERE application_id = p_application_id;

    -- Mark application as rejected with full metadata
    UPDATE tbl_user_application
    SET status = 'Rejected',
        rejected_reason = COALESCE(p_rejection_reason, 'No reason provided'),
        rejected_at = CURRENT_TIMESTAMP,
        rejected_by = v_rejected_by_id
    WHERE application_id = p_application_id AND status = 'Pending' AND archived_at IS NULL;

    -- Log the rejection
    CALL LogAction(
        p_rejected_by_email,
        CONCAT('Rejected user application for ', v_email),
        'application',
        JSON_OBJECT(
            'application_id', p_application_id,
            'target_email', v_email,
            'rejection_reason', COALESCE(p_rejection_reason, 'No reason provided')
        ),
        NULL,
        NULL
    );

    -- Return the rejected application
    SELECT 
        a.application_id,
        a.email,
        a.program_id,
        p.name AS program_name,
        a.role_id,
        r.role_name,
        a.reason,
        a.status,
        a.created_at,
        a.rejected_reason,
        a.rejected_at,
        rej_user.email AS rejected_by_email
    FROM tbl_user_application a
    JOIN tbl_role r ON a.role_id = r.role_id
    LEFT JOIN tbl_program p ON a.program_id = p.program_id
    LEFT JOIN tbl_user rej_user ON a.rejected_by = rej_user.user_id
    WHERE a.application_id = p_application_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllColleges()
BEGIN
    SELECT 
        college_id,
        name,
        abbreviation,
        created_at
    FROM tbl_college
    ORDER BY name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateProgram(
    IN p_college_id INT,
    IN p_name VARCHAR(200),
    IN p_abbreviation VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);

    -- Lookup user_id from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    INSERT INTO tbl_program (college_id, name, abbreviation)
    VALUES (p_college_id, p_name, p_abbreviation);

    SELECT * FROM tbl_program WHERE program_id = LAST_INSERT_ID();
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateProgram(
    IN p_program_id INT,
    IN p_college_id INT,
    IN p_name VARCHAR(200),
    IN p_abbreviation VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);

    -- Lookup user_id from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    UPDATE tbl_program
    SET college_id = p_college_id,
        name = p_name,
        abbreviation = p_abbreviation
    WHERE program_id = p_program_id;

    SELECT * FROM tbl_program WHERE program_id = p_program_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteProgram(
    IN p_program_id INT,
    IN p_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);

    -- Lookup user_id from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    DELETE FROM tbl_program WHERE program_id = p_program_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllExecutiveRanks()
BEGIN
    SELECT 
        rank_id,
        rank_level,
        default_title,
        description,
        created_at
    FROM tbl_executive_rank
    ORDER BY rank_level;
END$$
DELIMITER ;

DELIMITER $$
DROP PROCEDURE IF EXISTS GetAddEventStatus$$
CREATE DEFINER='admin'@'%' PROCEDURE GetAddEventStatus(
    IN p_org_name VARCHAR(200)
)
BEGIN
    DECLARE v_org_id INT;
    DECLARE v_event_id INT;


    SELECT organization_id INTO v_org_id
    FROM tbl_organization
    WHERE name = p_org_name
    LIMIT 1;


    SELECT e.event_id
      INTO v_event_id
      FROM tbl_event e
     WHERE e.organization_id = v_org_id
     ORDER BY e.created_at DESC
     LIMIT 1;


    IF v_event_id IS NULL THEN
        SELECT
            NULL AS id,
            (SELECT MAX(cycle_number) FROM tbl_renewal_cycle WHERE organization_id = v_org_id) AS cycle_number,
            1 AS status;
    ELSE

        SELECT
            e.event_id AS id,
            e.cycle_number,
            (
                SELECT COUNT(*)
                FROM tbl_event_application_requirement r
                WHERE r.is_applicable_to = 'post-event'
            ) = (
                SELECT COUNT(DISTINCT ers.requirement_id)
                FROM tbl_event_requirement_submissions ers
                JOIN tbl_event_application_requirement r ON ers.requirement_id = r.requirement_id
                WHERE ers.event_id = e.event_id
                  AND r.is_applicable_to = 'post-event'
                  AND ers.status = 'Approved'
            ) AS status
        FROM tbl_event e
        WHERE e.event_id = v_event_id;
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetNotificationsByEmail(
    IN p_email VARCHAR(100),
    IN p_is_read BOOLEAN,
    IN p_limit INT,
    IN p_offset INT
)
BEGIN
    SELECT 
        n.notification_id,
        n.title,
        n.message,
        n.entity_type,
        n.entity_id,
        n.sender_id,
        n.action,
        n.url,
        n.created_at,
        nr.is_read,
        sender.f_name AS sender_first_name,
        sender.l_name AS sender_last_name
    FROM tbl_notification n
    JOIN tbl_notification_recipient nr ON n.notification_id = nr.notification_id
    LEFT JOIN tbl_user sender ON n.sender_id = sender.user_id
    WHERE nr.recipient_email = p_email
      AND (p_is_read IS NULL OR nr.is_read = p_is_read)
    ORDER BY n.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE MarkNotificationRead(
    IN p_notification_id INT,
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);
    
    -- Get user email
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    
    IF v_user_email IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;
    
    -- Update notification as read
    UPDATE tbl_notification_recipient 
    SET is_read = TRUE 
    WHERE notification_id = p_notification_id 
    AND recipient_email = v_user_email;
    
    SELECT 'Notification marked as read' AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE NotifyApplicationApprovalChange(
    IN p_approval_id INT,
    IN p_application_id INT
)
BEGIN
    DECLARE v_application_status VARCHAR(20);
    DECLARE v_organization_id INT;
    DECLARE v_applicant_user_id VARCHAR(200);
    DECLARE v_approver_id VARCHAR(200);
    DECLARE v_org_name VARCHAR(255);
    DECLARE v_step INT;
    DECLARE v_step_status ENUM('Pending','Approved','Rejected');
    DECLARE v_title VARCHAR(255);
    DECLARE v_message TEXT;
    DECLARE v_url VARCHAR(512);
    DECLARE v_application_type ENUM('new','renewal');
    DECLARE v_total_steps INT DEFAULT 0;
    DECLARE v_completed_steps INT DEFAULT 0;
    DECLARE v_remaining_steps INT DEFAULT 0;
    DECLARE v_adviser_id VARCHAR(200);
    DECLARE v_recipient_emails JSON;

    /* Context: application, org name (prefer submitted name if present) */
    SELECT a.status,
           a.organization_id,
           a.applicant_user_id,
           COALESCE(NULLIF(a.submitted_org_name,''), o.name),
           a.application_type
      INTO v_application_status,
           v_organization_id,
           v_applicant_user_id,
           v_org_name,
           v_application_type
    FROM tbl_application a
    LEFT JOIN tbl_organization o ON a.organization_id = o.organization_id
    WHERE a.application_id = p_application_id
    LIMIT 1;

    /* If we couldn't resolve org name, fall back to application id string */
    IF v_org_name IS NULL OR TRIM(v_org_name) = '' THEN
        SET v_org_name = CONCAT('Application-', p_application_id);
    END IF;

    /* approver / step context */
    SELECT approver_id, step, status
      INTO v_approver_id, v_step, v_step_status
    FROM tbl_approval_process
    WHERE approval_id = p_approval_id
    LIMIT 1;

    /* Step metrics */
    SELECT COUNT(*) INTO v_total_steps
    FROM tbl_application_approval
    WHERE application_id = p_application_id;

    SELECT COUNT(*) INTO v_completed_steps
    FROM tbl_application_approval aa
    JOIN tbl_approval_process ap ON aa.approval_id = ap.approval_id
    WHERE aa.application_id = p_application_id
      AND ap.status = 'Approved';

    SET v_remaining_steps = GREATEST(0, v_total_steps - v_completed_steps);

    /* Frontend URL (use application id + org slug-friendly name) */
    SET v_url = CONCAT('/organizations/app-details/', p_application_id, '/', REPLACE(v_org_name, ' ', '-'));

    /* Adviser */
    SELECT adviser_id INTO v_adviser_id FROM tbl_organization WHERE organization_id = v_organization_id LIMIT 1;

    /* Recipients: applicant, adviser, all approvers for this application */
    SELECT JSON_ARRAYAGG(email) INTO v_recipient_emails
    FROM (
        SELECT u.email
        FROM tbl_user u
        WHERE u.user_id IN (
            v_applicant_user_id,
            v_adviser_id
        )
        UNION
        SELECT u.email
        FROM tbl_approval_process ap
        JOIN tbl_user u ON ap.approver_id = u.user_id
        WHERE ap.application_id = p_application_id
    ) AS recipients;

    /* Build human-friendly notification title/message */
    IF v_application_status IS NOT NULL AND LOWER(v_application_status) = 'approved' THEN
        SET v_title = CONCAT('Application Approved — ', v_org_name);
        SET v_message = CONCAT('Good news — the ', v_application_type, ' application for "', v_org_name, '" has completed all approval steps.');
    ELSEIF v_step_status = 'Approved' THEN
        SET v_title = CONCAT('Approval Progress — ', v_org_name);
        SET v_message = CONCAT('Step ', v_step, ' for "', v_org_name, '" was approved. ', v_remaining_steps, ' step(s) remaining. You can view details here: ', v_url);
    ELSEIF v_step_status = 'Rejected' OR (v_application_status IS NOT NULL AND LOWER(v_application_status) = 'rejected') THEN
        SET v_title = CONCAT('Application Rejected — ', v_org_name);
        SET v_message = CONCAT('The ', v_application_type, ' application for "', v_org_name, '" was rejected at step ', v_step, '. Please review the comments and next steps: ', v_url);
    ELSE
        SET v_title = CONCAT('Application Update — ', v_org_name);
        SET v_message = CONCAT('Status update for "', v_org_name, '": ', COALESCE(v_application_status,'Updated'), '. Current step: ', COALESCE(CAST(v_step AS CHAR), 'N/A'), '. See details: ', v_url);
    END IF;

    /* Create notification (uses CreateNotification stored procedure signature) */
    IF v_recipient_emails IS NOT NULL THEN
        CALL CreateNotification(
            v_title,                 -- p_title
            v_message,               -- p_message
            v_url,                   -- p_url (nullable)
            'organization',          -- p_entity_type
            v_organization_id,       -- p_entity_id
            v_approver_id,           -- p_sender_id (approver who triggered change)
            v_recipient_emails,      -- p_recipient_emails (JSON array)
            'application_approval_update' -- p_action
        );
    END IF;

    /* Log action — LogAction(p_user_email, p_action, p_type, p_meta_data, p_redirect_url, p_file_path) */
    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = v_approver_id LIMIT 1),
        CONCAT('Approval step updated for ', v_org_name, ': ', v_title),
        'Organization Application Approval',
        JSON_OBJECT(
            'application_id', p_application_id,
            'organization_id', v_organization_id,
            'step', v_step,
            'status', v_application_status,
            'step_status', v_step_status,
            'title', v_title
        ),
        v_url,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateTransaction(
    IN p_user_email VARCHAR(100),
    IN p_payer_name VARCHAR(255),
    IN p_payee_name VARCHAR(255),
    IN p_transaction_type_code VARCHAR(50),
    IN p_payment_type_code VARCHAR(50),
    IN p_payment_description VARCHAR(255),
    IN p_amount DECIMAL(10,2),
    IN p_status ENUM('Pending','Completed','Failed'),
    IN p_transaction_date DATE,
    IN p_proof_image VARCHAR(500),
    IN p_meta JSON,
    IN p_event_id INT,
    IN p_payer_name_override VARCHAR(255),
    IN p_org_id INT,
    IN p_cycle_number INT,
    IN p_expense_category VARCHAR(100),
    IN p_reference_doc VARCHAR(255)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_payment_type_id INT;
    DECLARE v_transaction_type_id INT;
    DECLARE v_txn_id INT;
    DECLARE v_type_code VARCHAR(50);

    SELECT transaction_type_id, code
      INTO v_transaction_type_id, v_type_code
      FROM tbl_transaction_type
     WHERE code = p_transaction_type_code
     LIMIT 1;
    IF v_transaction_type_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction type code not found';
    END IF;

    SELECT payment_type_id INTO v_payment_type_id
      FROM tbl_payment_type WHERE code = p_payment_type_code LIMIT 1;
    IF v_payment_type_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment type code not found';
    END IF;

    IF p_user_email IS NOT NULL AND p_user_email <> '' THEN
        SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
        IF v_user_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User (email) not found';
        END IF;
    ELSE
        SET v_user_id = NULL;
    END IF;

    INSERT INTO tbl_transaction(
        user_id,
        payer_name,
        payee_name,
        payment_description,
        amount,
        transaction_type_id,
        payment_type_id,
        status,
        transaction_date,
        receipt_no,
        proof_image
    ) VALUES (
        v_user_id,
        NULLIF(p_payer_name,''),
        NULLIF(p_payee_name,''),
        p_payment_description,
        p_amount,
        v_transaction_type_id,
        v_payment_type_id,
        COALESCE(p_status,'Pending'),
        p_transaction_date,
        'PENDING',
        NULLIF(p_proof_image,'')
    );

    SET v_txn_id = LAST_INSERT_ID();

    IF v_type_code = 'INCOME' THEN
        UPDATE tbl_transaction
           SET receipt_no = CONCAT('RCPT-', p_payment_type_code, '-', LPAD(v_txn_id,6,'0'))
         WHERE transaction_id = v_txn_id;
    ELSE
        UPDATE tbl_transaction
           SET receipt_no = NULL
         WHERE transaction_id = v_txn_id;
    END IF;

    IF v_type_code = 'INCOME' THEN
        IF p_event_id IS NOT NULL THEN
            INSERT INTO tbl_transaction_event(transaction_id, event_id, remarks, payer_name_override)
            VALUES (v_txn_id, p_event_id, NULL, NULLIF(p_payer_name_override,''));
        END IF;
        IF p_org_id IS NOT NULL AND p_cycle_number IS NOT NULL THEN
            INSERT INTO tbl_transaction_membership(transaction_id, organization_id, cycle_number)
            VALUES (v_txn_id, p_org_id, p_cycle_number);
        END IF;
    END IF;

    IF v_type_code = 'EXPENSE' THEN
        IF p_expense_category IS NULL OR p_expense_category = '' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Expense category required for expense transaction';
        END IF;
        INSERT INTO tbl_transaction_expense(transaction_id, expense_category, reference_doc)
        VALUES (v_txn_id, p_expense_category, NULLIF(p_reference_doc,''));
    END IF;

    CALL LogAction(
        COALESCE(p_user_email,'system@anonymous.local'),
        CONCAT('Created transaction #', v_txn_id, ' (', v_type_code, ')'),
        'transaction_create',
        p_meta,
        NULL,
        NULL
    );

    CALL GetTransaction(v_txn_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100),
    IN p_payment_description VARCHAR(255),
    IN p_amount DECIMAL(10,2),
    IN p_status ENUM('Pending','Completed','Failed'),
    IN p_proof_image VARCHAR(500),
    IN p_meta JSON,
    IN p_payer_name VARCHAR(255),
    IN p_payee_name VARCHAR(255),
    IN p_payer_name_override VARCHAR(255),
    IN p_expense_category VARCHAR(100),
    IN p_reference_doc VARCHAR(255)
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    DECLARE v_type_code VARCHAR(50);
    DECLARE v_exists INT;

    SELECT user_id INTO v_actor_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found'; END IF;

    SELECT tt.code INTO v_type_code
    FROM tbl_transaction t
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    WHERE t.transaction_id = p_transaction_id;

    IF v_type_code IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not found';
    END IF;

    UPDATE tbl_transaction
       SET payment_description = COALESCE(p_payment_description, payment_description),
           amount = COALESCE(p_amount, amount),
           status = COALESCE(p_status, status),
           proof_image = COALESCE(NULLIF(p_proof_image,''), proof_image),
           payer_name = COALESCE(NULLIF(p_payer_name,''), payer_name),
           payee_name = COALESCE(NULLIF(p_payee_name,''), payee_name),
           updated_at = CURRENT_TIMESTAMP
     WHERE transaction_id = p_transaction_id;

    IF ROW_COUNT() = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Update failed'; END IF;

    IF v_type_code = 'INCOME' AND p_payer_name_override IS NOT NULL THEN
        SELECT COUNT(*) INTO v_exists FROM tbl_transaction_event WHERE transaction_id = p_transaction_id;
        IF v_exists = 1 THEN
            UPDATE tbl_transaction_event
               SET payer_name_override = NULLIF(p_payer_name_override,'')
             WHERE transaction_id = p_transaction_id;
        END IF;
    END IF;

    IF v_type_code = 'EXPENSE' THEN
        SELECT COUNT(*) INTO v_exists FROM tbl_transaction_expense WHERE transaction_id = p_transaction_id;
        IF v_exists = 1 THEN
            UPDATE tbl_transaction_expense
               SET expense_category = COALESCE(p_expense_category, expense_category),
                   reference_doc = COALESCE(NULLIF(p_reference_doc,''), reference_doc)
             WHERE transaction_id = p_transaction_id;
        END IF;
    END IF;

    CALL LogAction(
        p_user_email,
        CONCAT('Updated transaction #', p_transaction_id, ' (', v_type_code, ')'),
        'transaction_update',
        p_meta,
        NULL,
        NULL
    );

    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100),
    IN p_reason VARCHAR(255),
    IN p_meta JSON
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    SELECT user_id INTO v_actor_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found'; END IF;

    UPDATE tbl_transaction
       SET archived_at = CURRENT_TIMESTAMP,
           archived_by = v_actor_id,
           archived_reason = p_reason,
           unarchived_at = NULL,
           unarchived_by = NULL
     WHERE transaction_id = p_transaction_id
       AND archived_at IS NULL;

    IF ROW_COUNT() = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not found or already archived'; END IF;

    CALL LogAction(
        p_user_email,
        CONCAT('Archived transaction #', p_transaction_id,' Reason: ', p_reason),
        'transaction_archive',
        p_meta,
        NULL,
        NULL
    );

    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100),
    IN p_meta JSON
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    SELECT user_id INTO v_actor_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found'; END IF;

    UPDATE tbl_transaction
       SET unarchived_at = CURRENT_TIMESTAMP,
           unarchived_by = v_actor_id,
           archived_at = NULL,
           archived_by = NULL,
           archived_reason = NULL
     WHERE transaction_id = p_transaction_id
       AND archived_at IS NOT NULL;

    IF ROW_COUNT() = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not archived or not found'; END IF;

    CALL LogAction(
        p_user_email,
        CONCAT('Unarchived transaction #', p_transaction_id),
        'transaction_unarchive',
        p_meta,
        NULL,
        NULL
    );

    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetTransaction(
    IN p_transaction_id INT
)
BEGIN
    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           te.event_id,
           te.payer_name_override,
           tm.organization_id,
           tm.cycle_number,
           ex.expense_category,
           ex.reference_doc
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    LEFT JOIN tbl_transaction_expense ex ON t.transaction_id = ex.transaction_id
    WHERE t.transaction_id = p_transaction_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetTransactions(
    IN p_user_email VARCHAR(100),
    IN p_status ENUM('Pending','Completed','Failed'),
    IN p_include_archived BOOLEAN,
    IN p_event_id INT,
    IN p_org_id INT,
    IN p_transaction_type_code VARCHAR(50)      -- optional filter (INCOME / EXPENSE)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_type_id INT;

    IF p_user_email IS NOT NULL AND p_user_email <> '' THEN
        SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
        IF v_user_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User not found'; END IF;
    END IF;

    IF p_transaction_type_code IS NOT NULL AND p_transaction_type_code <> '' THEN
        SELECT transaction_type_id INTO v_type_id
        FROM tbl_transaction_type
        WHERE code = p_transaction_type_code
        LIMIT 1;
        IF v_type_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction type not found'; END IF;
    END IF;

    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           te.event_id,
           te.payer_name_override,
           tm.organization_id,
           tm.cycle_number,
           ex.expense_category,
           ex.reference_doc
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    LEFT JOIN tbl_transaction_expense ex ON t.transaction_id = ex.transaction_id
    WHERE (v_user_id IS NULL OR t.user_id = v_user_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_include_archived OR t.archived_at IS NULL)
      AND (p_event_id IS NULL OR te.event_id = p_event_id)
      AND (p_org_id IS NULL OR tm.organization_id = p_org_id)
      AND (v_type_id IS NULL OR t.transaction_type_id = v_type_id)
    ORDER BY t.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetPaymentTypes()
BEGIN
    SELECT payment_type_id, code, label, category
      FROM tbl_payment_type
     ORDER BY label;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetTransactionTypes()
BEGIN
    SELECT transaction_type_id, code, label
    FROM tbl_transaction_type
    ORDER BY label;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE NotifyNewEventProposal(
    IN p_event_id INT,
    IN p_event_application_id INT,
    IN p_event_title VARCHAR(255),
    IN p_organization_id INT,
    IN p_organization_name VARCHAR(100),
    IN p_applicant_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_applicant_name VARCHAR(101);
    DECLARE v_admin_emails JSON;
    
    -- Get applicant name
    SELECT CONCAT(f_name, ' ', l_name) INTO v_applicant_name
    FROM tbl_user
    WHERE user_id = p_applicant_user_id;
    
    -- Get admin emails (users with role_id = 3)
    SELECT JSON_ARRAYAGG(email) INTO v_admin_emails
    FROM tbl_user
    WHERE role_id = 3 AND status = 'Active';
    
    -- Create user-friendly notification
    CALL CreateNotification(
        CONCAT('Event Proposal: "', p_event_title, '"'),
        CONCAT(p_organization_name, ' has submitted a proposal for their upcoming event "', p_event_title, '". Submitted by ', v_applicant_name, '. Please review the proposal for approval.'),
        'event',
        p_event_id,
        p_applicant_user_id,
        v_admin_emails,
        'event_proposal_pending'
    );
    
    -- Log with user-friendly message
    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_applicant_user_id),
        CONCAT('Submitted event proposal: "', p_event_title, '" for ', p_organization_name),
        'Event Proposals',
        JSON_OBJECT(
            'event_title', p_event_title,
            'organization', p_organization_name,
            'event_application_id', p_event_application_id,
            'proposer', v_applicant_name,
            'action', 'Submitted event proposal for administrative review'
        ),
        CONCAT('/events/proposals/', p_event_application_id),
        'event_proposal_documents'
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetSystemCounts()
BEGIN
    DECLARE v_total_orgs INT DEFAULT 0;
    DECLARE v_total_app_org INT DEFAULT 0;
    DECLARE v_total_app_user INT DEFAULT 0;
    DECLARE v_total_event_apps INT DEFAULT 0;
    DECLARE v_total_upcoming_events INT DEFAULT 0;

    -- Total organizations (all rows)
    SELECT COUNT(*) INTO v_total_orgs
    FROM tbl_organization;

    -- Total organization applications (only Pending)
    SELECT COUNT(*) INTO v_total_app_org
    FROM tbl_application
    WHERE status = 'Pending';

    -- Total user applications (only Pending)
    SELECT COUNT(*) INTO v_total_app_user
    FROM tbl_user_application
    WHERE status = 'Pending';

    -- Total event proposals / applications
    SELECT COUNT(*) INTO v_total_event_apps
    FROM tbl_event_application;

    -- Total upcoming events (approved and starting today or later)
    SELECT COUNT(*) INTO v_total_upcoming_events
    FROM tbl_event
    WHERE status = 'Approved'
      AND start_date >= CURDATE();

    -- Return a single row with all counts
    SELECT
        v_total_orgs AS total_organizations,
        v_total_app_org AS total_organization_applications,
        v_total_app_user AS total_user_applications,
        (v_total_app_org + v_total_app_user) AS total_applications,
        v_total_event_apps AS total_event_proposals,
        v_total_upcoming_events AS total_upcoming_events;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetApprovedOrganizationLogos()
BEGIN
    SELECT
        o.organization_id,
        o.name AS organization_name,
        o.logo,
        o.current_org_version_id,
        o.category,
        o.created_at
    FROM tbl_organization o
    WHERE o.status = 'Approved'
      AND o.logo IS NOT NULL
      AND o.logo != ''
    ORDER BY o.name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateSDAOEvent(
    IN p_user_id VARCHAR(200),
    IN p_title VARCHAR(300),
    IN p_description TEXT,
    IN p_venue_type ENUM('Face to face', 'Online'),
    IN p_venue VARCHAR(200),
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_status ENUM('Pending', 'Approved', 'Rejected', 'Archived'),
    IN p_type ENUM('Paid', 'Free'),
    IN p_is_open_to ENUM('Members only', 'Open to all', 'NU Students only'),
    IN p_fee INT,
    IN p_capacity INT,
    IN p_image TEXT
)
BEGIN
    -- Only allow SDAO (role_id = 4) to use this proc
    DECLARE v_role_id INT;
    SELECT role_id INTO v_role_id FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_role_id != 4 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO can create SDAO events';
    END IF;

    -- Check if event is within a blocked period
    IF EXISTS (
        SELECT 1 FROM tbl_blocked_period
        WHERE p_start_date <= end_date AND p_end_date >= start_date
    ) THEN
        -- Only SDAO can create events in blocked periods (already checked above)
        -- SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Events cannot be created during blocked periods';
        -- Add a dummy statement to avoid empty block
        SET @dummy := 1;
    END IF;

    INSERT INTO tbl_event (
        organization_id,
        cycle_number,
        event_type,
        user_id,
        title,
        description,
        image,
        venue_type,
        venue,
        start_date,
        end_date,
        start_time,
        end_time,
        status,
        type,
        is_open_to,
        fee,
        capacity,
        created_at
    ) VALUES (
        NULL, NULL, 'SDAO', p_user_id, p_title, p_description, p_image, p_venue_type, p_venue,
        p_start_date, p_end_date, p_start_time, p_end_time, 'Approved', p_type, p_is_open_to, p_fee, p_capacity, NOW()
    );

    SELECT * FROM tbl_event WHERE event_id = LAST_INSERT_ID();
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE IsDateBlocked(
    IN p_start_date DATE,
    IN p_end_date DATE
)
BEGIN
    SELECT * FROM tbl_blocked_period
    WHERE p_start_date <= end_date AND p_end_date >= start_date;
END$$
DELIMITER ;


DELIMITER $$
CREATE PROCEDURE CheckOrgRenewalStatus(
    IN p_org_id INT
)
BEGIN
    DECLARE v_org_version_id INT DEFAULT NULL;
    DECLARE v_latest_approved_period_id INT DEFAULT NULL;
    DECLARE v_latest_app_id INT DEFAULT NULL;
    DECLARE v_latest_app_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_latest_app_period_id INT DEFAULT NULL;
    DECLARE v_active_period_id INT DEFAULT NULL;
    DECLARE v_active_start DATETIME DEFAULT NULL;
    DECLARE v_active_end DATETIME DEFAULT NULL;

    -- Labels so we can exit early
    renewal_proc: BEGIN

        -- 1) get current_org_version_id from tbl_organization
        SELECT current_org_version_id
        INTO v_org_version_id
        FROM tbl_organization
        WHERE organization_id = p_org_id
        LIMIT 1;

        -- If org or current version not found -> return simple result
        IF v_org_version_id IS NULL THEN
            SELECT JSON_OBJECT(
                'organization_id', p_org_id,
                'current_org_version_id', NULL,
                'active_period_found', FALSE,
                'show_renewal', FALSE,
                'pending_application', FALSE,
                'already_renewed', FALSE,
                'reason', 'no_current_version'
            ) AS result;
            LEAVE renewal_proc;
        END IF;

        -- 2) find most recent Approved application period for this org_version (if any)
        SELECT a.period_id
        INTO v_latest_approved_period_id
        FROM tbl_application a
        WHERE a.org_version_id = v_org_version_id
          AND a.status = 'Approved'
        ORDER BY a.created_at DESC
        LIMIT 1;

        -- 3) find the latest application record for this org_version (most recent submission/resubmission)
        SELECT a.application_id, a.status, a.period_id
        INTO v_latest_app_id, v_latest_app_status, v_latest_app_period_id
        FROM tbl_application a
        WHERE a.org_version_id = v_org_version_id
        ORDER BY a.created_at DESC
        LIMIT 1;

        -- 4) find the currently active application period, if any (single active)
        SELECT ap.period_id,
               CONCAT(ap.start_date, ' ', ap.start_time),
               CONCAT(ap.end_date, ' ', ap.end_time)
        INTO v_active_period_id, v_active_start, v_active_end
        FROM tbl_application_period ap
        WHERE ap.is_active = 1
          AND NOW() BETWEEN CONCAT(ap.start_date, ' ', ap.start_time)
                       AND CONCAT(ap.end_date, ' ', ap.end_time)
        LIMIT 1;

        -- 5) Decision logic
        IF v_active_period_id IS NULL THEN
            -- no active application period -> no renewal action
            SELECT JSON_OBJECT(
                'organization_id', p_org_id,
                'current_org_version_id', v_org_version_id,
                'active_period_found', FALSE,
                'active_period_id', NULL,
                'latest_approved_period_id', v_latest_approved_period_id,
                'latest_application_id', v_latest_app_id,
                'latest_application_status', v_latest_app_status,
                'latest_application_period_id', v_latest_app_period_id,
                'show_renewal', FALSE,
                'pending_application', FALSE,
                'already_renewed', (v_latest_approved_period_id IS NOT NULL)
            ) AS result;
            LEAVE renewal_proc;
        END IF;

        -- If active period exists, apply rules in priority order:
        --  A) If there exists a Pending application for this version in the active period -> pending_application
        IF v_latest_app_period_id IS NOT NULL AND v_latest_app_period_id = v_active_period_id
           AND v_latest_app_status = 'Pending' THEN
            SELECT JSON_OBJECT(
                'organization_id', p_org_id,
                'current_org_version_id', v_org_version_id,
                'active_period_found', TRUE,
                'active_period_id', v_active_period_id,
                'active_period_start', v_active_start,
                'active_period_end', v_active_end,
                'latest_approved_period_id', v_latest_approved_period_id,
                'latest_application_id', v_latest_app_id,
                'latest_application_status', v_latest_app_status,
                'latest_application_period_id', v_latest_app_period_id,
                'show_renewal', FALSE,
                'pending_application', TRUE,
                'already_renewed', (v_latest_approved_period_id = v_active_period_id)
            ) AS result;
            LEAVE renewal_proc;
        END IF;

        -- B) If the (most recent) Approved application's period matches the active period -> already renewed
        IF v_latest_approved_period_id IS NOT NULL AND v_latest_approved_period_id = v_active_period_id THEN
            SELECT JSON_OBJECT(
                'organization_id', p_org_id,
                'current_org_version_id', v_org_version_id,
                'active_period_found', TRUE,
                'active_period_id', v_active_period_id,
                'active_period_start', v_active_start,
                'active_period_end', v_active_end,
                'latest_approved_period_id', v_latest_approved_period_id,
                'latest_application_id', v_latest_app_id,
                'latest_application_status', v_latest_app_status,
                'latest_application_period_id', v_latest_app_period_id,
                'show_renewal', FALSE,
                'pending_application', FALSE,
                'already_renewed', TRUE
            ) AS result;
            LEAVE renewal_proc;
        END IF;

        -- C) Otherwise there is an active period and it does NOT match the approved period -> show renewal
        SELECT JSON_OBJECT(
            'organization_id', p_org_id,
            'current_org_version_id', v_org_version_id,
            'active_period_found', TRUE,
            'active_period_id', v_active_period_id,
            'active_period_start', v_active_start,
            'active_period_end', v_active_end,
            'latest_approved_period_id', v_latest_approved_period_id,
            'latest_application_id', v_latest_app_id,
            'latest_application_status', v_latest_app_status,
            'latest_application_period_id', v_latest_app_period_id,
            'show_renewal', TRUE,
            'pending_application', FALSE,
            'already_renewed', FALSE
        ) AS result;

    END renewal_proc;
END$$
DELIMITER ;

-- INDEXES

CREATE INDEX idx_org_members_user ON tbl_organization_members(user_id);
CREATE INDEX idx_event_program ON tbl_event_course(program_id);

CREATE INDEX idx_org_members ON tbl_organization_members(organization_id, user_id);
CREATE INDEX idx_committee_org ON tbl_committee(organization_id);
CREATE INDEX idx_committee_members_user ON tbl_committee_members(user_id);

CREATE INDEX idx_active_end_datetime 
ON tbl_application_period(is_active, end_date, end_time);

-- Additional procedure for post-event requirement checking
DELIMITER $$
DROP PROCEDURE IF EXISTS CheckAllPostEventRequirementsSubmitted$$
CREATE DEFINER='admin'@'%' PROCEDURE CheckAllPostEventRequirementsSubmitted(
    IN p_event_id INT
)
BEGIN
    DECLARE v_total_post_event_requirements INT DEFAULT 0;
    DECLARE v_submitted_post_event_requirements INT DEFAULT 0;
    
    -- Count total post-event requirements
    SELECT COUNT(*)
    INTO v_total_post_event_requirements
    FROM tbl_event_application_requirement
    WHERE is_applicable_to = 'post-event';
    
    -- Count submitted and approved post-event requirements for the event
    SELECT COUNT(DISTINCT ers.requirement_id)
    INTO v_submitted_post_event_requirements
    FROM tbl_event_requirement_submissions ers
    INNER JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    WHERE ers.event_id = p_event_id
      AND ear.is_applicable_to = 'post-event'
      AND ers.status = 'Approved';
    
    -- Return the comparison result
    SELECT 
        p_event_id as event_id,
        v_total_post_event_requirements as total_requirements,
        v_submitted_post_event_requirements as submitted_requirements,
        CASE 
            WHEN v_total_post_event_requirements = v_submitted_post_event_requirements THEN 1
            ELSE 0
        END as all_requirements_submitted;
END$$
DELIMITER ;

-- EVENTS

DELIMITER $$
CREATE DEFINER='admin'@'%' EVENT ev_disable_expired_periods
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
  UPDATE tbl_application_period
  SET is_active = 0
  WHERE is_active = 1
    AND 
      end_date < CURDATE();
END $$
DELIMITER ;

-- SAMPLE DATAS
INSERT INTO tbl_role(role_name, is_approver, hierarchy_order)
VALUES("Student",0,null), 
("Adviser",1,1),
("Program Chair",1,2),
("SDAO",1,5),
("Dean",1,3),
("Academic Director",1,4);

INSERT INTO tbl_permission(permission_name, scope)
VALUES("CREATE_EVENT","Organization"),
("UPDATE_EVENT","Organization"),
("DELETE_EVENT","Organization"),
("VIEW_EVENT","Organization"),
("REGISTER_EVENT","Organization"),
("APPLY_ORGANIZATION","Organization"),
("APPROVE_ORGANIZATION","Approver"),
("ARCHIVE_ORGANIZATION","SDAO"),
("VIEW_ORGANIZATION","Global"),
("MANAGE_ACCOUNT","SDAO"),
("CREATE_COMMITTEE","Organization"),
("UPDATE_COMMITTEE","Organization"),
("DELETE_COMMITTEE","Organization"),
("VIEW_COMMITTEE","Organization"),
("MANAGE_REQUIREMENTS","SDAO"),
("VIEW_APPLICATION","Approver"),
("MANAGE_APPLICATIONS","SDAO"),
("CREATE_EVALUATION","Organization"), 
("UPDATE_EVALUATION","Organization"),
("DELETE_EVALUATION","Organization"),
("VIEW_EVALUATION","Organization"),
("VIEW_LOGS","SDAO"),
("WEB_ACCESS","Global"),
("MANAGE_REGISTRATION","SDAO"),
("SUBMIT_REQUIREMENTS","Global"),
("MANAGE_PROGRAMS","SDAO"),
("CREATE_SDAO_EVENT","SDAO"),
("APPLY_NEW_ORGANIZATION","Global"),
("APPLY_RENEWAL_ORGANIZATION","Organization"),
("VIEW_TRANSACTIONS","Global"),
("MANAGE_TRANSACTIONS","Global");

INSERT INTO tbl_role_permission (role_id, permission_id) 
VALUES
(4,2),
(4,3),
(4,4),
(4,8),
(4,9),
(4,10),
(4,11),
(4,12),
(4,13),
(4,14),
(4,15),
(4,17),
(4,19),
(4,21),
(4,22),
(4,23),
(4,24),
(4,25),
(4,26),
(4,27),
(4,30),
(4,31),
(2,6),
(2,9),
(2,16),
(2,17),
(2,23),
(2,28),
(3,17),
(4,17),
(5,17),
(6,17),
(3,23),
(5,23),
(6,23),
(3,9),
(5,9),
(6,9),
(3,16),
(5,16),
(6,16),
(3,4),
(2,4),
(5,4),
(6,4);

INSERT INTO tbl_college (name, abbreviation) VALUES 
("School of Arts, Sciences, and Education", "SASE"),
("School of Business, Management, and Accountancy", "SBMA"),
("School of Engineering, Computing and Architecture", "SECA");

INSERT INTO tbl_program (college_id, name, abbreviation) VALUES 
(1,"Bachelor of Science in Physical Education", "BPEd"),
(1,"Bachelor of Arts in Communication", "ABComm"),
(1,"Bachelor of Science in Psychology", "BSPSY"),
(2,"Bachelor of Science in Hospitality Management", "BSHM"),
(2,"Bachelor of Science in Business Administration major in Human Resource Management", "BSBA-HRM"),
(2,"Master of Management", "MM"),
(2,"Bachelor of Science in Business Administration major in Financial Managemen", "BSBA-FinMgt"),
(2,"Bachelor of Science in Business Administration major in Marketing Management", "BSBA-MktgMgt"),
(2,"Bachelor of Science in Tourism Management", "BSTM"),
(2,"Bachelor of Science in Accountancy", "BSAccountancy"),
(2,"Bachelor of Science in Management Accounting", "BSMA"),
(3,"Bachelor of Science in Computer Engineering", "BSCpE"),
(3,"Bachelor of Science in Information Technology with a specialization in Mobile and Web Applications", "BSIT-MWA"),
(3,"Bachelor of Science in Civil Engineering", "BSCE"),
(3,"Bachelor of Science in Architecture", "BSArch"),
(3,"Bachelor of Science in Computer Science with specialization in Machine Learning", "BSCS-ML");

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id) VALUES
-- ('_ExbgMDtE-90mt0wLlA74VFYH5I1freBLw4NMY9RcBU', ' Geraldine', 'Aris', 'arisgc@students.nu-dasma.edu.ph', '1', '2'),
('6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0', 'Benson', 'Javier', 'javierbb@students.nu-dasma.edu.ph', NULL, '4'),
('cyQuRJT6GaT0Y89NFQua6nMhFJF6E-SAIk_rpryVY1k', ' Carl Roehl', 'Falcon', 'falconcs@students.nu-dasma.edu.ph', NULL, '6'),
('dumalagim@students.nu-dasma.edu.ph', 'Iver', 'Dumalag', 'dumalagim@students.nu-dasma.edu.ph', '1', '1'),
('LBmQ-WzvRhVmb55Ucidrc14aL39ae9Ei-7xfbOrPeEA', ' Samantha Joy', 'Madrunio', 'madruniosm@students.nu-dasma.edu.ph', '13', '2'),
('NqBfAZcMXHZF5g9ztwkQ1ykPgtNmZwYRcIPKKK40ROc', ' Alister Dylan Emmanuel', 'Realo', 'realoam@students.nu-dasma.edu.ph', '13', '1'),
('ochavillorc@students.nu-dasma.edu.ph', 'Red ', 'Ochavillo', 'ochavillorc@students.nu-dasma.edu.ph', '13', '1'),
('CyTLmjW4Edhvk2WvWFDNuWLYjW0WJETBPbY2HWk-ZqE', ' Loraine', 'Miraballes', 'miraballesl@students.nu-dasma.edu.ph', NULL, '1'),
('CY4e1GmCXysMRn8VYudhqDy7CDJ8xVidGO1v8RnRj1E', ' Shamiah M', 'Mendoza', 'mendozasm@students.nu-dasma.edu.ph', '13', '3');


-- INSERT INTO tbl_application_requirement (requirement_name, is_applicable_to, file_path, created_by) VALUES
-- ('Letter of Intent', 'new', 'requirement-1748793177547-Letter-of-Intent.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('Student Org Application Form', 'new', 'requirement-1748793205361-ACO-SA-F-002Student-Org-Application-Form.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('By Laws of the Organization', 'new', 'requirement-1748793242309-Constitution-and-ByLaws.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('List of Officers/Founders', 'new', 'requirement-1748793302932-List-of-Officers-and-Founders.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('Letter from the College Dean', 'new', 'requirement-1748793328989-Letter-from-the-College-Dean.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('List of Members', 'new', 'requirement-1748793346203-List-of-Members.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('Latest Certificate of Grades of Officers', 'new', 'requirement-1748793368006-Latest-Certificate-of-Grades-of-Officers.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('Biodata/CV of Officers', 'new', 'requirement-1748793390349-CV-of-Officers.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0'),
-- ('List of Proposed Projects with Proposed Budget for the AY', 'new', 'requirement-1748793408714-List-of-Proposed-Project-with-Proposed-Budget.pdf', '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0');


INSERT INTO tbl_executive_rank (rank_level, default_title, description) VALUES
(1, 'President', 'Highest authority with full permissions'),
(2, 'Vice President Internal', 'Handles internal organizational matters'),
(3, 'Vice President External', 'Handles external partnerships and representation'),
(4, 'Secretary', 'Administrative lead'),
(5, 'Treasurer', 'Financial manager'),
(6, 'Auditor', 'Responsible for auditing and financial oversight'),
(7, 'Public Information Officer', 'Handles publicity and information dissemination'),
(8, 'Officer', 'General executive member');

-- Insert evaluation question groups
INSERT INTO tbl_evaluation_question_group (group_title, group_description, is_active)
VALUES 
('Activity: Meeting/Seminar/Conference/Workshop/Quiz Bee/Competition/Sport fest, etc.', 'Question about activities', TRUE),
('About the Speaker/Resource person', 'Feedback about event speakers/presenters', TRUE),
('Meals', 'Feedback about meals', TRUE),
('Handouts', 'Feedback about handouts', TRUE),
('Transportation', 'Feedback about transportation', TRUE),
('Comments and Suggestions', 'Feedback about the whole event', TRUE);

-- Insert evaluation questions
INSERT INTO tbl_evaluation_question (question_text, question_type, group_id, is_required)
VALUES
('Is the activity relevant/important to you?', 'likert_4', 1, TRUE),
('Is the program relevant to the course/you’re in?', 'likert_4', 1, TRUE),
('Were the objectives clear and communicated before the activity?', 'likert_4', 1, TRUE),
('Were the objectives met by the activity?', 'likert_4', 1, TRUE),
('Was the venue proper for this kind of activity?', 'likert_4', 1, TRUE),
('Did the activity start and end on time?', 'likert_4', 1, TRUE),
('Did the organizers maintain an orderly environment all throughout the activity?', 'likert_4', 1, TRUE),
('Was the event/activity well-advertised/properly announce?', 'likert_4', 1, TRUE),
('Would you recommend this activity to your classmates/friends?', 'likert_4', 1, TRUE),
('Do you want an activity like this to happen more often?', 'likert_4', 1, TRUE),
('Overall evaluation', 'likert_4', 1, TRUE),
('Was the speaker well-prepared and knowledgeable on the topic?', 'likert_4', 2, TRUE),
('Did the speaker use different and appropriate methods in delivering the topic?', 'likert_4', 2, TRUE),
('Was the speaker able to connect with the audience and catch their attention?', 'likert_4', 2, TRUE),
('Were the meals/snacks provided enough to fill you?', 'likert_4', 3, TRUE),
('Did the meals/snacks have a pleasant taste?', 'likert_4', 3, TRUE),
('Are the handouts provided useful?', 'likert_4', 4, TRUE),
('Is the printing of the handouts clear?', 'likert_4', 4, TRUE),
('Did you feel safe during the travel to the venue?', 'likert_4', 5, TRUE),
('Did you feel that the transportation provided is in good running condition?', 'likert_4', 5, TRUE),
('Did you feel safe with the driver’s skills?', 'likert_4', 5, TRUE),
('What important knowledge or information did you gain from this activity?', 'textbox', 6, TRUE),
('What did you like most about the activity?', 'textbox', 6, TRUE),
('What did you like least about the activity?', 'textbox', 6, TRUE),
('Any other comments/suggestions for further improvement the activity?', 'textbox', 6, TRUE);


INSERT INTO tbl_rank_permission(rank_id, permission_id) VALUES
(1,1),
(1,9),
(1,16),
(1,11),
(1,12),
(1,13),
(1,14),
(1,23),
(1,4),
(1,25),
(1,17),
(1,19),
(1,20),
(1,21);

INSERT INTO tbl_transaction_type (code, label) VALUES
  ('INCOME','Income'),
  ('EXPENSE','Expense')
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO tbl_payment_type (code, label, category) VALUES
('CH', 'Cash', 'Cash'),
('CD', 'Credit/Debit Card', 'Card'),
('BT', 'Bank Transfer', 'Bank'),
('GC', 'GCash', 'E-Wallet'),
('MY', 'Maya', 'E-Wallet'),
('PP', 'PayPal', 'Online');

INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    (SELECT user_id FROM tbl_user WHERE email='javierbb@students.nu-dasma.edu.ph'),
    NULL,
    NULL,
    'Membership Fee Payment',
    500.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='INCOME'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='GC'),
    'Pending',
    CURDATE(),
    'RCPT-GC-0001',
    'proofs/membership_fee_gc_0001.png'
);

-- Income: Event Registration (user payer)
INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    (SELECT user_id FROM tbl_user WHERE email='falconcs@students.nu-dasma.edu.ph'),
    NULL,
    NULL,
    'Event Registration',
    150.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='INCOME'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='CH'),
    'Completed',
    CURDATE(),
    'RCPT-CH-0002',
    NULL
);

-- Income: Anonymous Sponsorship (external payer)
INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    NULL,
    'External Sponsor Corp',
    NULL,
    'Sponsorship Donation',
    2500.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='INCOME'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='BT'),
    'Completed',
    CURDATE(),
    'RCPT-BT-0003',
    'proofs/donation_bt_0003.jpg'
);

-- Income: Failed Merch Purchase (for status testing)
INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    (SELECT user_id FROM tbl_user WHERE email='mendozasm@students.nu-dasma.edu.ph'),
    NULL,
    NULL,
    'Merch Purchase',
    300.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='INCOME'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='CD'),
    'Failed',
    CURDATE(),
    'RCPT-CD-0004',
    NULL
);

-- Expense: Venue Rental (no receipt number for expense)
INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    (SELECT user_id FROM tbl_user WHERE email='arisgc@students.nu-dasma.edu.ph'),
    NULL,
    'ABC Convention Center',
    'Venue Rental for General Assembly',
    5000.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='EXPENSE'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='CH'),
    'Completed',
    CURDATE(),
    NULL,
    'proofs/expense_venue_ga.png'
);

-- Expense: Printing Supplies
INSERT INTO tbl_transaction (
    user_id, payer_name, payee_name, payment_description, amount,
    transaction_type_id, payment_type_id, status,
    transaction_date, receipt_no, proof_image
) VALUES (
    (SELECT user_id FROM tbl_user WHERE email='arisgc@students.nu-dasma.edu.ph'),
    NULL,
    'PrintWorks Stationers',
    'Flyers & IDs Printing',
    1200.00,
    (SELECT transaction_type_id FROM tbl_transaction_type WHERE code='EXPENSE'),
    (SELECT payment_type_id FROM tbl_payment_type WHERE code='GC'),
    'Pending',
    CURDATE(),
    NULL,
    NULL
);



