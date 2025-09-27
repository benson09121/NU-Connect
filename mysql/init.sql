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
    status ENUM('Active','Archived') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL
);

CREATE TABLE tbl_program(
    program_id INT PRIMARY KEY AUTO_INCREMENT,
    college_id INT NOT NULL,
    name VARCHAR(200) UNIQUE,
    abbreviation VARCHAR(20) UNIQUE,
    status ENUM('Active','Archived') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    CONSTRAINT fk_program_college
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
    FOREIGN KEY (role_id) REFERENCES tbl_role(role_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

ALTER TABLE tbl_college
  ADD CONSTRAINT fk_college_archived_by
  FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE;

ALTER TABLE tbl_program
  ADD CONSTRAINT fk_program_archived_by
  FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE; 

CREATE TABLE tbl_user_application (
    application_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    role_id INT NOT NULL,
    program_id INT NULL,
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
    term_option BOOLEAN DEFAULT NULL,
    is_open_to_all_courses BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    FOREIGN KEY (adviser_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TABLE tbl_organization_version (
    org_version_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NULL,
    name VARCHAR(255) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected', 'Archived') DEFAULT 'Pending',
    logo_path VARCHAR(500) NULL,
    description TEXT NULL,
    base_program_id INT NULL,
    membership_fee_type ENUM('Per Term', 'Whole Academic Year', 'Free') DEFAULT 'Free',
    category ENUM('Co-Curricular Organization','Extra Curricular Organization') DEFAULT 'Co-Curricular Organization',
    membership_fee_amount DECIMAL(10,2) NULL,
    is_recruiting BOOLEAN DEFAULT TRUE,
    is_open_to_all_courses BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_from DATE NULL,
    valid_to DATE NULL,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
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
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id)
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


CREATE TABLE tbl_committee_role (
    committee_role_id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    role_name ENUM('Committee Head', 'Committee Officer') DEFAULT 'Committee Officer',  -- e.g., 'Committee Head', 'Committee Member'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES tbl_committee(committee_id) ON DELETE CASCADE
);

ALTER TABLE tbl_committee_role 
ADD CONSTRAINT unique_committee_head 
    UNIQUE KEY (committee_id, role_name);


CREATE TABLE tbl_committee_members(
    committee_member_id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    committee_role_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES tbl_committee(committee_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (committee_role_id) REFERENCES tbl_committee_role(committee_role_id) ON DELETE SET NULL
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


CREATE TABLE tbl_blocked_period (
    blocked_period_id INT AUTO_INCREMENT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason VARCHAR(255) NOT NULL,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    unarchived_at TIMESTAMP NULL,
    unarchived_by VARCHAR(200) NULL,
    unarchived_reason VARCHAR(255) NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id),
    FOREIGN KEY (unarchived_by) REFERENCES tbl_user(user_id)
);

CREATE TABLE tbl_event_collaborator (
    event_id INT NOT NULL,
    organization_id INT NOT NULL,
    PRIMARY KEY (event_id, organization_id),
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE
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

-- Transaction Type Table
CREATE TABLE tbl_transaction_type (
    transaction_type_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,   -- e.g. 'INCOME', 'EXPENSE'
    label VARCHAR(100) NOT NULL         -- e.g. 'Income', 'Expense'
);

-- Payment Type Table
CREATE TABLE tbl_payment_type (
    payment_type_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL, 
    label VARCHAR(100) NOT NULL, 
    method_group VARCHAR(50) NOT NULL 
);

-- Financial Category Table
CREATE TABLE tbl_financial_category (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,   -- e.g., MEMBERSHIP, EVENT_FEE, SPONSORSHIP, DONATION, OFFICE_SUPPLIES
    label VARCHAR(100) NOT NULL,
    kind ENUM('INCOME','EXPENSE') NOT NULL,
    parent_category_id INT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (parent_category_id) REFERENCES tbl_financial_category(category_id) ON DELETE SET NULL
);

-- Transaction Type <-> Category Mapping Table
CREATE TABLE tbl_transaction_type_category (
    transaction_type_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (transaction_type_id, category_id),
    FOREIGN KEY (transaction_type_id) REFERENCES tbl_transaction_type(transaction_type_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES tbl_financial_category(category_id) ON DELETE CASCADE
);

-- Main Transaction Table
CREATE TABLE tbl_transaction (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(200) NULL,
    payer_name VARCHAR(255) NULL,
    payee_name VARCHAR(255) NULL,
    payment_description VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    transaction_type_id INT NOT NULL,
    payment_type_id INT NOT NULL,
    category_id INT NULL,
    org_version_id INT NULL,
    status ENUM('Pending', 'Completed', 'Failed', 'Cancelled') DEFAULT 'Pending',
    transaction_date DATETIME NOT NULL,
    receipt_no VARCHAR(100) NULL,
    proof_image VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    archived_by VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (payment_type_id) REFERENCES tbl_payment_type(payment_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (transaction_type_id) REFERENCES tbl_transaction_type(transaction_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (category_id) REFERENCES tbl_financial_category(category_id) ON DELETE SET NULL,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL,
    CONSTRAINT fk_txn_type_category
      FOREIGN KEY (transaction_type_id, category_id)
      REFERENCES tbl_transaction_type_category(transaction_type_id, category_id),
    INDEX idx_txn_org_version (org_version_id),
    INDEX idx_txn_org_version_date (org_version_id, transaction_date)
);

CREATE TABLE tbl_event_attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    transaction_id INT NULL,
    status ENUM('Pending', 'Registered', 'Evaluated', 'Attended', 'Rejected') NOT NULL,
    time_in DATETIME DEFAULT NULL,
    time_out DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE SET NULL,  -- Fixed: changed from tbl_event_transaction to tbl_transaction
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);


-- Membership Specialization Table
CREATE TABLE tbl_transaction_membership (
    transaction_id INT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, cycle_number) REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE RESTRICT
);

-- Event Specialization Table
CREATE TABLE tbl_transaction_event (
    transaction_id INT PRIMARY KEY,
    event_id INT NOT NULL,
    remarks VARCHAR(255) DEFAULT NULL,
    payer_name_override VARCHAR(255) NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE RESTRICT
);

CREATE TABLE tbl_receipt_sequence (
  series_key    VARCHAR(100) PRIMARY KEY,
  prefix        VARCHAR(50)  NOT NULL,
  pad_length    TINYINT      NOT NULL DEFAULT 6,
  current_value INT          NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE tbl_transaction
  ADD UNIQUE KEY uq_transaction_receipt_no (receipt_no);

CREATE TABLE tbl_ai_conversation (
  conversation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id VARCHAR(200) NOT NULL,                       -- who started/owns this chat
  title VARCHAR(255) NULL,
  system_prompt TEXT NULL,                               -- store custom instructions if any
  model VARCHAR(100) DEFAULT 'deepseek-chat',
  temperature DECIMAL(3,2) DEFAULT 0.7,
  top_p DECIMAL(3,2) DEFAULT 1.0,
  entity_type ENUM('general','user','organization','event','application','approval','system') DEFAULT 'general',
  entity_id INT NULL,
  summary LONGTEXT NULL,                                 -- rolling summary for long chats
  is_global BOOLEAN DEFAULT TRUE,
  last_summary_message_id BIGINT NULL,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
  INDEX idx_owner_updated (owner_id, updated_at DESC),
  INDEX idx_scope (entity_type, entity_id)
);

CREATE TABLE tbl_ai_message (
  message_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  role ENUM('system','user','assistant','tool') NOT NULL,
  user_id VARCHAR(200) NULL,                              -- set for role='user'
  content LONGTEXT NOT NULL,
  model VARCHAR(100) NULL,                                -- set for assistant messages
  context_organizations JSON COMMENT 'Organizations referenced in this message',
  message_scope ENUM('current_view', 'multi_org', 'global') DEFAULT 'current_view',
  meta JSON NULL,                                         -- tool_calls, function args, etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES tbl_ai_conversation(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
  INDEX idx_conv_time (conversation_id, created_at),
  INDEX idx_conv_msg (conversation_id, message_id),
  INDEX idx_message_scope (conversation_id, message_scope)
);

CREATE TABLE tbl_member_permission_override (
    override_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL, -- from tbl_organization_members
    permission_id INT NOT NULL,
    is_allowed BOOLEAN NOT NULL, -- TRUE = force allow, FALSE = force deny
    FOREIGN KEY (member_id) REFERENCES tbl_organization_members(member_id),
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id)
);


CREATE TABLE tbl_membership_leave_application (
    leave_application_id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number INT NOT NULL,
    user_id VARCHAR(200) NOT NULL,
    leave_reason TEXT NOT NULL,
    effective_date DATE NULL, -- When they want to leave
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(200) NULL,
    reviewed_at TIMESTAMP NULL,
    remarks TEXT NULL,
    FOREIGN KEY (organization_id, cycle_number) 
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id),
    FOREIGN KEY (reviewed_by) REFERENCES tbl_user(user_id)
);

-- TRIGGERS


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

DELIMITER $$

/* ---- Block creating a Program under an archived College ---- */
CREATE TRIGGER trg_program_before_insert
BEFORE INSERT ON tbl_program
FOR EACH ROW
BEGIN
    IF (SELECT status FROM tbl_college WHERE college_id = NEW.college_id) = 'Archived' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot create program under an archived college';
    END IF;
END$$

/* ---- Block re-pointing a Program to an archived College ---- */
CREATE TRIGGER trg_program_before_update
BEFORE UPDATE ON tbl_program
FOR EACH ROW
BEGIN
    IF NEW.college_id <> OLD.college_id THEN
        IF (SELECT status FROM tbl_college WHERE college_id = NEW.college_id) = 'Archived' THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Cannot move program into an archived college';
        END IF;
    END IF;
END$$

/* ---- Block adding org members to archived orgs (requires tbl_organization_members) ---- */
CREATE TRIGGER trg_org_members_before_insert
BEFORE INSERT ON tbl_organization_members
FOR EACH ROW
BEGIN
    IF (SELECT status FROM tbl_organization WHERE organization_id = NEW.organization_id) = 'Archived' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot add members to an archived organization';
    END IF;
END$$


/* ---- Block new org versions for archived orgs ---- */
CREATE TRIGGER trg_org_version_before_insert
BEFORE INSERT ON tbl_organization_version
FOR EACH ROW
BEGIN
    IF NEW.organization_id IS NOT NULL AND
       (SELECT status FROM tbl_organization WHERE organization_id = NEW.organization_id) = 'Archived'
    THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Cannot create a new organization version for an archived organization';
    END IF;
END$$

/* (Optional sanity) Block creating an org directly as Archived */
CREATE TRIGGER trg_org_before_insert
BEFORE INSERT ON tbl_organization
FOR EACH ROW
BEGIN
    IF NEW.status = 'Archived' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'New organizations cannot be created already archived';
    END IF;
END$$
DELIMITER ;

-- PROCEDURES
use db_nuconnect;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE _RaiseDupKey(IN p_msg TEXT)
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = p_msg;
END$$
DELIMITER ;

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
    DECLARE v_error_message TEXT;
    
    -- Look up user by email
    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    
    -- If system email and user not found, use the system user ID directly
    IF v_user_id IS NULL AND p_user_email = 'system@nu-dasma.edu.ph' THEN
        SET v_user_id = 'sys-system';
    END IF;
    
    -- Final check - if still no user found, signal error
    IF v_user_id IS NULL THEN
        SET v_error_message = CONCAT('User email not found for logging: ', COALESCE(p_user_email, 'NULL'));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_error_message;
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
CREATE DEFINER='admin'@'%' PROCEDURE GetAllEventsByOrganizations(
    IN p_orgs JSON
)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE v_len INT DEFAULT 0;
    DECLARE v_org_id INT;

    -- Normalize input
    IF p_orgs IS NULL OR JSON_TYPE(p_orgs) <> 'ARRAY' THEN
        SET p_orgs = JSON_ARRAY();
    END IF;

    -- Temp table for org IDs
    DROP TEMPORARY TABLE IF EXISTS tmp_orgs;
    CREATE TEMPORARY TABLE tmp_orgs (
        organization_id INT PRIMARY KEY
    ) ENGINE=Memory;

    -- Populate org IDs from JSON array
    SET v_len = JSON_LENGTH(p_orgs);
    WHILE i < v_len DO
        SET v_org_id = CAST(
            JSON_UNQUOTE(JSON_EXTRACT(p_orgs, CONCAT('$[', i, '].organization_id')))
            AS UNSIGNED
        );
        IF v_org_id IS NOT NULL THEN
            INSERT IGNORE INTO tmp_orgs (organization_id) VALUES (v_org_id);
        END IF;
        SET i = i + 1;
    END WHILE;

    -- Return merged list
    SELECT
        e.event_id,
        e.title,
        e.user_id AS organizer_id,
        o.name AS organization_name,
        e.organization_id,
        o.logo AS organization_logo,
        rc.org_version_id AS organization_version_id,
        e.description,
        e.venue,
        e.image,
        e.start_time,
        e.end_time,
        DATE_FORMAT(e.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(e.end_date, '%Y-%m-%d') AS end_date,
        e.created_at,
        e.status,
        e.type,
        e.is_open_to AS access_type,
        COALESCE(e.fee, 0) AS event_fee,
        e.capacity,
        CASE 
            WHEN TIMESTAMP(e.end_date, e.end_time) < CURRENT_TIMESTAMP THEN 'Ended'
            ELSE 'Upcoming'
        END AS event_status,
        e.certificate AS certificate_available,
        CASE 
            WHEN e.event_type = 'SDAO' THEN 1
            ELSE 0
        END AS is_sdao_event
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
        AND e.cycle_number = rc.cycle_number
    WHERE e.status = 'Approved'
      AND (
           e.is_open_to IN ('Open to all', 'NU Students only')
        OR EXISTS (SELECT 1 FROM tmp_orgs t WHERE t.organization_id = e.organization_id)
      )
    ORDER BY 
        CASE WHEN TIMESTAMP(e.end_date, e.end_time) < CURRENT_TIMESTAMP THEN 1 ELSE 0 END,
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
CREATE DEFINER='admin'@'%' PROCEDURE CreatePendingMobileUser(
    IN p_email VARCHAR(100),
    IN p_program_id INT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_role_id INT DEFAULT 1; -- Assuming 1 is student role, adjust as needed
    
    -- Generate UUID for user_id
    SET v_user_id = UUID();
    
    -- Check if email already exists
    IF EXISTS (SELECT 1 FROM tbl_user WHERE email = p_email) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email already exists';
    END IF;
    
    -- Insert pending user
    INSERT INTO tbl_user (
        user_id,
        email,
        program_id,
        role_id,
        status
    ) VALUES (
        v_user_id,
        p_email,
        p_program_id,
        v_role_id,
        'Pending'
    );
    
    -- Return the created user information
    SELECT 
        user_id,
        email,
        program_id,
        role_id,
        status,         
        created_at
    FROM tbl_user 
    WHERE user_id = v_user_id;
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
c.logo as organization_logo,
c.term_option,
a.organization_id,
rc.org_version_id as organization_version_id,
a.venue_type,
a.venue, 
a.start_time, 
a.end_time, 
a.status, 
a.type, 
DATE_FORMAT(a.start_date, '%Y-%m-%d') AS start_date,
DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date,
a.event_type,
a.is_open_to,
a.fee,
a.capacity,
a.image,
a.created_at,
ees.start_date as evaluation_start_date,
ees.end_date as evaluation_end_date,
ees.start_time as evaluation_start_time,
ees.end_time as evaluation_end_time,
COALESCE(b.status, "Not Registered") as student_status,
-- Transaction information for paid events
b.transaction_id,
t.amount as paid_amount,
t.status as payment_status,
t.receipt_no,
t.proof_image,
t.created_at as payment_date,
te.payer_name_override,
te.remarks as payment_remarks,
-- Certificate template information
ct.template_path as certificate,
-- Eligibility check
CASE 
    WHEN a.is_open_to = 'Open to all' THEN TRUE
    WHEN a.is_open_to = 'NU Students only' THEN TRUE
    WHEN a.is_open_to = 'Members only' AND om.member_id IS NOT NULL THEN TRUE
    ELSE FALSE
END as is_eligible,
-- Check if user has paid for current term (for Per Term organizations)
CASE 
    WHEN c.membership_fee_type = 'Per Term' THEN
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM tbl_term_payments tp
                JOIN tbl_academic_term at ON tp.term_id = at.term_id
                WHERE tp.user_id = userId 
                AND tp.organization_id = a.organization_id
                AND tp.organization_version_id = rc.org_version_id
                AND tp.payment_status IN ('Pending', 'Approved')
                AND DATE(NOW()) BETWEEN at.start_date AND at.end_date
            ) THEN TRUE
            ELSE FALSE
        END
    WHEN c.membership_fee_type = 'Free' THEN TRUE
    ELSE TRUE  -- For other fee types, assume paid
END as is_paid_on_term,
-- Check if user can join event even if not paid (based on term_option)
CASE 
    WHEN c.membership_fee_type = 'Per Term' THEN
        CASE 
            WHEN c.term_option = 1 THEN TRUE  -- Allow unpaid members to join
            WHEN c.term_option = 0 THEN FALSE -- Don't allow unpaid members to join
            ELSE TRUE  -- If NULL, default to allow (backward compatibility)
        END
    ELSE TRUE  -- For non-Per Term organizations, always allow
END as can_join_if_unpaid
FROM tbl_event a
LEFT JOIN tbl_event_attendance b ON a.event_id = b.event_id AND b.user_id = userId AND b.deleted_at IS NULL
LEFT JOIN tbl_organization c ON a.organization_id = c.organization_id
LEFT JOIN tbl_renewal_cycle rc ON a.organization_id = rc.organization_id 
    AND a.cycle_number = rc.cycle_number
LEFT JOIN tbl_event_evaluation_settings ees ON a.event_id = ees.event_id
-- Join transaction directly from event_attendance.transaction_id
LEFT JOIN tbl_transaction t ON b.transaction_id = t.transaction_id
-- Get additional transaction event details
LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
-- Join certificate template information
LEFT JOIN tbl_certificate_template ct ON a.event_id = ct.event_id
-- Join organization membership to check eligibility
LEFT JOIN tbl_organization_members om ON a.organization_id = om.organization_id 
    AND a.cycle_number = om.cycle_number 
    AND om.user_id = userId
WHERE a.event_id = eventId;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateEventTransaction(
    IN p_user_email VARCHAR(200),
    IN p_payer_name VARCHAR(200),
    IN p_amount DECIMAL(10,2),
    IN p_payment_type_code VARCHAR(50),
    IN p_proof_image VARCHAR(255),
    IN p_event_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT
)
BEGIN
    DECLARE v_transaction_id INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_series_key VARCHAR(100);
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_pad_len TINYINT DEFAULT 6;
    DECLARE v_type_char CHAR(1);
    DECLARE v_org_token VARCHAR(16);
    DECLARE v_yyyymm CHAR(6);
    DECLARE v_organization_name VARCHAR(255);

    -- Get user_id from email
    SELECT user_id INTO v_user_id
    FROM tbl_user 
    WHERE email = p_user_email;
    
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;

    SELECT name into v_organization_name
    FROM tbl_organization
    WHERE organization_id = p_organization_id;
    
    -- Get transaction type ID for INCOME (event payments are income)
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type 
    WHERE code = 'INCOME' LIMIT 1;
    IF v_transaction_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Income transaction type not found'; 
    END IF;
    
    -- Get payment type ID
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type 
    WHERE code = p_payment_type_code LIMIT 1;
    IF v_payment_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment type not found'; 
    END IF;
    
    -- Get category ID for Event Fees - first try to find existing category
    SELECT category_id INTO v_category_id 
    FROM tbl_financial_category 
    WHERE code = 'EVENT_FEE' 
      AND active = TRUE 
    LIMIT 1;
    
    -- If specific event category not found, try any income category
    IF v_category_id IS NULL THEN
        SELECT category_id INTO v_category_id 
        FROM tbl_financial_category 
        WHERE kind = 'INCOME' 
          AND active = TRUE 
        LIMIT 1;
    END IF;
    
    -- If still no category found, create the event fees category
    IF v_category_id IS NULL THEN
        INSERT INTO tbl_financial_category (code, label, kind, active) 
        VALUES ('EVENT_FEE', 'Event Fee', 'INCOME', TRUE);
        
        SET v_category_id = LAST_INSERT_ID();
        
        -- Link the new category to the INCOME transaction type
        INSERT IGNORE INTO tbl_transaction_type_category (transaction_type_id, category_id)
        VALUES (v_transaction_type_id, v_category_id);
    END IF;
    
    -- Generate receipt number
    SET v_type_char = 'I'; -- Income
    SET v_yyyymm = DATE_FORMAT(NOW(), '%Y%m');
    SET v_org_token = CONCAT('EVT', LPAD(p_event_id, 4, '0'));
    SET v_prefix = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
    SET v_series_key = v_prefix;
    CALL NextReceiptNo(v_series_key, v_prefix, v_pad_len, v_receipt_no);
    
    -- Insert transaction record
    INSERT INTO tbl_transaction (
        user_id,
        payer_name,
        payee_name,
        payment_description,
        amount,
        transaction_type_id,
        payment_type_id,
        category_id,
        org_version_id,
        status,
        transaction_date,
        receipt_no,
        proof_image
    ) VALUES (
        v_user_id,
        p_payer_name,
        v_organization_name,
        'Event Registration Fee',
        p_amount,
        v_transaction_type_id,
        v_payment_type_id,
        v_category_id,
        p_organization_version_id,
        'Pending',
        NOW(),
        v_receipt_no,
        p_proof_image
    );
    
    SET v_transaction_id = LAST_INSERT_ID();
    
    -- Insert event transaction link (REMOVED created_at column)
    INSERT INTO tbl_transaction_event (
        transaction_id,
        event_id,
        payer_name_override,
        remarks
    ) VALUES (
        v_transaction_id,
        p_event_id,
        p_payer_name,
        'Event payment transaction'
    );
    
    -- Log the action
    CALL LogAction(
        p_user_email,
        'Successfully created event payment transaction',
        'Event Payment',
        JSON_OBJECT(
            'transaction_id', v_transaction_id,
            'amount', p_amount,
            'event_id', p_event_id,
            'organization_id', p_organization_id,
            'organization_version_id', p_organization_version_id,
            'receipt_no', v_receipt_no
        ),
        NULL,
        p_proof_image
    );
    
    -- Return the created transaction using existing GetTransaction procedure
    CALL GetTransaction(v_transaction_id);
    
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOneEventAttendeesWithDetails(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200)
)
BEGIN
    SELECT
        ea.attendance_id as id,
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
        tt.label AS transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_user u ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id 
    LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id AND ea.user_id = t.user_id
    LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    WHERE ea.event_id = p_event_id AND u.user_id = p_user_id;
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
    WHERE a.status IN ("Registered", "Evaluated", "Attended") 
      AND a.event_id = eventId;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateEvent(
    IN p_user_id VARCHAR(200),
    IN p_title VARCHAR(300),
    IN p_description TEXT,
    IN p_venue_type ENUM('Face to face', 'Online'),
    IN p_venue VARCHAR(200),
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_organization_id INT,
    IN p_cycle_number INT,
    IN p_event_type ENUM('Organization', 'SDAO', 'System'),
    IN p_status ENUM('Pending', 'Approved', 'Rejected', 'Archived'),
    IN p_type ENUM('Paid', 'Free'),
    IN p_is_open_to ENUM('Members only', 'Open to all', 'NU Students only'),
    IN p_fee INT,
    IN p_capacity INT,
    IN p_image TEXT,
    IN p_collaborators JSON -- << NEW PARAMETER
)
BEGIN
    DECLARE v_base_program_id INT;
    DECLARE v_event_id INT;
    DECLARE v_role_id INT;
    DECLARE v_user_email VARCHAR(100);
    DECLARE v_all_emails JSON;
    DECLARE i INT DEFAULT 0;
    DECLARE v_collab_count INT DEFAULT 0;
    DECLARE v_collab_org_id INT;

    -- Get role and email of user
    SELECT role_id, email INTO v_role_id, v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;

    -- Enhanced blocked period check: Check for unarchived blocked periods
    IF EXISTS (
        SELECT 1 FROM tbl_blocked_period
        WHERE p_start_date BETWEEN start_date AND end_date
        AND archived_at IS NULL  -- Only check active (unarchived) blocked periods
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Events cannot be created during blocked periods';
    END IF;
    
    -- SDAO role check
    IF p_event_type = 'SDAO' AND v_role_id != 4 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO can create SDAO events';
    END IF;
    
    -- Venue and time conflict validation for ALL events (not just face-to-face with venues)
    -- For face-to-face events with venues, check venue conflicts
    IF p_venue_type = 'Face to face' AND p_venue IS NOT NULL AND TRIM(p_venue) != '' THEN
        IF EXISTS (
            SELECT 1 FROM tbl_event e
            WHERE e.venue = p_venue
            AND e.start_date = p_start_date
            AND e.status NOT IN ('Rejected', 'Archived')
            AND (
                -- Time overlap logic: events conflict if they overlap in time
                (e.start_time <= p_start_time AND e.end_time > p_start_time) OR  -- Existing event starts before and ends after our start
                (e.start_time < p_end_time AND e.end_time >= p_end_time) OR      -- Existing event starts before and ends after our end  
                (e.start_time >= p_start_time AND e.end_time <= p_end_time)      -- Existing event is completely within our time
            )
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Schedule conflict: Another event is already scheduled at the same venue during this time';
        END IF;
    END IF;
    
    -- Duplicate title check - Apply to both Organization and SDAO events
    IF p_event_type = 'Organization' AND EXISTS (
        SELECT 1 FROM tbl_event e
        WHERE e.title = p_title
        AND e.organization_id = p_organization_id
        AND e.cycle_number = p_cycle_number
        AND e.status NOT IN ('Rejected', 'Archived')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An event with the same title already exists for this organization';
    ELSEIF p_event_type = 'SDAO' AND EXISTS (
        SELECT 1 FROM tbl_event e
        WHERE e.title = p_title
        AND e.event_type = 'SDAO'
        AND e.status NOT IN ('Rejected', 'Archived')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An SDAO event with the same title already exists';
    END IF;

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
        CASE WHEN p_event_type = 'Organization' THEN p_organization_id ELSE NULL END,
        CASE WHEN p_event_type = 'Organization' THEN p_cycle_number ELSE NULL END,
        p_event_type,
        p_user_id,
        p_title,
        p_description,
        p_image,
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
        p_capacity,
        NOW()
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

    -- Add event collaborators if provided
    IF p_collaborators IS NOT NULL AND JSON_LENGTH(p_collaborators) > 0 THEN
        SET v_collab_count = JSON_LENGTH(p_collaborators);
        SET i = 0;
        WHILE i < v_collab_count DO
            SET v_collab_org_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_collaborators, CONCAT('$[', i, ']'))) AS UNSIGNED);
            IF v_collab_org_id IS NOT NULL THEN
                INSERT IGNORE INTO tbl_event_collaborator (event_id, organization_id)
                VALUES (v_event_id, v_collab_org_id);
            END IF;
            SET i = i + 1;
        END WHILE;
    END IF;

    -- Get all active user emails for notification (for SDAO events)
    IF p_event_type = 'SDAO' THEN
        SELECT JSON_ARRAYAGG(email) INTO v_all_emails FROM tbl_user WHERE status = 'Active';

        -- Log the action
        CALL LogAction(
            v_user_email,
            CONCAT('Created new SDAO event: ', p_title),
            'Event Management',
            JSON_OBJECT(
                'event_id', v_event_id,
                'title', p_title,
                'start_date', p_start_date,
                'end_date', p_end_date
            ),
            CONCAT('/events/', v_event_id),
            NULL
        );

        -- Notify all users
        CALL CreateNotification(
            CONCAT('New Event: ', p_title),
            CONCAT('A new event "', p_title, '" has been created and is now available for registration.'),
            CONCAT('/events/', v_event_id),
            'event',
            v_event_id,
            p_user_id,
            v_all_emails,
            'event_created'
        );
    END IF;

    COMMIT;
    SELECT * FROM tbl_event WHERE event_id = v_event_id;
END $$
DELIMITER ;

-- Trigger to prevent overlapping blocked periods
DELIMITER $$
CREATE TRIGGER tr_blocked_period_before_insert
BEFORE INSERT ON tbl_blocked_period
FOR EACH ROW
BEGIN
    -- Normalize dates (ensure start <= end)
    IF NEW.start_date > NEW.end_date THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start date cannot be after end date';
    END IF;
    
    -- Check for exact duplicates (same dates, unarchived)
    IF EXISTS (
        SELECT 1 FROM tbl_blocked_period 
        WHERE start_date = NEW.start_date 
        AND end_date = NEW.end_date
        AND archived_at IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A blocked period with the same dates already exists';
    END IF;
    
    -- Check for overlapping periods (unarchived only)
    IF EXISTS (
        SELECT 1 FROM tbl_blocked_period
        WHERE NEW.start_date < end_date 
        AND NEW.end_date > start_date
        AND archived_at IS NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blocked period overlaps with an existing active blocked period';
    END IF;
END $$

CREATE TRIGGER tr_blocked_period_before_update
BEFORE UPDATE ON tbl_blocked_period
FOR EACH ROW
BEGIN
    -- Only check validation if dates are being changed and period is being unarchived
    IF (NEW.start_date != OLD.start_date OR NEW.end_date != OLD.end_date OR (OLD.archived_at IS NOT NULL AND NEW.archived_at IS NULL)) THEN
        -- Normalize dates
        IF NEW.start_date > NEW.end_date THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Start date cannot be after end date';
        END IF;
        
        -- Skip overlap check if this period is being archived
        IF NEW.archived_at IS NULL THEN
            -- Check for overlapping periods (excluding self)
            IF EXISTS (
                SELECT 1 FROM tbl_blocked_period
                WHERE blocked_period_id != NEW.blocked_period_id
                AND NEW.start_date < end_date 
                AND NEW.end_date > start_date
                AND archived_at IS NULL
            ) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Blocked period overlaps with an existing active blocked period';
            END IF;
        END IF;
    END IF;
END $$
DELIMITER ;

-- Enhanced CheckScheduleConflict procedure
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckScheduleConflict(
    IN p_event_title VARCHAR(300),
    IN p_organization_id INT,
    IN p_committee_id INT,
    IN p_venue VARCHAR(200),
    IN p_start_date DATE,
    IN p_start_time TIME,
    IN p_end_time TIME,
    IN p_event_id INT
)
BEGIN
    -- Check for blocked periods that conflict with the event date
    SELECT 
        'blocked_period' as conflict_type,
        CONCAT('Event date conflicts with blocked period: ', bp.reason) as conflict_message,
        NULL as conflicting_event_id,
        bp.blocked_period_id
    FROM tbl_blocked_period bp
    WHERE p_start_date BETWEEN bp.start_date AND bp.end_date
    AND bp.archived_at IS NULL
    
    UNION ALL
    
    -- Check for venue conflicts (same venue, overlapping times, same date) - only for face-to-face events with venues
    SELECT 
        'schedule_conflict' as conflict_type,
        CONCAT('Venue "', e.venue, '" is already booked from ', e.start_time, ' to ', e.end_time, ' on ', e.start_date) as conflict_message,
        e.event_id as conflicting_event_id,
        NULL as blocked_period_id
    FROM tbl_event e
    WHERE p_venue IS NOT NULL 
    AND e.venue = p_venue 
    AND e.start_date = p_start_date
    AND e.status NOT IN ('Rejected', 'Archived')
    AND (p_event_id IS NULL OR e.event_id != p_event_id)
    AND (
        -- Time overlap logic: events conflict if they overlap in time
        (e.start_time <= p_start_time AND e.end_time > p_start_time) OR  -- Existing event starts before and ends after our start
        (e.start_time < p_end_time AND e.end_time >= p_end_time) OR      -- Existing event starts before and ends after our end  
        (e.start_time >= p_start_time AND e.end_time <= p_end_time)      -- Existing event is completely within our time
    )
    
    UNION ALL
    
    -- Check for duplicate events (same title within organization)
    SELECT 
        'duplicate_event' as conflict_type,
        CONCAT('Event with same title "', e.title, '" already exists for this organization') as conflict_message,
        e.event_id as conflicting_event_id,
        NULL as blocked_period_id
    FROM tbl_event e
    WHERE p_event_title IS NOT NULL
    AND e.title = p_event_title
    AND e.status NOT IN ('Rejected', 'Archived')
    AND (p_event_id IS NULL OR e.event_id != p_event_id)
    AND p_organization_id IS NOT NULL 
    AND e.organization_id = p_organization_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllBlockedPeriods()
BEGIN
    SELECT 
        bp.blocked_period_id,
        bp.start_date,
        bp.end_date,
        bp.reason,
        bp.created_at,
        bp.archived_at,
        bp.archived_reason,
        bp.unarchived_at,
        bp.unarchived_reason,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name,
        creator.email as creator_email,
        archiver.first_name as archiver_first_name,
        archiver.last_name as archiver_last_name,
        archiver.email as archiver_email,
        unarchiver.first_name as unarchiver_first_name,
        unarchiver.last_name as unarchiver_last_name,
        unarchiver.email as unarchiver_email
    FROM tbl_blocked_period bp
    LEFT JOIN tbl_user creator ON bp.created_by = creator.user_id
    LEFT JOIN tbl_user archiver ON bp.archived_by = archiver.user_id
    LEFT JOIN tbl_user unarchiver ON bp.unarchived_by = unarchiver.user_id
    ORDER BY bp.start_date DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveEvent(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    IF p_event_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;

    -- Only allow archiving SDAO events
    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id AND event_type = 'SDAO') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO events can be archived with this procedure';
    END IF;

    UPDATE tbl_event
    SET status = 'Archived'
    WHERE event_id = p_event_id;

    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN SET v_user_email = ''; END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Archived event "', (SELECT title FROM tbl_event WHERE event_id = p_event_id), '"', 
               IF(p_reason IS NOT NULL, CONCAT(' - Reason: ', p_reason), '')),
        'Event Management',
        JSON_OBJECT('event_id', p_event_id, 'archived_at', NOW(), 'reason', p_reason),
        CONCAT('/events/', p_event_id),
        NULL
    );

    SELECT * FROM tbl_event WHERE event_id = p_event_id LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveEvent(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    IF p_event_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id AND event_type = 'SDAO') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO events can be unarchived with this procedure';
    END IF;

    UPDATE tbl_event
    SET status = 'Approved'
    WHERE event_id = p_event_id AND status = 'Archived';

    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN SET v_user_email = ''; END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Restored event "', (SELECT title FROM tbl_event WHERE event_id = p_event_id), '"',
               IF(p_reason IS NOT NULL AND p_reason != '', CONCAT(' - Reason: ', p_reason), '')),
        'Event Management',
        JSON_OBJECT('event_id', p_event_id, 'unarchived_at', NOW(), 'reason', p_reason),
        CONCAT('/events/', p_event_id),
        NULL
    );

    SELECT * FROM tbl_event WHERE event_id = p_event_id LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateEvent(
    IN p_event_id INT,
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
    IN p_image TEXT,
    IN p_user_id VARCHAR(200),
    IN p_collaborators JSON
)
BEGIN
    DECLARE v_user_email VARCHAR(100);
    DECLARE i INT DEFAULT 0;
    DECLARE v_collab_count INT DEFAULT 0;
    DECLARE v_collab_org_id INT;

    IF p_event_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id AND event_type = 'SDAO') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO events can be updated with this procedure';
    END IF;

    UPDATE tbl_event
    SET title = p_title,
        description = p_description,
        venue_type = p_venue_type,
        venue = p_venue,
        start_date = p_start_date,
        end_date = p_end_date,
        start_time = p_start_time,
        end_time = p_end_time,
        status = p_status,
        type = p_type,
        is_open_to = p_is_open_to,
        fee = p_fee,
        capacity = p_capacity,
        image = p_image
    WHERE event_id = p_event_id;

    -- Update collaborators if provided
    IF p_collaborators IS NOT NULL THEN
        -- Remove existing collaborators
        DELETE FROM tbl_event_collaborator WHERE event_id = p_event_id;
        
        -- Add new collaborators if any
        IF JSON_LENGTH(p_collaborators) > 0 THEN
            SET v_collab_count = JSON_LENGTH(p_collaborators);
            SET i = 0;
            WHILE i < v_collab_count DO
                SET v_collab_org_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_collaborators, CONCAT('$[', i, ']'))) AS UNSIGNED);
                IF v_collab_org_id IS NOT NULL THEN
                    INSERT IGNORE INTO tbl_event_collaborator (event_id, organization_id)
                    VALUES (p_event_id, v_collab_org_id);
                END IF;
                SET i = i + 1;
            END WHILE;
        END IF;
    END IF;

    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN SET v_user_email = ''; END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Updated event "', p_title, '"'),
        'Event Management',
        JSON_OBJECT('event_id', p_event_id, 'updated_at', NOW()),
        CONCAT('/events/', p_event_id),
        NULL
    );

    SELECT * FROM tbl_event WHERE event_id = p_event_id LIMIT 1;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteEvent(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    IF p_event_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'event_id required';
    END IF;
    IF p_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'user_id required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id AND event_type = 'SDAO') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only SDAO events can be deleted with this procedure';
    END IF;

    DELETE FROM tbl_event WHERE event_id = p_event_id;

    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN SET v_user_email = ''; END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Permanently deleted event', IF(p_reason IS NOT NULL, CONCAT(' - Reason: ', p_reason), '')),
        'Event Management',
        JSON_OBJECT('event_id', p_event_id, 'deleted_at', NOW(), 'reason', p_reason),
        '/events',
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RegisterEvent(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200),
    IN p_status ENUM('Pending','Registered','Evaluated','Attended','Rejected'),
    IN p_transaction_id INT  -- can be NULL
)
BEGIN
    DECLARE v_status ENUM('Pending','Registered','Evaluated','Attended','Rejected');

    SET v_status = COALESCE(p_status, 'Registered');

    -- Insert new attendance or update existing rejected/completed registration
    IF NOT EXISTS (
        SELECT 1
        FROM tbl_event_attendance
        WHERE event_id = p_event_id
          AND user_id  = p_user_id
          AND status IN ('Registered', 'Pending')  -- Only prevent if actively registered
          AND deleted_at IS NULL
    ) THEN
        -- Check if there's an existing record (could be rejected/completed)
        IF EXISTS (
            SELECT 1
            FROM tbl_event_attendance
            WHERE event_id = p_event_id
              AND user_id = p_user_id
              AND deleted_at IS NULL
        ) THEN
            -- Update existing record (re-registration after rejection)
            UPDATE tbl_event_attendance
            SET status = v_status,
                transaction_id = p_transaction_id,
                time_in = NULL,
                time_out = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE event_id = p_event_id
              AND user_id = p_user_id
              AND deleted_at IS NULL;
        ELSE
            -- Insert new record
            INSERT INTO tbl_event_attendance (event_id, user_id, status, transaction_id)
            VALUES (p_event_id, p_user_id, v_status, p_transaction_id);
        END IF;
    ELSE
        -- Update existing active registration (only overwrite transaction_id if provided)
        UPDATE tbl_event_attendance
        SET status = v_status,
            transaction_id = CASE 
                WHEN p_transaction_id IS NOT NULL THEN p_transaction_id 
                ELSE transaction_id 
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE event_id = p_event_id
          AND user_id  = p_user_id
          AND deleted_at IS NULL;
    END IF;

    -- Return the attendance row centered on tbl_event_attendance
    SELECT
        ea.attendance_id AS id,
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
        tt.label AS transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_user u               ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction t        ON ea.transaction_id = t.transaction_id
    LEFT JOIN tbl_transaction_type tt  ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_transaction_event te ON te.transaction_id = t.transaction_id
    WHERE ea.event_id = p_event_id
      AND ea.user_id  = p_user_id
      AND ea.deleted_at IS NULL
    LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnRegisterEvent(IN
    event_id INT,
    user_id VARCHAR(200)
)
BEGIN
-- Select the record first for real-time updates
SELECT
    ea.attendance_id as id,
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
    tt.label AS transaction_type,
    t.status AS transaction_status,
    t.proof_image,
    t.created_at AS transaction_created_at
FROM tbl_event_attendance ea
LEFT JOIN tbl_user u ON ea.user_id = u.user_id
LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id 
LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id AND ea.user_id = t.user_id
LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
WHERE ea.event_id = event_id AND ea.user_id = user_id;

-- Then delete the record
DELETE FROM tbl_event_attendance WHERE event_id = event_id AND user_id = user_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckEventRegistration(IN
	event_id INT,
    user_id VARCHAR(200)
)
BEGIN
    -- Only return registration if status is 'Registered' or 'Pending'
    -- This allows re-registration for 'Rejected' or other statuses
    SELECT * FROM tbl_event_attendance a 
    WHERE a.event_id = event_id 
      AND a.user_id = user_id 
      AND a.status IN ('Registered', 'Pending');
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
CREATE DEFINER='admin'@'%' PROCEDURE ApproveTransactionPayment(
    IN p_transaction_id INT
)
BEGIN
    DECLARE v_event_id INT;
    DECLARE v_user_id VARCHAR(200);
    
    -- Get event_id and user_id from the transaction
    SELECT te.event_id, t.user_id
    INTO v_event_id, v_user_id
    FROM tbl_transaction t
    JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    WHERE t.transaction_id = p_transaction_id
    LIMIT 1;
    
    -- Validate that we found the transaction and it's an event transaction
    IF v_event_id IS NULL OR v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Transaction not found or is not an event transaction';
    END IF;
    
    -- Update the event attendance status to 'Registered'
    UPDATE tbl_event_attendance 
    SET status = 'Registered'
    WHERE transaction_id = p_transaction_id
      AND deleted_at IS NULL;
    
    -- Update the transaction status to 'Completed'
    UPDATE tbl_transaction
    SET status = 'Completed'
    WHERE transaction_id = p_transaction_id;
    
    -- Return the attendance details
    SELECT
        ea.attendance_id AS id,
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
        tt.label AS transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_user u               ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction t        ON ea.transaction_id = t.transaction_id
    LEFT JOIN tbl_transaction_type tt  ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_transaction_event te ON te.transaction_id = t.transaction_id
    WHERE t.transaction_id = p_transaction_id
      AND ea.deleted_at IS NULL
    LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllOrganizations()
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
    GROUP BY o.organization_id
    ORDER BY o.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizations(IN p_user_id VARCHAR(200))
BEGIN
    SELECT 
        o.organization_id,
        o.current_org_version_id AS organization_version_id,
        o.name AS organization_name,
        o.logo,
        o.description AS organization_description,
        o.category AS organization_type,
        o.status, -- Include status for filtering (Active, Archived, etc.)
        o.is_recruiting,
        o.membership_fee_amount,
        o.membership_fee_type,
        -- Get the current organization version ID from the latest renewal cycle
        (
            SELECT rc.org_version_id
            FROM tbl_renewal_cycle rc
            WHERE rc.organization_id = o.organization_id
            ORDER BY rc.cycle_number DESC
            LIMIT 1
        ) AS organization_version_id,
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
        -- Return membership status (prioritize pending applications)
        COALESCE(
            -- First priority: Check for pending membership applications
            (SELECT 'Pending'
             FROM tbl_membership_application ma
             WHERE ma.organization_id = o.organization_id
               AND ma.user_id = p_user_id
               AND ma.status = 'Pending'
             LIMIT 1),
            -- Second priority: Check active organization members (excluding archived)
            (SELECT om.status 
             FROM tbl_organization_members om 
             WHERE om.organization_id = o.organization_id 
               AND om.user_id = p_user_id
               AND om.status = 'Active'
             LIMIT 1),
            -- Third priority: Check committee members
            (SELECT IF(COUNT(*) > 0, 'Active', NULL)
             FROM tbl_committee c
             JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
             WHERE c.organization_id = o.organization_id
               AND cm.user_id = p_user_id
            ),
            -- Default: Not Member (including archived members)
            'Not Member'
        ) AS membership_status,
        -- Get 4 random member names per organization
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'first_name', member_data.f_name,
                    'last_name', member_data.l_name
                )
            )
            FROM (
                SELECT DISTINCT user_data.f_name, user_data.l_name
                FROM (
                    SELECT u.f_name, u.l_name
                    FROM tbl_organization_members om
                    JOIN tbl_user u ON om.user_id = u.user_id
                    WHERE om.organization_id = o.organization_id
                      AND om.status = 'Active'
                      AND u.f_name IS NOT NULL 
                      AND u.l_name IS NOT NULL
                    UNION
                    SELECT u.f_name, u.l_name
                    FROM tbl_committee_members cm
                    JOIN tbl_user u ON cm.user_id = u.user_id
                    JOIN tbl_committee c ON cm.committee_id = c.committee_id
                    WHERE c.organization_id = o.organization_id
                      AND u.f_name IS NOT NULL 
                      AND u.l_name IS NOT NULL
                ) AS user_data
                ORDER BY RAND()
                LIMIT 4
            ) AS member_data
        ) AS member_names,
        (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'event_id', e.event_id,
                'event_start_date', e.start_date,
                'event_end_date', e.end_date,
                'event_title', e.title,
                'start_time', e.start_time,
                'end_time', e.end_time,
                'venue', e.venue,
                'image', e.image,
                'attendee_names', (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'first_name', u.f_name,
                            'last_name', u.l_name
                        )
                    )
                    FROM tbl_event_attendance ea
                    JOIN tbl_user u ON ea.user_id = u.user_id
                    WHERE ea.event_id = e.event_id
                    AND ea.status IN ('Registered', 'Evaluated', 'Attended')
                    AND ea.deleted_at IS NULL
                    AND u.f_name IS NOT NULL 
                    AND u.l_name IS NOT NULL
                ),
                'attendee_images', (
                    SELECT GROUP_CONCAT(u.profile_picture ORDER BY RAND() SEPARATOR ',')
                    FROM (
                        SELECT u.profile_picture
                        FROM tbl_event_attendance ea
                        JOIN tbl_user u ON ea.user_id = u.user_id
                        WHERE ea.event_id = e.event_id
                        AND ea.status IN ('Registered', 'Evaluated', 'Attended')
                        AND ea.deleted_at IS NULL
                        LIMIT 4
                    ) AS u
                ),
                'total_attendees', (
                    SELECT COUNT(*)
                    FROM tbl_event_attendance
                    WHERE event_id = e.event_id
                    AND status IN ('Registered', 'Evaluated', 'Attended')
                    AND deleted_at IS NULL
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
CREATE DEFINER='admin'@'%' PROCEDURE UpdateOrganizationTermOption(
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_term_option BOOLEAN
)
BEGIN
    DECLARE v_org_exists INT DEFAULT 0;
    DECLARE v_membership_fee_type VARCHAR(50);
    
    -- Check if organization exists
    SELECT COUNT(*) INTO v_org_exists
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;
    
    IF v_org_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization not found';
    END IF;
    
    -- Get the membership fee type
    SELECT membership_fee_type INTO v_membership_fee_type
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;
    
    -- Only allow updating term_option for Per Term organizations
    IF v_membership_fee_type != 'Per Term' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Term option can only be set for Per Term organizations';
    END IF;
    
    -- Update the term_option
    UPDATE tbl_organization 
    SET term_option = p_term_option
    WHERE organization_id = p_organization_id;
    
    -- Return success message with updated organization info
    SELECT 
        organization_id,
        name as organization_name,
        membership_fee_type,
        term_option,
        CASE 
            WHEN p_term_option = 1 THEN 'Members can join events even if not paid'
            WHEN p_term_option = 0 THEN 'Members must pay to join events'
            ELSE 'No restriction set'
        END as term_option_description
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetUpcomingEvents(IN p_orgs JSON)
BEGIN
    -- Normalize input
    IF p_orgs IS NULL OR JSON_TYPE(p_orgs) <> 'ARRAY' THEN
        SET p_orgs = JSON_ARRAY();
    END IF;

    -- Return upcoming events using JSON_CONTAINS instead of temp table
    SELECT
        e.event_id,
        e.title AS event_title,
        DATE_FORMAT(e.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(e.end_date, '%Y-%m-%d') AS end_date,
        e.start_time,
        e.end_time,
        e.venue,
        e.image,
        o.name AS organization_name,
        o.logo AS organization_logo,
        e.organization_id,
        rc.org_version_id AS organization_version_id,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'first_name', random_attendees.f_name,
                    'last_name', random_attendees.l_name
                )
            )
            FROM (
                SELECT attendee_user.f_name, attendee_user.l_name
                FROM tbl_event_attendance ea
                JOIN tbl_user attendee_user ON ea.user_id = attendee_user.user_id
                WHERE ea.event_id = e.event_id
                AND ea.status IN ('Registered', 'Evaluated', 'Attended')
                AND attendee_user.f_name IS NOT NULL 
                AND attendee_user.l_name IS NOT NULL
                ORDER BY RAND()
                LIMIT 4
            ) AS random_attendees
        ) AS attendee_names,
        (
            SELECT COUNT(*) 
            FROM tbl_event_attendance 
            WHERE event_id = e.event_id
            AND status IN ('Registered', 'Evaluated', 'Attended')
        ) AS total_attendees,
        -- Count total organizations involved (main org + collaborators)
        (
            1 + COALESCE((
                SELECT COUNT(*)
                FROM tbl_event_collaborator ec
                WHERE ec.event_id = e.event_id
            ), 0)
        ) AS total_organizations_involved
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
        AND e.cycle_number = rc.cycle_number
    WHERE e.status = 'Approved'
      AND e.start_date >= CURDATE()
      AND (
           e.is_open_to IN ('Open to all', 'NU Students only')
        OR (
            e.organization_id IS NOT NULL 
            AND JSON_CONTAINS(p_orgs, JSON_OBJECT('organization_id', e.organization_id))
        )
        OR EXISTS (
            SELECT 1 FROM tbl_event_collaborator ec
            WHERE ec.event_id = e.event_id
            AND JSON_CONTAINS(p_orgs, JSON_OBJECT('organization_id', ec.organization_id))
        )
      )
    ORDER BY 
        e.start_date ASC, 
        e.start_time ASC
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
                    WHEN cr.role_name IS NOT NULL THEN CONCAT('Committee ', cr.role_name)
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
    LEFT JOIN tbl_committee_role cr 
        ON cm.committee_role_id = cr.committee_role_id
    WHERE om.user_id = p_user_id
       OR cm.user_id = p_user_id
    GROUP BY o.organization_id, o.name, o.logo
    ORDER BY o.name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddCertificateTemplate(
    IN p_event_id INT,
    IN p_template_path VARCHAR(255),
    IN p_uploaded_by VARCHAR(200)
)
BEGIN
    DECLARE v_user_email VARCHAR(100);

    -- Check if uploaded_by exists
    IF NOT EXISTS (SELECT 1 FROM tbl_user WHERE user_id = p_uploaded_by) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uploader user_id does not exist';
    END IF;

    -- Check if event exists
    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event does not exist';
    END IF;

    -- Get email for logging
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_uploaded_by LIMIT 1;

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

    -- Log the action
    CALL LogAction(
        v_user_email,
        'Updated certificate template',
        'Certificate Management',
        JSON_OBJECT('event_id', p_event_id, 'template_path', p_template_path),
        CONCAT('/events/', p_event_id),
        p_template_path
    );
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteCertificateTemplate(
    IN p_event_id INT
)
BEGIN
    DECLARE v_template_path VARCHAR(255);
    DECLARE v_uploaded_by VARCHAR(200);
    DECLARE v_user_email VARCHAR(100);

    -- Ensure the event exists
    IF NOT EXISTS (SELECT 1 FROM tbl_event WHERE event_id = p_event_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event does not exist';
    END IF;

    -- Get current template (if any) and uploader
    SELECT template_path, uploaded_by
      INTO v_template_path, v_uploaded_by
      FROM tbl_certificate_template
     WHERE event_id = p_event_id
     LIMIT 1;

    IF v_template_path IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No certificate template to delete for this event';
    END IF;

    -- Get email for logging
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = v_uploaded_by LIMIT 1;

    -- Log the action
    CALL LogAction(
        v_user_email,
        'Removed certificate template',
        'certificate',
        JSON_OBJECT('event_id', p_event_id, 'template_path', v_template_path),
        CONCAT('/events/', p_event_id),
        v_template_path
    );

    -- Return the path so the caller can delete the file on disk
    SELECT v_template_path AS deleted_template_path;

    -- Remove the DB record
    DELETE FROM tbl_certificate_template
     WHERE event_id = p_event_id;
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
CREATE DEFINER='admin'@'%' PROCEDURE CreateMembershipTransaction(
    IN p_user_email VARCHAR(100),
    IN p_payer_name VARCHAR(255),
    IN p_amount DECIMAL(10,2),
    IN p_payment_type_code VARCHAR(50),
    IN p_proof_image VARCHAR(500),
    IN p_organization_id INT,
    IN p_organization_version_id INT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_cycle_number INT;

    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_series_key VARCHAR(100);
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_pad_len TINYINT DEFAULT 6;
    DECLARE v_type_char CHAR(1);
    DECLARE v_org_token VARCHAR(16);
    DECLARE v_yyyymm CHAR(6);

    -- Get user ID from email
    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_user_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User not found'; 
    END IF;

    -- Get cycle_number from organization_version_id
    SELECT cycle_number INTO v_cycle_number 
    FROM tbl_renewal_cycle 
    WHERE organization_id = p_organization_id 
      AND org_version_id = p_organization_version_id 
    LIMIT 1;
    IF v_cycle_number IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cycle number not found for the given organization version'; 
    END IF;

    -- Get transaction type ID for INCOME
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type 
    WHERE code = 'INCOME' LIMIT 1;
    IF v_transaction_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Income transaction type not found'; 
    END IF;

    -- Get payment type ID
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type 
    WHERE code = p_payment_type_code LIMIT 1;
    IF v_payment_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment type not found'; 
    END IF;

    -- Get category ID for Membership Fees - first try to find the existing category
    SELECT category_id INTO v_category_id 
    FROM tbl_financial_category 
    WHERE code = 'MEMBERSHIP_FEES' 
      AND active = TRUE 
    LIMIT 1;
    
    -- If specific membership category not found, try any income category
    IF v_category_id IS NULL THEN
        SELECT category_id INTO v_category_id 
        FROM tbl_financial_category 
        WHERE kind = 'INCOME' 
          AND active = TRUE 
        LIMIT 1;
    END IF;
    
    -- If still no category found, create the membership fees category
    IF v_category_id IS NULL THEN
        INSERT INTO tbl_financial_category (code, label, kind, active) 
        VALUES ('MEMBERSHIP_FEES', 'Membership Fees', 'INCOME', TRUE);
        
        SET v_category_id = LAST_INSERT_ID();
        
        -- Link the new category to the INCOME transaction type
        INSERT IGNORE INTO tbl_transaction_type_category (transaction_type_id, category_id)
        VALUES (v_transaction_type_id, v_category_id);
    END IF;

    -- Generate receipt number
    SET v_type_char = 'I'; -- Income
    SET v_yyyymm = DATE_FORMAT(NOW(), '%Y%m');
    SET v_org_token = CONCAT('ORG', LPAD(p_organization_id, 3, '0'));
    SET v_prefix = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
    SET v_series_key = v_prefix;
    CALL NextReceiptNo(v_series_key, v_prefix, v_pad_len, v_receipt_no);

    -- Create main transaction record
    INSERT INTO tbl_transaction (
        user_id, payer_name, payee_name, payment_description, amount,
        transaction_type_id, payment_type_id, category_id, org_version_id, status, 
        transaction_date, receipt_no, proof_image
    ) VALUES (
        v_user_id, p_payer_name, 'NU Connect', 'Membership Fee', p_amount,
        v_transaction_type_id, v_payment_type_id, v_category_id, p_organization_version_id, 'Pending', 
        NOW(), v_receipt_no, p_proof_image
    );

    SET v_transaction_id = LAST_INSERT_ID();

    -- Link to organization (membership transaction) using the retrieved cycle_number
    INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
    VALUES (v_transaction_id, p_organization_id, v_cycle_number);

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Created membership transaction for organization ', p_organization_id),
        'MEMBERSHIP_TRANSACTION_CREATE',
        JSON_OBJECT(
            'transaction_id', v_transaction_id,
            'amount', p_amount,
            'organization_id', p_organization_id,
            'organization_version_id', p_organization_version_id,
            'cycle_number', v_cycle_number,
            'receipt_no', v_receipt_no
        ),
        NULL,
        p_proof_image
    );

    -- Return the created transaction
    CALL GetTransaction(v_transaction_id);
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
    DECLARE v_user_email VARCHAR(100);
    DECLARE v_event_id INT;
    DECLARE v_duration_seconds INT;
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

    -- Extract user_email, event_id, and duration_seconds from JSON
    SET v_user_email = JSON_UNQUOTE(JSON_EXTRACT(p_json_data, '$.user_email'));
    SET v_event_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_json_data, '$.event_id')) AS UNSIGNED);
    SET v_duration_seconds = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_json_data, '$.duration_seconds')) AS UNSIGNED);

    -- Resolve user_id from user_email
    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = v_user_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    -- Create evaluation record with duration
    INSERT INTO tbl_evaluation (event_id, user_id, duration_seconds)
    VALUES (v_event_id, v_user_id, v_duration_seconds);
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
CREATE DEFINER='admin'@'%' PROCEDURE UpdateMemberEventStatus(
    IN p_event_id INT,
    IN p_user_id VARCHAR(200)
    )
BEGIN
    UPDATE tbl_event_attendance
    SET status = 'Evaluated', time_out = CURRENT_TIMESTAMP()
    WHERE event_id = p_event_id AND user_id = p_user_id;

    SELECT
    ea.attendance_id as id,
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
    tt.label AS transaction_type,
    t.status AS transaction_status,
    t.proof_image,
    t.created_at AS transaction_created_at
FROM tbl_event_attendance ea
LEFT JOIN tbl_user u ON ea.user_id = u.user_id
LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id 
LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id AND ea.user_id = t.user_id
LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
WHERE ea.event_id = p_event_id AND ea.user_id = p_user_id;
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
                SELECT JSON_ARRAYAGG(
                    CASE 
                        WHEN perm_data.organization_ids IS NOT NULL AND JSON_LENGTH(perm_data.organization_ids) > 0 THEN
                            JSON_OBJECT(
                                'permission', perm_data.permission_name,
                                'organization_ids', perm_data.organization_ids
                            )
                        ELSE
                            perm_data.permission_name
                    END
                )
                FROM (
                    SELECT DISTINCT 
                        permission_name,
                        CASE 
                            WHEN permission_scope = 'Organization' AND organization_ids IS NOT NULL THEN organization_ids
                            ELSE NULL
                        END AS organization_ids
                    FROM (
                        -- Base role permissions (global scope)
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            NULL as organization_ids
                        FROM tbl_role_permission rp
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE rp.role_id = u.role_id

                        UNION ALL

                        -- Executive role permissions through ranks (organization-scoped)
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            CASE 
                                WHEN COUNT(DISTINCT om.organization_id) > 0 THEN
                                    CONCAT('[', GROUP_CONCAT(DISTINCT om.organization_id SEPARATOR ','), ']')
                                ELSE NULL
                            END as organization_ids
                        FROM tbl_organization_members om
                        JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
                        JOIN tbl_rank_permission rp ON er.rank_id = rp.rank_id
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE om.user_id = u.user_id
                          AND om.status = 'Active'
                          AND om.member_type = 'Executive'
                        GROUP BY p.permission_name, p.scope
                        HAVING COUNT(DISTINCT om.organization_id) > 0

                        UNION ALL

                        -- Committee role permissions (organization-scoped)
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            CASE 
                                WHEN COUNT(DISTINCT c.organization_id) > 0 THEN
                                    CONCAT('[', GROUP_CONCAT(DISTINCT c.organization_id SEPARATOR ','), ']')
                                ELSE NULL
                            END as organization_ids
                        FROM tbl_committee_members cm
                        JOIN tbl_committee c ON cm.committee_id = c.committee_id
                        JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
                        JOIN tbl_committee_role_permission crp ON cr.committee_role_id = crp.committee_role_id
                        JOIN tbl_permission p ON crp.permission_id = p.permission_id
                        WHERE cm.user_id = u.user_id
                        GROUP BY p.permission_name, p.scope
                        HAVING COUNT(DISTINCT c.organization_id) > 0

                        UNION ALL

                        -- Organization adviser permissions (organization-scoped)
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            CASE 
                                WHEN COUNT(DISTINCT o.organization_id) > 0 THEN
                                    CONCAT('[', GROUP_CONCAT(DISTINCT o.organization_id SEPARATOR ','), ']')
                                ELSE NULL
                            END as organization_ids
                        FROM tbl_organization o
                        JOIN tbl_role_permission rp ON rp.role_id = u.role_id
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE o.adviser_id = u.user_id
                          AND p.scope = 'Organization'
                        GROUP BY p.permission_name, p.scope
                        HAVING COUNT(DISTINCT o.organization_id) > 0

                        UNION ALL

                        -- Member permission overrides (organization-scoped)
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            CASE 
                                WHEN COUNT(DISTINCT om.organization_id) > 0 THEN
                                    CONCAT('[', GROUP_CONCAT(DISTINCT om.organization_id SEPARATOR ','), ']')
                                ELSE NULL
                            END as organization_ids
                        FROM tbl_member_permission_override mpo
                        JOIN tbl_organization_members om ON mpo.member_id = om.member_id
                        JOIN tbl_permission p ON mpo.permission_id = p.permission_id
                        WHERE om.user_id = u.user_id
                          AND mpo.is_allowed = TRUE
                          AND om.status = 'Active'
                        GROUP BY p.permission_name, p.scope
                        HAVING COUNT(DISTINCT om.organization_id) > 0

                        UNION ALL

                        -- Organization-scoped permissions for users who may not currently have organizations
                        SELECT 
                            p.permission_name,
                            p.scope as permission_scope,
                            '[]' as organization_ids  -- Empty array indicates permission exists but no orgs
                        FROM tbl_role_permission rp
                        JOIN tbl_permission p ON rp.permission_id = p.permission_id
                        WHERE rp.role_id = u.role_id
                          AND p.scope = 'Organization'
                          AND NOT EXISTS (
                              -- Only include if user doesn't have this permission through any organization
                              SELECT 1 FROM tbl_organization_members om
                              JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
                              JOIN tbl_rank_permission rp2 ON er.rank_id = rp2.rank_id
                              WHERE om.user_id = u.user_id
                                AND rp2.permission_id = p.permission_id
                                AND om.status = 'Active'
                                AND om.member_type = 'Executive'
                              
                              UNION ALL
                              
                              SELECT 1 FROM tbl_committee_members cm
                              JOIN tbl_committee c ON cm.committee_id = c.committee_id
                              JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
                              JOIN tbl_committee_role_permission crp ON cr.committee_role_id = crp.committee_role_id
                              WHERE cm.user_id = u.user_id
                                AND crp.permission_id = p.permission_id
                                
                              UNION ALL
                              
                              SELECT 1 FROM tbl_organization o
                              WHERE o.adviser_id = u.user_id
                                AND EXISTS (
                                    SELECT 1 FROM tbl_role_permission rp3
                                    WHERE rp3.role_id = u.role_id
                                      AND rp3.permission_id = p.permission_id
                                )
                          )
                    ) AS all_permissions
                ) AS perm_data
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
                    'current_org_version_id', orgs.current_org_version_id,
                    'cycle_number', orgs.cycle_number,
                    'position', orgs.position
                ))
                FROM (
                    -- Adviser
                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, rc.cycle_number,
                        'Adviser' AS position
                    FROM tbl_organization o
                    JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
                        AND rc.org_version_id = o.current_org_version_id
                    WHERE o.adviser_id = u.user_id

                    UNION

                    -- Executive
                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, rc.cycle_number,
                        'Executive' AS position
                    FROM tbl_organization_members om
                    JOIN tbl_organization o ON om.organization_id = o.organization_id
                    JOIN tbl_renewal_cycle rc ON om.organization_id = rc.organization_id 
                        AND om.cycle_number = rc.cycle_number
                        AND rc.org_version_id = o.current_org_version_id
                    WHERE om.user_id = u.user_id AND om.member_type = 'Executive' AND om.status = 'Active'

                    UNION

                    -- Committee
                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, rc.cycle_number,
                        'Committee' AS position
                    FROM tbl_organization_members om
                    JOIN tbl_organization o ON om.organization_id = o.organization_id
                    JOIN tbl_renewal_cycle rc ON om.organization_id = rc.organization_id 
                        AND om.cycle_number = rc.cycle_number
                        AND rc.org_version_id = o.current_org_version_id
                    WHERE om.user_id = u.user_id AND om.member_type = 'Committee' AND om.status = 'Active'

                    UNION

                    -- Member
                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, rc.cycle_number,
                        'Member' AS position
                    FROM tbl_organization_members om
                    JOIN tbl_organization o ON om.organization_id = o.organization_id
                    JOIN tbl_renewal_cycle rc ON om.organization_id = rc.organization_id 
                        AND om.cycle_number = rc.cycle_number
                        AND rc.org_version_id = o.current_org_version_id
                    WHERE om.user_id = u.user_id AND om.member_type = 'Member' AND om.status = 'Active'

                    UNION

                    -- Applicant of approved applications (for students who created org applications but weren't added as members)
                    SELECT o.name, o.logo, o.status, o.organization_id, o.current_org_version_id, rc.cycle_number,
                        'Applicant' AS position
                    FROM tbl_application a
                    JOIN tbl_organization o ON a.organization_id = o.organization_id
                    JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
                        AND rc.org_version_id = o.current_org_version_id
                    WHERE a.applicant_user_id = u.user_id 
                      AND a.status = 'Approved'
                      AND o.status = 'Approved'
                ) AS orgs
            ),
            JSON_ARRAY()
        ),
        'pending_application', (
    SELECT 
        CASE 
            WHEN a.status IN ('Pending','Rejected') THEN 
                JSON_OBJECT(
                    'application_id', a.application_id,
                    'organization_name', v.name,
                    'status', a.status
                )
            ELSE NULL
        END
    FROM tbl_application a
    JOIN tbl_organization_version v ON a.org_version_id = v.org_version_id
    WHERE a.applicant_user_id = u.user_id
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
            updated_at = CURRENT_TIMESTAMP
        WHERE email = p_email;

        -- Log the update using LogAction
        CALL LogAction(
            p_created_by_email,
            'Updated managed account access',
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
            'Created new managed account',
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
           u.archived_reason
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
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Log the update using LogAction
    CALL LogAction(
        p_updated_by_email,
        'Updated account permissions',
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
           u.archived_reason
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
    SELECT COUNT(*) INTO user_count FROM tbl_user WHERE email = p_email;
    IF user_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    ELSE
        -- Get the user_id to log the action properly
        SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_email;

        -- Archive the user with full metadata
        UPDATE tbl_user
        SET 
            status = 'Archive',
            archived_at = CURRENT_TIMESTAMP,
            archived_by = v_archived_by_id,
            archived_reason = COALESCE(p_reason, 'Manual archive via DeleteManagedAccount'),
            updated_at = CURRENT_TIMESTAMP
        WHERE email = p_email;

        -- Log the archiving using LogAction
        CALL LogAction(
            p_archived_by_email,
            'Removed account access',
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
           u.archived_reason
    FROM tbl_user u
    JOIN tbl_role r ON u.role_id = r.role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE u.email = p_email;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveManagedAccount(
    IN p_user_id VARCHAR(200),
    IN p_unarchived_by_email VARCHAR(100),
    IN p_reason VARCHAR(255)
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

    -- Check if user exists and get email
    SELECT COUNT(*) INTO user_count FROM tbl_user WHERE user_id = p_user_id;
    IF user_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;

    SELECT email INTO v_email FROM tbl_user WHERE user_id = p_user_id;

    -- Unarchive user (remove archive metadata)
    UPDATE tbl_user
    SET 
        status = 'Active',
        archived_at = NULL,
        archived_by = NULL,
        archived_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Log the action using LogAction (include reason only if provided)
    IF p_reason IS NOT NULL AND TRIM(p_reason) <> '' THEN
        CALL LogAction(
            p_unarchived_by_email,
            CONCAT('Unarchived managed account for ', v_email),
            'account',
            JSON_OBJECT('reason', p_reason, 'target_email', v_email),
            NULL,
            NULL
        );
    ELSE
        CALL LogAction(
            p_unarchived_by_email,
            CONCAT('Unarchived managed account for ', v_email),
            'account',
            JSON_OBJECT('target_email', v_email),
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
           u.archived_reason
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

        -- For the first step (adviser role), handle differently based on application type
        IF v_first_step THEN
            -- For NEW applications: Use the actual adviser who submitted the application (p_initiated_by)
            -- For RENEWAL applications: Use the specific adviser of the organization
            IF v_application_type = 'new' THEN
                SET v_approver_id = p_initiated_by; -- Use the adviser who submitted
            ELSE
                -- For renewal, use the specific adviser of the organization being renewed
                SET v_approver_id = (
                    SELECT o.adviser_id
                    FROM tbl_application a
                    JOIN tbl_organization o ON a.organization_id = o.organization_id
                    WHERE a.application_id = p_application_id
                      AND o.adviser_id IS NOT NULL
                      AND EXISTS (
                          SELECT 1 FROM tbl_user u 
                          WHERE u.user_id = o.adviser_id 
                            AND u.role_id = v_role_id 
                            AND u.status = 'Active'
                      )
                    LIMIT 1
                );
            END IF;
        ELSE
            -- For subsequent steps, use the standard role-based selection
            SET v_approver_id = (
                SELECT user_id
                FROM tbl_user
                WHERE role_id = v_role_id
                  AND status = 'Active'
                LIMIT 1
            );
        END IF;

        IF v_approver_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM tbl_approval_process ap
                WHERE ap.application_id = p_application_id
                  AND ap.period_id = v_period_id
                  AND ap.approval_role_id = v_role_id
            ) THEN
                IF v_first_step THEN
                    -- For NEW applications: Auto-approve the adviser who submitted
                    -- For RENEWAL applications: Set as pending for adviser to approve
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
                        CASE WHEN v_application_type = 'new' THEN 'Approved' ELSE 'Pending' END,
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

DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE CreateOrganizationApplication(
    IN p_organization   JSON,
    IN p_executives     JSON,
    IN p_requirements   JSON,
    IN p_user_id        VARCHAR(200)
)
BEGIN
    -- Declarations
    DECLARE v_program_id         INT;
    DECLARE v_period_id          INT;
    DECLARE v_application_id     INT;
    DECLARE v_org_name           VARCHAR(100);
    DECLARE v_logo_filename      VARCHAR(255);
    DECLARE i                    INT DEFAULT 0;
    DECLARE v_requirement_count  INT DEFAULT 0;
    DECLARE v_req_id             INT;
    DECLARE v_file_path          VARCHAR(255);
    DECLARE v_exec_count         INT DEFAULT 0;
    DECLARE v_cycle_number       INT DEFAULT 1;
    DECLARE v_fee_type           VARCHAR(50) DEFAULT 'Free';
    DECLARE v_fee_amount         DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_dept_count         INT DEFAULT 0;
    DECLARE v_organization_id    INT DEFAULT NULL;
    DECLARE v_org_version_id     INT DEFAULT NULL;
    DECLARE v_application_type   ENUM('new','renewal') DEFAULT 'new';
    DECLARE v_exec_user_id       VARCHAR(200);
    DECLARE v_exec_email         VARCHAR(255);
    DECLARE v_exec_fname         VARCHAR(100);
    DECLARE v_exec_lname         VARCHAR(100);
    DECLARE v_exec_full_name     VARCHAR(255);
    DECLARE v_generated_uuid     VARCHAR(200);

    -- Error handler
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Defensive parsing
    SET v_org_name = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_name'));
    SET @__fee = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_duration'));
    IF @__fee IS NOT NULL AND @__fee != '' AND @__fee IN ('Per Term', 'Whole Academic Year', 'Free') THEN
        SET v_fee_type = @__fee;
    ELSE
        SET v_fee_type = 'Free';
    END IF;
    SET @__fee_amt = JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.fee_amount'));
    IF @__fee_amt IS NULL OR @__fee_amt = '' THEN
        SET v_fee_amount = NULL;
    ELSE
        SET v_fee_amount = NULLIF(CAST(@__fee_amt AS DECIMAL(10,2)), 0);
    END IF;

    SET v_exec_count = COALESCE(JSON_LENGTH(p_executives), 0);
    SET v_dept_count  = COALESCE(JSON_LENGTH(p_organization, '$.department'), 0);

    START TRANSACTION;

    -- Get user's program
    SELECT program_id INTO v_program_id
    FROM tbl_user
    WHERE user_id = p_user_id
    LIMIT 1;
    IF v_program_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User program not found';
    END IF;

    -- Check whether the requesting user is a president (rank_id = 1) of any organization
    SELECT m.organization_id INTO v_organization_id
    FROM tbl_organization_members m
    JOIN tbl_executive_role er ON m.executive_role_id = er.executive_role_id
    WHERE m.user_id = p_user_id
      AND er.rank_id = 1
    LIMIT 1;

    IF v_organization_id IS NOT NULL THEN
        SET v_application_type = 'renewal';
    ELSE
        SET v_application_type = 'new';
    END IF;

    -- Create organization version
    INSERT INTO tbl_organization_version (
        organization_id,
        name,
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
        v_organization_id,
        v_org_name,
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
    SET v_org_version_id = LAST_INSERT_ID();

    -- Insert multiple program associations into tbl_organization_version_course
    SET @dept_field = CASE 
        WHEN JSON_LENGTH(p_organization, '$.department') > 0 THEN '$.department'
        WHEN JSON_LENGTH(p_organization, '$.programs') > 0 THEN '$.programs'
        ELSE '$.department'
    END;
    
    SET v_dept_count = COALESCE(JSON_LENGTH(p_organization, @dept_field), 0);
    SET i = 0;
    
    WHILE i < v_dept_count DO
        SET @program = JSON_EXTRACT(p_organization, CONCAT(@dept_field, '[', i, ']'));
        
        -- Handle both program_id (numeric) and abbreviation (string) formats
        IF JSON_TYPE(@program) = 'OBJECT' THEN
            SET @program_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(@program, '$.program_id')) AS UNSIGNED);
        ELSE
            SET @program_abbr = JSON_UNQUOTE(@program);
            SELECT program_id INTO @program_id 
            FROM tbl_program 
            WHERE LOWER(abbreviation) = LOWER(@program_abbr)
            LIMIT 1;
        END IF;
        
        IF @program_id IS NOT NULL THEN
            INSERT IGNORE INTO tbl_organization_version_course (
                org_version_id,
                program_id
            ) VALUES (
                v_org_version_id,
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

    -- Create application
    INSERT INTO tbl_application (
        organization_id,
        org_version_id,
        submitted_org_name,
        submitted_org_logo,
        application_type,
        period_id,
        applicant_user_id,
        status
    ) VALUES (
        v_organization_id,
        v_org_version_id,
        v_org_name,
        JSON_UNQUOTE(JSON_EXTRACT(p_organization, '$.organization_logo')),
        v_application_type,
        v_period_id,
        p_user_id,
        'Pending'
    );
    SET v_application_id = LAST_INSERT_ID();

    -- Insert proposed executives with user matching and UUID generation
    SET i = 0;
    WHILE i < v_exec_count DO
        SET @executive = JSON_EXTRACT(p_executives, CONCAT('$[', i, ']'));
        
        -- Extract executive details
        SET v_exec_fname = TRIM(JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.f_name')));
        SET v_exec_lname = TRIM(JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.l_name')));
        SET v_exec_email = LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(@executive, '$.nu_email'))));
        SET v_exec_full_name = CONCAT(v_exec_fname, ' ', v_exec_lname);
        
        -- Initialize exec_user_id
        SET v_exec_user_id = NULL;
        
        -- Try multiple methods to find existing user
        -- Method 1: Try exact email match (case-insensitive)
        IF v_exec_user_id IS NULL AND v_exec_email IS NOT NULL AND v_exec_email != '' THEN
            SELECT user_id INTO v_exec_user_id 
            FROM tbl_user 
            WHERE LOWER(email) = v_exec_email 
            LIMIT 1;
        END IF;
        
        -- Method 2: Try name match if email didn't work
        IF v_exec_user_id IS NULL AND v_exec_fname IS NOT NULL AND v_exec_lname IS NOT NULL THEN
            SELECT user_id INTO v_exec_user_id
            FROM tbl_user
            WHERE LOWER(TRIM(f_name)) = LOWER(v_exec_fname) 
              AND LOWER(TRIM(l_name)) = LOWER(v_exec_lname)
              AND status = 'Active'
            LIMIT 1;
        END IF;
        
        -- Method 3: Try email username pattern match
        IF v_exec_user_id IS NULL AND v_exec_email IS NOT NULL AND v_exec_email != '' THEN
            SET @email_username = SUBSTRING_INDEX(v_exec_email, '@', 1);
            
            SELECT user_id INTO v_exec_user_id
            FROM tbl_user
            WHERE LOWER(email) LIKE CONCAT(LOWER(@email_username), '%@students.nu-dasma.edu.ph')
              AND status = 'Active'
            LIMIT 1;
        END IF;
        
        -- If user not found, generate a clean UUID for them (no prefix)
        IF v_exec_user_id IS NULL THEN
            SET v_generated_uuid = REPLACE(UUID(), '-', '');
        ELSE
            SET v_generated_uuid = v_exec_user_id;
        END IF;
        
        -- Insert application executive with either found user_id or generated UUID
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
            v_org_version_id,
            v_generated_uuid,  -- Will be existing user_id or new UUID
            v_exec_full_name,
            v_exec_email,
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
            v_organization_id,
            v_cycle_number,
            v_org_version_id,
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
        v_org_version_id AS org_version_id,
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
    DECLARE v_org_version_id INT; -- will hold new version id if created
    DECLARE v_is_president INT DEFAULT 0;

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

    -- Check if the requesting user is president (rank_id = 1) for this organization
    SET v_is_president = 0;
    SELECT 1 INTO v_is_president
    FROM tbl_organization_members m
    JOIN tbl_executive_role er ON m.executive_role_id = er.executive_role_id
    WHERE m.user_id = p_user_id
      AND m.organization_id = v_organization_id
      AND er.rank_id = 1
    LIMIT 1;
    -- If SELECT found no rows, v_is_president remains 0 (NULL raises error with INTO, so we set default and use LEFT JOIN style safe select)
    IF v_is_president IS NULL THEN
        SET v_is_president = 0;
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

    -- If user is president, create a new organization_version linked to the organization (to capture the resubmission changes)
    IF v_is_president = 1 THEN
        INSERT INTO tbl_organization_version (
            organization_id,
            name,
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
            v_organization_id,
            v_org_name,
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
        SET v_org_version_id = LAST_INSERT_ID();
    ELSE
        SET v_org_version_id = NULL;
    END IF;

    -- Create new application (resubmission treated as 'new' application per original)
    INSERT INTO tbl_application (
        organization_id,
        cycle_number,
        org_version_id,
        application_type,
        period_id,
        applicant_user_id,
        status
    ) VALUES (
        v_organization_id,
        v_cycle_number,
        v_org_version_id,
        'new',
        v_period_id,
        p_user_id,
        'Pending'
    );
    SET v_application_id = LAST_INSERT_ID();
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
            org_version_id,
            file_path,
            submitted_by
        ) VALUES (
            v_application_id,
            v_req_id,
            v_cycle_number,
            v_organization_id,
            v_org_version_id,
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
CREATE DEFINER='admin'@'%' PROCEDURE GetEventTickets(
    IN p_user_id VARCHAR(200)
)
BEGIN
    SELECT 
        e.event_id,
        e.start_date,
        e.start_time,
        e.end_date,
        e.end_time,
        e.organization_id,
        rc.org_version_id AS organization_version_id,
        e.image,
        u.f_name,
        u.l_name,
        e.title AS event_title,
        o.name AS organization_name,
        ea.status AS attendance_status,
        ea.time_in,
        ea.time_out,
        ea.created_at AS registration_date
    FROM tbl_event_attendance ea
    JOIN tbl_event e ON ea.event_id = e.event_id
    JOIN tbl_user u ON ea.user_id = u.user_id
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
        AND e.cycle_number = rc.cycle_number
    WHERE ea.user_id = p_user_id
      AND ea.status IN ('Registered', 'Attended', 'Evaluated')
      AND ea.deleted_at IS NULL  -- Exclude soft-deleted registrations
      AND e.status = 'Approved'  -- Only show approved events
    ORDER BY e.start_date DESC, e.start_time DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEvents()
BEGIN
    SELECT 
        e.event_id AS id,
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
        -- Get the org_version_id for this event's org/cycle, then get the cycle_number for that version
        (
            SELECT rc.org_version_id
            FROM tbl_renewal_cycle rc
            WHERE rc.organization_id = e.organization_id
              AND rc.cycle_number = e.cycle_number
            LIMIT 1
        ) AS organization_version_id,
        e.cycle_number,
        e.status,
        e.type,
        e.user_id,
        e.created_at,
        -- Collaborators as JSON array
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'organization_id', ec.organization_id,
                    'organization_name', co.name
                )
            )
            FROM tbl_event_collaborator ec
            LEFT JOIN tbl_organization co ON ec.organization_id = co.organization_id
            WHERE ec.event_id = e.event_id
        ) AS collaborators
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE FUNCTION GetEventCollaborators(p_event_id INT)
RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE result JSON;
    
    SELECT JSON_ARRAYAGG(
               JSON_OBJECT(
                   'organization_id', co.organization_id,
                   'organization_name', co.name,
                   'base_program_id', co.base_program_id,
                   'logo', co.logo
               )
           ) INTO result
      FROM tbl_event_collaborator ec
      LEFT JOIN tbl_organization co ON co.organization_id = ec.organization_id
     WHERE ec.event_id = p_event_id;
    
    RETURN COALESCE(result, JSON_ARRAY());
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventsByUserRole(
    IN p_user_id_or_email VARCHAR(200)  -- user_id OR email
)
proc_main: BEGIN
    DECLARE v_user_id    VARCHAR(200) DEFAULT NULL;
    DECLARE v_role_name  VARCHAR(100) DEFAULT '';
    DECLARE v_program_id INT          DEFAULT NULL;
    DECLARE v_college_id INT          DEFAULT NULL;

    /* Resolve user by id or email (email case-insensitive) */
    SELECT u.user_id,
           COALESCE(r.role_name,''),
           u.program_id,
           pr.college_id
      INTO v_user_id, v_role_name, v_program_id, v_college_id
      FROM tbl_user u
      JOIN tbl_role r  ON r.role_id = u.role_id
 LEFT JOIN tbl_program pr ON pr.program_id = u.program_id
     WHERE u.user_id = p_user_id_or_email
        OR LOWER(u.email) = LOWER(p_user_id_or_email)
     LIMIT 1;

    /* If user not found → show only global events */
    IF v_user_id IS NULL THEN
        SELECT e.*,
               o.name AS organization_name,
               rc.org_version_id AS organization_version_id,
               GetEventCollaborators(e.event_id) AS collaborators
          FROM tbl_event e
     LEFT JOIN tbl_organization o ON o.organization_id = e.organization_id
     LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
               AND e.cycle_number = rc.cycle_number
         WHERE e.event_type IN ('SDAO','System')
      ORDER BY e.start_date DESC, e.created_at DESC;
        LEAVE proc_main;
    END IF;

    /* SDAO / Academic Director → everything */
    IF v_role_name IN ('SDAO','Academic Director') THEN
        SELECT e.*,
               o.name AS organization_name,
               rc.org_version_id AS organization_version_id,
               GetEventCollaborators(e.event_id) AS collaborators
          FROM tbl_event e
     LEFT JOIN tbl_organization o ON o.organization_id = e.organization_id
     LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
               AND e.cycle_number = rc.cycle_number
      ORDER BY e.start_date DESC, e.created_at DESC;
        LEAVE proc_main;
    END IF;

    /* Everyone else (Dean, Program Chair, Adviser, Student) */
    SELECT DISTINCT
           e.*,
           o.name AS organization_name,
           rc.org_version_id AS organization_version_id,
           GetEventCollaborators(e.event_id) AS collaborators
      FROM tbl_event e
 LEFT JOIN tbl_organization o ON o.organization_id = e.organization_id
 LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
           AND e.cycle_number = rc.cycle_number
     WHERE
           /* Global */
           e.event_type IN ('SDAO','System')

        /* Created by the user */
        OR e.user_id = v_user_id

        /* Owner org: user is a member (Active/Pending) */
        OR EXISTS (
              SELECT 1
                FROM tbl_organization_members m
               WHERE m.user_id = v_user_id
                 AND (m.status IS NULL OR m.status IN ('Active','Pending'))
                 AND m.organization_id = e.organization_id
          )

        /* Collaborator org: user is a member (Active/Pending) */
        OR EXISTS (
              SELECT 1
                FROM tbl_event_collaborator ec
                JOIN tbl_organization_members m
                  ON m.organization_id = ec.organization_id
               WHERE ec.event_id = e.event_id
                 AND m.user_id = v_user_id
                 AND (m.status IS NULL OR m.status IN ('Active','Pending'))
          )

        /* Adviser: org they advise (owner or collaborator) */
        OR (v_role_name = 'Adviser' AND EXISTS (
              SELECT 1
                FROM tbl_organization ao
               WHERE ao.organization_id = e.organization_id
                 AND ao.adviser_id = v_user_id
          ))
        OR (v_role_name = 'Adviser' AND EXISTS (
              SELECT 1
                FROM tbl_event_collaborator ec2
                JOIN tbl_organization ao2
                  ON ao2.organization_id = ec2.organization_id
               WHERE ec2.event_id = e.event_id
                 AND ao2.adviser_id = v_user_id
          ))

        /* Program Chair: base program (owner or collaborator) */
        OR (v_role_name = 'Program Chair' AND v_program_id IS NOT NULL AND EXISTS (
              SELECT 1
                FROM tbl_organization po
               WHERE po.organization_id = e.organization_id
                 AND po.base_program_id = v_program_id
          ))
        OR (v_role_name = 'Program Chair' AND v_program_id IS NOT NULL AND EXISTS (
              SELECT 1
                FROM tbl_event_collaborator ec3
                JOIN tbl_organization po2
                  ON po2.organization_id = ec3.organization_id
               WHERE ec3.event_id = e.event_id
                 AND po2.base_program_id = v_program_id
          ))

        /* Dean: college of the owner/collaborator base program */
        OR (v_role_name = 'Dean' AND v_college_id IS NOT NULL AND EXISTS (
              SELECT 1
                FROM tbl_organization do1
                JOIN tbl_program dp1 ON dp1.program_id = do1.base_program_id
               WHERE do1.organization_id = e.organization_id
                 AND dp1.college_id = v_college_id
          ))
        OR (v_role_name = 'Dean' AND v_college_id IS NOT NULL AND EXISTS (
              SELECT 1
                FROM tbl_event_collaborator ec4
                JOIN tbl_organization do2 ON do2.organization_id = ec4.organization_id
                JOIN tbl_program     dp2 ON dp2.program_id = do2.base_program_id
               WHERE ec4.event_id = e.event_id
                 AND dp2.college_id = v_college_id
          ))

        /* Proposed events: by the user OR by an org they're related to */
        OR EXISTS (
              SELECT 1
                FROM tbl_event_application ea
               WHERE ea.proposed_event_id = e.event_id
                 AND (
                       ea.applicant_user_id = v_user_id
                    OR EXISTS (
                          SELECT 1
                            FROM tbl_organization_members m2
                           WHERE m2.user_id = v_user_id
                             AND (m2.status IS NULL OR m2.status IN ('Active','Pending'))
                             AND m2.organization_id = ea.organization_id
                       )
                    OR (v_role_name = 'Adviser' AND EXISTS (
                          SELECT 1 FROM tbl_organization ao3
                           WHERE ao3.organization_id = ea.organization_id
                             AND ao3.adviser_id = v_user_id
                       ))
                    OR (v_role_name = 'Program Chair' AND v_program_id IS NOT NULL AND EXISTS (
                          SELECT 1 FROM tbl_organization po3
                           WHERE po3.organization_id = ea.organization_id
                             AND po3.base_program_id = v_program_id
                       ))
                    OR (v_role_name = 'Dean' AND v_college_id IS NOT NULL AND EXISTS (
                          SELECT 1
                            FROM tbl_organization do3
                            JOIN tbl_program dp3 ON dp3.program_id = do3.base_program_id
                           WHERE do3.organization_id = ea.organization_id
                             AND dp3.college_id = v_college_id
                       ))
                 )
          )
  ORDER BY e.start_date DESC, e.created_at DESC;

END proc_main $$
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
CREATE DEFINER='admin'@'%' PROCEDURE GetEventById(IN p_event_id INT)
BEGIN
    SELECT
        e.event_id AS id,
        e.organization_id,
        e.cycle_number,
        e.event_type,
        e.user_id,
        e.title,
        e.description,
        e.image,
        e.venue_type,
        e.venue,
        e.start_date,
        e.end_date,
        e.start_time,
        e.end_time,
        e.status,
        e.type,
        e.is_open_to,
        e.fee,
        e.capacity,
        e.created_at,
        e.certificate,
        o.name AS organization_name,
        o.term_option,
        rc.cycle_number AS renewal_cycle_number,
        rc.org_version_id AS organization_version_id,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'organization_id', ec.organization_id,
                    'organization_name', co.name
                )
            )
            FROM tbl_event_collaborator ec
            LEFT JOIN tbl_organization co ON ec.organization_id = co.organization_id
            WHERE ec.event_id = e.event_id
        ) AS collaborators
    FROM tbl_event e
    LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id AND e.cycle_number = rc.cycle_number
    WHERE e.event_id = p_event_id
    LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventsByStatus(IN p_status VARCHAR(20))
BEGIN
    DECLARE norm_status VARCHAR(20);
    SET norm_status = LOWER(TRIM(p_status));

    IF norm_status = 'approved' THEN
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
            e.created_at,
            (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'organization_id', ec.organization_id,
                        'organization_name', co.name
                    )
                )
                FROM tbl_event_collaborator ec
                LEFT JOIN tbl_organization co ON ec.organization_id = co.organization_id
                WHERE ec.event_id = e.event_id
            ) AS collaborators
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
        LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id AND e.cycle_number = rc.cycle_number
        WHERE LOWER(e.status) = 'approved'
          AND (
            (e.end_date > CURDATE())
            OR (e.end_date = CURDATE() AND e.end_time >= CURTIME())
            OR (e.end_date IS NULL AND e.start_date >= CURDATE())
          );
    ELSE
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
            e.created_at,
            (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'organization_id', ec.organization_id,
                        'organization_name', co.name
                    )
                )
                FROM tbl_event_collaborator ec
                LEFT JOIN tbl_organization co ON ec.organization_id = co.organization_id
                WHERE ec.event_id = e.event_id
            ) AS collaborators
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
        LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id AND e.cycle_number = rc.cycle_number
        WHERE LOWER(e.status) = norm_status;
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
    IN p_organization_id INT,
    IN p_application_id INT
)
BEGIN
    -- Top-level declarations (all before statements)
    DECLARE v_step INT;
    DECLARE v_last_step INT;
    DECLARE v_org_version_id INT;
    DECLARE v_existing_org_id INT;
    DECLARE v_version_org_id INT;
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
    DECLARE v_application_type ENUM('new','renewal');
    DECLARE v_president_candidate VARCHAR(200);
    DECLARE v_president_name VARCHAR(255);
    DECLARE v_president_email VARCHAR(255);
    DECLARE v_created_by_is_president INT DEFAULT 0;
    DECLARE v_effective_cycle_number INT DEFAULT 1;
    DECLARE v_last_cycle INT DEFAULT 0;
    DECLARE v_next_cycle INT DEFAULT 1;
    DECLARE v_student_role_id INT;
    DECLARE v_fname VARCHAR(100);
    DECLARE v_lname VARCHAR(100);

    -- Transaction error handler: rollback and re-raise the error
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

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

    -- 4) If this is the final approval step, perform promotion & organization wiring
    IF v_step = v_last_step THEN

        -- Pull application's organization_id (if any) and org_version_id and application type
        SELECT a.organization_id, a.org_version_id, a.application_type
        INTO v_existing_org_id, v_org_version_id, v_application_type
        FROM tbl_application a
        WHERE a.application_id = p_application_id
        LIMIT 1;

        -- Pull the version snapshot fields (the proposed org data) AND the version's organization_id
        SELECT v.organization_id, v.name, v.logo_path, v.description, v.base_program_id,
               v.membership_fee_type, v.membership_fee_amount, v.category,
               v.created_by, v.is_recruiting, v.is_open_to_all_courses
        INTO v_version_org_id, v_org_name, v_org_logo, v_org_description, v_base_program_id,
             v_fee_type, v_fee_amount, v_category,
             v_created_by, v_is_recruiting, v_is_open_to_all_courses
        FROM tbl_organization_version v
        WHERE v.org_version_id = v_org_version_id
        LIMIT 1;

        -- Prefer version.organization_id -> application.organization_id -> p_organization_id -> create
        SET v_new_org_id = NULL;

        IF v_version_org_id IS NOT NULL THEN
            SET v_new_org_id = v_version_org_id;

            -- Decide whether to replace adviser_id
            SELECT COUNT(*) INTO v_created_by_is_president
            FROM tbl_organization_members m
            JOIN tbl_executive_role er ON m.executive_role_id = er.executive_role_id
            WHERE m.user_id = v_created_by
              AND er.rank_id = 1
              AND m.organization_id = v_new_org_id;

            IF v_created_by_is_president > 0 THEN
                UPDATE tbl_organization
                SET name = v_org_name,
                    logo = v_org_logo,
                    description = v_org_description,
                    base_program_id = v_base_program_id,
                    membership_fee_type = v_fee_type,
                    membership_fee_amount = v_fee_amount,
                    category = v_category,
                    adviser_id = adviser_id,
                    status = 'Approved',
                    is_recruiting = v_is_recruiting,
                    is_open_to_all_courses = v_is_open_to_all_courses,
                    current_org_version_id = v_org_version_id
                WHERE organization_id = v_new_org_id;
            ELSE
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
                WHERE organization_id = v_new_org_id;
            END IF;

        ELSEIF v_existing_org_id IS NOT NULL THEN
            SET v_new_org_id = v_existing_org_id;

            SELECT COUNT(*) INTO v_created_by_is_president
            FROM tbl_organization_members m
            JOIN tbl_executive_role er ON m.executive_role_id = er.executive_role_id
            WHERE m.user_id = v_created_by
              AND er.rank_id = 1
              AND m.organization_id = v_new_org_id;

            IF v_created_by_is_president > 0 THEN
                UPDATE tbl_organization
                SET name = v_org_name,
                    logo = v_org_logo,
                    description = v_org_description,
                    base_program_id = v_base_program_id,
                    membership_fee_type = v_fee_type,
                    membership_fee_amount = v_fee_amount,
                    category = v_category,
                    adviser_id = adviser_id,
                    status = 'Approved',
                    is_recruiting = v_is_recruiting,
                    is_open_to_all_courses = v_is_open_to_all_courses,
                    current_org_version_id = v_org_version_id
                WHERE organization_id = v_new_org_id;
            ELSE
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
                WHERE organization_id = v_new_org_id;
            END IF;

            UPDATE tbl_organization_version
            SET organization_id = v_new_org_id
            WHERE org_version_id = v_org_version_id;

        ELSEIF p_organization_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM tbl_organization WHERE organization_id = p_organization_id) THEN
                SET v_new_org_id = p_organization_id;

                SELECT COUNT(*) INTO v_created_by_is_president
                FROM tbl_organization_members m
                JOIN tbl_executive_role er ON m.executive_role_id = er.executive_role_id
                WHERE m.user_id = v_created_by
                  AND er.rank_id = 1
                  AND m.organization_id = v_new_org_id;

                IF v_created_by_is_president > 0 THEN
                    UPDATE tbl_organization
                    SET name = v_org_name,
                        logo = v_org_logo,
                        description = v_org_description,
                        base_program_id = v_base_program_id,
                        membership_fee_type = v_fee_type,
                        membership_fee_amount = v_fee_amount,
                        category = v_category,
                        adviser_id = adviser_id,
                        status = 'Approved',
                        is_recruiting = v_is_recruiting,
                        is_open_to_all_courses = v_is_open_to_all_courses,
                        current_org_version_id = v_org_version_id
                    WHERE organization_id = v_new_org_id;
                ELSE
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
                    WHERE organization_id = v_new_org_id;
                END IF;

                UPDATE tbl_organization_version
                SET organization_id = v_new_org_id
                WHERE org_version_id = v_org_version_id;
            ELSE
                SET v_new_org_id = NULL;
            END IF;
        END IF;

        -- If still no organization ID determined, create a new organization
        IF v_new_org_id IS NULL THEN
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

            UPDATE tbl_organization_version
            SET organization_id = v_new_org_id
            WHERE org_version_id = v_org_version_id;
        END IF;

        -- **NEW: Archive all other organization versions for this organization_id and approve the current one**
        UPDATE tbl_organization_version 
        SET status = 'Archived',
            archived_at = CURRENT_TIMESTAMP,
            archived_by = (SELECT approver_id FROM tbl_approval_process WHERE approval_id = p_approval_id),
            archived_reason = 'Superseded by approved application'
        WHERE organization_id = v_new_org_id 
          AND org_version_id != v_org_version_id;  -- Don't archive the current version
        
        -- **NEW: Set the current organization version to Approved**
        UPDATE tbl_organization_version 
        SET status = 'Approved',
            valid_from = CURRENT_DATE,
            archived_at = NULL,
            archived_by = NULL,
            archived_reason = NULL
        WHERE org_version_id = v_org_version_id;

        -- Defensive check
        IF v_new_org_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization ID is NULL before renewal cycle insert.';
        END IF;

        -- Get default student role
        SET v_student_role_id = (
            SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'student' LIMIT 1
        );
        IF v_student_role_id IS NULL THEN
            SET v_student_role_id = (SELECT role_id FROM tbl_role LIMIT 1);
        END IF;

        -- STEP 1: Create ALL users from tbl_application_executives FIRST
        BEGIN
            DECLARE done INT DEFAULT FALSE;
            DECLARE v_proposed_user_id VARCHAR(200);
            DECLARE v_proposed_name VARCHAR(255);
            DECLARE v_proposed_email VARCHAR(255);
            
            DECLARE user_cursor CURSOR FOR
                SELECT proposed_user_id, proposed_name, proposed_email
                FROM tbl_application_executives
                WHERE application_id = p_application_id;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN user_cursor;
            user_loop: LOOP
                FETCH user_cursor INTO v_proposed_user_id, v_proposed_name, v_proposed_email;
                IF done THEN
                    LEAVE user_loop;
                END IF;

                -- Normalize email
                SET v_proposed_email = LOWER(TRIM(v_proposed_email));

                -- Check if user exists
                IF NOT EXISTS (SELECT 1 FROM tbl_user WHERE user_id = v_proposed_user_id) THEN
                    -- Parse name
                    IF v_proposed_name IS NULL OR v_proposed_name = '' THEN
                        SET v_fname = 'Pending';
                        SET v_lname = 'User';
                    ELSE
                        SET v_fname = TRIM(SUBSTRING_INDEX(v_proposed_name, ' ', 1));
                        SET v_lname = TRIM(SUBSTRING(v_proposed_name, CHAR_LENGTH(v_fname) + 2));
                        IF v_lname = '' OR v_lname IS NULL THEN
                            SET v_lname = v_fname;
                        END IF;
                    END IF;

                    -- Ensure email is valid
                    IF v_proposed_email IS NULL OR v_proposed_email = '' THEN
                        SET v_proposed_email = CONCAT('pending+', v_proposed_user_id, '@students.nu-dasma.edu.ph');
                    END IF;

                    -- Create the user
                    INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, status, created_at)
                    VALUES (v_proposed_user_id, v_fname, v_lname, v_proposed_email, v_base_program_id, v_student_role_id, 'Pending', CURRENT_TIMESTAMP);
                END IF;

            END LOOP user_loop;
            CLOSE user_cursor;
        END;

        -- STEP 2: Get president for renewal cycle
        SET v_president_candidate = NULL;
        
        SELECT ae.proposed_user_id 
        INTO v_president_candidate
        FROM tbl_application_executives ae
        WHERE ae.application_id = p_application_id
          AND ae.proposed_rank_id = 1
        LIMIT 1;

        -- If no president found in executives, use created_by
        IF v_president_candidate IS NULL OR v_president_candidate = '' THEN
            SET v_president_candidate = v_created_by;
        END IF;

        -- STEP 3: Create renewal cycle
        IF v_application_type = 'new' THEN
            SET v_effective_cycle_number = 1;
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
                    v_president_candidate,
                    v_org_version_id,
                    CURRENT_TIMESTAMP
                );
            ELSE
                UPDATE tbl_renewal_cycle
                SET president_id = v_president_candidate,
                    org_version_id = v_org_version_id
                WHERE organization_id = v_new_org_id AND cycle_number = 1;
            END IF;
        ELSE
            -- renewal: create next cycle
            SELECT COALESCE(MAX(cycle_number), 0) INTO v_last_cycle
            FROM tbl_renewal_cycle
            WHERE organization_id = v_new_org_id;

            SET v_next_cycle = v_last_cycle + 1;
            SET v_effective_cycle_number = v_next_cycle;

            INSERT INTO tbl_renewal_cycle (
                organization_id,
                cycle_number,
                start_date,
                president_id,
                org_version_id,
                created_at
            ) VALUES (
                v_new_org_id,
                v_effective_cycle_number,
                CURRENT_DATE,
                v_president_candidate,
                v_org_version_id,
                CURRENT_TIMESTAMP
            );
        END IF;

        -- STEP 4: Create executive roles and organization members
        BEGIN
            DECLARE done INT DEFAULT FALSE;
            DECLARE v_proposed_user_id VARCHAR(200);
            DECLARE v_proposed_title VARCHAR(100);
            DECLARE v_proposed_rank_id INT;
            DECLARE v_executive_role_id INT;

            DECLARE exec_cursor CURSOR FOR
                SELECT proposed_user_id, proposed_title, proposed_rank_id
                FROM tbl_application_executives
                WHERE application_id = p_application_id;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN exec_cursor;
            exec_loop: LOOP
                FETCH exec_cursor INTO v_proposed_user_id, v_proposed_title, v_proposed_rank_id;
                IF done THEN
                    LEAVE exec_loop;
                END IF;

                -- Normalize title
                SET v_proposed_title = TRIM(v_proposed_title);

                -- Determine rank_id
                IF v_proposed_rank_id IS NULL THEN
                    SET v_proposed_rank_id = (SELECT rank_id FROM tbl_executive_rank WHERE LOWER(default_title) = LOWER(v_proposed_title) LIMIT 1);
                END IF;
                IF v_proposed_rank_id IS NULL THEN
                    SET v_proposed_rank_id = (SELECT MIN(rank_id) FROM tbl_executive_rank);
                END IF;

                -- Find or insert executive_role
                SET v_executive_role_id = (
                    SELECT executive_role_id FROM tbl_executive_role
                    WHERE organization_id = v_new_org_id
                      AND cycle_number = v_effective_cycle_number
                      AND role_title = v_proposed_title
                      AND rank_id = v_proposed_rank_id
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
                        v_effective_cycle_number,
                        v_proposed_title,
                        v_proposed_rank_id,
                        CURRENT_TIMESTAMP
                    );
                    SET v_executive_role_id = LAST_INSERT_ID();
                END IF;

                -- Insert or update organization member
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
                    v_effective_cycle_number,
                    v_proposed_user_id,
                    'Executive',
                    v_executive_role_id,
                    'Active',
                    CURRENT_TIMESTAMP,
                    v_org_version_id
                )
                ON DUPLICATE KEY UPDATE
                    executive_role_id = v_executive_role_id,
                    member_type = 'Executive',
                    status = 'Active',
                    org_version_id = v_org_version_id;

            END LOOP exec_loop;
            CLOSE exec_cursor;
        END;

        -- Mark requirement submissions as approved
        UPDATE tbl_organization_requirement_submission s
        SET s.status = 'Approved'
        WHERE s.application_id = p_application_id;

        -- **NEW: Insert default membership questions for the approved organization**
        -- Only create default questions if none exist for this organization and cycle
        IF NOT EXISTS (
            SELECT 1 FROM tbl_membership_question 
            WHERE organization_id = v_new_org_id 
              AND cycle_number = v_effective_cycle_number
        ) THEN
            -- Insert default membership questions
            INSERT INTO tbl_membership_question (
                organization_id, 
                cycle_number, 
                question_text, 
                question_type, 
                is_required, 
                options
            ) VALUES 
            (v_new_org_id, v_effective_cycle_number, 'Why do you want to join this organization?', 'text', TRUE, NULL),
            (v_new_org_id, v_effective_cycle_number, 'What skills or experiences can you contribute to the organization?', 'text', TRUE, NULL),
            (v_new_org_id, v_effective_cycle_number, 'What are your expectations from this organization?', 'text', FALSE, NULL);
        END IF;

        -- Update application status
        UPDATE tbl_application
        SET status = 'Approved',
            organization_id = v_new_org_id
        WHERE application_id = p_application_id;

        -- Send invitation emails to all officers
        BEGIN
            DECLARE done INT DEFAULT FALSE;
            DECLARE v_officer_email VARCHAR(255);
            DECLARE v_officer_name VARCHAR(255);
            
            DECLARE email_cursor CURSOR FOR
                SELECT DISTINCT u.email, CONCAT(u.f_name, ' ', u.l_name) as full_name
                FROM tbl_application_executives ae
                JOIN tbl_user u ON ae.proposed_user_id = u.user_id
                WHERE ae.application_id = p_application_id
                  AND u.email IS NOT NULL 
                  AND u.email != ''
                  AND u.status = 'Pending';

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN email_cursor;
            email_loop: LOOP
                FETCH email_cursor INTO v_officer_email, v_officer_name;
                IF done THEN
                    LEAVE email_loop;
                END IF;

                -- Log invitation attempt for audit trail
                CALL LogAction(
                    'system@nu-dasma.edu.ph',
                    'Sent officer invitation email',
                    'user_invitation',
                    JSON_OBJECT(
                        'organization_name', v_org_name,
                        'recipient_email', v_officer_email,
                        'recipient_name', v_officer_name,
                        'application_id', p_application_id,
                        'organization_id', v_new_org_id
                    ),
                    NULL,
                    NULL
                );

            END LOOP email_loop;
            CLOSE email_cursor;
        END;
    END IF;

    -- Commit transaction
    COMMIT;

    -- Return results
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
                    'adviser_id', (CASE WHEN v_created_by_is_president > 0 THEN (SELECT adviser_id FROM tbl_organization WHERE organization_id = v_new_org_id) ELSE v_created_by END),
                    'status', 'Approved',
                    'is_recruiting', v_is_recruiting,
                    'is_open_to_all_courses', v_is_open_to_all_courses,
                    'effective_cycle', v_effective_cycle_number,
                    'current_org_version_id', v_org_version_id
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
    DECLARE v_user_email VARCHAR(100);
    DECLARE v_approver_email VARCHAR(100);
    DECLARE v_event_title VARCHAR(300);

    -- Set remarks to 'No Remarks' if NULL or empty
    IF p_remarks IS NULL OR LENGTH(TRIM(p_remarks)) = 0 THEN
        SET v_final_remarks = 'No Remarks';
    ELSE
        SET v_final_remarks = p_remarks;
    END IF;

    -- Get user email, approver email, and event title for notification
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id;
    SELECT email INTO v_approver_email FROM tbl_user WHERE user_id = p_approver_id;
    SELECT title INTO v_event_title FROM tbl_event WHERE event_id = p_event_id;

    -- Find the MOST RECENT attendance record (to handle cases where multiple records exist)
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = p_event_id 
      AND user_id = p_user_id 
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No registration found for this event and user';
    END IF;

    -- Clean up any duplicate attendance records (keep the most recent one)
    DELETE FROM tbl_event_attendance 
    WHERE event_id = p_event_id 
      AND user_id = p_user_id 
      AND attendance_id != v_attendance_id
      AND deleted_at IS NULL;

    -- Get the MOST RECENT transaction ID if exists
    SELECT te.transaction_id INTO v_transaction_id
    FROM tbl_transaction_event te
    JOIN tbl_transaction t ON te.transaction_id = t.transaction_id
    WHERE te.event_id = p_event_id 
      AND t.user_id = p_user_id
      AND t.status IN ('Pending', 'Processing')  -- Only get pending transactions
    ORDER BY t.created_at DESC
    LIMIT 1;

    -- Update attendance status
    UPDATE tbl_event_attendance
    SET status = 'Registered',
        updated_at = CURRENT_TIMESTAMP
    WHERE attendance_id = v_attendance_id;

    -- Update transaction status and remarks if exists
    IF v_transaction_id IS NOT NULL THEN
        -- Clean up any duplicate pending transactions for the same event/user
        UPDATE tbl_transaction t
        JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
        SET t.status = 'Cancelled'
        WHERE te.event_id = p_event_id 
          AND t.user_id = p_user_id
          AND t.transaction_id != v_transaction_id
          AND t.status IN ('Pending', 'Processing');

        -- Update the selected transaction
        UPDATE tbl_transaction
        SET status = 'Completed',
            updated_at = CURRENT_TIMESTAMP
        WHERE transaction_id = v_transaction_id;

        UPDATE tbl_transaction_event
        SET remarks = CONCAT('Approved: ', v_final_remarks)
        WHERE transaction_id = v_transaction_id;
    END IF;

    -- Log the approval
    CALL LogAction(
        v_approver_email, 
        CONCAT('Approved registration for "', v_event_title, '" by ', v_user_email), 
        'Attendance Approval',
        JSON_OBJECT(
            'event_id', p_event_id,
            'event_title', v_event_title,
            'user_id', p_user_id,
            'user_email', v_user_email,
            'attendance_id', v_attendance_id,
            'transaction_id', v_transaction_id,
            'remarks', v_final_remarks
        ),
        CONCAT('/event-attendance/', p_event_id), 
        NULL
    );

    -- Send notification to user
    CALL CreateNotification(
        'Event Registration Approved',
        CONCAT('Your registration for "', v_event_title, '" has been approved. ', v_final_remarks),
        CONCAT('/events/', p_event_id),
        'event',
        p_event_id,
        p_approver_id,
        JSON_ARRAY(v_user_email),
        'registration_approved'
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
    DECLARE v_user_email VARCHAR(100);
    DECLARE v_approver_email VARCHAR(100);
    DECLARE v_event_title VARCHAR(300);

    -- Get user email, approver email, and event title for notification
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id;
    SELECT email INTO v_approver_email FROM tbl_user WHERE user_id = p_approver_id;
    SELECT title INTO v_event_title FROM tbl_event WHERE event_id = p_event_id;

    -- Find the MOST RECENT attendance record
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = p_event_id 
      AND user_id = p_user_id 
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_attendance_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'No registration found for this event and user';
    END IF;

    -- Get the MOST RECENT transaction ID if exists
    SELECT te.transaction_id INTO v_transaction_id
    FROM tbl_transaction_event te
    JOIN tbl_transaction t ON te.transaction_id = t.transaction_id
    WHERE te.event_id = p_event_id 
      AND t.user_id = p_user_id
      AND t.status IN ('Pending', 'Processing')
    ORDER BY t.created_at DESC
    LIMIT 1;

    -- Update attendance status to Rejected (don't soft-delete to allow re-registration)
    UPDATE tbl_event_attendance
    SET status = 'Rejected',
        updated_at = CURRENT_TIMESTAMP
    WHERE attendance_id = v_attendance_id;

    -- Update transaction status and remarks if exists
    IF v_transaction_id IS NOT NULL THEN
        UPDATE tbl_transaction
        SET status = 'Failed',
            updated_at = CURRENT_TIMESTAMP
        WHERE transaction_id = v_transaction_id;

        UPDATE tbl_transaction_event
        SET remarks = CONCAT('Rejected: ', p_reason)
        WHERE transaction_id = v_transaction_id;
    END IF;

    -- Log the rejection
    CALL LogAction(
        v_approver_email, 
        CONCAT('Rejected registration for "', v_event_title, '" by ', v_user_email, ' - Reason: ', p_reason), 
        'Attendance Rejection',
        JSON_OBJECT(
            'event_id', p_event_id,
            'event_title', v_event_title,
            'user_id', p_user_id,
            'user_email', v_user_email,
            'attendance_id', v_attendance_id,
            'transaction_id', v_transaction_id,
            'reason', p_reason
        ),
        CONCAT('/event-attendance/', p_event_id), 
        NULL
    );

    -- Send notification to user
    CALL CreateNotification(
        'Event Registration Rejected',
        CONCAT('Your registration for "', v_event_title, '" has been rejected. Reason: ', p_reason),
        CONCAT('/events/', p_event_id),
        'event',
        p_event_id,
        p_approver_id,
        JSON_ARRAY(v_user_email),
        'registration_rejected'
    );

    SELECT 'Attendance rejected successfully' AS message;
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
    -- Total registered
    SELECT COUNT(*) INTO @total_registered
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND status IN ('Registered', 'Attended', 'Evaluated');

    -- Total attended (Attended or Evaluated)
    SELECT COUNT(*) INTO @total_attended
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND status IN ('Attended', 'Evaluated');

    -- Total evaluated (Evaluated)
    SELECT COUNT(*) INTO @total_evaluated
    FROM tbl_event_attendance
    WHERE event_id = p_event_id AND status = 'Evaluated';

    -- Attendance Rate
    SET @attendance_rate = IF(@total_registered > 0, ROUND((@total_attended / @total_registered) * 100, 1), 0);

    -- Evaluation Completion Rate
    SET @evaluation_rate = IF(@total_attended > 0, ROUND((@total_evaluated / @total_attended) * 100, 1), 0);

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
        @total_attended AS totalAttended,
        @attendance_rate AS attendanceRate,
        @total_evaluated AS totalEvaluated,
        @evaluation_rate AS evaluationRate,
        ROUND(COALESCE(@avg_rating, 0), 2) AS averageRating,
        CONCAT(FLOOR(COALESCE(@avg_feedback_time, 0) / 60), 'm ', 
               MOD(COALESCE(@avg_feedback_time, 0), 60), 's') AS avgFeedbackTime;
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
CREATE DEFINER='admin'@'%' PROCEDURE GetOrgRelevantLogs(
    IN p_user_id_or_email VARCHAR(200),  -- pass NULL/'' for system-wide
    IN p_type             VARCHAR(100),
    IN p_start_date       DATETIME,
    IN p_end_date         DATETIME
)
proc_main: BEGIN
    DECLARE v_user_id    VARCHAR(200) DEFAULT NULL;
    DECLARE v_role_name  VARCHAR(100) DEFAULT '';
    DECLARE v_program_id INT          DEFAULT NULL;
    DECLARE v_college_id INT          DEFAULT NULL;

    /* ---------- System-wide fast path (no user) ---------- */
    IF p_user_id_or_email IS NULL OR p_user_id_or_email = '' THEN
        SELECT 
            l.log_id,
            l.user_id,
            CONCAT(u.f_name, ' ', u.l_name) AS full_name,
            u.profile_picture,
            l.timestamp,
            l.action_type AS action,
            l.redirect_url,
            l.file_path,
            l.meta_data,
            l.type
        FROM tbl_logs l
        LEFT JOIN tbl_user u ON u.user_id = l.user_id
        WHERE (p_type IS NULL OR l.type = p_type)
          AND (p_start_date IS NULL OR l.timestamp >= p_start_date)
          AND (p_end_date   IS NULL OR l.timestamp <= p_end_date)
        ORDER BY l.timestamp DESC;
        LEAVE proc_main;
    END IF;

    /* ---------- Resolve user (by user_id OR email) ---------- */
    SELECT u.user_id,
           COALESCE(r.role_name,''), 
           u.program_id,
           pr.college_id
      INTO v_user_id, v_role_name, v_program_id, v_college_id
      FROM tbl_user u
      JOIN tbl_role r  ON r.role_id = u.role_id
 LEFT JOIN tbl_program pr ON pr.program_id = u.program_id
     WHERE u.user_id = p_user_id_or_email
        OR u.email   = p_user_id_or_email
     LIMIT 1;

    IF v_user_id IS NULL THEN
        SELECT * FROM tbl_logs WHERE 1=0;
        LEAVE proc_main;
    END IF;

    /* ---------- Super roles: SDAO / Academic Director -> all logs ---------- */
    IF v_role_name IN ('SDAO','Academic Director') THEN
        SELECT 
            l.log_id,
            l.user_id,
            CONCAT(u.f_name, ' ', u.l_name) AS full_name,
            u.profile_picture,
            l.timestamp,
            l.action_type AS action,
            l.redirect_url,
            l.file_path,
            l.meta_data,
            l.type
        FROM tbl_logs l
        LEFT JOIN tbl_user u ON u.user_id = l.user_id
        WHERE (p_type IS NULL OR l.type = p_type)
          AND (p_start_date IS NULL OR l.timestamp >= p_start_date)
          AND (p_end_date   IS NULL OR l.timestamp <= p_end_date)
        ORDER BY l.timestamp DESC;
        LEAVE proc_main;
    END IF;

    /* ---------- Build scope (no temp tables; two CTE copies for safe reuse) ---------- */
    WITH
    scope_owner AS (
        /* Adviser orgs */
        SELECT o.organization_id
          FROM tbl_organization o
         WHERE o.adviser_id = v_user_id
        UNION DISTINCT
        /* Active memberships */
        SELECT m.organization_id
          FROM tbl_organization_members m
         WHERE m.user_id = v_user_id
           AND (m.status IS NULL OR m.status = 'Active')
        UNION DISTINCT
        /* Program Chair (base program) */
        SELECT o2.organization_id
          FROM tbl_organization o2
         WHERE v_role_name = 'Program Chair'
           AND v_program_id IS NOT NULL
           AND o2.base_program_id = v_program_id
        UNION DISTINCT
        /* Program Chair (mapped courses) */
        SELECT oc.organization_id
          FROM tbl_organization_course oc
         WHERE v_role_name = 'Program Chair'
           AND v_program_id IS NOT NULL
           AND oc.program_id = v_program_id
        UNION DISTINCT
        /* Dean (base program’s college) */
        SELECT o3.organization_id
          FROM tbl_organization o3
          JOIN tbl_program bp ON bp.program_id = o3.base_program_id
         WHERE v_role_name = 'Dean'
           AND v_college_id IS NOT NULL
           AND bp.college_id = v_college_id
        UNION DISTINCT
        /* Dean (mapped courses’ college) */
        SELECT oc2.organization_id
          FROM tbl_organization_course oc2
          JOIN tbl_program p ON p.program_id = oc2.program_id
         WHERE v_role_name = 'Dean'
           AND v_college_id IS NOT NULL
           AND p.college_id = v_college_id
    ),
    scope_collab AS (  /* safe second copy for collaborator join */
        SELECT * FROM scope_owner
    ),
    logs_slim AS (
        /* Extract only the ids we need from meta_data JSON. Keep it simple. */
        SELECT
          l.log_id,
          l.user_id,
          l.timestamp,
          l.action_type,
          l.redirect_url,
          l.file_path,
          l.meta_data,
          l.type,
          /* organization id (direct) */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.organization_id')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.organizationId')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.org_id')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.orgId'))
          ),'') AS UNSIGNED) AS org_id_any,
          /* event id */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.event_id')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.eventId'))
          ),'') AS UNSIGNED) AS evt_id_any,
          /* transaction id */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.transaction_id')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.transactionId'))
          ),'') AS UNSIGNED) AS txn_id_any,
          /* event application id */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.event_application_id')),
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.eventApplicationId'))
          ),'') AS UNSIGNED) AS evapp_id_any,
          /* organization application id */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.application_id'))
          ),'') AS UNSIGNED) AS app_id_any,
          /* requirement submission id (pre/post event) */
          CAST(NULLIF(COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(l.meta_data,'$.submission_id'))
          ),'') AS UNSIGNED) AS ers_id_any
        FROM tbl_logs l
        WHERE (p_type IS NULL OR l.type = p_type)
          AND (p_start_date IS NULL OR l.timestamp >= p_start_date)
          AND (p_end_date   IS NULL OR l.timestamp <= p_end_date)
    )
    SELECT 
        ls.log_id,
        ls.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.profile_picture,
        ls.timestamp,
        ls.action_type AS action,
        ls.redirect_url,
        ls.file_path,
        ls.meta_data,
        ls.type
    FROM logs_slim ls
    /* who did it */
    LEFT JOIN tbl_user u ON u.user_id = ls.user_id

    /* --- resolve owner org candidates via plain LEFT JOINs --- */
    /* direct org id */
    LEFT JOIN scope_owner so_direct
           ON so_direct.organization_id = ls.org_id_any

    /* event on the log */
    LEFT JOIN tbl_event e
           ON e.event_id = ls.evt_id_any

    /* transaction → membership org */
    LEFT JOIN tbl_transaction_membership tm
           ON tm.transaction_id = ls.txn_id_any

    /* transaction → event → owner org */
    LEFT JOIN tbl_transaction_event te
           ON te.transaction_id = ls.txn_id_any
    LEFT JOIN tbl_event e_tx
           ON e_tx.event_id = te.event_id

    /* event application → org */
    LEFT JOIN tbl_event_application ea
           ON ea.event_application_id = ls.evapp_id_any

    /* organization application → org */
    LEFT JOIN tbl_application app
           ON app.application_id = ls.app_id_any

    /* requirement submission → org (pre/post-event) */
    LEFT JOIN tbl_event_requirement_submissions ers
           ON ers.submission_id = ls.ers_id_any

    /* now map any of those orgs to the user's owner-scope */
    LEFT JOIN scope_owner so_owner
           ON so_owner.organization_id = COALESCE(
                ls.org_id_any,
                e.organization_id,
                tm.organization_id,
                e_tx.organization_id,
                ea.organization_id,
                app.organization_id,
                ers.organization_id
           )

    /* collaborator match from the main event on log */
    LEFT JOIN tbl_event_collaborator ec1
           ON ec1.event_id = ls.evt_id_any
    LEFT JOIN scope_collab sc1
           ON sc1.organization_id = ec1.organization_id

    /* collaborator match from the transaction's event */
    LEFT JOIN tbl_event_collaborator ec2
           ON ec2.event_id = e_tx.event_id
    LEFT JOIN scope_collab sc2
           ON sc2.organization_id = ec2.organization_id

    /* visibility rules */
    WHERE
          so_direct.organization_id IS NOT NULL
       OR so_owner.organization_id  IS NOT NULL
       OR sc1.organization_id       IS NOT NULL
       OR sc2.organization_id       IS NOT NULL
       OR e.event_type   = 'SDAO'
       OR e_tx.event_type = 'SDAO'
    ORDER BY ls.timestamp DESC;

END proc_main $$
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
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationById(
    IN p_organization_id INT,
    IN p_organization_version_id INT
)
BEGIN
    SELECT 
        o.organization_id AS id,
        o.name AS organization_name,
        o.logo AS organization_logo,
        o.status AS organization_status,
        rc.cycle_number,
        o.category,
        p.name AS program_name,
        o.created_at,
        rc.org_version_id AS organization_version_id
    FROM tbl_organization o
    LEFT JOIN tbl_program p ON o.base_program_id = p.program_id
    LEFT JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
        AND rc.org_version_id = p_organization_version_id
    WHERE o.organization_id = p_organization_id
      AND o.status = 'Approved';
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationUsers(
  IN p_organization_id INT,
  IN p_org_version_id INT
)
BEGIN
  DECLARE v_cycle_number INT;

  -- Find the cycle that is explicitly linked to the provided org_version_id
  SELECT rc.cycle_number
    INTO v_cycle_number
  FROM tbl_renewal_cycle rc
  WHERE rc.organization_id = p_organization_id
    AND rc.org_version_id = p_org_version_id
  ORDER BY rc.cycle_number DESC
  LIMIT 1;

  -- If no cycle is found for that version, return an empty result (correct columns, no rows)
  IF v_cycle_number IS NULL THEN
    SELECT 
      CAST(NULL AS CHAR(200)) AS user_id,
      CAST(NULL AS CHAR(100)) AS email,
      CAST(NULL AS CHAR(50))  AS f_name,
      CAST(NULL AS CHAR(50))  AS l_name,
      CAST(NULL AS CHAR(200)) AS program_name,
      CAST(NULL AS CHAR(100)) AS role,
      CAST(NULL AS UNSIGNED)  AS is_executive,
      CAST(NULL AS UNSIGNED)  AS is_committee
    WHERE 1 = 0;
  ELSE
    SELECT DISTINCT
        u.user_id,
        u.email,
        u.f_name,
        u.l_name,
        p.name AS program_name,
        COALESCE(er.role_title, 'Member') AS role,
        (om.member_type = 'Executive') AS is_executive,
        EXISTS (
            SELECT 1
            FROM tbl_committee_members cm
            JOIN tbl_committee c 
              ON cm.committee_id = c.committee_id
            WHERE cm.user_id = u.user_id
              AND c.organization_id = om.organization_id
              AND c.cycle_number = om.cycle_number
        ) AS is_committee
    FROM tbl_user u
    JOIN tbl_organization_members om 
      ON u.user_id = om.user_id
     AND om.organization_id = p_organization_id
     AND om.cycle_number   = v_cycle_number
    LEFT JOIN tbl_executive_role er 
      ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p 
      ON u.program_id = p.program_id
    WHERE om.status = 'Active'
      AND u.status  = 'Active'
    ORDER BY u.f_name, u.l_name;
  END IF;
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
    IN p_emails JSON,
    IN p_checker VARCHAR(255)
)
BEGIN
    -- Returns { unavailable: [email1, email2, ...] }
    -- unavailable if: not student role OR is executive in any org
    DECLARE v_unavailable_emails JSON;
    DECLARE v_checker_org_id INT;

    -- Ensure temp table is fresh for each call
    DROP TEMPORARY TABLE IF EXISTS temp_emails;
    CREATE TEMPORARY TABLE temp_emails (
        email VARCHAR(255) NOT NULL,
        PRIMARY KEY (email)
    );

    -- Normalize checker input
    SET p_checker = TRIM(COALESCE(p_checker, ''));

    IF p_checker = '' THEN
        -- 1) Insert users whose role is NOT student and whose email is in supplied JSON
        INSERT IGNORE INTO temp_emails (email)
        SELECT u.email
        FROM tbl_user u
        JOIN tbl_role r ON u.role_id = r.role_id
        WHERE JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
          AND LOWER(r.role_name) != 'student';

        -- 2) Insert emails that are executives in any organization
        INSERT IGNORE INTO temp_emails (email)
        SELECT DISTINCT u.email
        FROM tbl_user u
        JOIN tbl_organization_members om ON u.user_id = om.user_id
        WHERE JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
          AND om.member_type = 'Executive';

    ELSE
        -- Find checker org_id only if checker is an active Executive or has rank_level = 1 (president)
        SELECT om.organization_id
        INTO v_checker_org_id
        FROM tbl_user u
        JOIN tbl_organization_members om ON u.user_id = om.user_id
        LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
        LEFT JOIN tbl_executive_rank rk ON er.rank_id = rk.rank_id
        WHERE u.email = p_checker
          AND om.status = 'Active'
          AND (
              om.member_type = 'Executive'
              OR rk.rank_level = 1
          )
        LIMIT 1;

        IF v_checker_org_id IS NULL THEN
            DROP TEMPORARY TABLE IF EXISTS temp_emails;
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Checker is not an active executive/president of any organization.';
        END IF;

        -- Only mark as unavailable if role is not student within the same organization
        INSERT IGNORE INTO temp_emails (email)
        SELECT DISTINCT u.email
        FROM tbl_user u
        JOIN tbl_organization_members om ON u.user_id = om.user_id
        JOIN tbl_role r ON u.role_id = r.role_id
        WHERE JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
          AND om.organization_id = v_checker_org_id
          AND om.status = 'Active'
          AND LOWER(r.role_name) != 'student';

        -- If any of the supplied emails are executives in another organization -> error
        IF EXISTS (
            SELECT 1
            FROM tbl_user u
            JOIN tbl_organization_members om ON u.user_id = om.user_id
            WHERE JSON_CONTAINS(p_emails, CAST(CONCAT('"', u.email, '"') AS JSON))
              AND om.member_type = 'Executive'
              AND om.organization_id != v_checker_org_id
        ) THEN
            DROP TEMPORARY TABLE IF EXISTS temp_emails;
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One or more emails belong to executives of another organization.';
        END IF;
    END IF;

    -- Aggregate distinct emails (if none, return empty array)
    SELECT COALESCE(JSON_ARRAYAGG(email), JSON_ARRAY()) INTO v_unavailable_emails FROM temp_emails;

    -- Cleanup
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
        e.certificate AS certificate_type,
        e.organization_id,
        e.image,
        -- Get organization_version_id from the renewal cycle
        rc.org_version_id AS organization_version_id
    FROM tbl_event_certificate ec
    JOIN tbl_event e ON ec.event_id = e.event_id
    LEFT JOIN tbl_renewal_cycle rc ON e.organization_id = rc.organization_id 
        AND e.cycle_number = rc.cycle_number
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

    -- Determine cycle number for the provided version (if any)
    SELECT cycle_number
    INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id
    LIMIT 1;

    -- default cycle to 1 if not found
    IF v_cycle_number IS NULL THEN
        SET v_cycle_number = 1;
    END IF;

    -- Return details sourced from the organization_version row.
    -- Adviser is taken exclusively from tbl_organization.adviser_id when the version is linked to an org.
    SELECT JSON_OBJECT(
        'organization_detail', JSON_OBJECT(
            'id', COALESCE(v.organization_id, p_org_id),
            'org_version_id', v.org_version_id,
            'org_name', v.name,
            'category', v.category,
            'logo', v.logo_path,
            'cycle_number', v_cycle_number,
            'description', v.description,
            'membership_fee_type', v.membership_fee_type,
            'membership_fee_amount', v.membership_fee_amount,
            'is_recruiting', v.is_recruiting,
            'is_open_to_all_courses', v.is_open_to_all_courses,
            'term_option', o.term_option,
            -- Adviser placed back inside organization_detail (ONLY from tbl_organization.adviser_id)
            'adviser', CASE
                WHEN v.organization_id IS NOT NULL AND adv.user_id IS NOT NULL THEN JSON_OBJECT(
                    'user_id', adv.user_id,
                    'first_name', adv.f_name,
                    'last_name', adv.l_name,
                    'email', adv.email
                )
                ELSE NULL
            END,
            'programs', (
                SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'name', prog.name,
                    'abbreviation', prog.abbreviation,
                    'program_id', prog.program_id,
                    'is_base', CASE WHEN prog.program_id = v.base_program_id THEN 1 ELSE 0 END
                ))
                FROM (
                    SELECT p.program_id, p.name, p.abbreviation
                    FROM tbl_program p
                    WHERE p.program_id = v.base_program_id
                    UNION
                    SELECT p.program_id, p.name, p.abbreviation
                    FROM tbl_organization_version_course ovp
                    JOIN tbl_program p ON ovp.program_id = p.program_id
                    WHERE ovp.org_version_id = p_org_version_id
                ) AS prog
            )
        ),
        -- Who proposed/created this organization version (student or applicant)
        'proposed_by', JSON_OBJECT(
            'user_id', proposer.user_id,
            'first_name', proposer.f_name,
            'last_name', proposer.l_name,
            'email', proposer.email
        ),
        -- Executives for the effective org & cycle (if any)
        'executive_members', (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'first_name', u.f_name,
                'last_name', u.l_name,
                'email', u.email,
                'role_title', er.role_title,
                'rank_id', er.rank_id,
                'program_name', p.name
            ))
            FROM tbl_organization_members om
            JOIN tbl_user u ON om.user_id = u.user_id
            JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
            LEFT JOIN tbl_program p ON u.program_id = p.program_id
            WHERE om.organization_id = COALESCE(v.organization_id, p_org_id)
                AND om.cycle_number = v_cycle_number
                AND om.member_type = 'Executive'
        ),
        -- Committees and roles for the effective org & cycle (if any)
        'committee_roles', (
            SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'committee_name', c.name,
                'role_name', cr.role_name
            ))
            FROM tbl_committee_role cr
            JOIN tbl_committee c ON cr.committee_id = c.committee_id
            WHERE c.organization_id = COALESCE(v.organization_id, p_org_id)
                AND c.cycle_number = v_cycle_number
        )
    ) AS result
    FROM tbl_organization_version v
    LEFT JOIN tbl_organization o ON v.organization_id = o.organization_id
    -- adviser strictly from tbl_organization.adviser_id (no fallback)
    LEFT JOIN tbl_user adv ON o.adviser_id = adv.user_id
    LEFT JOIN tbl_user proposer ON v.created_by = proposer.user_id
    WHERE v.org_version_id = p_org_version_id
    LIMIT 1;
END $$
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
        p.name AS program_name,
        er.rank_id,          -- Added: Rank ID from tbl_executive_role
        erk.rank_level       -- Added: Rank level from tbl_executive_rank
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_executive_rank erk ON er.rank_id = erk.rank_id  -- Added: Join to get rank details
    WHERE om.organization_id = p_org_id
        AND om.cycle_number = v_cycle_number
        AND om.member_type = 'Executive';
END $$
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
    /* ========== 1) Application + Event + Collaborators (JSON) ========== */
    SELECT 
        ea.event_application_id,
        ea.organization_id,
        o.name AS organization_name,
        o.adviser_id,
        CONCAT(adviser.f_name, ' ', adviser.l_name) AS adviser_name,
        ea.cycle_number,
        rc.start_date AS cycle_start_date,
        rc.org_version_id AS organization_version_id,
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
        ea.updated_at AS application_updated_at,

        /* NEW: collaborators as JSON array (empty [] if none) */
        (
            SELECT IFNULL(
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'organization_id', ec.organization_id,
                        'organization_name', co.name,
                        'base_program_id', co.base_program_id,
                        'logo', co.logo
                    )
                ),
                JSON_ARRAY()
            )
            FROM tbl_event_collaborator ec
            LEFT JOIN tbl_organization co
                   ON co.organization_id = ec.organization_id
            WHERE ec.event_id = ea.proposed_event_id
        ) AS collaborators,

        /* Optional helper: how many collaborators */
        (
            SELECT COUNT(*)
            FROM tbl_event_collaborator ec
            WHERE ec.event_id = ea.proposed_event_id
        ) AS collaborators_count

    FROM tbl_event_application ea
    JOIN tbl_organization o
      ON ea.organization_id = o.organization_id
    LEFT JOIN tbl_event e
      ON ea.proposed_event_id = e.event_id
    JOIN tbl_renewal_cycle rc
      ON ea.organization_id = rc.organization_id 
     AND ea.cycle_number   = rc.cycle_number
    JOIN tbl_user applicant
      ON ea.applicant_user_id = applicant.user_id
    JOIN tbl_user adviser
      ON o.adviser_id = adviser.user_id
    WHERE ea.event_application_id = p_event_application_id;

    /* ========== 2) Submitted requirements for this application (unchanged) ========== */
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
    JOIN tbl_event_application_requirement ear
      ON ers.requirement_id = ear.requirement_id
    JOIN tbl_user u
      ON ers.submitted_by = u.user_id
    WHERE ers.event_application_id = p_event_application_id
    ORDER BY ear.is_applicable_to, ear.requirement_name;
END $$
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
    IN p_requirements JSON,
    IN p_collaborators JSON -- <-- NEW PARAMETER, can be null
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
    DECLARE v_org_version_id INT; -- Add this declaration

    DECLARE v_collab_count INT DEFAULT 0;
    DECLARE v_collab_org_id INT;

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

    -- Get current president for the organization and org_version_id
    SELECT cycle_number, org_version_id INTO v_cycle_number, v_org_version_id
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

    -- Insert collaborators if provided
    IF p_collaborators IS NOT NULL AND JSON_LENGTH(p_collaborators) > 0 THEN
        SET v_collab_count = JSON_LENGTH(p_collaborators);
        SET i = 0;
        WHILE i < v_collab_count DO
            SET v_collab_org_id = CAST(JSON_UNQUOTE(JSON_EXTRACT(p_collaborators, CONCAT('$[', i, ']'))) AS UNSIGNED);
            IF v_collab_org_id IS NOT NULL THEN
                INSERT IGNORE INTO tbl_event_collaborator (event_id, organization_id)
                VALUES (v_event_id, v_collab_org_id);
            END IF;
            SET i = i + 1;
        END WHILE;
    END IF;

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

            -- Store requirement submission with org_version_id
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

    -- Return success information with org_version_id
    SELECT 
        v_event_id AS event_id,
        v_event_application_id AS event_application_id,
        JSON_UNQUOTE(JSON_EXTRACT(p_event, '$.title')) AS event_title,
        p_organization_id AS organization_id,
        v_organization_name AS organization_name,
        v_cycle_number AS cycle_number,
        v_org_version_id AS org_version_id;

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
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_step_number INT;
    DECLARE v_max_step INT;
    DECLARE v_event_id INT;
    DECLARE v_organization_id INT;
    DECLARE v_event_title VARCHAR(300);
    DECLARE v_end_date DATE;
    DECLARE v_end_time TIME;
    DECLARE v_user_email VARCHAR(100);
    DECLARE v_next_approver_id VARCHAR(200);
    DECLARE v_next_approver_email VARCHAR(100);
    DECLARE v_next_step INT;
    DECLARE v_applicant_id VARCHAR(200);
    DECLARE v_applicant_email VARCHAR(100);

    -- Update the approval status
    UPDATE tbl_event_approval_process
    SET 
        comment = p_comment,
        status = 'Approved',
        approved_at = CURRENT_TIMESTAMP
    WHERE event_approval_id = p_approval_id;

    -- Log the approval action using LogAction
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    CALL LogAction(
        v_user_email,
        CONCAT('Approved event application step for application ID: ', p_event_application_id),
        'Event Approval',
        JSON_OBJECT(
            'approval_id', p_approval_id,
            'application_id', p_event_application_id,
            'comment', p_comment
        ),
        NULL,
        NULL
    );

    -- Get current step number
    SELECT step_number INTO v_step_number
    FROM tbl_event_approval_process
    WHERE event_approval_id = p_approval_id;

    -- Get the max step number for this application
    SELECT MAX(step_number) INTO v_max_step
    FROM tbl_event_approval_process
    WHERE event_application_id = p_event_application_id;

    -- Notify next approver if not final step
    IF v_step_number < v_max_step THEN
        SELECT step_number, approver_id INTO v_next_step, v_next_approver_id
        FROM tbl_event_approval_process
        WHERE event_application_id = p_event_application_id
          AND step_number = v_step_number + 1
        LIMIT 1;

        IF v_next_approver_id IS NOT NULL THEN
            SELECT email INTO v_next_approver_email FROM tbl_user WHERE user_id = v_next_approver_id LIMIT 1;
            CALL CreateNotification(
                'Event Application Approval Needed',
                'You have a pending event application that requires your review and approval.',
                NULL,
                'approval',
                p_event_application_id,
                p_user_id,
                JSON_ARRAY(v_next_approver_email),
                'approval_required'
            );
        END IF;
    END IF;

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

            -- Log evaluation setup using LogAction
            CALL LogAction(
                v_user_email,
                CONCAT('Added default evaluation configuration for event: ', v_event_title),
                'Event Evaluation Setup',
                JSON_OBJECT(
                    'event_id', v_event_id,
                    'default_group_id', 1
                ),
                NULL,
                NULL
            );
        END IF;

        -- Log final approval using LogAction
        CALL LogAction(
            v_user_email,
            CONCAT('Fully approved event application for: ', IFNULL(v_event_title, 'Untitled Event')),
            'Event Final Approval',
            JSON_OBJECT(
                'application_id', p_event_application_id,
                'event_id', IFNULL(v_event_id, 'NULL'),
                'organization_id', v_organization_id
            ),
            NULL,
            NULL
        );

        -- Notify applicant of final approval
        SELECT applicant_user_id INTO v_applicant_id FROM tbl_event_application WHERE event_application_id = p_event_application_id;
        SELECT email INTO v_applicant_email FROM tbl_user WHERE user_id = v_applicant_id LIMIT 1;
        IF v_applicant_email IS NOT NULL THEN
            CALL CreateNotification(
                'Event Application Approved',
                CONCAT('Your event application (', IFNULL(v_event_title, 'Untitled Event'), ') has been fully approved.'),
                NULL,
                'approval',
                p_event_application_id,
                p_user_id,
                JSON_ARRAY(v_applicant_email),
                'approval_final'
            );
        END IF;
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
    DECLARE v_user_email VARCHAR(100);

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

    -- Get user email for logging
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;

    -- Log the rejection using LogAction
    CALL LogAction(
        v_user_email,
        CONCAT('Rejected event application for: ', IFNULL(v_event_title, 'Untitled Event')),
        'Event Rejection',
        JSON_OBJECT(
            'approval_id', p_approval_id,
            'application_id', p_event_application_id,
            'event_id', IFNULL(v_event_id, 'NULL'),
            'comment', p_comment
        ),
        NULL,
        NULL
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
    DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
    start_time,
    DATE_FORMAT(a.end_date, '%Y-%m-%d') AS end_date,
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
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE i INT DEFAULT 0;
    DECLARE group_count INT;
    DECLARE current_group_id INT;
    DECLARE v_user_email VARCHAR(100);

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

    -- Get user email for logging
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;

    -- Log the configuration update using LogAction
    CALL LogAction(
        v_user_email,
        CONCAT('Updated evaluation configuration for event ID: ', p_event_id),
        'Event Evaluation Config',
        JSON_OBJECT(
            'event_id', p_event_id,
            'group_ids', p_group_ids,
            'evaluation_end_date', IFNULL(p_evaluation_end_date, 'NULL'),
            'evaluation_end_time', IFNULL(p_evaluation_end_time, 'NULL')
        ),
        NULL,
        NULL
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
            submitted_at = CURRENT_TIMESTAMP,
            status = 'Approved'
        WHERE submission_id = v_submission_id;
    ELSE
        -- Insert a new submission with status 'Approved'
        INSERT INTO tbl_event_requirement_submissions (
            event_id,
            event_application_id,
            requirement_id,
            cycle_number,
            organization_id,
            file_path,
            submitted_by,
            status
        ) VALUES (
            p_event_id,
            v_event_application_id,
            p_requirement_id,
            p_cycle_number,
            p_organization_id,
            p_file_path,
            p_submitted_by,
            'Approved'
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

    -- Archive organization
    UPDATE tbl_organization
    SET status = 'Archived',
        archived_at = CURRENT_TIMESTAMP,
        archived_by = p_user_id,
        archived_reason = p_reason
    WHERE organization_id = p_organization_id;

    -- Archive all org versions
    UPDATE tbl_organization_version
    SET status = 'Archived',
        archived_at = CURRENT_TIMESTAMP,
        archived_by = p_user_id,
        archived_reason = p_reason
    WHERE organization_id = p_organization_id;

    -- Lookup user email for LogAction and call stored logger
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN
        SET v_user_email = '';
    END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Archived organization ID ', p_organization_id, IF(p_reason IS NOT NULL, CONCAT(' (Reason: ', p_reason, ')'), '')),
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

    -- Unarchive organization
    UPDATE tbl_organization
    SET status = 'Approved',
        archived_at = NULL,
        archived_by = NULL,
        archived_reason = NULL
    WHERE organization_id = p_organization_id
      AND status = 'Archived';

    -- Unarchive all org versions
    UPDATE tbl_organization_version
    SET status = 'Approved',
        archived_at = NULL,
        archived_by = NULL,
        archived_reason = NULL
    WHERE organization_id = p_organization_id
      AND status = 'Archived';

    -- Lookup user email for LogAction and call stored logger
    SELECT email INTO v_user_email FROM tbl_user WHERE user_id = p_user_id LIMIT 1;
    IF v_user_email IS NULL THEN
        SET v_user_email = '';
    END IF;

    CALL LogAction(
        v_user_email,
        CONCAT('Unarchived organization ID ', p_organization_id, IF(p_reason IS NOT NULL AND p_reason != '', CONCAT(' (Reason: ', p_reason, ')'), '')),
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
    IN p_terminated_by VARCHAR(200)  -- user_id of the staff/admin closing the period
)
BEGIN
    /* ===== Declarations (top only) ===== */
    DECLARE v_period_id INT;
    DECLARE v_terminator_email VARCHAR(100);
    DECLARE v_admin_emails JSON;
    DECLARE v_applicant_emails JSON;
    DECLARE v_start_date DATE;
    DECLARE v_end_date DATE;
    DECLARE v_start_time TIME;
    DECLARE v_end_time TIME;
    DECLARE v_rejected_count INT DEFAULT 0;

    /* ===== Locate the currently active period ===== */
    SELECT period_id, start_date, end_date, start_time, end_time
      INTO v_period_id, v_start_date, v_end_date, v_start_time, v_end_time
      FROM tbl_application_period
     WHERE is_active = 1
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_period_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No active application period found';
    END IF;

    /* ===== Resolve/validate terminator email ===== */
    SELECT email INTO v_terminator_email
      FROM tbl_user
     WHERE user_id = p_terminated_by
     LIMIT 1;

    IF v_terminator_email IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Terminator user not found';
    END IF;

    START TRANSACTION;

      /* Mark the active period as inactive */
      UPDATE tbl_application_period
         SET is_active = 0
       WHERE period_id = v_period_id;

      /* Collect all Pending applicants' emails under this period (to notify) */
      SELECT JSON_ARRAYAGG(u.email) INTO v_applicant_emails
        FROM tbl_application a
        JOIN tbl_user u ON u.user_id = a.applicant_user_id
       WHERE a.period_id = v_period_id
         AND a.status = 'Pending';

      /* Reject all Pending applications under this period */
      UPDATE tbl_application
         SET status = 'Rejected'
       WHERE period_id = v_period_id
         AND status = 'Pending';

      SET v_rejected_count = ROW_COUNT();

      /* Collect active admin/adviser emails (to notify system-wide close) */
      SELECT JSON_ARRAYAGG(email) INTO v_admin_emails
        FROM tbl_user
       WHERE role_id IN (2,3,4)  -- adjust to your role mapping
         AND status = 'Active';

      /* Notify admins */
      CALL CreateNotification(
          'Application Period Closed',
          CONCAT(
            'The application period from ',
            DATE_FORMAT(v_start_date, '%M %d, %Y at %h:%i %p'),
            ' to ',
            DATE_FORMAT(v_end_date, '%M %d, %Y at %h:%i %p'),
            ' has been closed. No further applications will be accepted.'
          ),
          NULL,                 -- url
          'system',             -- entity_type
          v_period_id,          -- entity_id
          p_terminated_by,      -- sender_id
          COALESCE(v_admin_emails, JSON_ARRAY()), -- recipients JSON
          'application_period_terminated'
      );

      /* Notify affected applicants (only if any were rejected) */
      IF v_rejected_count > 0 THEN
        CALL CreateNotification(
            'Your Application Was Closed',
            CONCAT(
              'The application period (',
              DATE_FORMAT(v_start_date, '%M %d, %Y'),
              ' - ',
              DATE_FORMAT(v_end_date, '%M %d, %Y'),
              ') has been closed. All pending applications in this period were rejected.'
            ),
            NULL,                 -- url
            'system',        -- entity_type
            v_period_id,          -- entity_id (period context)
            p_terminated_by,      -- sender_id
            COALESCE(v_applicant_emails, JSON_ARRAY()), -- recipients JSON
            'application_rejected_due_to_period_close'
        );
      END IF;

      /* Log action */
      CALL LogAction(
          v_terminator_email,
          CONCAT(
            'Terminated application period: ',
            DATE_FORMAT(v_start_date, '%M %d, %Y'),
            ' - ',
            DATE_FORMAT(v_end_date, '%M %d, %Y'),
            ' (Rejected ', v_rejected_count, ' pending application(s))'
          ),
          'Application Period Management',
          JSON_OBJECT(
            'period_id', v_period_id,
            'start_date', v_start_date,
            'end_date', v_end_date,
            'start_time', v_start_time,
            'end_time', v_end_time,
            'rejected_count', v_rejected_count,
            'action', 'Terminate active application period'
          ),
          CONCAT('/admin/application-periods/', v_period_id),
          NULL
      );

    COMMIT;

    SELECT v_period_id AS terminated_period_id, v_rejected_count AS rejected_pending_applications;
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
    DECLARE v_user_email VARCHAR(100);  -- Add user email variable

    DECLARE done INT DEFAULT FALSE;
    DECLARE del_req_id INT;
    DECLARE del_req_name VARCHAR(255);
    DECLARE del_cursor CURSOR FOR SELECT requirement_id FROM tmp_existing_ids;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    -- Get user email for logging
    SELECT email INTO v_user_email
    FROM tbl_user
    WHERE user_id = p_user_id
    LIMIT 1;

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

            -- Log add using LogAction
            CALL LogAction(
                v_user_email,
                CONCAT('Added event requirement: ', v_req_name),
                'event_requirement',
                JSON_OBJECT('requirement_name', v_req_name, 'is_applicable_to', v_req_type),
                NULL,
                NULL
            );
        ELSE
            -- Update existing requirement
            UPDATE tbl_event_application_requirement
            SET requirement_name = v_req_name,
                is_applicable_to = v_req_type,
                file_path = v_file_path,
                updated_at = CURRENT_TIMESTAMP
            WHERE requirement_id = v_req_id;

            -- Log update using LogAction
            CALL LogAction(
                v_user_email,
                CONCAT('Updated event requirement: ', v_req_name),
                'event_requirement',
                JSON_OBJECT('requirement_id', v_req_id, 'requirement_name', v_req_name, 'is_applicable_to', v_req_type),
                NULL,
                NULL
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

        -- Log deletion using LogAction
        CALL LogAction(
            v_user_email,
            CONCAT('Deleted event requirement: ', del_req_name),
            'event_requirement',
            JSON_OBJECT('requirement_id', del_req_id, 'requirement_name', del_req_name),
            NULL,
            NULL
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
    IN p_organization_version_id INT,
    IN p_user_id VARCHAR(200),
    IN p_answers JSON  -- All answers as JSON array
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_application_id INT;
    DECLARE v_member_id INT;
    DECLARE v_answer_count INT DEFAULT 0;
    DECLARE v_current_answer JSON;
    DECLARE v_question_id INT;
    DECLARE v_answer_text TEXT;
    
    -- Get the cycle number using organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_org_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Check if user already has a pending application
    IF EXISTS (
        SELECT 1 FROM tbl_membership_application 
        WHERE organization_id = p_org_id 
        AND cycle_number = v_cycle_number 
        AND user_id = p_user_id 
        AND status = 'Pending'
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User already has a pending membership application';
    END IF;

    -- Start transaction
    START TRANSACTION;
    
    -- Create membership application (single application)
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
    
    -- Process each answer in the JSON array
    SET v_answer_count = JSON_LENGTH(p_answers);
    
    WHILE v_answer_count > 0 DO
        SET v_answer_count = v_answer_count - 1;
        SET v_current_answer = JSON_EXTRACT(p_answers, CONCAT('$[', v_answer_count, ']'));
        SET v_question_id = JSON_UNQUOTE(JSON_EXTRACT(v_current_answer, '$.question_id'));
        SET v_answer_text = JSON_UNQUOTE(JSON_EXTRACT(v_current_answer, '$.answer'));
        
        -- Insert each response linked to the same application
        INSERT INTO tbl_membership_response (
            application_id,
            question_id,
            response_value
        ) VALUES (
            v_application_id,
            v_question_id,
            v_answer_text
        );
    END WHILE;
    
    -- Commit transaction
    COMMIT;
    
    -- Return application information
    SELECT
        ma.application_id as id,
        ma.organization_id,
        ma.cycle_number,
        ma.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        u.profile_picture,
        'Member' AS member_type, -- Default member type since it's a membership application
        ma.status AS status,
        ma.application_id,
        ma.status AS application_status,
        ma.applied_at,
        ma.reviewed_by,
        ma.reviewed_at,
        org.membership_fee_type,
        org.membership_fee_amount,
        latest_transaction.transaction_id,
        latest_transaction.amount AS paid_amount,
        latest_transaction.status AS payment_status,
        latest_transaction.proof_image,
        -- Application responses as JSON array
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'response_id', mr.response_id,
                    'question_id', mr.question_id,
                    'question_text', mq.question_text,
                    'question_type', mq.question_type,
                    'response_value', mr.response_value,
                    'is_required', mq.is_required
                )
            )
            FROM tbl_membership_response mr
            JOIN tbl_membership_question mq ON mr.question_id = mq.question_id
            WHERE mr.application_id = ma.application_id
        ) AS application_responses
    FROM tbl_membership_application ma
    JOIN tbl_user u ON ma.user_id = u.user_id
    LEFT JOIN tbl_organization org ON ma.organization_id = org.organization_id
    LEFT JOIN (
        -- Subquery to get the latest MEMBERSHIP transaction per user for this organization/cycle
        SELECT 
            tm.organization_id,
            tm.cycle_number,
            t.user_id,
            t.transaction_id,
            t.amount,
            t.status,
            t.proof_image,
            ROW_NUMBER() OVER (
                PARTITION BY tm.organization_id, tm.cycle_number, t.user_id 
                ORDER BY 
                    CASE t.status 
                        WHEN 'Completed' THEN 1 
                        WHEN 'Pending' THEN 2 
                        ELSE 3 
                    END,
                    t.created_at DESC
            ) as rn
        FROM tbl_transaction_membership tm
        JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
        JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
        JOIN tbl_financial_category fc ON t.category_id = fc.category_id
        WHERE tt.code = 'INCOME'
          AND fc.code = 'MEMBERSHIP'  -- Only get transactions with MEMBERSHIP category
          AND t.status IN ('Pending', 'Completed')
          AND tm.organization_id = p_org_id
          AND tm.cycle_number = v_cycle_number
    ) latest_transaction 
        ON latest_transaction.organization_id = ma.organization_id
        AND latest_transaction.cycle_number = ma.cycle_number
        AND latest_transaction.user_id = ma.user_id
        AND latest_transaction.rn = 1
    WHERE ma.application_id = v_application_id;
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
    IN p_action_by_email VARCHAR(100),
    IN p_organization_version_id INT
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
    DECLARE v_executive_in_other_org INT;
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);

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

    -- Get user name and organization name for user-friendly logging
    SELECT CONCAT(u.f_name, ' ', u.l_name) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT o.name INTO v_organization_name 
    FROM tbl_organization o 
    WHERE o.organization_id = p_organization_id;

    -- Check if user is already an active executive in a different organization
    SELECT COUNT(*) INTO v_executive_in_other_org
    FROM tbl_organization_members om
    WHERE om.user_id = v_user_id
    AND om.member_type = 'Executive'
    AND om.status = 'Active'
    AND om.organization_id != p_organization_id;

    IF v_executive_in_other_org > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'User is already an active executive member in another organization';
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
    CALL LogAction(
        p_action_by_email,
        CONCAT('Promoted ', v_user_name, ' to executive role "', p_role_title, '" in ', v_organization_name),
        'EXECUTIVE_MEMBER_PROMOTION',
        JSON_OBJECT(
            'organization_id', p_organization_id,
            'cycle_number', v_current_cycle,
            'user_id', v_user_id,
            'role_title', p_role_title,
            'rank_level', p_rank_level,
            'organization_name', v_organization_name,
            'user_name', v_user_name
        ),
        CONCAT('/organization/', p_organization_id),
        NULL
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
    DECLARE v_current_executive_role_id INT;
    DECLARE v_program_id INT;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_current_cycle INT;
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);

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

    -- Get user name and organization name for user-friendly logging
    SELECT CONCAT(u.f_name, ' ', u.l_name) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT o.name INTO v_organization_name 
    FROM tbl_organization o 
    WHERE o.organization_id = p_organization_id;

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

    -- Get the current executive role ID for this member
    SELECT executive_role_id INTO v_current_executive_role_id
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND user_id = v_user_id
      AND member_type = 'Executive'
    LIMIT 1;

    IF v_current_executive_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Executive member not found in organization';
    END IF;

    -- Check if there's already an executive role with the new title and rank
    SELECT executive_role_id INTO v_executive_role_id
    FROM tbl_executive_role
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND role_title = p_role_title
      AND rank_id = v_rank_id
    LIMIT 1;

    IF v_executive_role_id IS NULL THEN
        -- No existing role with new title/rank combination, update the current role
        UPDATE tbl_executive_role
        SET role_title = p_role_title,
            rank_id = v_rank_id
        WHERE executive_role_id = v_current_executive_role_id;
        
        SET v_executive_role_id = v_current_executive_role_id;
    ELSE
        -- Role with new title/rank already exists, switch to that role
        -- Update organization member's executive role
        UPDATE tbl_organization_members
        SET executive_role_id = v_executive_role_id
        WHERE organization_id = p_organization_id
          AND cycle_number = v_current_cycle
          AND user_id = v_user_id
          AND member_type = 'Executive';
          
        -- Check if the old role has any other members, if not, delete it
        IF NOT EXISTS (
            SELECT 1 FROM tbl_organization_members 
            WHERE executive_role_id = v_current_executive_role_id
        ) THEN
            DELETE FROM tbl_executive_role 
            WHERE executive_role_id = v_current_executive_role_id;
        END IF;
    END IF;

    -- Log the action
    CALL LogAction(
        p_action_by_email,
        CONCAT('Updated executive member ', v_user_name, ' to role "', p_role_title, '" in ', v_organization_name),
        'EXECUTIVE_MEMBER_UPDATE',
        JSON_OBJECT(
            'organization_id', p_organization_id,
            'cycle_number', v_current_cycle,
            'user_id', v_user_id,
            'role_title', p_role_title,
            'rank_level', p_rank_level,
            'organization_name', v_organization_name,
            'user_name', v_user_name
        ),
        CONCAT('/organization/', p_organization_id),
        NULL
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
    DECLARE v_user_name VARCHAR(255);  -- Add user name variable
    DECLARE v_org_name VARCHAR(255);   -- Add organization name variable

    -- Get current cycle number for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    IF v_current_cycle IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for organization';
    END IF;

    -- Get user_id and name of executive member
    SELECT user_id, CONCAT(f_name, ' ', l_name) 
    INTO v_user_id, v_user_name
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Executive member not found';
    END IF;

    -- Get organization name
    SELECT name INTO v_org_name
    FROM tbl_organization
    WHERE organization_id = p_organization_id
    LIMIT 1;

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

    -- Log the action using LogAction stored procedure
    CALL LogAction(
        p_action_by_email,  -- p_user_email
        CONCAT('Archived executive member: ', COALESCE(v_user_name, 'Unknown User'), ' from ', COALESCE(v_org_name, 'Unknown Organization')),  -- p_action
        'executive_member_archive',  -- p_type
        JSON_OBJECT(
            'organization_id', p_organization_id,
            'organization_name', v_org_name,
            'cycle_number', v_current_cycle,
            'user_id', v_user_id,
            'user_name', v_user_name,
            'user_email', p_email,
            'member_id', v_member_id,
            'executive_role_id', v_executive_role_id
        ),  -- p_meta_data
        NULL,  -- p_redirect_url
        NULL   -- p_file_path
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
    IN p_org_id INT,
    IN p_committee_name VARCHAR(100),
    IN p_description TEXT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_organization_exists INT;
    DECLARE v_committee_exists INT;
    DECLARE v_new_committee_id INT;
    DECLARE v_organization_name VARCHAR(200);
    DECLARE v_current_cycle INT;

    -- Get current cycle for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_org_id;

    -- If no cycle found, default to 1
    IF v_current_cycle IS NULL THEN
        SET v_current_cycle = 1;
    END IF;

    -- Validate organization exists and is active
    SELECT COUNT(*) INTO v_organization_exists 
    FROM tbl_organization 
    WHERE organization_id = p_org_id
    AND status IN ('Approved', 'Renewal');

    IF v_organization_exists = 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Organization not found or not active';
    END IF;

    -- Get organization name for user-friendly logging
    SELECT name INTO v_organization_name 
    FROM tbl_organization 
    WHERE organization_id = p_org_id;

    -- Check for duplicate committee name (case-insensitive and trimmed)
    SELECT COUNT(*) INTO v_committee_exists
    FROM tbl_committee
    WHERE organization_id = p_org_id
    AND cycle_number = v_current_cycle
    AND LOWER(TRIM(name)) = LOWER(TRIM(p_committee_name));

    IF v_committee_exists > 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'A committee with this name already exists in this organization';
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
        p_org_id,
        v_current_cycle,
        p_committee_name,
        p_description
    );

    SET v_new_committee_id = LAST_INSERT_ID();

    -- Create default committee roles (Committee Head, Committee Officer)
    INSERT INTO tbl_committee_role (committee_id, role_name)
    VALUES 
        (v_new_committee_id, 'Committee Head'),
        (v_new_committee_id, 'Committee Officer');

    -- Log the action
    CALL LogAction(
        p_action_by_email,
        CONCAT('Created new committee "', p_committee_name, '" in ', v_organization_name),
        'committee_creation',
        NULL,
        CONCAT('/organization/', p_org_id),
        NULL
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
    DECLARE v_organization_name VARCHAR(200);

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

    -- Get organization name for user-friendly logging
    SELECT name INTO v_organization_name 
    FROM tbl_organization 
    WHERE organization_id = v_organization_id;

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
    CALL LogAction(
        p_action_by_email,
        CONCAT('Updated committee "', v_current_name, '"', 
               CASE WHEN p_new_name IS NOT NULL AND p_new_name <> v_current_name 
                    THEN CONCAT(' to "', p_new_name, '"') 
                    ELSE '' END,
               ' in ', v_organization_name),
        'committee_update',
        JSON_OBJECT(
            'committee_id', p_committee_id,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'current_name', v_current_name,
            'new_name', p_new_name,
            'current_description', v_current_description,
            'new_description', p_new_description
        ),
        CONCAT('/organization/', v_organization_id),
        NULL
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
    DECLARE v_members_removed_from_org INT DEFAULT 0;  -- New: Count members removed from tbl_organization_members
    DECLARE v_error_message TEXT;  -- Variable to store concatenated error messages

    -- Error handler for foreign key constraint violations
    DECLARE EXIT HANDLER FOR SQLSTATE '23000'
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        
        IF @errno = 1451 THEN  -- Cannot delete or update a parent row: a foreign key constraint fails
            -- Check if it's related to committee roles/permissions
            IF @text LIKE '%tbl_committee_role_permission%' OR @text LIKE '%committee_role_id%' THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee: This committee has permissions assigned to its roles. Please remove all committee member permissions before archiving this committee.';
            ELSEIF @text LIKE '%tbl_committee_role%' OR @text LIKE '%committee_id%' THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee: This committee has roles that are referenced by other records. Please ensure all committee members are removed first.';
            ELSE
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee: This committee is referenced by other records in the system. Please remove all dependent records first.';
            END IF;
        ELSEIF @errno = 1452 THEN  -- Cannot add or update a child row: a foreign key constraint fails
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Cannot archive committee: Invalid reference to organization or user data.';
        ELSE
            -- Format any other database errors for user-friendly display  
            IF @text IS NOT NULL THEN
                SET v_error_message = CONCAT('Database error while archiving committee: ', @text);
            ELSEIF @errno IS NOT NULL THEN
                SET v_error_message = CONCAT('Database error while archiving committee: MySQL Error ', @errno);
            ELSE
                SET v_error_message = 'Database error while archiving committee: Unknown error occurred';
            END IF;
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = v_error_message;
        END IF;
    END;

    -- General error handler for other SQL errors
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        IF @text IS NOT NULL THEN
            SET v_error_message = CONCAT('Error archiving committee: ', @text);
        ELSEIF @errno IS NOT NULL THEN
            SET v_error_message = CONCAT('Error archiving committee (Code: ', @errno, ')');
        ELSE
            SET v_error_message = 'Error archiving committee: Unknown database error occurred';
        END IF;
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = v_error_message;
    END;

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
        cr.role_name,  -- Fixed: Use role_name from tbl_committee_role instead of non-existent cm.role
        CURRENT_TIMESTAMP,
        v_archived_by_id
    FROM tbl_committee_members cm
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id  -- Added: Join to get role_name
    WHERE cm.committee_id = p_committee_id;

    -- 3. Check and remove members from tbl_organization_members if they are only committee members
    BEGIN
        DECLARE done INT DEFAULT FALSE;
        DECLARE v_member_user_id VARCHAR(200);
        DECLARE v_is_only_committee_member INT;
        
        DECLARE member_cursor CURSOR FOR
            SELECT cm.user_id
            FROM tbl_committee_members cm
            WHERE cm.committee_id = p_committee_id;
        
        DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
        
        OPEN member_cursor;
        member_loop: LOOP
            FETCH member_cursor INTO v_member_user_id;
            IF done THEN
                LEAVE member_loop;
            END IF;
            
            -- Check if the user is only a committee member (no other roles in the organization)
            -- Fixed: Removed reference to non-existent tbl_executive_members and adjusted logic
            SELECT COUNT(*)
            INTO v_is_only_committee_member
            FROM tbl_organization_members om
            WHERE om.organization_id = v_organization_id
              AND om.cycle_number = v_cycle_number
              AND om.user_id = v_member_user_id
              AND om.member_type != 'Committee';  -- Count other member types (e.g., Executive, Member)
            
            -- If the user is only a committee member (no other roles), remove from tbl_organization_members
            IF v_is_only_committee_member = 0 THEN
                DELETE FROM tbl_organization_members
                WHERE organization_id = v_organization_id
                  AND cycle_number = v_cycle_number
                  AND user_id = v_member_user_id
                  AND member_type = 'Committee';
                
                SET v_members_removed_from_org = v_members_removed_from_org + 1;
            END IF;
        END LOOP member_loop;
        CLOSE member_cursor;
    END;

    -- 4. Delete committee members
    DELETE FROM tbl_committee_members WHERE committee_id = p_committee_id;

    -- 5. Delete committee roles and permissions
    DELETE crp FROM tbl_committee_role_permission crp
    JOIN tbl_committee_role cr ON crp.committee_role_id = cr.committee_role_id
    WHERE cr.committee_id = p_committee_id;

    -- 6. Delete committee roles
    DELETE FROM tbl_committee_role WHERE committee_id = p_committee_id;

    -- 7. Finally, delete the committee
    DELETE FROM tbl_committee WHERE committee_id = p_committee_id;

    -- Log the action using LogAction stored procedure
    CALL LogAction(
        p_archived_by_email,  -- p_user_email
        CONCAT('Archived committee: ', v_committee_name, ' (', v_member_count, ' members)'),  -- p_action
        'committee_archive',  -- p_type
        JSON_OBJECT(
            'original_committee_id', p_committee_id,
            'committee_name', v_committee_name,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'member_count', v_member_count,
            'members_removed_from_org', v_members_removed_from_org,
            'reason', p_reason
        ),  -- p_meta_data
        NULL,  -- p_redirect_url
        NULL   -- p_file_path
    );

    COMMIT;
END $$
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
CREATE DEFINER=`admin`@`%` PROCEDURE GetAllCommitteeMembers(
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;

    -- Resolve cycle_number for the given org and version (latest match if multiple)
    SELECT rc.cycle_number
      INTO v_cycle_number
    FROM tbl_renewal_cycle rc
    WHERE rc.organization_id = p_org_id
      AND rc.org_version_id = p_org_version_id
    ORDER BY rc.start_date DESC
    LIMIT 1;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No matching cycle found for the given organization and version.';
    END IF;

    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cr.role_name AS role,               -- from role table
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        p.name AS program_name,
        u.status AS user_status
    FROM tbl_committee c
    JOIN tbl_committee_members cm 
      ON c.committee_id = cm.committee_id
    LEFT JOIN tbl_committee_role cr
      ON cr.committee_role_id = cm.committee_role_id
    JOIN tbl_user u 
      ON cm.user_id = u.user_id
    LEFT JOIN tbl_program p 
      ON u.program_id = p.program_id
    WHERE c.organization_id = p_org_id
      AND c.cycle_number = v_cycle_number
    ORDER BY 
        c.organization_id,
        c.cycle_number,
        c.name,
        cr.role_name,
        u.l_name,
        u.f_name;
END$$
DELIMITER ;



DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE AddCommitteeMember(
    IN p_committee_id INT,
    IN p_user_email VARCHAR(100),
    IN p_role ENUM('Committee Head', 'Committee Officer'),
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_org_version_id INT;
    DECLARE v_is_member INT;
    DECLARE v_new_member_id INT;
    DECLARE v_committee_role_id INT;
    DECLARE v_role_name VARCHAR(50);
    DECLARE v_web_access_permission_id INT;
    DECLARE v_existing_permissions_count INT;
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_committee_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);

    -- committee -> org + cycle
    SELECT organization_id, cycle_number
      INTO v_organization_id, v_cycle_number
    FROM tbl_committee
    WHERE committee_id = p_committee_id
    LIMIT 1;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Committee not found';
    END IF;

    -- get org_version_id for this cycle (if any)
    SELECT org_version_id INTO v_org_version_id
    FROM tbl_renewal_cycle
    WHERE organization_id = v_organization_id
      AND cycle_number = v_cycle_number
    LIMIT 1;

    -- actor
    SELECT user_id INTO v_action_by_user_id 
    FROM tbl_user 
    WHERE email = p_action_by_email 
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- user to add
    SELECT user_id INTO v_user_id 
    FROM tbl_user 
    WHERE email = p_user_email 
    LIMIT 1;

    IF v_user_id IS NULL THEN
        -- create pending student user
        SET v_user_id = CONCAT('usr-', UUID_SHORT());
        INSERT INTO tbl_user (
            user_id, email, role_id, status, created_at, updated_at
        ) VALUES (
            v_user_id,
            p_user_email,
            (SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'student' LIMIT 1),
            'Pending',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    END IF;

    -- Get user name, committee name, and organization name for user-friendly logging
    SELECT COALESCE(CONCAT(u.f_name, ' ', u.l_name), u.email) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT c.name INTO v_committee_name 
    FROM tbl_committee c 
    WHERE c.committee_id = p_committee_id;
    
    SELECT o.name INTO v_organization_name 
    FROM tbl_organization o 
    WHERE o.organization_id = v_organization_id;

    -- prevent duplicate committee membership
    SELECT COUNT(*)
      INTO v_is_member
    FROM tbl_committee_members
    WHERE committee_id = p_committee_id
      AND user_id = v_user_id;

    IF v_is_member > 0 THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'User is already a member of this committee';
    END IF;

    -- ensure committee roles exist for this committee (Head, Officer)
    INSERT IGNORE INTO tbl_committee_role (committee_id, role_name)
    VALUES (p_committee_id, 'Committee Head'),
           (p_committee_id, 'Committee Officer');

    -- resolve role name + committee_role_id
    SET v_role_name = CASE 
        WHEN p_role = 'Committee Head' THEN 'Committee Head'
        ELSE 'Committee Officer'
    END;

    SELECT committee_role_id
      INTO v_committee_role_id
    FROM tbl_committee_role
    WHERE committee_id = p_committee_id
      AND role_name = v_role_name
    LIMIT 1;

    -- Get WEB_ACCESS permission ID
    SELECT permission_id INTO v_web_access_permission_id
    FROM tbl_permission
    WHERE permission_name = 'WEB_ACCESS'
    LIMIT 1;

    -- Check existing permissions for this committee role
    SELECT COUNT(*) INTO v_existing_permissions_count
    FROM tbl_committee_role_permission
    WHERE committee_role_id = v_committee_role_id;

    -- Handle permission assignment based on role and existing permissions
    IF v_role_name = 'Committee Head' THEN
        -- Committee Head: Always gets WEB_ACCESS permission
        IF v_existing_permissions_count = 0 AND v_web_access_permission_id IS NOT NULL THEN
            INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id)
            VALUES (v_committee_role_id, v_web_access_permission_id);
        END IF;
    ELSE
        -- Committee Officer: Get permissions from existing officers or WEB_ACCESS as fallback
        IF v_existing_permissions_count = 0 THEN
            -- No existing permissions, check if there are other officers with permissions
            BEGIN
                DECLARE v_sample_officer_role_id INT DEFAULT NULL;
                
                -- Find another Committee Officer role with permissions in the same organization
                SELECT cr.committee_role_id INTO v_sample_officer_role_id
                FROM tbl_committee_role cr
                JOIN tbl_committee c ON cr.committee_id = c.committee_id
                WHERE c.organization_id = v_organization_id
                  AND c.cycle_number = v_cycle_number
                  AND cr.role_name = 'Committee Officer'
                  AND cr.committee_role_id != v_committee_role_id
                  AND EXISTS (
                      SELECT 1 FROM tbl_committee_role_permission crp 
                      WHERE crp.committee_role_id = cr.committee_role_id
                  )
                LIMIT 1;

                IF v_sample_officer_role_id IS NOT NULL THEN
                    -- Copy permissions from existing officer
                    INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id)
                    SELECT v_committee_role_id, crp.permission_id
                    FROM tbl_committee_role_permission crp
                    WHERE crp.committee_role_id = v_sample_officer_role_id;
                ELSE
                    -- No existing officer permissions found, add WEB_ACCESS as default
                    IF v_web_access_permission_id IS NOT NULL THEN
                        INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id)
                        VALUES (v_committee_role_id, v_web_access_permission_id);
                    END IF;
                END IF;
            END;
        END IF;
    END IF;

    -- add the committee member (role-aware)
    INSERT INTO tbl_committee_members (
        committee_id, user_id, committee_role_id, created_at
    ) VALUES (
        p_committee_id, v_user_id, v_committee_role_id, CURRENT_TIMESTAMP
    );

    SET v_new_member_id = LAST_INSERT_ID();

    -- ensure org membership row exists for this user (as Committee)
    SELECT COUNT(*)
      INTO v_is_member
    FROM tbl_organization_members
    WHERE organization_id = v_organization_id
      AND cycle_number   = v_cycle_number
      AND user_id        = v_user_id;

    IF v_is_member = 0 THEN
        INSERT INTO tbl_organization_members
            (organization_id, cycle_number, user_id, org_version_id, member_type, status, joined_at)
        VALUES
            (v_organization_id, v_cycle_number, v_user_id, v_org_version_id, 'Committee', 'Active', CURRENT_TIMESTAMP);
    ELSE
        -- Update existing member to Committee type if they were a regular member
        UPDATE tbl_organization_members 
        SET member_type = 'Committee', 
            status = 'Active',
            org_version_id = v_org_version_id
        WHERE organization_id = v_organization_id
          AND cycle_number = v_cycle_number
          AND user_id = v_user_id;
    END IF;

    -- log action (aligned to tbl_logs schema)
    CALL LogAction(
        p_action_by_email,
        CONCAT('Added ', v_user_name, ' as ', v_role_name, ' to committee "', v_committee_name, '" in ', v_organization_name),
        'committee_member_add',
        NULL,
        CONCAT('/organization/', v_organization_id),
        NULL
    );

    -- return the newly added member row with enhanced information
    -- Debug: Check if the query will return results
    IF NOT EXISTS (
        SELECT 1 FROM tbl_committee c
        JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
        JOIN tbl_user u ON cm.user_id = u.user_id
        JOIN tbl_organization_members om ON om.user_id = u.user_id
         AND om.organization_id = v_organization_id
         AND om.cycle_number = v_cycle_number
        WHERE c.organization_id = v_organization_id
          AND c.cycle_number = v_cycle_number
          AND cm.committee_member_id = v_new_member_id
    ) THEN
        SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Failed to retrieve committee member data after creation';
    END IF;

    SELECT 
        c.committee_id,
        c.name AS committee_name,
        c.description AS committee_description,
        cm.committee_member_id AS id,
        cr.role_name AS role,
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        u.status AS user_status,
        p.name AS program_name,
        p.abbreviation AS program_abbreviation,
        col.name AS college_name,
        om.member_id AS organization_member_id,
        om.status AS organization_membership_status,
        -- Committee role permissions
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'permission_id', perm.permission_id,
                    'permission_name', perm.permission_name,
                    'permission_scope', perm.scope
                )
            )
            FROM tbl_committee_role_permission crp
            JOIN tbl_permission perm ON crp.permission_id = perm.permission_id
            WHERE crp.committee_role_id = cr.committee_role_id
        ) AS role_permissions,
        -- Organization info
        o.name AS organization_name,
        o.logo AS organization_logo
    FROM tbl_committee c
    JOIN tbl_committee_members cm 
      ON c.committee_id = cm.committee_id
    LEFT JOIN tbl_committee_role cr
      ON cr.committee_role_id = cm.committee_role_id
    JOIN tbl_user u 
      ON cm.user_id = u.user_id
    JOIN tbl_organization_members om 
      ON om.user_id = u.user_id
     AND om.organization_id = v_organization_id
     AND om.cycle_number = v_cycle_number
    LEFT JOIN tbl_program p 
      ON u.program_id = p.program_id
    LEFT JOIN tbl_college col
      ON p.college_id = col.college_id
    JOIN tbl_organization o
      ON o.organization_id = v_organization_id
    WHERE c.organization_id = v_organization_id
      AND c.cycle_number = v_cycle_number
      AND cm.committee_member_id = v_new_member_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ScanTicket(
    IN p_email VARCHAR(100),
    IN p_event_id INT,  -- Changed from event_title to event_id
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
            om.member_type = 'Executive'  -- Executive members
            OR (
                om.member_type = 'Committee'  -- Committee members with Committee Head role
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
    
    -- Find existing attendance record
    SELECT attendance_id INTO v_attendance_id
    FROM tbl_event_attendance
    WHERE event_id = p_event_id
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
    
    -- Return success message with event details
    SELECT 
        'Ticket scanned successfully' AS message,
        v_event_title AS event_title,
        p_email AS attendee_email,
        NOW() AS scanned_at;
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
    DECLARE v_action_by_email VARCHAR(100);  -- Added: To store email for LogAction
    DECLARE v_committee_id INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_old_role_id INT;  -- Changed to store committee_role_id
    DECLARE v_old_role_name ENUM('Committee Head', 'Committee Officer');  -- For logging
    DECLARE v_new_role_id INT;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get email of the action performer for LogAction
    SELECT email INTO v_action_by_email
    FROM tbl_user
    WHERE user_id = v_action_by_user_id
    LIMIT 1;

    IF v_action_by_email IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer email not found for logging';
    END IF;

    -- Get current member info (use committee_role_id, not 'role')
    SELECT committee_id, user_id, committee_role_id INTO v_committee_id, v_user_id, v_old_role_id
    FROM tbl_committee_members
    WHERE committee_member_id = p_committee_member_id;

    IF v_committee_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Committee member not found';
    END IF;

    -- Get the old role name for logging
    SELECT role_name INTO v_old_role_name
    FROM tbl_committee_role
    WHERE committee_role_id = v_old_role_id;

    -- Get the new role ID
    SELECT committee_role_id INTO v_new_role_id
    FROM tbl_committee_role
    WHERE role_name = p_new_role
    LIMIT 1;

    IF v_new_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid new role specified';
    END IF;

    -- Update the role (set committee_role_id, not 'role')
    UPDATE tbl_committee_members
    SET committee_role_id = v_new_role_id
    WHERE committee_member_id = p_committee_member_id;

    -- Log the action using LogAction stored procedure
    CALL LogAction(
        v_action_by_email,  -- p_user_email
        CONCAT('Updated committee member role: ', v_user_id, ' in committee ', v_committee_id, ' from ', v_old_role_name, ' to ', p_new_role),  -- p_action
        'committee_member_update',  -- p_type
        JSON_OBJECT(
            'committee_member_id', p_committee_member_id,
            'committee_id', v_committee_id,
            'user_id', v_user_id,
            'old_role', v_old_role_name,
            'new_role', p_new_role
        ),  -- p_meta_data
        NULL,  -- p_redirect_url
        NULL   -- p_file_path
    );

    -- Return updated member details (join to get role_name)
    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cr.role_name AS role,  -- Fixed: Use role_name from tbl_committee_role
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
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id  -- Added join for role_name
    WHERE cm.committee_member_id = p_committee_member_id;
END $$
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
    DECLARE v_role_name VARCHAR(50);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_org_member_id INT;
    DECLARE v_member_id_to_archive INT;
    DECLARE v_member_id_source VARCHAR(30);
    DECLARE v_is_only_committee_member INT;  -- New: Check if user has other roles
    DECLARE v_error_message TEXT;  -- Variable to store concatenated error messages
    DECLARE v_user_name VARCHAR(255);  -- Add user name variable
    DECLARE v_committee_name VARCHAR(100);  -- Add committee name variable

    -- Error handler for foreign key constraint violations
    DECLARE EXIT HANDLER FOR SQLSTATE '23000'
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        
        IF @errno = 1451 THEN  -- Cannot delete or update a parent row: a foreign key constraint fails
            -- Check if it's related to committee roles/permissions
            IF @text LIKE '%tbl_committee_role_permission%' OR @text LIKE '%committee_role_id%' THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee member: This member has permissions that need to be transferred to another member first.';
            ELSEIF @text LIKE '%tbl_committee_members%' OR @text LIKE '%committee_member_id%' THEN
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee member: This member is referenced by other records in the system. Please remove all dependent records first.';
            ELSE
                SIGNAL SQLSTATE '45000' 
                SET MESSAGE_TEXT = 'Cannot archive committee member: This member is referenced by other records in the system. Please remove all dependent records first.';
            END IF;
        ELSEIF @errno = 1452 THEN  -- Cannot add or update a child row: a foreign key constraint fails
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = 'Cannot archive committee member: Invalid reference to user, committee, or organization data.';
        ELSE
            -- Format any other database errors for user-friendly display
            IF @text IS NOT NULL THEN
                SET v_error_message = CONCAT('Database error while archiving committee member: ', @text);
            ELSEIF @errno IS NOT NULL THEN
                SET v_error_message = CONCAT('Database error while archiving committee member: MySQL Error ', @errno);
            ELSE
                SET v_error_message = 'Database error while archiving committee member: Unknown error occurred';
            END IF;
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = v_error_message;
        END IF;
    END;

    -- General error handler for other SQL errors
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            @errno = MYSQL_ERRNO, @text = MESSAGE_TEXT;
        IF @text IS NOT NULL THEN
            SET v_error_message = CONCAT('Error archiving committee member: ', @text);
        ELSEIF @errno IS NOT NULL THEN
            SET v_error_message = CONCAT('Error archiving committee member (Code: ', @errno, ')');
        ELSE
            SET v_error_message = 'Error archiving committee member: Unknown database error occurred';
        END IF;
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = v_error_message;
    END;

    START TRANSACTION;

    -- Get user_id of the action performer
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get current member info (role via tbl_committee_role) and user details
    SELECT cm.committee_id,
           cm.user_id,
           cr.role_name,
           c.organization_id,
           c.cycle_number,
           CONCAT(u.f_name, ' ', u.l_name),
           c.name
    INTO v_committee_id,
         v_user_id,
         v_role_name,
         v_organization_id,
         v_cycle_number,
         v_user_name,
         v_committee_name
    FROM tbl_committee_members cm
    JOIN tbl_committee c
      ON cm.committee_id = c.committee_id
    JOIN tbl_user u
      ON cm.user_id = u.user_id
    LEFT JOIN tbl_committee_role cr
      ON cr.committee_role_id = cm.committee_role_id
    WHERE cm.committee_member_id = p_committee_member_id
    LIMIT 1;

    IF v_committee_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Committee member not found';
    END IF;

    -- Try to find the corresponding organization member_id (for archive linkage)
    SELECT om.member_id
      INTO v_org_member_id
    FROM tbl_organization_members om
    WHERE om.organization_id = v_organization_id
      AND om.cycle_number   = v_cycle_number
      AND om.user_id        = v_user_id
    LIMIT 1;

    -- Decide which member_id to archive (prefer organization_members.member_id)
    IF v_org_member_id IS NOT NULL THEN
        SET v_member_id_to_archive = v_org_member_id;
        SET v_member_id_source = 'organization_member';
    ELSE
        -- Fallback: use the committee_member_id to keep an audit trail
        SET v_member_id_to_archive = p_committee_member_id;
        SET v_member_id_source = 'committee_member';
    END IF;

    -- Archive the member into tbl_archived_organization_members
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
        v_member_id_to_archive,
        v_organization_id,
        v_cycle_number,
        v_user_id,
        'Committee',
        NULL,
        v_committee_id,
        v_role_name,
        CURRENT_TIMESTAMP,
        v_action_by_user_id
    );

    -- Return the record being archived (before deletion)
    SELECT 
        c.committee_id,
        c.name AS committee_name,
        cm.committee_member_id AS id,
        cr.role_name AS role,
        cm.created_at AS member_since,
        u.user_id,
        u.f_name,
        u.l_name,
        u.email,
        p.name AS program_name,
        u.status AS user_status
    FROM tbl_committee c
    JOIN tbl_committee_members cm ON c.committee_id = cm.committee_id
    LEFT JOIN tbl_committee_role cr ON cr.committee_role_id = cm.committee_role_id
    JOIN tbl_user u ON cm.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    WHERE cm.committee_member_id = p_committee_member_id;

    -- Check if the user is only a committee member (no other roles in the organization)
    -- Fixed: Removed reference to non-existent tbl_executive_members and adjusted logic
    SELECT COUNT(*)
      INTO v_is_only_committee_member
    FROM tbl_organization_members om
    WHERE om.organization_id = v_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.user_id = v_user_id
      AND om.member_type != 'Committee';  -- Count other member types (e.g., Executive, Member)

    -- If the user is only a committee member (no other roles), remove from tbl_organization_members
    IF v_is_only_committee_member = 0 THEN
        DELETE FROM tbl_organization_members
        WHERE organization_id = v_organization_id
          AND cycle_number = v_cycle_number
          AND user_id = v_user_id
          AND member_type = 'Committee';
    END IF;

    -- Remove from active committee members
    DELETE FROM tbl_committee_members
    WHERE committee_member_id = p_committee_member_id;

    -- Log the action using LogAction stored procedure
    CALL LogAction(
        p_action_by_email,  -- p_user_email
        CONCAT('Archived committee member: ', COALESCE(v_user_name, 'Unknown User'), ' from ', COALESCE(v_committee_name, 'Unknown Committee')),  -- p_action
        'committee_member_archive',  -- p_type
        JSON_OBJECT(
            'committee_member_id', p_committee_member_id,
            'committee_id', v_committee_id,
            'user_id', v_user_id,
            'user_name', v_user_name,
            'committee_name', v_committee_name,
            'committee_role', v_role_name,
            'organization_id', v_organization_id,
            'cycle_number', v_cycle_number,
            'reason', p_reason,
            'member_id_to_archive', v_member_id_to_archive,
            'member_id_source', v_member_id_source,
            'removed_from_org_members', IF(v_is_only_committee_member = 0, 'Yes', 'No')
        ),  -- p_meta_data
        NULL,  -- p_redirect_url
        NULL   -- p_file_path
    );

    COMMIT;
END $$
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
    WHERE org_version_id = p_org_version_id AND organization_id = p_org_id;

    SELECT
        ma.application_id as id,
        ma.organization_id,
        ma.cycle_number,
        ma.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        u.profile_picture,
        'Member' AS member_type, -- Default member type for applications
        ma.status,
        ma.application_id,
        ma.status AS application_status,
        ma.applied_at,
        ma.reviewed_by,
        ma.reviewed_at,
        org.membership_fee_type,
        org.membership_fee_amount,
        latest_transaction.transaction_id,
        latest_transaction.amount AS paid_amount,
        latest_transaction.status AS payment_status,
        latest_transaction.proof_image
    FROM tbl_membership_application ma
    JOIN tbl_user u ON ma.user_id = u.user_id
    LEFT JOIN tbl_organization org ON ma.organization_id = org.organization_id
    LEFT JOIN (
        -- Subquery to get the latest transaction per user for this organization/cycle
        SELECT 
            tm.organization_id,
            tm.cycle_number,
            t.user_id,
            t.transaction_id,
            t.amount,
            t.status,
            t.proof_image,
            ROW_NUMBER() OVER (
                PARTITION BY tm.organization_id, tm.cycle_number, t.user_id 
                ORDER BY 
                    CASE t.status 
                        WHEN 'Completed' THEN 1 
                        WHEN 'Pending' THEN 2 
                        ELSE 3 
                    END,
                    t.created_at DESC
            ) as rn
        FROM tbl_transaction_membership tm
        JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
        JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
        JOIN tbl_financial_category fc ON t.category_id = fc.category_id
        WHERE tt.code = 'INCOME'
          AND fc.code = 'MEMBERSHIP'  -- Only get transactions with MEMBERSHIP category
          AND t.status IN ('Pending', 'Completed')
          AND tm.organization_id = p_org_id
          AND tm.cycle_number = v_cycle_number
    ) latest_transaction 
        ON latest_transaction.organization_id = ma.organization_id
        AND latest_transaction.cycle_number = ma.cycle_number
        AND latest_transaction.user_id = ma.user_id
        AND latest_transaction.rn = 1
    WHERE ma.organization_id = p_org_id
      AND ma.cycle_number = v_cycle_number
      AND ma.status = 'Pending'
    ORDER BY ma.applied_at DESC;
END $$
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

    -- Log the rejection using LogAction
    CALL LogAction(
        p_reviewer_email,
        CONCAT('Rejected membership application ID: ', p_application_id),
        'membership_application_rejection',
        JSON_OBJECT(
            'application_id', p_application_id,
            'organization_id', v_org_id,
            'cycle_number', v_cycle_number,
            'member_user_id', v_user_id,
            'remarks', p_remarks
        ),
        NULL,
        NULL
    );
END $$
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
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);

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

    -- Get user name and organization name for user-friendly logging
    SELECT COALESCE(CONCAT(u.f_name, ' ', u.l_name), u.email) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT name INTO v_organization_name 
    FROM tbl_organization 
    WHERE name = p_org_name;

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
    CALL LogAction(
        p_action_by_email,
        CONCAT('Added ', v_user_name, ' as member to ', v_organization_name),
        'ORGANIZATION_MEMBER_ADD',
        JSON_OBJECT(
            'organization_id', @org_id,
            'cycle_number', @current_cycle,
            'user_id', v_user_id,
            'member_type', 'Member',
            'organization_name', v_organization_name,
            'user_name', v_user_name
        ),
        CONCAT('/organization/', @org_id),
        NULL
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
     IN p_org_id INT
)
BEGIN
    DECLARE v_current_cycle INT;
    SELECT MAX(cycle_number) INTO v_current_cycle FROM tbl_renewal_cycle WHERE organization_id = p_org_id;
    SELECT 
        om.member_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        om.joined_at,
        om.user_id as user
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    WHERE om.organization_id = p_org_id
        AND om.cycle_number = v_current_cycle
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
CREATE DEFINER='admin'@'%' PROCEDURE GetArchivedOrganizationMembers(
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
        aom.archived_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        aom.member_type,
        aom.archived_at,
        aom.archived_by,
        aom.committee_role,
        aom.executive_role_id,
        aom.committee_id
    FROM tbl_archived_organization_members aom
    JOIN tbl_user u ON aom.user_id = u.user_id
    WHERE aom.organization_id = p_org_id
        AND aom.cycle_number = v_cycle_number
    ORDER BY aom.archived_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveOrganizationMember(
    IN p_member_id INT,
    IN p_archived_by_email VARCHAR(100),
    IN p_reason VARCHAR(255),
    IN p_org_id INT,
    IN p_org_version_id INT
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
    DECLARE v_user_name VARCHAR(255);  -- Add user name variable
    DECLARE v_org_name VARCHAR(255);   -- Add organization name variable
    
    -- Get user_id of the archiver
    SELECT user_id INTO v_archived_by
    FROM tbl_user
    WHERE email = p_archived_by_email
    LIMIT 1;

    IF v_archived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Archiving user not found';
    END IF;

    -- Get member details and user/organization names
    SELECT 
        om.organization_id,
        om.cycle_number,
        om.user_id,
        om.member_type,
        om.executive_role_id,
        NULL, -- committee_id (will be set below if applicable)
        NULL,  -- committee_role (will be set below if applicable)
        CONCAT(u.f_name, ' ', u.l_name),
        o.name
    INTO
        v_organization_id,
        v_cycle_number,
        v_user_id,
        v_member_type,
        v_executive_role_id,
        v_committee_id,
        v_committee_role,
        v_user_name,
        v_org_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_organization o ON om.organization_id = o.organization_id
    WHERE om.member_id = p_member_id;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Organization member not found';
    END IF;

    -- Validate org_version_id matches cycle_number
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    -- If the member is a committee member, fetch committee details
    IF v_member_type = 'Committee' THEN
        SELECT 
            cm.committee_id,
            cr.role_name
        INTO 
            v_committee_id,
            v_committee_role
        FROM tbl_committee_members cm
        LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
        WHERE cm.user_id = v_user_id
          AND cm.committee_id IN (
              SELECT committee_id 
              FROM tbl_committee 
              WHERE organization_id = v_organization_id 
                AND cycle_number = v_cycle_number
          )
        LIMIT 1;
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

    -- Log the action using LogAction stored procedure
    CALL LogAction(
        p_archived_by_email,  -- p_user_email
        CONCAT('Archived organization member: ', COALESCE(v_user_name, 'Unknown User'), ' from ', COALESCE(v_org_name, 'Unknown Organization')),  -- p_action
        'organization_member_archive',  -- p_type
        JSON_OBJECT(
            'member_id', p_member_id,
            'organization_id', v_organization_id,
            'organization_name', v_org_name,
            'cycle_number', v_cycle_number,
            'user_id', v_user_id,
            'user_name', v_user_name,
            'member_type', v_member_type,
            'executive_role_id', v_executive_role_id,
            'committee_id', v_committee_id,
            'committee_role', v_committee_role,
            'reason', p_reason
        ),  -- p_meta_data
        NULL,  -- p_redirect_url
        NULL   -- p_file_path
    );
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveOrganizationMember(
    IN p_archived_id INT,  -- Renamed for clarity: This is the archived_id, not the original member_id
    IN p_unarchived_by_email VARCHAR(100),
    IN p_reason VARCHAR(255),
    IN p_org_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_archived_id INT;
    DECLARE v_unarchived_by VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_member_type ENUM('Member', 'Executive', 'Committee');
    DECLARE v_executive_role_id INT;
    DECLARE v_committee_id INT;
    DECLARE v_committee_role ENUM('Committee Head', 'Committee Officer');
    DECLARE v_user_name VARCHAR(255);  -- Add user name variable
    DECLARE v_org_name VARCHAR(255);   -- Add organization name variable
    
    -- Get user_id of the unarchiver
    SELECT user_id INTO v_unarchived_by
    FROM tbl_user
    WHERE email = p_unarchived_by_email
    LIMIT 1;

    IF v_unarchived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Unarchiving user not found';
    END IF;

    -- Get archived member details and user/organization names by archived_id
    SELECT 
        aom.archived_id,
        aom.organization_id,
        aom.cycle_number,
        aom.user_id,
        aom.member_type,
        aom.executive_role_id,
        aom.committee_id,
        aom.committee_role,
        CONCAT(u.f_name, ' ', u.l_name),
        o.name
    INTO
        v_archived_id,
        v_organization_id,
        v_cycle_number,
        v_user_id,
        v_member_type,
        v_executive_role_id,
        v_committee_id,
        v_committee_role,
        v_user_name,
        v_org_name
    FROM tbl_archived_organization_members aom
    JOIN tbl_user u ON aom.user_id = u.user_id
    JOIN tbl_organization o ON aom.organization_id = o.organization_id
    WHERE aom.archived_id = p_archived_id  -- Changed from member_id to archived_id
    LIMIT 1;

    IF v_organization_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Archived organization member not found';
    END IF;

    -- Validate org_version_id matches cycle_number
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id;

    IF v_cycle_number != v_cycle_number THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Organization version does not match archived member cycle';
    END IF;

    -- Restore to active members as 'Member' type regardless of original role
    -- Always restore as regular member, not executive or committee
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
        v_organization_id,
        v_cycle_number,
        v_user_id,
        'Member',  -- Always restore as regular member
        NULL,      -- No executive role for regular members
        'Active',
        CURRENT_TIMESTAMP,
        p_org_version_id
    );

    -- Remove from archived members
    DELETE FROM tbl_archived_organization_members
    WHERE archived_id = p_archived_id;  -- Changed from member_id to archived_id

    -- Log the action using LogAction
    CALL LogAction(
        p_unarchived_by_email,
        CONCAT('Unarchived organization member: ', COALESCE(v_user_name, 'Unknown User'), ' restored as Member to ', COALESCE(v_org_name, 'Unknown Organization')),
        'organization_member_unarchive',
        JSON_OBJECT(
            'archived_id', p_archived_id,
            'organization_id', v_organization_id,
            'organization_name', v_org_name,
            'cycle_number', v_cycle_number,
            'user_id', v_user_id,
            'user_name', v_user_name,
            'original_member_type', v_member_type,
            'restored_as', 'Member',
            'reason', p_reason
        ),
        CONCAT('/organizations/', v_organization_id, '/members'),
        NULL
    );
END $$
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

    -- Create new application (allow program_id to be NULL)
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

    -- Log the application using LogAction (if user exists)
    IF EXISTS (SELECT 1 FROM tbl_user WHERE email = p_email) THEN
        CALL LogAction(
            p_email,
            CONCAT('Submitted a new user application for role: ', p_role_name, IFNULL(CONCAT(', program ID: ', p_program_id), ''), '.'),
            'user_application',
            JSON_OBJECT(
                'email', p_email,
                'role', p_role_name,
                'program_id', p_program_id,
                'reason', p_reason
            ),
            NULL,
            NULL
        );
    END IF;

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
    SELECT * FROM tbl_college
    ORDER BY name;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateCollege(
    IN p_name          VARCHAR(100),
    IN p_abbreviation  VARCHAR(20),
    IN p_user_email    VARCHAR(100)
)
BEGIN
    /* All DECLAREs first */
    DECLARE v_college_id INT;

    /* Nicer duplicate message (name/abbr) */
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'College name or abbreviation already exists';
    END;

    /* Basic validations */
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College name is required';
    END IF;
    IF p_abbreviation IS NULL OR TRIM(p_abbreviation) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College abbreviation is required';
    END IF;

    /* Insert */
    INSERT INTO tbl_college(name, abbreviation, status)
    VALUES (TRIM(p_name), TRIM(p_abbreviation), 'Active');

    SET v_college_id = LAST_INSERT_ID();

    /* Audit */
    CALL LogAction(
        p_user_email,
        CONCAT('Created college "', TRIM(p_name), '" (', TRIM(p_abbreviation), ')'),
        'College.Create',
        JSON_OBJECT('college_id', v_college_id, 'name', TRIM(p_name), 'abbreviation', TRIM(p_abbreviation)),
        NULL, NULL
    );

    /* Friendly payload */
    SELECT 'College created successfully' AS message, c.*
    FROM tbl_college c WHERE c.college_id = v_college_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateCollege(
    IN p_college_id   INT,
    IN p_name         VARCHAR(100),
    IN p_abbreviation VARCHAR(20),
    IN p_user_email   VARCHAR(100)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_status VARCHAR(10);
    DECLARE v_old JSON;

    DECLARE EXIT HANDLER FOR 1062
    BEGIN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT='College name or abbreviation already exists';
    END;

    -- Existence check (no aggregate mixing)
    SELECT COUNT(*) INTO v_exists
    FROM tbl_college WHERE college_id = p_college_id;
    IF v_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College not found';
    END IF;

    SELECT status INTO v_status
    FROM tbl_college WHERE college_id = p_college_id LIMIT 1;

    IF v_status = 'Archived' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot update an archived college';
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College name is required';
    END IF;
    IF p_abbreviation IS NULL OR TRIM(p_abbreviation) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College abbreviation is required';
    END IF;

    SELECT JSON_OBJECT(
             'college_id', college_id,
             'name', name,
             'abbreviation', abbreviation,
             'status', status,
             'archived_at', archived_at,
             'archived_by', archived_by,
             'archived_reason', archived_reason
           )
      INTO v_old
    FROM tbl_college
    WHERE college_id = p_college_id;

    UPDATE tbl_college
       SET name = TRIM(p_name),
           abbreviation = TRIM(p_abbreviation)
     WHERE college_id = p_college_id;

    CALL LogAction(
        p_user_email,
        CONCAT('Updated college "', TRIM(p_name), '" (', TRIM(p_abbreviation), ')'),
        'College.Update',
        JSON_OBJECT('before', v_old,
                    'after', JSON_OBJECT('college_id', p_college_id,
                                         'name', TRIM(p_name),
                                         'abbreviation', TRIM(p_abbreviation))),
        NULL, NULL
    );

    SELECT 'College updated successfully' AS message, c.*
    FROM tbl_college c WHERE c.college_id = p_college_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveCollege(
    IN p_college_id INT,
    IN p_reason     VARCHAR(255),
    IN p_user_email VARCHAR(100)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_status VARCHAR(10);
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_active_programs INT DEFAULT 0;
    DECLARE v_has_prog_table INT DEFAULT 0;

    -- Resolve archiver user_id
    SELECT user_id INTO v_user_id
    FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User email not found';
    END IF;

    -- Existence check
    SELECT COUNT(*) INTO v_exists
    FROM tbl_college WHERE college_id = p_college_id;
    IF v_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College not found';
    END IF;

    SELECT status INTO v_status
    FROM tbl_college WHERE college_id = p_college_id LIMIT 1;
    IF v_status = 'Archived' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College is already archived';
    END IF;

    -- Check programs only if table exists (optional but safe)
    SELECT COUNT(*) INTO v_has_prog_table
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_program';

    IF v_has_prog_table > 0 THEN
        SELECT COUNT(*) INTO v_active_programs
        FROM tbl_program
        WHERE college_id = p_college_id AND status = 'Active';

        IF v_active_programs > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT='Cannot archive college with Active programs. Archive/move programs first.';
        END IF;
    END IF;

    UPDATE tbl_college
       SET status = 'Archived',
           archived_at = CURRENT_TIMESTAMP,
           archived_by = v_user_id,
           archived_reason = p_reason
     WHERE college_id = p_college_id;

    CALL LogAction(
        p_user_email,
        CONCAT('Archived college ID ', p_college_id),
        'College.Archive',
        JSON_OBJECT('college_id', p_college_id, 'reason', p_reason),
        NULL, NULL
    );

    SELECT 'College archived successfully' AS message, c.*
    FROM tbl_college c WHERE c.college_id = p_college_id;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveCollege(
    IN p_college_id INT,
    IN p_user_email VARCHAR(100)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_status VARCHAR(10);

    -- Existence check
    SELECT COUNT(*) INTO v_exists
    FROM tbl_college WHERE college_id = p_college_id;
    IF v_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College not found';
    END IF;

    SELECT status INTO v_status
    FROM tbl_college WHERE college_id = p_college_id LIMIT 1;

    IF v_status = 'Active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='College is already Active';
    END IF;

    UPDATE tbl_college
       SET status = 'Active',
           archived_at = NULL,
           archived_by = NULL,
           archived_reason = NULL
     WHERE college_id = p_college_id;

    CALL LogAction(
        p_user_email,
        CONCAT('Unarchived college ID ', p_college_id),
        'College.Unarchive',
        JSON_OBJECT('college_id', p_college_id),
        NULL, NULL
    );

    SELECT 'College unarchived successfully' AS message, c.*
    FROM tbl_college c WHERE c.college_id = p_college_id;
END $$
DELIMITER ;

/* -------- CreateProgram (fixed DECLARE order + EXIT handler + stable last_insert_id) -------- */
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateProgram(
    IN p_college_id INT,
    IN p_name VARCHAR(200),
    IN p_abbreviation VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    -- DECLAREs must be first
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_col_status ENUM('Active','Archived');
    DECLARE v_new_program_id INT;

    -- nicer duplicate messages; EXIT to stop the proc
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
        CALL _RaiseDupKey('Program name or abbreviation already exists');
    END;

    /* who */
    SELECT user_id INTO v_user_id
    FROM tbl_user WHERE email = p_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    /* parent college must exist and be Active */
    SELECT status INTO v_col_status
    FROM tbl_college WHERE college_id = p_college_id;
    IF v_col_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'College not found';
    END IF;
    IF v_col_status = 'Archived' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot create program under an archived college';
    END IF;

    INSERT INTO tbl_program (college_id, name, abbreviation)
    VALUES (p_college_id, p_name, p_abbreviation);

    SET v_new_program_id = LAST_INSERT_ID();

    /* log */
    CALL LogAction(
        p_email,
        CONCAT('Created program "', COALESCE(p_name,'(no name)'), '" (', COALESCE(p_abbreviation,'N/A'), ')'),
        'Program.Create',
        JSON_OBJECT('program_id', v_new_program_id, 'college_id', p_college_id, 'name', p_name, 'abbreviation', p_abbreviation),
        NULL, NULL
    );

    /* friendly payload */
    SELECT 'Program created successfully' AS message, p.*
    FROM tbl_program p WHERE p.program_id = v_new_program_id;
END$$
DELIMITER ;

/* -------- UpdateProgram (fixed DECLARE order + EXIT handler) -------- */
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateProgram(
    IN p_program_id INT,
    IN p_college_id INT,
    IN p_name VARCHAR(200),
    IN p_abbreviation VARCHAR(20),
    IN p_email VARCHAR(100)
)
BEGIN
    -- DECLAREs must be first
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_col_status ENUM('Active','Archived');
    DECLARE v_old JSON;

    -- duplicate handler up front
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
        CALL _RaiseDupKey('Program name or abbreviation already exists');
    END;

    /* who */
    SELECT user_id INTO v_user_id
    FROM tbl_user WHERE email = p_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found for provided email';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM tbl_program WHERE program_id = p_program_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Program not found';
    END IF;

    /* target college must exist and be Active */
    SELECT status INTO v_col_status
    FROM tbl_college WHERE college_id = p_college_id;
    IF v_col_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'College not found';
    END IF;
    IF v_col_status = 'Archived' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot move program into an archived college';
    END IF;

    /* snapshot for log */
    SELECT JSON_OBJECT(
               'program', program_id,
               'college_id', college_id,
               'name', name,
               'abbreviation', abbreviation,
               'status', status
           )
      INTO v_old
      FROM tbl_program WHERE program_id = p_program_id;

    UPDATE tbl_program
       SET college_id   = p_college_id,
           name         = p_name,
           abbreviation = p_abbreviation
     WHERE program_id   = p_program_id;

    CALL LogAction(
        p_email,
        CONCAT('Updated program "', COALESCE(p_name,'(no name)'), '" (', COALESCE(p_abbreviation,'N/A'), ')'),
        'Program.Update',
        JSON_OBJECT('before', v_old,
                    'after', JSON_OBJECT('program_id', p_program_id, 'college_id', p_college_id, 'name', p_name, 'abbreviation', p_abbreviation)),
        NULL, NULL
    );

    SELECT 'Program updated successfully' AS message, p.*
    FROM tbl_program p WHERE p.program_id = p_program_id;
END$$
DELIMITER ;

/* -------- ArchiveProgram -------- */
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveProgram(
    IN p_program_id INT,
    IN p_user_email VARCHAR(100),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_status ENUM('Active','Archived');

    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User not found for provided email';
    END IF;

    SELECT status INTO v_status FROM tbl_program WHERE program_id = p_program_id;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Program not found';
    END IF;
    IF v_status = 'Archived' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Program is already archived';
    END IF;

    UPDATE tbl_program
       SET status = 'Archived',
           archived_at = NOW(),
           archived_by = v_user_id,
           archived_reason = p_reason
     WHERE program_id = p_program_id;

    CALL LogAction(
        p_user_email,
        CONCAT('Archived program ID ', p_program_id, COALESCE(CONCAT(' - reason: ', p_reason), '')),
        'Program.Archive',
        JSON_OBJECT('program_id', p_program_id, 'reason', p_reason),
        NULL, NULL
    );

    SELECT 'Program archived successfully' AS message, p.*
    FROM tbl_program p WHERE p.program_id = p_program_id;
END$$
DELIMITER ;

/* -------- UnarchiveProgram -------- */
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveProgram(
    IN p_program_id INT,
    IN p_user_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_status ENUM('Active','Archived');

    SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User not found for provided email';
    END IF;

    SELECT status INTO v_status FROM tbl_program WHERE program_id = p_program_id;
    IF v_status IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Program not found';
    END IF;
    IF v_status = 'Active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Program is not archived';
    END IF;

    UPDATE tbl_program
       SET status = 'Active',
           archived_at = NULL,
           archived_by = NULL,
           archived_reason = NULL
     WHERE program_id = p_program_id;

    CALL LogAction(
        p_user_email,
        CONCAT('Unarchived program ID ', p_program_id),
        'Program.Unarchive',
        JSON_OBJECT('program_id', p_program_id),
        NULL, NULL
    );

    SELECT 'Program unarchived successfully' AS message, p.*
    FROM tbl_program p WHERE p.program_id = p_program_id;
END$$
DELIMITER ;

/* -------- Back-compat: DeleteProgram now archives instead -------- */
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteProgram(
    IN p_program_id INT,
    IN p_email VARCHAR(100)
)
BEGIN
    /* Soft-delete for safety */
    CALL ArchiveProgram(p_program_id, p_email, 'Archived via DeleteProgram');
    /* Return a friendly hint */
    SELECT 'Note: program was archived (soft-deleted) to preserve history' AS notice;
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

        -- Count approved post-event requirement submissions for this event
        SELECT COUNT(DISTINCT ers.requirement_id) INTO v_post_req_approved
        FROM tbl_event_requirement_submissions ers
        JOIN tbl_event_application_requirement r ON ers.requirement_id = r.requirement_id
        WHERE ers.event_id = v_event_id
          AND r.is_applicable_to = 'post-event'
          AND ers.status = 'Approved';

        -- Allow add if last event is Rejected OR all post-event requirements are approved
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
        SET v_title = CONCAT('Application Approved - ', v_org_name);
        SET v_message = CONCAT('Good news - the ', v_application_type, ' application for "', v_org_name, '" has completed all approval steps.');
    ELSEIF v_step_status = 'Approved' THEN
        SET v_title = CONCAT('Approval Progress - ', v_org_name);
        SET v_message = CONCAT('Step ', v_step, ' for "', v_org_name, '" was approved. ', v_remaining_steps, ' step(s) remaining. You can view details here: ', v_url);
    ELSEIF v_step_status = 'Rejected' OR (v_application_status IS NOT NULL AND LOWER(v_application_status) = 'rejected') THEN
        SET v_title = CONCAT('Application Rejected - ', v_org_name);
        SET v_message = CONCAT('The ', v_application_type, ' application for "', v_org_name, '" was rejected at step ', v_step, '. Please review the comments and next steps: ', v_url);
    ELSE
        SET v_title = CONCAT('Application Update - ', v_org_name);
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

    /* Log action - LogAction(p_user_email, p_action, p_type, p_meta_data, p_redirect_url, p_file_path) */
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
CREATE DEFINER='admin'@'%' PROCEDURE GetTransaction(
    IN p_transaction_id INT
)
BEGIN
    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           pt.method_group AS payment_method_group,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           fc.code AS category_code,
           fc.label AS category_label,
           fc.kind AS category_kind,
           te.event_id,
           te.payer_name_override,
           te.remarks,
           tm.organization_id,
           tm.cycle_number,
           -- Include both the transaction's org_version_id and current from organization
           t.org_version_id AS transaction_org_version_id,
           o.current_org_version_id,
           u.f_name AS user_first_name,
           u.l_name AS user_last_name,
           u.email AS user_email
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    LEFT JOIN tbl_organization o ON tm.organization_id = o.organization_id
    LEFT JOIN tbl_user u ON t.user_id = u.user_id
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
    IN p_transaction_type_code VARCHAR(50),
    IN p_category_code VARCHAR(50)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_type_id INT;
    DECLARE v_category_id INT;

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

    IF p_category_code IS NOT NULL AND p_category_code <> '' THEN
        SELECT category_id INTO v_category_id
        FROM tbl_financial_category
        WHERE code = p_category_code
        LIMIT 1;
        IF v_category_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Category not found'; END IF;
    END IF;

    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           pt.method_group AS payment_method_group,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           fc.code AS category_code,
           fc.label AS category_label,
           fc.kind AS category_kind,
           te.event_id,
           te.payer_name_override,
           te.remarks,
           tm.organization_id,
           tm.cycle_number,
           COALESCE(t.org_version_id, rc.org_version_id) AS organization_version_id,
           u.f_name AS user_first_name,
           u.l_name AS user_last_name,
           u.email AS user_email
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    LEFT JOIN tbl_renewal_cycle rc ON tm.organization_id = rc.organization_id AND tm.cycle_number = rc.cycle_number
    LEFT JOIN tbl_user u ON t.user_id = u.user_id
    WHERE (v_user_id IS NULL OR t.user_id = v_user_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND (p_include_archived OR t.archived_at IS NULL)
      AND (p_event_id IS NULL OR te.event_id = p_event_id)
      AND (p_org_id IS NULL OR tm.organization_id = p_org_id)
      AND (v_type_id IS NULL OR t.transaction_type_id = v_type_id)
      AND (v_category_id IS NULL OR t.category_id = v_category_id)
    ORDER BY t.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetTransactionsByOrganization(
    IN p_organization_id INT
)
BEGIN
    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           pt.method_group AS payment_method_group,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           fc.code AS category_code,
           fc.label AS category_label,
           fc.kind AS category_kind,
           te.event_id,
           te.payer_name_override,
           te.remarks,
           -- Use COALESCE to get organization_id from either membership or event
           COALESCE(tm.organization_id, e.organization_id) AS organization_id,
           COALESCE(tm.cycle_number, e.cycle_number) AS cycle_number,
           COALESCE(t.org_version_id, rc1.org_version_id, rc2.org_version_id) AS organization_version_id,
           u.f_name AS user_first_name,
           u.l_name AS user_last_name,
           u.email AS user_email
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    -- Join event details for event transactions
    LEFT JOIN tbl_event e ON te.event_id = e.event_id
    -- Join renewal cycles for both membership and event transactions
    LEFT JOIN tbl_renewal_cycle rc1 ON tm.organization_id = rc1.organization_id AND tm.cycle_number = rc1.cycle_number
    LEFT JOIN tbl_renewal_cycle rc2 ON e.organization_id = rc2.organization_id AND e.cycle_number = rc2.cycle_number
    LEFT JOIN tbl_user u ON t.user_id = u.user_id
    WHERE (tm.organization_id = p_organization_id OR e.organization_id = p_organization_id)
    ORDER BY t.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetTransactionsByUser(
    IN p_user_id VARCHAR(200)
)
BEGIN
    SELECT t.*,
           pt.code AS payment_type_code,
           pt.label AS payment_type_label,
           pt.method_group AS payment_method_group,
           tt.code AS transaction_type_code,
           tt.label AS transaction_type_label,
           fc.code AS category_code,
           fc.label AS category_label,
           fc.kind AS category_kind,
           te.event_id,
           te.payer_name_override,
           te.remarks,
           -- Use COALESCE to get organization_id from either membership or event
           COALESCE(tm.organization_id, e.organization_id) AS organization_id,
           COALESCE(tm.cycle_number, e.cycle_number) AS cycle_number,
           COALESCE(rc1.org_version_id, rc2.org_version_id) AS organization_version_id,
           u.f_name AS user_first_name,
           u.l_name AS user_last_name,
           u.email AS user_email
    FROM tbl_transaction t
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    LEFT JOIN tbl_financial_category fc ON t.category_id = fc.category_id
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    LEFT JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    -- Join event details for event transactions
    LEFT JOIN tbl_event e ON te.event_id = e.event_id
    -- Join renewal cycles for both membership and event transactions
    LEFT JOIN tbl_renewal_cycle rc1 ON tm.organization_id = rc1.organization_id AND tm.cycle_number = rc1.cycle_number
    LEFT JOIN tbl_renewal_cycle rc2 ON e.organization_id = rc2.organization_id AND e.cycle_number = rc2.cycle_number
    LEFT JOIN tbl_user u ON t.user_id = u.user_id
    WHERE t.user_id = p_user_id
    ORDER BY t.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetPaymentTypes()
BEGIN
    SELECT payment_type_id, code, label, method_group
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
CREATE DEFINER='admin'@'%' PROCEDURE GetFinancialCategories()
BEGIN
    SELECT category_id, code, label, kind, parent_category_id, active
    FROM tbl_financial_category
    WHERE active = TRUE
    ORDER BY kind, label;
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE NextReceiptNo(
  IN  p_series_key  VARCHAR(100),
  IN  p_prefix      VARCHAR(50),
  IN  p_pad_length  TINYINT,
  OUT p_receipt_no  VARCHAR(100)
)
BEGIN
  INSERT INTO tbl_receipt_sequence (series_key, prefix, pad_length, current_value)
  VALUES (p_series_key, p_prefix, p_pad_length, 1)
  ON DUPLICATE KEY UPDATE
    current_value = LAST_INSERT_ID(current_value + 1),
    prefix        = VALUES(prefix),
    pad_length    = VALUES(pad_length);

  SET @next := LAST_INSERT_ID();
  SET p_receipt_no = CONCAT(p_prefix, LPAD(@next, p_pad_length, '0'));
END $$
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
    IN p_transaction_date DATETIME,
    IN p_proof_image VARCHAR(500),
    IN p_receipt_no VARCHAR(100),
    IN p_category_code VARCHAR(50),
    IN p_event_id INT,
    IN p_payer_name_override VARCHAR(255),
    IN p_event_remarks VARCHAR(255),
    IN p_organization_id INT,
    IN p_cycle_number INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_transaction_id INT;

    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_series_key VARCHAR(100);
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_pad_len TINYINT DEFAULT 6;
    DECLARE v_type_char CHAR(1);
    DECLARE v_org_token VARCHAR(16);
    DECLARE v_yyyymm CHAR(6);

    -- Get user ID if email provided
    IF p_user_email IS NOT NULL AND p_user_email <> '' THEN
        SELECT user_id INTO v_user_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
        IF v_user_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='User not found'; END IF;
    END IF;

    -- Get transaction type ID
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type 
    WHERE code = p_transaction_type_code LIMIT 1;
    IF v_transaction_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction type not found'; 
    END IF;

    -- Get payment type ID
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type 
    WHERE code = p_payment_type_code LIMIT 1;
    IF v_payment_type_id IS NULL THEN 
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment type not found'; 
    END IF;

    -- Get category ID if provided
    IF p_category_code IS NOT NULL AND p_category_code <> '' THEN
        SELECT category_id INTO v_category_id 
        FROM tbl_financial_category 
        WHERE code = p_category_code AND active = TRUE LIMIT 1;
        IF v_category_id IS NULL THEN 
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial category not found or inactive'; 
        END IF;

        -- Ensure type-category pair is allowed
        IF v_category_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM tbl_transaction_type_category 
                WHERE transaction_type_id = v_transaction_type_id
                  AND category_id = v_category_id
            ) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Category not allowed for this transaction type';
            END IF;
        END IF;
    END IF;

    -- Generate receipt if not provided
    IF p_receipt_no IS NULL OR p_receipt_no = '' THEN
        SET v_type_char = CASE UPPER(p_transaction_type_code)
            WHEN 'INCOME'  THEN 'I'
            WHEN 'EXPENSE' THEN 'X'
            ELSE 'T' END;
        SET v_yyyymm = DATE_FORMAT(COALESCE(p_transaction_date, NOW()), '%Y%m');
        SET v_org_token = IFNULL(CONCAT('ORG', LPAD(p_organization_id, 3, '0')), 'INST');
        SET v_prefix    = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
        SET v_series_key= v_prefix;
        CALL NextReceiptNo(v_series_key, v_prefix, v_pad_len, v_receipt_no);
    ELSE
        SET v_receipt_no = p_receipt_no;
        IF EXISTS (SELECT 1 FROM tbl_transaction WHERE receipt_no = v_receipt_no) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt number already exists';
        END IF;
    END IF;

    -- Create main transaction record
    INSERT INTO tbl_transaction (
        user_id, payer_name, payee_name, payment_description, amount,
        transaction_type_id, payment_type_id, category_id, org_version_id, status, 
        transaction_date, receipt_no, proof_image
    ) VALUES (
        v_user_id, p_payer_name, p_payee_name, p_payment_description, p_amount,
        v_transaction_type_id, v_payment_type_id, v_category_id, p_org_version_id, p_status, 
        p_transaction_date, v_receipt_no, p_proof_image
    );

    SET v_transaction_id = LAST_INSERT_ID();

    -- Link to organization (membership transaction)
    IF p_organization_id IS NOT NULL THEN
        INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
        VALUES (v_transaction_id, p_organization_id, p_cycle_number);
    END IF;

    -- Link to event if provided
    IF p_event_id IS NOT NULL THEN
        INSERT INTO tbl_transaction_event (transaction_id, event_id, payer_name_override, remarks)
        VALUES (v_transaction_id, p_event_id, p_payer_name_override, p_event_remarks);
    END IF;

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Created transaction: ', p_payment_description),
        'TRANSACTION_CREATE',
        JSON_OBJECT(
            'transaction_id', v_transaction_id,
            'amount', p_amount,
            'type', p_transaction_type_code,
            'category', p_category_code,
            'receipt_no', v_receipt_no
        ),
        NULL,
        p_proof_image
    );

    -- Return the created transaction
    CALL GetTransaction(v_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100),
    IN p_payment_description VARCHAR(255),
    IN p_amount DECIMAL(10,2),
    IN p_status ENUM('Pending','Completed','Failed'),
    IN p_proof_image VARCHAR(500),       -- new path if replacing; NULL/'' to not set
    IN p_receipt_no VARCHAR(100),
    IN p_category_code VARCHAR(50),
    IN p_payer_name VARCHAR(255),
    IN p_payee_name VARCHAR(255),
    IN p_payer_name_override VARCHAR(255),
    IN p_event_remarks VARCHAR(255),
    IN p_remove_proof_image TINYINT,     -- 1 = remove image, 0/NULL = don't remove
    IN p_org_version_id INT              -- new parameter for organization version
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    DECLARE v_type_code VARCHAR(50);
    DECLARE v_transaction_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_exists INT;

    -- Actor must exist
    SELECT user_id INTO v_actor_id
      FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found';
    END IF;

    -- Get existing transaction's type (code + id)
    SELECT t.transaction_type_id, tt.code
      INTO v_transaction_type_id, v_type_code
      FROM tbl_transaction t
      JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
     WHERE t.transaction_id = p_transaction_id
     LIMIT 1;
    IF v_type_code IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not found';
    END IF;

    -- Resolve category if provided and validate pair against type
    IF p_category_code IS NOT NULL AND p_category_code <> '' THEN
        SELECT category_id INTO v_category_id
          FROM tbl_financial_category
         WHERE code = p_category_code AND active = TRUE
         LIMIT 1;
        IF v_category_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Financial category not found or inactive';
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM tbl_transaction_type_category
             WHERE transaction_type_id = v_transaction_type_id
               AND category_id = v_category_id
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Category not allowed for this transaction type';
        END IF;
    END IF;

    -- Enforce unique receipt when changing
    IF p_receipt_no IS NOT NULL AND p_receipt_no <> '' THEN
        IF EXISTS (
            SELECT 1 FROM tbl_transaction
             WHERE receipt_no = p_receipt_no
               AND transaction_id <> p_transaction_id
        ) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Receipt number already exists';
        END IF;
    END IF;

    -- Update main row (tri-state image logic)
    UPDATE tbl_transaction
       SET payment_description = COALESCE(p_payment_description, payment_description),
           amount              = COALESCE(p_amount, amount),
           status              = COALESCE(p_status, status),
           receipt_no          = COALESCE(NULLIF(p_receipt_no,''), receipt_no),
           category_id         = COALESCE(v_category_id, category_id),
           org_version_id      = COALESCE(p_org_version_id, org_version_id),
           payer_name          = COALESCE(NULLIF(p_payer_name,''), payer_name),
           payee_name          = COALESCE(NULLIF(p_payee_name,''), payee_name),
           proof_image         =
               CASE
                 WHEN p_remove_proof_image = 1 THEN NULL             -- remove
                 WHEN p_proof_image IS NOT NULL AND p_proof_image <> '' THEN p_proof_image -- replace
                 ELSE proof_image                                    -- keep
               END,
           updated_at          = CURRENT_TIMESTAMP
     WHERE transaction_id = p_transaction_id;

    IF ROW_COUNT() = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Update failed';
    END IF;

    -- If income transaction: update event link fields when row exists
    IF v_type_code = 'INCOME' THEN
        SELECT COUNT(*) INTO v_exists FROM tbl_transaction_event WHERE transaction_id = p_transaction_id;
        IF v_exists = 1 THEN
            UPDATE tbl_transaction_event
               SET payer_name_override = COALESCE(NULLIF(p_payer_name_override,''), payer_name_override),
                   remarks            = COALESCE(NULLIF(p_event_remarks,''), remarks)
             WHERE transaction_id = p_transaction_id;
        END IF;
    END IF;

    -- Audit log
    CALL LogAction(
        p_user_email,
        CONCAT('Updated transaction #', p_transaction_id, ' (', v_type_code, ')'),
        'TRANSACTION_UPDATE',
        JSON_OBJECT(
            'transaction_id', p_transaction_id,
            'amount', p_amount,
            'status', p_status,
            'category', p_category_code,
            'remove_image', IFNULL(p_remove_proof_image,0)
        ),
        NULL,
        p_proof_image
    );

    -- Return updated row
    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100),
    IN p_reason VARCHAR(255)
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    SELECT user_id INTO v_actor_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found'; END IF;

    UPDATE tbl_transaction
       SET archived_at = CURRENT_TIMESTAMP,
           archived_by = v_actor_id,
           archived_reason = p_reason
     WHERE transaction_id = p_transaction_id
       AND archived_at IS NULL;

    IF ROW_COUNT() = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not found or already archived'; END IF;

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Archived transaction #', p_transaction_id, ' Reason: ', p_reason),
        'TRANSACTION_ARCHIVE',
        JSON_OBJECT(
            'transaction_id', p_transaction_id,
            'reason', p_reason
        ),
        NULL,
        NULL
    );

    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveTransaction(
    IN p_transaction_id INT,
    IN p_user_email VARCHAR(100)
)
BEGIN
    DECLARE v_actor_id VARCHAR(200);
    SELECT user_id INTO v_actor_id FROM tbl_user WHERE email = p_user_email LIMIT 1;
    IF v_actor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor user not found'; END IF;

    UPDATE tbl_transaction
       SET archived_at = NULL,
           archived_by = NULL,
           archived_reason = NULL
     WHERE transaction_id = p_transaction_id
       AND archived_at IS NOT NULL;

    IF ROW_COUNT() = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Transaction not archived or not found'; END IF;

    -- Log the action
    CALL LogAction(
        p_user_email,
        CONCAT('Unarchived transaction #', p_transaction_id),
        'TRANSACTION_UNARCHIVE',
        JSON_OBJECT('transaction_id', p_transaction_id),
        NULL,
        NULL
    );

    CALL GetTransaction(p_transaction_id);
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
CREATE DEFINER='admin'@'%' PROCEDURE GetSystemCounts(
    IN p_user_id VARCHAR(200) -- pass NULL/'' for system-only totals
)
BEGIN
    /* ---------- System-wide totals ---------- */
    DECLARE v_total_orgs            INT DEFAULT 0;
    DECLARE v_total_app_org         INT DEFAULT 0;
    DECLARE v_total_app_user        INT DEFAULT 0;
    DECLARE v_total_event_apps      INT DEFAULT 0;
    DECLARE v_total_upcoming_events INT DEFAULT 0;

    /* ---------- Student-scoped ---------- */
    DECLARE v_student_pending_proposals    INT DEFAULT 0;
    DECLARE v_student_pending_transactions INT DEFAULT 0;
    DECLARE v_student_upcoming_events      INT DEFAULT 0;
    DECLARE v_student_total_reports        INT DEFAULT 0; -- post-event only

    /* ---------- Adviser-scoped ---------- */
    DECLARE v_adviser_total_members    INT DEFAULT 0;
    DECLARE v_adviser_total_reports    INT DEFAULT 0;
    DECLARE v_adviser_total_events     INT DEFAULT 0;
    DECLARE v_adviser_upcoming_events  INT DEFAULT 0;

    /* ---------- System totals ---------- */
    SELECT COUNT(*) INTO v_total_orgs            FROM tbl_organization;
    SELECT COUNT(*) INTO v_total_app_org         FROM tbl_application      WHERE status = 'Pending';
    SELECT COUNT(*) INTO v_total_app_user        FROM tbl_user_application WHERE status = 'Pending';
    SELECT COUNT(*) INTO v_total_event_apps      FROM tbl_event_application;
    SELECT COUNT(*) INTO v_total_upcoming_events FROM tbl_event
     WHERE status = 'Approved' AND start_date >= CURDATE();

    /* ---------- If no user provided, return system totals only ---------- */
    IF p_user_id IS NULL OR p_user_id = '' THEN

        SELECT
            v_total_orgs            AS total_organizations,
            v_total_app_org         AS total_organization_applications,
            v_total_app_user        AS total_user_applications,
            (v_total_app_org + v_total_app_user) AS total_applications,
            v_total_event_apps      AS total_event_proposals,
            v_total_upcoming_events AS total_upcoming_events,

            /* student-scoped (zero without user) */
            v_student_pending_proposals    AS student_pending_proposals,
            v_student_pending_transactions AS student_pending_transactions,
            v_student_upcoming_events      AS student_upcoming_events,
            v_student_total_reports        AS student_total_reports,

            /* adviser-scoped (zero without user) */
            v_adviser_total_members      AS adviser_total_members,
            v_adviser_total_reports      AS adviser_total_reports,
            v_adviser_total_events       AS adviser_total_events,
            v_adviser_upcoming_events    AS adviser_upcoming_events;

    ELSE
        /* ---------- Build per-user organization sets ---------- */
        DROP TEMPORARY TABLE IF EXISTS tmp_student_orgs;
        CREATE TEMPORARY TABLE tmp_student_orgs (
            organization_id INT PRIMARY KEY
        ) ENGINE=Memory;

        INSERT IGNORE INTO tmp_student_orgs (organization_id)
        SELECT DISTINCT m.organization_id
          FROM tbl_organization_members m
         WHERE m.user_id = p_user_id
           AND m.status = 'Active';

        DROP TEMPORARY TABLE IF EXISTS tmp_adviser_orgs;
        CREATE TEMPORARY TABLE tmp_adviser_orgs (
            organization_id INT PRIMARY KEY
        ) ENGINE=Memory;

        INSERT IGNORE INTO tmp_adviser_orgs (organization_id)
        SELECT o.organization_id
          FROM tbl_organization o
         WHERE o.adviser_id = p_user_id;

        /* ---------- Student-scoped counts ---------- */

        /* 1) Pending event proposals for the student's orgs */
        SELECT COUNT(*)
          INTO v_student_pending_proposals
          FROM tbl_event_application ea
         WHERE ea.status = 'Pending'
           AND EXISTS (SELECT 1 FROM tmp_student_orgs s WHERE s.organization_id = ea.organization_id);

        /* 2) Pending transactions touching student's orgs (materialize first) */
        DROP TEMPORARY TABLE IF EXISTS tmp_student_txns;
        CREATE TEMPORARY TABLE tmp_student_txns (
            transaction_id INT PRIMARY KEY
        ) ENGINE=Memory;

        /* membership-linked */
        INSERT IGNORE INTO tmp_student_txns (transaction_id)
        SELECT t.transaction_id
          FROM tbl_transaction t
          JOIN tbl_transaction_membership tm ON tm.transaction_id = t.transaction_id
          JOIN tmp_student_orgs s            ON s.organization_id   = tm.organization_id
         WHERE t.status = 'Pending';

        /* event-linked */
        INSERT IGNORE INTO tmp_student_txns (transaction_id)
        SELECT t.transaction_id
          FROM tbl_transaction t
          JOIN tbl_transaction_event te ON te.transaction_id = t.transaction_id
          JOIN tbl_event e              ON e.event_id        = te.event_id
          JOIN tmp_student_orgs s       ON s.organization_id = e.organization_id
         WHERE t.status = 'Pending';

        SELECT COUNT(*) INTO v_student_pending_transactions FROM tmp_student_txns;

        /* 3) Upcoming events for student's orgs */
        SELECT COUNT(*)
          INTO v_student_upcoming_events
          FROM tbl_event e
         WHERE e.status = 'Approved'
           AND e.start_date >= CURDATE()
           AND EXISTS (SELECT 1 FROM tmp_student_orgs s WHERE s.organization_id = e.organization_id);

        /* 4) Student “reports”: ONLY post-event submissions */
        SELECT COUNT(*)
          INTO v_student_total_reports
          FROM tbl_event_requirement_submissions ers
          JOIN tbl_event_application_requirement r ON r.requirement_id = ers.requirement_id
         WHERE r.is_applicable_to = 'post-event'
           AND EXISTS (SELECT 1 FROM tmp_student_orgs s WHERE s.organization_id = ers.organization_id);

        /* ---------- Adviser-scoped counts ---------- */
        SELECT COUNT(*)
          INTO v_adviser_total_members
          FROM tbl_organization_members m
         WHERE m.status = 'Active'
           AND EXISTS (SELECT 1 FROM tmp_adviser_orgs a WHERE a.organization_id = m.organization_id);

        SELECT COUNT(*)
          INTO v_adviser_total_reports
          FROM tbl_event_requirement_submissions ers
         WHERE EXISTS (SELECT 1 FROM tmp_adviser_orgs a WHERE a.organization_id = ers.organization_id);

        SELECT COUNT(*)
          INTO v_adviser_total_events
          FROM tbl_event e
         WHERE EXISTS (SELECT 1 FROM tmp_adviser_orgs a WHERE a.organization_id = e.organization_id);

        SELECT COUNT(*)
          INTO v_adviser_upcoming_events
          FROM tbl_event e
         WHERE e.status = 'Approved'
           AND e.start_date >= CURDATE()
           AND EXISTS (SELECT 1 FROM tmp_adviser_orgs a WHERE a.organization_id = e.organization_id);

        /* ---------- Return single row ---------- */
        SELECT
            v_total_orgs            AS total_organizations,
            v_total_app_org         AS total_organization_applications,
            v_total_app_user        AS total_user_applications,
            (v_total_app_org + v_total_app_user) AS total_applications,
            v_total_event_apps      AS total_event_proposals,
            v_total_upcoming_events AS total_upcoming_events,

            /* Student-scoped */
            v_student_pending_proposals    AS student_pending_proposals,
            v_student_pending_transactions AS student_pending_transactions,
            v_student_upcoming_events      AS student_upcoming_events,
            v_student_total_reports        AS student_total_reports,

            /* Adviser-scoped */
            v_adviser_total_members      AS adviser_total_members,
            v_adviser_total_reports      AS adviser_total_reports,
            v_adviser_total_events       AS adviser_total_events,
            v_adviser_upcoming_events    AS adviser_upcoming_events;
    END IF;
END $$
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
CREATE DEFINER='admin'@'%' PROCEDURE CheckOrgRenewalStatus(
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

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateBlockedPeriod(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_reason VARCHAR(255),
    IN p_created_by VARCHAR(200)
)
BEGIN
    INSERT INTO tbl_blocked_period (start_date, end_date, reason, created_by)
    VALUES (p_start_date, p_end_date, p_reason, p_created_by);

    -- Log action
    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_created_by LIMIT 1),
        CONCAT('Created blocked period: ', p_reason),
        'blocked_period',
        JSON_OBJECT('blocked_period_id', LAST_INSERT_ID(), 'start_date', p_start_date, 'end_date', p_end_date),
        NULL,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateBlockedPeriod(
    IN p_blocked_period_id INT,
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_reason VARCHAR(255),
    IN p_updated_by VARCHAR(200)
)
BEGIN
    UPDATE tbl_blocked_period
    SET start_date = p_start_date,
        end_date = p_end_date,
        reason = p_reason
    WHERE blocked_period_id = p_blocked_period_id;

    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_updated_by LIMIT 1),
        CONCAT('Updated blocked period: ', p_reason),
        'blocked_period',
        JSON_OBJECT('blocked_period_id', p_blocked_period_id, 'start_date', p_start_date, 'end_date', p_end_date),
        NULL,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ArchiveBlockedPeriod(
    IN p_blocked_period_id INT,
    IN p_archived_by VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    UPDATE tbl_blocked_period
    SET archived_at = CURRENT_TIMESTAMP,
        archived_by = p_archived_by,
        archived_reason = p_reason,
        unarchived_at = NULL,
        unarchived_by = NULL,
        unarchived_reason = NULL
    WHERE blocked_period_id = p_blocked_period_id;

    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_archived_by LIMIT 1),
        CONCAT('Archived blocked period: ', p_reason),
        'blocked_period',
        JSON_OBJECT('blocked_period_id', p_blocked_period_id, 'reason', p_reason),
        NULL,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UnarchiveBlockedPeriod(
    IN p_blocked_period_id INT,
    IN p_unarchived_by VARCHAR(200),
    IN p_reason VARCHAR(255)
)
BEGIN
    UPDATE tbl_blocked_period
    SET archived_at = NULL,
        archived_by = NULL,
        archived_reason = NULL,
        unarchived_at = CURRENT_TIMESTAMP,
        unarchived_by = p_unarchived_by,
        unarchived_reason = p_reason
    WHERE blocked_period_id = p_blocked_period_id;

    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_unarchived_by LIMIT 1),
        CONCAT('Unarchived blocked period'),
        'blocked_period',
        JSON_OBJECT('blocked_period_id', p_blocked_period_id, 'reason', p_reason),
        NULL,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE DeleteBlockedPeriod(
    IN p_blocked_period_id INT,
    IN p_deleted_by VARCHAR(200)
)
BEGIN
    DELETE FROM tbl_blocked_period WHERE blocked_period_id = p_blocked_period_id;

    CALL LogAction(
        (SELECT email FROM tbl_user WHERE user_id = p_deleted_by LIMIT 1),
        CONCAT('Deleted blocked period: ', p_blocked_period_id),
        'blocked_period',
        JSON_OBJECT('blocked_period_id', p_blocked_period_id),
        NULL,
        NULL
    );
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetBlockedPeriodsByStatus(
    IN p_status ENUM('archived', 'unarchived')
)
BEGIN
    IF p_status = 'archived' THEN
        SELECT * FROM tbl_blocked_period WHERE archived_at IS NOT NULL;
    ELSE
        SELECT * FROM tbl_blocked_period WHERE archived_at IS NULL;
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllOrganizationsEventStatistics()
BEGIN
    -- Return final results with ranking and calculated trend status
    SELECT 
        RANK() OVER (ORDER BY org_stats.average_attendance DESC) AS rank_position,
        org_stats.organization_name,
        org_stats.current_org_version_id,
        org_stats.cycle_number,
        org_stats.total_events_held,
        org_stats.average_attendance,
        org_stats.total_participants,
        CASE
            WHEN org_stats.total_events_held < 2 THEN 'Insufficient Data'
            WHEN trend_data.earlier_avg = 0 AND trend_data.recent_avg > 0 THEN 'Growing'
            WHEN trend_data.earlier_avg > 0 AND trend_data.recent_avg > trend_data.earlier_avg * 1.1 THEN 'Growing'
            WHEN trend_data.earlier_avg > 0 AND trend_data.recent_avg < trend_data.earlier_avg * 0.9 THEN 'Declining'
            ELSE 'Stable'
        END AS participation_trend_status,
        CAST(IFNULL(org_stats.participation_trend, JSON_ARRAY()) AS CHAR) AS participation_trend
    FROM (
        SELECT 
            o.organization_id,
            ov.name AS organization_name,
            rc.org_version_id AS current_org_version_id,
            rc.cycle_number,
            -- Total events
            (
                SELECT COUNT(DISTINCT e.event_id)
                FROM tbl_event e
                WHERE e.organization_id = o.organization_id
                AND e.cycle_number = rc.cycle_number
                AND e.status = 'Approved'
            ) AS total_events_held,
            -- Average attendance
            (
                SELECT 
                    CASE 
                        WHEN COUNT(DISTINCT e.event_id) > 0 
                        THEN ROUND(COUNT(ea.attendance_id) / COUNT(DISTINCT e.event_id), 2)
                        ELSE 0.00
                    END
                FROM tbl_event e
                LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id 
                    AND ea.status IN ('Attended', 'Evaluated')
                    AND ea.deleted_at IS NULL
                LEFT JOIN tbl_user u ON ea.user_id = u.user_id AND u.status = 'Active'
                WHERE e.organization_id = o.organization_id
                AND e.cycle_number = rc.cycle_number
                AND e.status = 'Approved'
            ) AS average_attendance,
            -- Total unique active participants
            (
                SELECT COUNT(DISTINCT ea.user_id)
                FROM tbl_event_attendance ea
                INNER JOIN tbl_event e ON ea.event_id = e.event_id
                INNER JOIN tbl_user u ON ea.user_id = u.user_id
                WHERE e.organization_id = o.organization_id
                AND e.cycle_number = rc.cycle_number
                AND e.status = 'Approved'
                AND ea.status IN ('Attended', 'Evaluated')
                AND ea.deleted_at IS NULL
                AND u.status = 'Active'
            ) AS total_participants,
            -- Participation trend JSON
            (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'eventName', event_title,
                        'participants', participant_count
                    )
                )
                FROM (
                    SELECT 
                        e.title AS event_title,
                        COUNT(DISTINCT CASE 
                            WHEN ea.user_id IS NOT NULL AND u.status = 'Active' 
                            THEN ea.user_id 
                        END) AS participant_count
                    FROM tbl_event e
                    LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id 
                        AND ea.status IN ('Attended', 'Evaluated')
                        AND ea.deleted_at IS NULL
                    LEFT JOIN tbl_user u ON ea.user_id = u.user_id
                    WHERE e.organization_id = o.organization_id
                    AND e.cycle_number = rc.cycle_number
                    AND e.status = 'Approved'
                    GROUP BY e.event_id, e.title, e.start_date, e.start_time
                    ORDER BY e.start_date ASC, e.start_time ASC
                ) event_data
            ) AS participation_trend
        FROM tbl_organization o
        INNER JOIN (
            -- Get latest cycle for each organization
            SELECT organization_id, MAX(cycle_number) as max_cycle
            FROM tbl_renewal_cycle
            GROUP BY organization_id
        ) latest ON o.organization_id = latest.organization_id
        INNER JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
            AND rc.cycle_number = latest.max_cycle
        INNER JOIN tbl_organization_version ov ON rc.org_version_id = ov.org_version_id
        WHERE o.status = 'Approved'
    ) org_stats
    LEFT JOIN (
        -- Calculate trend data for each organization
        SELECT 
            o.organization_id,
            rc.cycle_number,
            COALESCE(AVG(CASE WHEN event_order <= midpoint THEN participant_count END), 0) as recent_avg,
            COALESCE(AVG(CASE WHEN event_order > midpoint THEN participant_count END), 0) as earlier_avg
        FROM tbl_organization o
        INNER JOIN (
            SELECT organization_id, MAX(cycle_number) as max_cycle
            FROM tbl_renewal_cycle
            GROUP BY organization_id
        ) latest ON o.organization_id = latest.organization_id
        INNER JOIN tbl_renewal_cycle rc ON o.organization_id = rc.organization_id 
            AND rc.cycle_number = latest.max_cycle
        LEFT JOIN (
            SELECT 
                e.organization_id,
                e.cycle_number,
                e.event_id,
                ROW_NUMBER() OVER (PARTITION BY e.organization_id, e.cycle_number ORDER BY e.start_date, e.start_time) as event_order,
                COUNT(DISTINCT CASE WHEN u.status = 'Active' THEN ea.user_id END) as participant_count,
                CEIL(COUNT(*) OVER(PARTITION BY e.organization_id, e.cycle_number) / 2.0) as midpoint
            FROM tbl_event e
            LEFT JOIN tbl_event_attendance ea ON e.event_id = ea.event_id 
                AND ea.status IN ('Attended', 'Evaluated')
                AND ea.deleted_at IS NULL
            LEFT JOIN tbl_user u ON ea.user_id = u.user_id
            WHERE e.status = 'Approved'
            GROUP BY e.organization_id, e.cycle_number, e.event_id, e.start_date, e.start_time
        ) event_stats ON o.organization_id = event_stats.organization_id 
            AND rc.cycle_number = event_stats.cycle_number
        WHERE o.status = 'Approved'
        GROUP BY o.organization_id, rc.cycle_number
    ) trend_data ON org_stats.organization_id = trend_data.organization_id 
        AND org_stats.cycle_number = trend_data.cycle_number
    ORDER BY rank_position;
    
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAnalyticsOrganizations()
BEGIN
  /* SDAO (no cycle), All Orgs (no cycle), and each org using latest cycle name */
  SELECT NULL AS organization_id, 'SDAO' AS organization_name, 1 AS sort_order
  UNION ALL
  SELECT -1  AS organization_id, 'All Organizations' AS organization_name, 2 AS sort_order
  UNION ALL
  SELECT o.organization_id, ov.name AS organization_name, 3 AS sort_order
  FROM tbl_organization o
  INNER JOIN (
    SELECT organization_id, MAX(cycle_number) AS max_cycle
    FROM tbl_renewal_cycle
    GROUP BY organization_id
  ) lc ON lc.organization_id = o.organization_id
  INNER JOIN tbl_renewal_cycle rc
    ON rc.organization_id = o.organization_id AND rc.cycle_number = lc.max_cycle
  INNER JOIN tbl_organization_version ov
    ON ov.org_version_id = rc.org_version_id
  WHERE o.status = 'Approved'
  ORDER BY sort_order, organization_name;
END$$
DELIMITER ;

DROP PROCEDURE IF EXISTS GetEventActivities;
DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE GetEventActivities(IN p_organization_id INT)
BEGIN
  /* ===== Dates (same logic) ===== */
  DECLARE v_today DATE;
  DECLARE v_current_month_start DATE;
  DECLARE v_current_month_end DATE;
  DECLARE v_last_month_start DATE;
  DECLARE v_last_month_end DATE;

  SET v_today = CURDATE();
  SET v_current_month_start = DATE_FORMAT(CURDATE(), '%Y-%m-01');
  SET v_current_month_end   = LAST_DAY(CURDATE());
  SET v_last_month_start    = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01');
  SET v_last_month_end      = LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH));

  WITH RECURSIVE months AS (
    SELECT 0 AS n, DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH) AS month_date
    UNION ALL
    SELECT n+1, DATE_ADD(month_date, INTERVAL 1 MONTH)
    FROM months WHERE n < 11
  ),
  lc AS (
    SELECT organization_id, MAX(cycle_number) AS max_cycle
    FROM tbl_renewal_cycle
    GROUP BY organization_id
  ),
  org_latest AS (
    SELECT o.organization_id, o.status,
           ov.name AS organization_name,
           rc.cycle_number, rc.org_version_id
    FROM tbl_organization o
    JOIN lc            ON lc.organization_id = o.organization_id
    JOIN tbl_renewal_cycle rc
         ON rc.organization_id = o.organization_id AND rc.cycle_number = lc.max_cycle
    JOIN tbl_organization_version ov
         ON ov.org_version_id = rc.org_version_id
    WHERE o.status = 'Approved'
  ),
  ev_sdao AS (
    SELECT e.*
    FROM tbl_event e
    WHERE e.event_type IN ('SDAO','System')
  ),
  ev_org AS (
    SELECT e.*
    FROM tbl_event e
    JOIN lc ON lc.organization_id = e.organization_id
    WHERE e.event_type = 'Organization'
      AND e.cycle_number = lc.max_cycle
  ),
  att_by_event AS (
    SELECT
      e.event_id,
      SUM(CASE WHEN ea.status IN ('Registered','Attended','Evaluated') THEN 1 ELSE 0 END) AS reg_all,
      SUM(CASE WHEN ea.status IN ('Attended','Evaluated') THEN 1 ELSE 0 END)              AS att_all,
      SUM(CASE WHEN ea.status = 'Evaluated' THEN 1 ELSE 0 END)                             AS eval_all,
      SUM(CASE WHEN ea.status = 'Registered' THEN 1 ELSE 0 END)                            AS reg_only
    FROM tbl_event e
    LEFT JOIN tbl_event_attendance ea
      ON ea.event_id = e.event_id AND ea.deleted_at IS NULL
    GROUP BY e.event_id
  ),
  /* SDAO aggregates */
  sdao_counts AS (
    SELECT
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END) AS completed_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS completed_lm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END)  AS cancelled_cm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS cancelled_lm
    FROM ev_sdao e
  ),
  sdao_rates AS (
    SELECT
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_cm,

      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_lm
    FROM ev_sdao e
    LEFT JOIN att_by_event a ON a.event_id = e.event_id
  ),
  sdao_trend AS (
    SELECT CAST(
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'event',   t.title,
            'attended',COALESCE(a.att_all,0),
            'notAttended',COALESCE(a.reg_only,0)
          ) AS CHAR)
          ORDER BY t.start_date DESC SEPARATOR ','
        ), ''),
        ']'
      ) AS JSON
    ) AS attendance_trend
    FROM (
      SELECT e.event_id, e.title, e.start_date
      FROM ev_sdao e
      WHERE e.status='Approved' AND e.start_date < v_today
      ORDER BY e.start_date DESC
      LIMIT 10
    ) t
    LEFT JOIN att_by_event a ON a.event_id = t.event_id
  ),
  sdao_feedback_per_event AS (
    SELECT CAST(
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'event', t.title,
            'feedback',
              CASE WHEN COALESCE(a.att_all,0) > 0
                   THEN ROUND(COALESCE(a.eval_all,0)*100.0/COALESCE(a.att_all,0),0)
                   ELSE 0 END
          ) AS CHAR)
          ORDER BY t.start_date DESC SEPARATOR ','
        ), ''),
        ']'
      ) AS JSON
    ) AS feedback_json
    FROM (
      SELECT e.event_id, e.title, e.start_date
      FROM ev_sdao e
      WHERE e.status='Approved' AND e.start_date < v_today
      ORDER BY e.start_date DESC
      LIMIT 10
    ) t
    LEFT JOIN att_by_event a ON a.event_id = t.event_id
  ),
  sdao_month_json AS (
    SELECT CAST(
      CONCAT(
        '[',
        GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'month', DATE_FORMAT(m.month_date, '%b'),
            'events',
              COALESCE((
                SELECT COUNT(*)
                FROM ev_sdao e
                WHERE e.status='Approved'
                  AND e.start_date < v_today
                  AND e.start_date >= m.month_date
                  AND e.start_date <  DATE_ADD(m.month_date, INTERVAL 1 MONTH)
              ),0)
          ) AS CHAR)
          ORDER BY m.month_date ASC SEPARATOR ','
        ),
        ']'
      ) AS JSON
    ) AS month_json
    FROM months m
  ),
  /* All-orgs aggregates */
  all_counts AS (
    SELECT
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END) AS completed_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS completed_lm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END)  AS cancelled_cm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS cancelled_lm
    FROM ev_org e
  ),
  all_rates AS (
    SELECT
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_cm,

      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_lm
    FROM ev_org e
    LEFT JOIN att_by_event a ON a.event_id = e.event_id
  ),
  all_trend AS (
    SELECT CAST(
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'event',   t.title,
            'attended',COALESCE(a.att_all,0),
            'notAttended',COALESCE(a.reg_only,0)
          ) AS CHAR)
          ORDER BY t.start_date DESC SEPARATOR ','
        ), ''),
        ']'
      ) AS JSON
    ) AS attendance_trend
    FROM (
      SELECT e.event_id, e.title, e.start_date
      FROM ev_org e
      WHERE e.status='Approved' AND e.start_date < v_today
      ORDER BY e.start_date DESC
      LIMIT 10
    ) t
    LEFT JOIN att_by_event a ON a.event_id = t.event_id
  ),
  all_feedback_per_event AS (
    SELECT CAST(
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'event', t.title,
            'feedback',
              CASE WHEN COALESCE(a.att_all,0) > 0
                   THEN ROUND(COALESCE(a.eval_all,0)*100.0/COALESCE(a.att_all,0),0)
                   ELSE 0 END
          ) AS CHAR)
          ORDER BY t.start_date DESC SEPARATOR ','
        ), ''),
        ']'
      ) AS JSON
    ) AS feedback_json
    FROM (
      SELECT e.event_id, e.title, e.start_date
      FROM ev_org e
      WHERE e.status='Approved' AND e.start_date < v_today
      ORDER BY e.start_date DESC
      LIMIT 10
    ) t
    LEFT JOIN att_by_event a ON a.event_id = t.event_id
  ),
  all_month_json AS (
    SELECT CAST(
      CONCAT(
        '[',
        GROUP_CONCAT(
          CAST(JSON_OBJECT(
            'month', DATE_FORMAT(m.month_date, '%b'),
            'events',
              COALESCE((
                SELECT COUNT(*)
                FROM ev_org e
                WHERE e.status='Approved'
                  AND e.start_date < v_today
                  AND e.start_date >= m.month_date
                  AND e.start_date <  DATE_ADD(m.month_date, INTERVAL 1 MONTH)
              ),0)
          ) AS CHAR)
          ORDER BY m.month_date ASC SEPARATOR ','
        ),
        ']'
      ) AS JSON
    ) AS month_json
    FROM months m
  ),
  org_counts AS (
    SELECT
      e.organization_id,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END) AS completed_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS completed_lm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_current_month_start AND v_current_month_end THEN 1 ELSE 0 END)  AS cancelled_cm,
      SUM(CASE WHEN e.status='Rejected'
               AND e.start_date BETWEEN v_last_month_start AND v_last_month_end THEN 1 ELSE 0 END)        AS cancelled_lm
    FROM ev_org e
    GROUP BY e.organization_id
  ),
  org_rates AS (
    SELECT
      e.organization_id,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_cm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_current_month_start AND v_current_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_cm,

      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.reg_all,0) ELSE 0 END)  AS regs_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.att_all,0) ELSE 0 END)  AS att_lm,
      SUM(CASE WHEN e.status='Approved' AND e.start_date < v_today
                    AND e.start_date BETWEEN v_last_month_start AND v_last_month_end
               THEN COALESCE(a.eval_all,0) ELSE 0 END) AS eval_lm
    FROM ev_org e
    LEFT JOIN att_by_event a ON a.event_id = e.event_id
    GROUP BY e.organization_id
  ),
  org_trend_src AS (
    SELECT
      e.organization_id, e.event_id, e.title, e.start_date,
      COALESCE(a.att_all,0) AS att_all, COALESCE(a.reg_only,0) AS reg_only,
      ROW_NUMBER() OVER (PARTITION BY e.organization_id ORDER BY e.start_date DESC) AS rn
    FROM ev_org e
    LEFT JOIN att_by_event a ON a.event_id = e.event_id
    WHERE e.status='Approved' AND e.start_date < v_today
  ),
  org_trend AS (
    SELECT
      organization_id,
      CAST(
        CONCAT(
          '[',
          IFNULL(GROUP_CONCAT(
            CAST(JSON_OBJECT(
              'event', title,
              'attended', att_all,
              'notAttended', reg_only
            ) AS CHAR)
            ORDER BY start_date DESC SEPARATOR ','
          ), ''),
          ']'
        ) AS JSON
      ) AS attendance_trend
    FROM org_trend_src
    WHERE rn <= 10
    GROUP BY organization_id
  ),
  org_feedback_src AS (
    SELECT
      e.organization_id, e.event_id, e.title, e.start_date,
      COALESCE(a.att_all,0) AS att_all, COALESCE(a.eval_all,0) AS eval_all,
      ROW_NUMBER() OVER (PARTITION BY e.organization_id ORDER BY e.start_date DESC) AS rn
    FROM ev_org e
    LEFT JOIN att_by_event a ON a.event_id = e.event_id
    WHERE e.status='Approved' AND e.start_date < v_today
  ),
  org_feedback AS (
    SELECT
      organization_id,
      CAST(
        CONCAT(
          '[',
          IFNULL(GROUP_CONCAT(
            CAST(JSON_OBJECT(
              'event', title,
              'feedback', CASE WHEN att_all > 0 THEN ROUND(eval_all*100.0/att_all,0) ELSE 0 END
            ) AS CHAR)
            ORDER BY start_date DESC SEPARATOR ','
          ), ''),
          ']'
        ) AS JSON
      ) AS feedback_json
    FROM org_feedback_src
    WHERE rn <= 10
    GROUP BY organization_id
  ),
  org_month AS (
    SELECT
      ol.organization_id,
      CAST(
        CONCAT(
          '[',
          GROUP_CONCAT(
            CAST(JSON_OBJECT(
              'month', DATE_FORMAT(m.month_date,'%b'),
              'events',
                COALESCE((
                  SELECT COUNT(*)
                  FROM ev_org e
                  WHERE e.organization_id = ol.organization_id
                    AND e.status='Approved'
                    AND e.start_date < v_today
                    AND e.start_date >= m.month_date
                    AND e.start_date <  DATE_ADD(m.month_date, INTERVAL 1 MONTH)
                ),0)
            ) AS CHAR)
            ORDER BY m.month_date ASC SEPARATOR ','
          ),
          ']'
        ) AS JSON
      ) AS month_json
    FROM org_latest ol
    CROSS JOIN months m
    GROUP BY ol.organization_id
  )

  /* ===== Single SELECT (CTEs visible here) ===== */
  SELECT *
  FROM (
    /* 1) SDAO/System - only when no org filter */
    SELECT
      NULL AS organization_id,
      'SDAO' AS organization_name,

      sc.completed_cm                            AS completed_events,
      sc.completed_lm                            AS last_month_completed,
      CASE WHEN sc.completed_lm = 0 THEN NULL ELSE sc.completed_cm - sc.completed_lm END AS completed_events_change,

      sc.cancelled_cm                            AS cancelled_events,
      sc.cancelled_lm                            AS last_month_cancelled,
      CASE WHEN sc.cancelled_lm = 0 THEN NULL ELSE sc.cancelled_cm - sc.cancelled_lm END AS cancelled_events_change,

      CASE WHEN sr.regs_cm > 0 THEN ROUND(sr.att_cm*100.0/sr.regs_cm,2) ELSE 0 END AS avg_attendance_rate,
      CASE WHEN sr.regs_lm > 0 THEN ROUND(sr.att_lm*100.0/sr.regs_lm,2) ELSE 0 END AS last_month_avg_attendance_rate,
      CASE WHEN sr.regs_lm = 0 THEN NULL
           ELSE (ROUND(sr.att_cm*100.0/NULLIF(sr.regs_cm,0),2) - ROUND(sr.att_lm*100.0/sr.regs_lm,2)) END AS attendance_rate_change,

      CASE WHEN sr.att_cm > 0 THEN ROUND(sr.eval_cm*100.0/sr.att_cm,2) ELSE 0 END AS avg_feedback_rate,
      CASE WHEN sr.att_lm > 0 THEN ROUND(sr.eval_lm*100.0/sr.att_lm,2) ELSE 0 END AS last_month_avg_feedback_rate,
      CASE WHEN sr.att_lm = 0 THEN NULL
           ELSE (ROUND(sr.eval_cm*100.0/NULLIF(sr.att_cm,0),2) - ROUND(sr.eval_lm*100.0/sr.att_lm,2)) END AS feedback_rate_change,

      st.attendance_trend,
      sfe.feedback_json AS event_feedback_rate,
      sm.month_json     AS events_per_month,

      1 AS sort_order
    FROM sdao_counts sc
    JOIN sdao_rates  sr ON 1=1
    JOIN sdao_trend  st ON 1=1
    JOIN sdao_feedback_per_event sfe ON 1=1
    JOIN sdao_month_json sm ON 1=1
    WHERE p_organization_id IS NULL

    UNION ALL

    /* 2) All Organizations - only when no org filter */
    SELECT
      -1 AS organization_id,
      'All Organizations' AS organization_name,

      ac.completed_cm                            AS completed_events,
      ac.completed_lm                            AS last_month_completed,
      CASE WHEN ac.completed_lm = 0 THEN NULL ELSE ac.completed_cm - ac.completed_lm END AS completed_events_change,

      ac.cancelled_cm                            AS cancelled_events,
      ac.cancelled_lm                            AS last_month_cancelled,
      CASE WHEN ac.cancelled_lm = 0 THEN NULL ELSE ac.cancelled_cm - ac.cancelled_lm END AS cancelled_events_change,

      CASE WHEN ar.regs_cm > 0 THEN ROUND(ar.att_cm*100.0/ar.regs_cm,2) ELSE 0 END AS avg_attendance_rate,
      CASE WHEN ar.regs_lm > 0 THEN ROUND(ar.att_lm*100.0/ar.regs_lm,2) ELSE 0 END AS last_month_avg_attendance_rate,
      CASE WHEN ar.regs_lm = 0 THEN NULL
           ELSE (ROUND(ar.att_cm*100.0/NULLIF(ar.regs_cm,0),2) - ROUND(ar.att_lm*100.0/ar.regs_lm,2)) END AS attendance_rate_change,

      CASE WHEN ar.att_cm > 0 THEN ROUND(ar.eval_cm*100.0/ar.att_cm,2) ELSE 0 END AS avg_feedback_rate,
      CASE WHEN ar.att_lm > 0 THEN ROUND(ar.eval_lm*100.0/ar.att_lm,2) ELSE 0 END AS last_month_avg_feedback_rate,
      CASE WHEN ar.att_lm = 0 THEN NULL
           ELSE (ROUND(ar.eval_cm*100.0/NULLIF(ar.att_cm,0),2) - ROUND(ar.eval_lm*100.0/ar.att_lm,2)) END AS feedback_rate_change,

      at.attendance_trend,
      afe.feedback_json AS event_feedback_rate,
      am.month_json     AS events_per_month,

      2 AS sort_order
    FROM all_counts ac
    JOIN all_rates  ar  ON 1=1
    JOIN all_trend  at  ON 1=1
    JOIN all_feedback_per_event afe ON 1=1
    JOIN all_month_json am ON 1=1
    WHERE p_organization_id IS NULL

    UNION ALL

    /* 3) Per-organization rows - all orgs when NULL, or single org when set */
    SELECT
      ol.organization_id,
      ol.organization_name,

      COALESCE(oc.completed_cm,0) AS completed_events,
      COALESCE(oc.completed_lm,0) AS last_month_completed,
      CASE WHEN COALESCE(oc.completed_lm,0) = 0 THEN NULL
           ELSE COALESCE(oc.completed_cm,0) - COALESCE(oc.completed_lm,0) END AS completed_events_change,

      COALESCE(oc.cancelled_cm,0) AS cancelled_events,
      COALESCE(oc.cancelled_lm,0) AS last_month_cancelled,
      CASE WHEN COALESCE(oc.cancelled_lm,0) = 0 THEN NULL
           ELSE COALESCE(oc.cancelled_cm,0) - COALESCE(oc.cancelled_lm,0) END AS cancelled_events_change,

      CASE WHEN COALESCE(or8.regs_cm,0) > 0 THEN ROUND(COALESCE(or8.att_cm,0)*100.0/COALESCE(or8.regs_cm,0),2) ELSE 0 END AS avg_attendance_rate,
      CASE WHEN COALESCE(or8.regs_lm,0) > 0 THEN ROUND(COALESCE(or8.att_lm,0)*100.0/COALESCE(or8.regs_lm,0),2) ELSE 0 END AS last_month_avg_attendance_rate,
      CASE WHEN COALESCE(or8.regs_lm,0) = 0 THEN NULL
           ELSE (ROUND(COALESCE(or8.att_cm,0)*100.0/NULLIF(or8.regs_cm,0),2) -
                 ROUND(COALESCE(or8.att_lm,0)*100.0/COALESCE(or8.regs_lm,0),2)) END AS attendance_rate_change,

      CASE WHEN COALESCE(or8.att_cm,0) > 0 THEN ROUND(COALESCE(or8.eval_cm,0)*100.0/COALESCE(or8.att_cm,0),2) ELSE 0 END AS avg_feedback_rate,
      CASE WHEN COALESCE(or8.att_lm,0) > 0 THEN ROUND(COALESCE(or8.eval_lm,0)*100.0/COALESCE(or8.att_lm,0),2) ELSE 0 END AS last_month_avg_feedback_rate,
      CASE WHEN COALESCE(or8.att_lm,0) = 0 THEN NULL
           ELSE (ROUND(COALESCE(or8.eval_cm,0)*100.0/NULLIF(or8.att_cm,0),2) -
                 ROUND(COALESCE(or8.eval_lm,0)*100.0/COALESCE(or8.att_lm,0),2)) END AS feedback_rate_change,

      ot.attendance_trend,
      ofe.feedback_json AS event_feedback_rate,
      om.month_json     AS events_per_month,

      3 AS sort_order
    FROM org_latest ol
    LEFT JOIN org_counts oc ON oc.organization_id = ol.organization_id
    LEFT JOIN org_rates  or8 ON or8.organization_id = ol.organization_id
    LEFT JOIN org_trend  ot ON ot.organization_id = ol.organization_id
    LEFT JOIN org_feedback ofe ON ofe.organization_id = ol.organization_id
    LEFT JOIN org_month   om ON om.organization_id = ol.organization_id
    WHERE (p_organization_id IS NULL OR ol.organization_id = p_organization_id)
  ) x
  ORDER BY sort_order, organization_name;

END$$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationExecutives(
    IN p_organization_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'role_type', 'Executive',
            'id', er.executive_role_id,
            'role_name', er.role_title,
            'rank_id', er.rank_id,
            'rank_title', exec_rank.default_title,
            'rank_level', exec_rank.rank_level,
            'permissions', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'permission_id', p.permission_id,
                        'permission_name', p.permission_name,
                        'permission_scope', p.scope,
                        'permission_source', 'rank'
                    )
                )
                FROM tbl_rank_permission rp
                JOIN tbl_permission p ON rp.permission_id = p.permission_id
                WHERE rp.rank_id = exec_rank.rank_id
            )
        )
    ) AS executive_ranks_permissions
    FROM tbl_executive_role er
    JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    WHERE er.organization_id = p_organization_id
      AND er.cycle_number = v_cycle_number
    ORDER BY exec_rank.rank_level ASC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationCommitteeRoles(
    IN p_organization_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'role_type', 'Committee',
            'id', cr.committee_role_id,
            'role_name', cr.role_name,
            'committee_id', c.committee_id,
            'committee_name', c.name,
            'permissions', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'permission_id', p.permission_id,
                        'permission_name', p.permission_name,
                        'permission_scope', p.scope,
                        'permission_source', 'committee_role'
                    )
                )
                FROM tbl_committee_role_permission crp
                JOIN tbl_permission p ON crp.permission_id = p.permission_id
                WHERE crp.committee_role_id = cr.committee_role_id
            )
        )
    ) AS committee_ranks_permissions
    FROM tbl_committee c
    JOIN tbl_committee_role cr ON c.committee_id = cr.committee_id
    WHERE c.organization_id = p_organization_id
      AND c.cycle_number = v_cycle_number
    ORDER BY c.name ASC, cr.role_name ASC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationPermissions()
BEGIN
    SELECT * FROM tbl_permission WHERE scope = "Organization";
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateExecutivePermissions(
    IN p_executive_rank_id INT,
    IN p_permissions JSON
)
BEGIN
    DECLARE v_permission_id INT;
    DECLARE v_permission_name VARCHAR(200);
    DECLARE v_counter INT DEFAULT 0;
    DECLARE v_array_length INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Verify that the executive rank exists
    IF NOT EXISTS (SELECT 1 FROM tbl_executive_rank WHERE rank_id = p_executive_rank_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Executive rank not found';
    END IF;

    -- Delete existing permissions for this rank
    DELETE FROM tbl_rank_permission 
    WHERE rank_id = p_executive_rank_id;

    -- Get the length of the permissions array
    SET v_array_length = JSON_LENGTH(p_permissions);

    -- Insert new permissions if any exist
    WHILE v_counter < v_array_length DO
        -- Extract permission name as string (using JSON_UNQUOTE)
        SET v_permission_name = JSON_UNQUOTE(JSON_EXTRACT(p_permissions, CONCAT('$[', v_counter, ']')));
        
        -- Get permission_id from permission_name
        SELECT permission_id INTO v_permission_id 
        FROM tbl_permission 
        WHERE permission_name = v_permission_name
        LIMIT 1;
        
        -- Only insert if permission exists
        IF v_permission_id IS NOT NULL THEN
            INSERT INTO tbl_rank_permission (rank_id, permission_id)
            VALUES (p_executive_rank_id, v_permission_id);
        END IF;
        
        -- Reset v_permission_id for next iteration
        SET v_permission_id = NULL;
        SET v_counter = v_counter + 1;
    END WHILE;

    COMMIT;

    -- Return the updated executive roles in array format (without wrapper object)
    SELECT 
        er.executive_role_id AS id,
        er.role_title AS role_name,
        exec_rank.rank_id,
        exec_rank.default_title AS rank_title,
        exec_rank.rank_level,
        'Executive' AS role_type,
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'permission_id', p.permission_id,
                    'permission_name', p.permission_name,
                    'permission_scope', p.scope,
                    'permission_source', 'rank'
                )
            )
            FROM tbl_rank_permission rp
            JOIN tbl_permission p ON rp.permission_id = p.permission_id
            WHERE rp.rank_id = exec_rank.rank_id
        ) AS permissions
    FROM tbl_executive_role er
    JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    WHERE exec_rank.rank_id = p_executive_rank_id
    LIMIT 1;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateCommitteePermissions(
    IN p_committee_id INT,
    IN p_role_type ENUM('Committee Head', 'Committee Officer'),
    IN p_permissions JSON
)
BEGIN
    DECLARE v_committee_role_id INT;
    DECLARE v_permission_id INT;
    DECLARE v_permission_name VARCHAR(200);
    DECLARE v_counter INT DEFAULT 0;
    DECLARE v_array_length INT;
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Ensure committee roles exist for this committee (Committee Head, Committee Officer)
    INSERT IGNORE INTO tbl_committee_role (committee_id, role_name)
    VALUES 
        (p_committee_id, 'Committee Head'),
        (p_committee_id, 'Committee Officer');

    -- Get the committee_role_id for the given committee and role type
    SELECT committee_role_id INTO v_committee_role_id
    FROM tbl_committee_role
    WHERE committee_id = p_committee_id AND role_name = p_role_type
    LIMIT 1;

    IF v_committee_role_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Committee role not found for the given committee and role type';
    END IF;

    -- Get organization_id and cycle_number for the return query
    SELECT c.organization_id, c.cycle_number 
    INTO v_organization_id, v_cycle_number
    FROM tbl_committee c
    WHERE c.committee_id = p_committee_id
    LIMIT 1;

    -- Delete existing permissions for this committee role
    DELETE FROM tbl_committee_role_permission 
    WHERE committee_role_id = v_committee_role_id;

    -- Get the length of the permissions array
    SET v_array_length = JSON_LENGTH(p_permissions);

    -- Insert new permissions if any exist
    WHILE v_counter < v_array_length DO
        SET v_permission_name = JSON_UNQUOTE(JSON_EXTRACT(p_permissions, CONCAT('$[', v_counter, ']')));
        
        -- Get permission_id from permission_name
        SELECT permission_id INTO v_permission_id 
        FROM tbl_permission 
        WHERE permission_name = v_permission_name
        LIMIT 1;
        
        -- Only insert if permission exists
        IF v_permission_id IS NOT NULL THEN
            INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id)
            VALUES (v_committee_role_id, v_permission_id);
        END IF;
        
        SET v_counter = v_counter + 1;
    END WHILE;

    COMMIT;

    -- Return the updated committee roles with permissions for the entire organization
    SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
            'role_type', 'Committee',
            'id', cr.committee_role_id,
            'role_name', cr.role_name,
            'committee_id', c.committee_id,
            'committee_name', c.name,
            'permissions', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'permission_id', p.permission_id,
                        'permission_name', p.permission_name,
                        'permission_scope', p.scope,
                        'permission_source', 'committee_role'
                    )
                )
                FROM tbl_committee_role_permission crp
                JOIN tbl_permission p ON crp.permission_id = p.permission_id
                WHERE crp.committee_role_id = cr.committee_role_id
            )
        )
    ) AS committee_ranks_permissions
    FROM tbl_committee c
    JOIN tbl_committee_role cr ON c.committee_id = cr.committee_id
    WHERE c.organization_id = v_organization_id
      AND c.cycle_number = v_cycle_number
    ORDER BY c.name ASC, cr.role_name ASC;

END$$
DELIMITER ;

-- Procedure to fix existing committees that might not have their default roles
DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE FixCommitteeRoles()
BEGIN
    -- Insert missing committee roles for all existing committees
    INSERT IGNORE INTO tbl_committee_role (committee_id, role_name)
    SELECT c.committee_id, 'Committee Head'
    FROM tbl_committee c
    WHERE c.status != 'Archived'
    UNION ALL
    SELECT c.committee_id, 'Committee Officer'
    FROM tbl_committee c
    WHERE c.status != 'Archived';
    
    -- Return count of committees fixed
    SELECT 
        COUNT(DISTINCT c.committee_id) as committees_processed,
        'Committee roles created/verified for all active committees' as message
    FROM tbl_committee c
    WHERE c.status != 'Archived';
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetMemberPermissionOverrides(
    IN p_organization_id INT,
    IN p_org_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_org_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    -- Get all members who have permission overrides, grouped by user with their permissions
    SELECT 
        om.member_id as id,
        om.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS member_name,
        u.f_name,
        u.l_name,
        u.email AS member_email,
        om.member_type,
        -- Executive role details (if applicable)
        er.role_title AS executive_role,
        exec_rank.rank_level AS executive_rank_level,
        exec_rank.default_title AS executive_rank_title,
        -- Committee details (if applicable)
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS committee_names,
        GROUP_CONCAT(DISTINCT cr.role_name ORDER BY cr.role_name SEPARATOR ', ') AS committee_roles,
        -- Program details
        prog.name AS program_name,
        prog.abbreviation AS program_abbreviation,
        -- Member status and join date
        om.status AS member_status,
        om.joined_at,
        -- All permission overrides for this user as JSON array
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'override_id', mpo.override_id,
                'permission_id', mpo.permission_id,
                'permission_name', p.permission_name,
                'permission_scope', p.scope,
                'is_allowed', mpo.is_allowed,
                'override_type', CASE 
                    WHEN mpo.is_allowed = TRUE THEN 'Force Allow'
                    ELSE 'Force Deny'
                END
            )
        ) AS permission_overrides,
        -- Count of total overrides for this user
        COUNT(mpo.override_id) AS total_overrides
    FROM tbl_member_permission_override mpo
    JOIN tbl_organization_members om ON mpo.member_id = om.member_id
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_permission p ON mpo.permission_id = p.permission_id
    LEFT JOIN tbl_program prog ON u.program_id = prog.program_id
    -- Executive role joins (for executives)
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    -- Committee joins (for committee members)
    LEFT JOIN tbl_committee_members cm ON cm.user_id = om.user_id
    LEFT JOIN tbl_committee c ON cm.committee_id = c.committee_id 
        AND c.organization_id = p_organization_id 
        AND c.cycle_number = v_cycle_number
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
    GROUP BY 
        om.member_id,
        om.user_id,
        u.f_name,
        u.l_name,
        u.email,
        om.member_type,
        er.role_title,
        exec_rank.rank_level,
        exec_rank.default_title,
        prog.name,
        prog.abbreviation,
        om.status,
        om.joined_at
    ORDER BY 
        u.l_name, 
        u.f_name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEmailSuggestionOverride(
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_search_pattern VARCHAR(255)
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_organization_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    -- Normalize search pattern for case-insensitive matching
    SET p_search_pattern = LOWER(TRIM(COALESCE(p_search_pattern, '')));

    -- Get all active organization members who don't have permission overrides
    -- and match the search pattern (email or name)
    SELECT DISTINCT
        u.user_id,
        u.f_name,  -- Added to SELECT list
        u.l_name,  -- Added to SELECT list
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        COALESCE(p.name, 'Unknown Program') AS program_name,
        COALESCE(p.abbreviation, 'N/A') AS program_abbreviation,
        om.member_type,
        om.member_id AS id,
        -- Executive role details (if applicable)
        er.role_title AS executive_role,
        exec_rank.rank_level AS executive_rank_level,
        exec_rank.default_title AS executive_rank_title,
        -- Committee details (if applicable)
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS committees,
        GROUP_CONCAT(DISTINCT cr.role_name ORDER BY cr.role_name SEPARATOR ', ') AS committee_roles,
        -- Member status and join date
        om.status AS member_status,
        om.joined_at,
        -- Add priority field to SELECT list for ordering
        CASE 
            WHEN LOWER(u.email) = p_search_pattern THEN 1
            WHEN LOWER(CONCAT(u.f_name, ' ', u.l_name)) = p_search_pattern THEN 2
            WHEN LOWER(u.email) LIKE CONCAT(p_search_pattern, '%') THEN 3
            WHEN LOWER(CONCAT(u.f_name, ' ', u.l_name)) LIKE CONCAT(p_search_pattern, '%') THEN 4
            ELSE 5
        END AS search_priority
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    -- Executive role joins (for executives)
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    -- Committee joins (for committee members)
    LEFT JOIN tbl_committee_members cm ON cm.user_id = om.user_id
    LEFT JOIN tbl_committee c ON cm.committee_id = c.committee_id 
        AND c.organization_id = p_organization_id 
        AND c.cycle_number = v_cycle_number
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
      -- Exclude users who already have permission overrides
      AND NOT EXISTS (
          SELECT 1 
          FROM tbl_member_permission_override mpo 
          WHERE mpo.member_id = om.member_id
      )
      -- Exclude users with rank 1 (President) executive role
      AND NOT (om.member_type = 'Executive' AND exec_rank.rank_level = 1)
      -- Search filter: match email or full name (case-insensitive)
      AND (
          p_search_pattern = '' 
          OR LOWER(u.email) LIKE CONCAT('%', p_search_pattern, '%')
          OR LOWER(CONCAT(u.f_name, ' ', u.l_name)) LIKE CONCAT('%', p_search_pattern, '%')
          OR LOWER(u.f_name) LIKE CONCAT('%', p_search_pattern, '%')
          OR LOWER(u.l_name) LIKE CONCAT('%', p_search_pattern, '%')
      )
    GROUP BY 
        u.user_id, 
        u.f_name, 
        u.l_name, 
        u.email, 
        p.name, 
        p.abbreviation, 
        om.member_type,
        om.member_id,
        er.role_title,
        exec_rank.rank_level,
        exec_rank.default_title,
        om.status,
        om.joined_at
    ORDER BY 
        -- Use the search_priority field from SELECT list
        search_priority,
        om.member_type DESC, -- Executives first, then Committee, then Member
        exec_rank.rank_level ASC, -- For executives, order by rank level
        u.l_name, 
        u.f_name
    LIMIT 50; -- Limit results for performance
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE AddMemberPermissionOverride(
    IN p_email VARCHAR(100),
    IN p_permissions JSON,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_member_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_permission_id INT;
    DECLARE v_permission_name VARCHAR(200);
    DECLARE v_is_allowed BOOLEAN;
    DECLARE v_counter INT DEFAULT 0;
    DECLARE v_array_length INT;
    DECLARE v_permission_obj JSON;
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_organization_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    -- Get action performer user_id
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Get user_id from email
    SELECT user_id INTO v_user_id
    FROM tbl_user
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;

    -- Get user name and organization name for user-friendly logging
    SELECT CONCAT(u.f_name, ' ', u.l_name) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT o.name INTO v_organization_name 
    FROM tbl_organization o 
    WHERE o.organization_id = p_organization_id;

    -- Get member_id from organization members
    SELECT member_id INTO v_member_id
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
      AND cycle_number = v_cycle_number
      AND user_id = v_user_id
      AND status = 'Active'
    LIMIT 1;

    IF v_member_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User is not an active member of this organization';
    END IF;

    -- Check if user already has permission overrides
    IF EXISTS (
        SELECT 1 FROM tbl_member_permission_override 
        WHERE member_id = v_member_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User already has permission overrides';
    END IF;

    -- Get the length of the permissions array
    SET v_array_length = JSON_LENGTH(p_permissions);

    -- Insert permission overrides
    WHILE v_counter < v_array_length DO
        -- Extract permission object
        SET v_permission_obj = JSON_EXTRACT(p_permissions, CONCAT('$[', v_counter, ']'));
        
        -- Extract permission name and is_allowed from the object
        SET v_permission_name = JSON_UNQUOTE(JSON_EXTRACT(v_permission_obj, '$.permission_name'));
        SET v_is_allowed = JSON_EXTRACT(v_permission_obj, '$.is_allowed');
        
        -- Get permission_id from permission_name
        SELECT permission_id INTO v_permission_id 
        FROM tbl_permission 
        WHERE permission_name = v_permission_name
        LIMIT 1;
        
        -- Only insert if permission exists
        IF v_permission_id IS NOT NULL THEN
            INSERT INTO tbl_member_permission_override (member_id, permission_id, is_allowed)
            VALUES (v_member_id, v_permission_id, v_is_allowed);
        END IF;
        
        -- Reset variables for next iteration
        SET v_permission_id = NULL;
        SET v_counter = v_counter + 1;
    END WHILE;

    -- Log the action
    CALL LogAction(
        p_action_by_email,
        CONCAT('Added permission overrides for ', v_user_name, ' in ', v_organization_name),
        'member_permission_override_add',
        JSON_OBJECT(
            'user_id', v_user_id,
            'user_name', v_user_name,
            'organization_id', p_organization_id,
            'organization_name', v_organization_name,
            'permissions_count', v_array_length
        ),
        CONCAT('/organization/', p_organization_id),
        NULL
    );

    COMMIT;

    -- Return the updated entry formatted for pub/sub with member_id as id
  -- ...existing code...

    -- Return the updated entry formatted for pub/sub with member_id as id
    SELECT 
        om.member_id as id,
        om.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS member_name,
        u.f_name,
        u.l_name,
        u.email AS member_email,
        om.member_type,
        -- Executive role details (if applicable)
        er.role_title AS executive_role,
        exec_rank.rank_level AS executive_rank_level,
        exec_rank.default_title AS executive_rank_title,
        -- Committee details (if applicable)
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS committee_names,
        GROUP_CONCAT(DISTINCT cr.role_name ORDER BY cr.role_name SEPARATOR ', ') AS committee_roles,
        -- Program details
        prog.name AS program_name,
        prog.abbreviation AS program_abbreviation,
        -- Member status and join date
        om.status AS member_status,
        om.joined_at,
        -- All permission overrides for this user as JSON array
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'override_id', mpo.override_id,
                'permission_id', mpo.permission_id,
                'permission_name', p.permission_name,
                'permission_scope', p.scope,
                'is_allowed', mpo.is_allowed,
                'override_type', CASE 
                    WHEN mpo.is_allowed = TRUE THEN 'Force Allow'
                    ELSE 'Force Deny'
                END
            )
        ) AS permission_overrides,
        -- Count of total overrides for this user
        COUNT(mpo.override_id) AS total_overrides
    FROM tbl_member_permission_override mpo
    JOIN tbl_organization_members om ON mpo.member_id = om.member_id
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_permission p ON mpo.permission_id = p.permission_id
    LEFT JOIN tbl_program prog ON u.program_id = prog.program_id
    -- Executive role joins (for executives)
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    -- Committee joins (for committee members)
    LEFT JOIN tbl_committee_members cm ON cm.user_id = om.user_id
    LEFT JOIN tbl_committee c ON cm.committee_id = c.committee_id 
        AND c.organization_id = p_organization_id 
        AND c.cycle_number = v_cycle_number
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
      AND om.member_id = v_member_id
    GROUP BY 
        om.member_id,
        om.user_id,
        u.f_name,
        u.l_name,
        u.email,
        om.member_type,
        er.role_title,
        exec_rank.rank_level,
        exec_rank.default_title,
        prog.name,
        prog.abbreviation,
        om.status,
        om.joined_at
    ORDER BY 
        u.l_name, 
        u.f_name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE UpdateMemberPermissionOverride(
    IN p_member_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_permission_lists JSON,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_permission_id INT;
    DECLARE v_permission_name VARCHAR(200);
    DECLARE v_is_allowed BOOLEAN;
    DECLARE v_counter INT DEFAULT 0;
    DECLARE v_array_length INT;
    DECLARE v_permission_obj JSON;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_user_name VARCHAR(200);
    DECLARE v_organization_name VARCHAR(200);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_organization_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    -- Get action performer user_id
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Verify member exists and is active in the organization
    SELECT om.user_id INTO v_user_id
    FROM tbl_organization_members om
    WHERE om.member_id = p_member_id
      AND om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member not found or not active in this organization';
    END IF;

    -- Get user name and organization name for user-friendly logging
    SELECT CONCAT(u.f_name, ' ', u.l_name) INTO v_user_name 
    FROM tbl_user u 
    WHERE u.user_id = v_user_id;
    
    SELECT o.name INTO v_organization_name 
    FROM tbl_organization o 
    WHERE o.organization_id = p_organization_id;

    -- Delete existing permission overrides for this member
    DELETE FROM tbl_member_permission_override 
    WHERE member_id = p_member_id;

    -- Get the length of the permissions array
    SET v_array_length = JSON_LENGTH(p_permission_lists);

    -- Insert new permission overrides
    WHILE v_counter < v_array_length DO
        -- Extract permission object
        SET v_permission_obj = JSON_EXTRACT(p_permission_lists, CONCAT('$[', v_counter, ']'));
        
        -- Extract permission name and is_allowed from the object
        SET v_permission_name = JSON_UNQUOTE(JSON_EXTRACT(v_permission_obj, '$.permission_name'));
        SET v_is_allowed = JSON_EXTRACT(v_permission_obj, '$.is_allowed');
        
        -- Get permission_id from permission_name
        SELECT permission_id INTO v_permission_id 
        FROM tbl_permission 
        WHERE permission_name = v_permission_name
        LIMIT 1;
        
        -- Only insert if permission exists
        IF v_permission_id IS NOT NULL THEN
            INSERT INTO tbl_member_permission_override (member_id, permission_id, is_allowed)
            VALUES (p_member_id, v_permission_id, v_is_allowed);
        END IF;
        
        -- Reset variables for next iteration
        SET v_permission_id = NULL;
        SET v_counter = v_counter + 1;
    END WHILE;

    -- Log the action
    CALL LogAction(
        p_action_by_email,
        CONCAT('Updated permission overrides for ', v_user_name, ' in ', v_organization_name),
        'member_permission_override_update',
        JSON_OBJECT(
            'member_id', p_member_id,
            'user_id', v_user_id,
            'user_name', v_user_name,
            'organization_id', p_organization_id,
            'organization_name', v_organization_name,
            'permissions_count', v_array_length
        ),
        CONCAT('/organization/', p_organization_id),
        NULL
    );

    COMMIT;

    -- Return the updated member entry formatted for pub/sub with member_id as id
  -- ...existing code...

 SELECT 
        om.member_id as id,
        om.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS member_name,
        u.f_name,
        u.l_name,
        u.email AS member_email,
        om.member_type,
        -- Executive role details (if applicable)
        er.role_title AS executive_role,
        exec_rank.rank_level AS executive_rank_level,
        exec_rank.default_title AS executive_rank_title,
        -- Committee details (if applicable)
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS committee_names,
        GROUP_CONCAT(DISTINCT cr.role_name ORDER BY cr.role_name SEPARATOR ', ') AS committee_roles,
        -- Program details
        prog.name AS program_name,
        prog.abbreviation AS program_abbreviation,
        -- Member status and join date
        om.status AS member_status,
        om.joined_at,
        -- All permission overrides for this user as JSON array
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'override_id', mpo.override_id,
                'permission_id', mpo.permission_id,
                'permission_name', p.permission_name,
                'permission_scope', p.scope,
                'is_allowed', mpo.is_allowed,
                'override_type', CASE 
                    WHEN mpo.is_allowed = TRUE THEN 'Force Allow'
                    ELSE 'Force Deny'
                END
            )
        ) AS permission_overrides,
        -- Count of total overrides for this user
        COUNT(mpo.override_id) AS total_overrides
    FROM tbl_member_permission_override mpo
    JOIN tbl_organization_members om ON mpo.member_id = om.member_id
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_permission p ON mpo.permission_id = p.permission_id
    LEFT JOIN tbl_program prog ON u.program_id = prog.program_id
    -- Executive role joins (for executives)
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    -- Committee joins (for committee members)
    LEFT JOIN tbl_committee_members cm ON cm.user_id = om.user_id
    LEFT JOIN tbl_committee c ON cm.committee_id = c.committee_id 
        AND c.organization_id = p_organization_id 
        AND c.cycle_number = v_cycle_number
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
      AND om.member_id = p_member_id -- <-- FIXED: was v_member_id, should be p_member_id
    GROUP BY 
        om.member_id,
        om.user_id,
        u.f_name,
        u.l_name,
        u.email,
        om.member_type,
        er.role_title,
        exec_rank.rank_level,
        exec_rank.default_title,
        prog.name,
        prog.abbreviation,
        om.status,
        om.joined_at
    ORDER BY 
        u.l_name, 
        u.f_name;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RemoveMemberPermissionOverride(
    IN p_member_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_action_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_action_by_user_id VARCHAR(200);
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_member_email VARCHAR(100);
    DECLARE v_member_name VARCHAR(255);
    DECLARE v_override_count INT DEFAULT 0;
    DECLARE v_organization_name VARCHAR(200);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Get the cycle_number for the given org_version_id and organization_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE org_version_id = p_organization_version_id 
    AND organization_id = p_organization_id;

    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No renewal cycle found for the given organization and version';
    END IF;

    -- Get action performer user_id
    SELECT user_id INTO v_action_by_user_id
    FROM tbl_user
    WHERE email = p_action_by_email
    LIMIT 1;

    IF v_action_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Action performer not found';
    END IF;

    -- Verify member exists and get member details
    SELECT om.user_id, u.email, CONCAT(u.f_name, ' ', u.l_name)
    INTO v_user_id, v_member_email, v_member_name
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    WHERE om.member_id = p_member_id
      AND om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member not found or not active in this organization';
    END IF;

    -- Get organization name for user-friendly logging
    SELECT name INTO v_organization_name 
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;

    -- Check if member has any permission overrides
    SELECT COUNT(*) INTO v_override_count
    FROM tbl_member_permission_override
    WHERE member_id = p_member_id;

    IF v_override_count = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member does not have any permission overrides to remove';
    END IF;

    SELECT 
        om.member_id as id,
        om.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS member_name,
        u.f_name,
        u.l_name,
        u.email AS member_email,
        om.member_type,
        -- Executive role details (if applicable)
        er.role_title AS executive_role,
        exec_rank.rank_level AS executive_rank_level,
        exec_rank.default_title AS executive_rank_title,
        -- Committee details (if applicable)
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS committee_names,
        GROUP_CONCAT(DISTINCT cr.role_name ORDER BY cr.role_name SEPARATOR ', ') AS committee_roles,
        -- Program details
        prog.name AS program_name,
        prog.abbreviation AS program_abbreviation,
        -- Member status and join date
        om.status AS member_status,
        om.joined_at,
        -- All permission overrides for this user as JSON array
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'override_id', mpo.override_id,
                'permission_id', mpo.permission_id,
                'permission_name', p.permission_name,
                'permission_scope', p.scope,
                'is_allowed', mpo.is_allowed,
                'override_type', CASE 
                    WHEN mpo.is_allowed = TRUE THEN 'Force Allow'
                    ELSE 'Force Deny'
                END
            )
        ) AS permission_overrides,
        -- Count of total overrides for this user
        COUNT(mpo.override_id) AS total_overrides
    FROM tbl_member_permission_override mpo
    JOIN tbl_organization_members om ON mpo.member_id = om.member_id
    JOIN tbl_user u ON om.user_id = u.user_id
    JOIN tbl_permission p ON mpo.permission_id = p.permission_id
    LEFT JOIN tbl_program prog ON u.program_id = prog.program_id
    -- Executive role joins (for executives)
    LEFT JOIN tbl_executive_role er ON om.executive_role_id = er.executive_role_id
    LEFT JOIN tbl_executive_rank exec_rank ON er.rank_id = exec_rank.rank_id
    -- Committee joins (for committee members)
    LEFT JOIN tbl_committee_members cm ON cm.user_id = om.user_id
    LEFT JOIN tbl_committee c ON cm.committee_id = c.committee_id 
        AND c.organization_id = p_organization_id 
        AND c.cycle_number = v_cycle_number
    LEFT JOIN tbl_committee_role cr ON cm.committee_role_id = cr.committee_role_id
    WHERE om.organization_id = p_organization_id
      AND om.cycle_number = v_cycle_number
      AND om.status = 'Active'
      AND om.member_id = p_member_id
    GROUP BY 
        om.member_id,
        om.user_id,
        u.f_name,
        u.l_name,
        u.email,
        om.member_type,
        er.role_title,
        exec_rank.rank_level,
        exec_rank.default_title,
        prog.name,
        prog.abbreviation,
        om.status,
        om.joined_at
    ORDER BY 
        u.l_name, 
        u.f_name;

    -- Delete all permission overrides for this member
    DELETE FROM tbl_member_permission_override 
    WHERE member_id = p_member_id;

    -- Log the action
    CALL LogAction(
        p_action_by_email,
        CONCAT('Removed all permission overrides for ', v_member_name, ' in ', v_organization_name),
        'member_permission_override_remove',
        JSON_OBJECT(
            'member_id', p_member_id,
            'user_id', v_user_id,
            'member_name', v_member_name,
            'organization_id', p_organization_id,
            'organization_name', v_organization_name,
            'overrides_removed', v_override_count
        ),
        CONCAT('/organization/', p_organization_id),
        NULL
    );

    COMMIT;
END$$
DELIMITER ;


-- INDEXES

-- for reporting and performance
CREATE INDEX idx_transaction_date ON tbl_transaction(transaction_date);
CREATE INDEX idx_transaction_status ON tbl_transaction(status);
CREATE INDEX idx_transaction_user ON tbl_transaction(user_id);
CREATE INDEX idx_transaction_type ON tbl_transaction(transaction_type_id);
CREATE INDEX idx_transaction_payment_type ON tbl_transaction(payment_type_id);
CREATE INDEX idx_transaction_category ON tbl_transaction(category_id);
CREATE INDEX idx_transaction_archived ON tbl_transaction(archived_at);

CREATE INDEX idx_org_members_user ON tbl_organization_members(user_id);
CREATE INDEX idx_event_program ON tbl_event_course(program_id);

CREATE INDEX idx_org_members ON tbl_organization_members(organization_id, user_id);
CREATE INDEX idx_committee_org ON tbl_committee(organization_id);
CREATE INDEX idx_committee_members_user ON tbl_committee_members(user_id);

-- Recommended index for lookups from version -> cycle
CREATE INDEX idx_rc_org_version ON tbl_renewal_cycle (org_version_id);

CREATE INDEX idx_active_end_datetime 
ON tbl_application_period(is_active, end_date, end_time);

DELIMITER $$
CREATE DEFINER=`admin`@`%` PROCEDURE `GetOrganizationFinance`(IN p_organization_id INT)
BEGIN
  -- Avoid JSON truncation


  DECLARE v_today DATE DEFAULT CURDATE();
  DECLARE v_curr_month_start DATE DEFAULT DATE_SUB(v_today, INTERVAL DAY(v_today)-1 DAY);

  WITH RECURSIVE
  -- Organizations in scope
  orgs AS (
    SELECT o.organization_id, o.name AS organization_name,
           o.membership_fee_type, o.membership_fee_amount
    FROM tbl_organization o
    WHERE o.status IN ('Approved','Renewal')
      AND (p_organization_id IS NULL OR o.organization_id = p_organization_id)
  ),
  -- Latest cycle per org
  cycles AS (
    SELECT rc.organization_id, rc.cycle_number, rc.start_date AS cycle_start_date
    FROM tbl_renewal_cycle rc
    JOIN (
      SELECT organization_id, MAX(cycle_number) AS max_cycle
      FROM tbl_renewal_cycle
      GROUP BY organization_id
    ) x ON x.organization_id = rc.organization_id AND x.max_cycle = rc.cycle_number
    WHERE rc.organization_id IN (SELECT organization_id FROM orgs)
  ),
  -- Unified org-bound transactions (membership + event), Completed only
  org_tx AS (
    SELECT
      t.transaction_id,
      tm.organization_id,
      tm.cycle_number,
      NULL AS event_id,
      t.transaction_date,
      tt.code AS tcode,
      t.amount
    FROM tbl_transaction t
    JOIN tbl_transaction_membership tm ON tm.transaction_id = t.transaction_id
    JOIN tbl_transaction_type tt ON tt.transaction_type_id = t.transaction_type_id
    JOIN orgs o ON o.organization_id = tm.organization_id
    WHERE t.status = 'Completed'
    UNION ALL
    SELECT
      t.transaction_id,
      e.organization_id,
      e.cycle_number,
      e.event_id,
      t.transaction_date,
      tt.code AS tcode,
      t.amount
    FROM tbl_transaction t
    JOIN tbl_transaction_event te ON te.transaction_id = t.transaction_id
    JOIN tbl_event e ON e.event_id = te.event_id
    JOIN tbl_transaction_type tt ON tt.transaction_type_id = t.transaction_type_id
    JOIN orgs o ON o.organization_id = e.organization_id
    WHERE t.status = 'Completed'
      AND e.organization_id IS NOT NULL
  ),
  -- Month grid (cycle-aligned) up to current calendar month
  org_months AS (
    SELECT c.organization_id,
           DATE_SUB(c.cycle_start_date, INTERVAL DAY(c.cycle_start_date)-1 DAY) AS month_start,
           c.cycle_number
    FROM cycles c
    UNION ALL
    SELECT organization_id, DATE_ADD(month_start, INTERVAL 1 MONTH), cycle_number
    FROM org_months
    WHERE month_start < v_curr_month_start
  ),
  -- Monthly income/expense per org (cycle-aligned)
  monthly_flow AS (
    SELECT
      om.organization_id,
      om.month_start,
      SUM(CASE WHEN ot.tcode = 'INCOME' AND ot.cycle_number = om.cycle_number THEN ot.amount ELSE 0 END) AS income_month,
      SUM(CASE WHEN ot.tcode = 'EXPENSE' AND ot.cycle_number = om.cycle_number THEN ot.amount ELSE 0 END) AS expense_month
    FROM org_months om
    LEFT JOIN org_tx ot
      ON ot.organization_id = om.organization_id
     AND ot.transaction_date BETWEEN om.month_start AND LAST_DAY(om.month_start)
    GROUP BY om.organization_id, om.month_start
  ),
  -- Add monthly net and running balance (funds)
  monthly_bal AS (
    SELECT
      mf.organization_id,
      mf.month_start,
      COALESCE(mf.income_month,0) AS income_month,
      COALESCE(mf.expense_month,0) AS expense_month,
      (COALESCE(mf.income_month,0) - COALESCE(mf.expense_month,0)) AS net_month,
      SUM(COALESCE(mf.income_month,0) - COALESCE(mf.expense_month,0))
        OVER (PARTITION BY mf.organization_id ORDER BY mf.month_start
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance_to_month
    FROM monthly_flow mf
  ),

  -- Use the last available month per-org (continuous running balance)
  org_last_month AS (
    SELECT organization_id, MAX(month_start) AS last_month_start
    FROM monthly_bal
    GROUP BY organization_id
  ),
  curr_by_org AS (
    SELECT
      mb.organization_id,
      mb.income_month     AS income_this_month,
      mb.expense_month    AS expense_this_month,
      mb.net_month        AS net_this_month,
      mb.balance_to_month AS funds_this_month
    FROM monthly_bal mb
    JOIN org_last_month lm
      ON lm.organization_id = mb.organization_id
     AND lm.last_month_start = mb.month_start
  ),
  prev_by_org AS (
    SELECT
      mb.organization_id,
      mb.income_month     AS income_last_month,
      mb.expense_month    AS expense_last_month,
      mb.net_month        AS net_last_month,
      mb.balance_to_month AS funds_last_month
    FROM monthly_bal mb
    JOIN org_last_month lm
      ON lm.organization_id = mb.organization_id
     AND mb.month_start = DATE_SUB(lm.last_month_start, INTERVAL 1 MONTH)
  ),
  -- JSON arrays per org (include running funds)
  cash_flow_json_by_org AS (
    SELECT
      mb.organization_id,
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          JSON_OBJECT(
            'month', DATE_FORMAT(mb.month_start, '%Y-%m'),
            'income', COALESCE(mb.income_month,0),
            'expense', COALESCE(mb.expense_month,0),
            'net', COALESCE(mb.net_month,0),
            'funds', COALESCE(mb.balance_to_month,0)
          )
          ORDER BY mb.month_start SEPARATOR ','
        ), ''),
        ']'
      ) AS cash_flow_over_time
    FROM monthly_bal mb
    GROUP BY mb.organization_id
  ),
  -- Event revenue per event (within current cycle to today)
  event_sums AS (
    SELECT
      e.organization_id,
      e.event_id,
      e.title,
      SUM(CASE WHEN tt.code = 'INCOME' THEN t.amount ELSE 0 END) AS income_event,
      SUM(CASE WHEN tt.code = 'EXPENSE' THEN t.amount ELSE 0 END) AS expense_event
    FROM tbl_event e
    JOIN orgs o ON o.organization_id = e.organization_id
    JOIN cycles c ON c.organization_id = e.organization_id AND c.cycle_number = e.cycle_number
    LEFT JOIN tbl_transaction_event te ON te.event_id = e.event_id
    LEFT JOIN tbl_transaction t ON t.transaction_id = te.transaction_id AND t.status = 'Completed'
    LEFT JOIN tbl_transaction_type tt ON tt.transaction_type_id = t.transaction_type_id
    WHERE e.start_date BETWEEN c.cycle_start_date AND v_today
    GROUP BY e.organization_id, e.event_id, e.title
  ),
  event_revenue_json_by_org AS (
    SELECT
      es.organization_id,
      CONCAT(
        '[',
        IFNULL(GROUP_CONCAT(
          JSON_OBJECT(
            'event_id', es.event_id,
            'title', es.title,
            'income', COALESCE(es.income_event,0),
            'expense', COALESCE(es.expense_event,0),
            'net', COALESCE(es.income_event,0) - COALESCE(es.expense_event,0)
          )
          ORDER BY (COALESCE(es.income_event,0) - COALESCE(es.expense_event,0)) DESC, es.title SEPARATOR ','
        ), ''),
        ']'
      ) AS event_revenue
    FROM event_sums es
    GROUP BY es.organization_id
  ),
  -- Global monthly sums (across orgs)
  global_monthly_flow AS (
    SELECT
      month_start,
      SUM(income_month)  AS income_sum,
      SUM(expense_month) AS expense_sum
    FROM monthly_flow
    GROUP BY month_start
  ),
  global_monthly_bal AS (
    SELECT
      gmf.month_start,
      COALESCE(gmf.income_sum,0)  AS income_sum,
      COALESCE(gmf.expense_sum,0) AS expense_sum,
      (COALESCE(gmf.income_sum,0) - COALESCE(gmf.expense_sum,0)) AS net_sum,
      SUM(COALESCE(gmf.income_sum,0) - COALESCE(gmf.expense_sum,0))
        OVER (ORDER BY gmf.month_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS funds_to_month
    FROM global_monthly_flow gmf
  ),
  -- Global JSONs
  global_cash_flow_json AS (
    SELECT CONCAT(
             '[',
             IFNULL(GROUP_CONCAT(
               JSON_OBJECT(
                 'month', DATE_FORMAT(gb.month_start, '%Y-%m'),
                 'income', COALESCE(gb.income_sum,0),
                 'expense', COALESCE(gb.expense_sum,0),
                 'net', COALESCE(gb.net_sum,0),
                 'funds', COALESCE(gb.funds_to_month,0)
               )
               ORDER BY gb.month_start SEPARATOR ','
             ), ''),
             ']'
           ) AS cash_flow_over_time
    FROM global_monthly_bal gb
  ),
  global_event_revenue_json AS (
    SELECT CONCAT(
             '[',
             IFNULL(GROUP_CONCAT(
               JSON_OBJECT(
                 'event_id', es.event_id,
                 'title', es.title,
                 'income', COALESCE(es.income_event,0),
                 'expense', COALESCE(es.expense_event,0),
                 'net', COALESCE(es.income_event,0) - COALESCE(es.expense_event,0)
               )
               ORDER BY (COALESCE(es.income_event,0) - COALESCE(es.expense_event,0)) DESC, es.title SEPARATOR ','
             ), ''),
             ']'
           ) AS event_revenue
    FROM event_sums es
  ),
  -- Global snapshots use last available month
  global_last_month AS (
    SELECT MAX(month_start) AS last_month_start
    FROM global_monthly_bal
  ),
  global_curr AS (
    SELECT
      gb.income_sum     AS income_this_month,
      gb.expense_sum    AS expense_this_month,
      gb.net_sum        AS net_this_month,
      gb.funds_to_month AS funds_this_month
    FROM global_monthly_bal gb
    JOIN global_last_month lm
      ON gb.month_start = lm.last_month_start
  ),
  global_prev AS (
    SELECT
      gb.income_sum     AS income_last_month,
      gb.expense_sum    AS expense_last_month,
      gb.net_sum        AS net_last_month,
      gb.funds_to_month AS funds_last_month
    FROM global_monthly_bal gb
    JOIN global_last_month lm
      ON gb.month_start = DATE_SUB(lm.last_month_start, INTERVAL 1 MONTH)
  ),
  -- Membership aggregates
  members_total_by_org AS (
    SELECT om.organization_id, COUNT(DISTINCT om.user_id) AS members_total
    FROM tbl_organization_members om
    JOIN cycles c ON c.organization_id = om.organization_id AND c.cycle_number = om.cycle_number
    WHERE om.status = 'Active'
    GROUP BY om.organization_id
  ),
  members_paid_by_org AS (
    SELECT tm.organization_id,
           COUNT(DISTINCT t.user_id) AS members_paid,
           COALESCE(SUM(t.amount),0) AS paid_amount
    FROM tbl_transaction_membership tm
    JOIN tbl_transaction t ON t.transaction_id = tm.transaction_id AND t.status = 'Completed'
    JOIN cycles c ON c.organization_id = tm.organization_id AND c.cycle_number = tm.cycle_number
    JOIN orgs o ON o.organization_id = tm.organization_id
    GROUP BY tm.organization_id
  ),
  membership_agg_all AS (
    SELECT
      COALESCE(SUM(mt.members_total),0) AS total_members,
      COALESCE(SUM(mp.members_paid),0) AS paid_members,
      GREATEST(COALESCE(SUM(mt.members_total),0) - COALESCE(SUM(mp.members_paid),0), 0) AS unpaid_members,
      COALESCE(SUM(mp.paid_amount),0) AS paid_amount_total,
      (SUM(CASE WHEN o.membership_fee_type <> 'Free' THEN 1 ELSE 0 END) > 0) AS is_required
    FROM orgs o
    LEFT JOIN members_total_by_org mt ON mt.organization_id = o.organization_id
    LEFT JOIN members_paid_by_org  mp ON mp.organization_id = o.organization_id
  ),
  -- SDAO (events without org)
  sdao_tx AS (
    SELECT
      t.transaction_id,
      e.event_id,
      t.transaction_date,
      tt.code AS tcode,
      t.amount
    FROM tbl_transaction t
    JOIN tbl_transaction_event te ON te.transaction_id = t.transaction_id
    JOIN tbl_event e ON e.event_id = te.event_id
    JOIN tbl_transaction_type tt ON tt.transaction_type_id = t.transaction_type_id
    WHERE t.status = 'Completed'
      AND e.organization_id IS NULL
  ),
  sdao_series AS (
    SELECT
      COALESCE(
        DATE_SUB(MIN(transaction_date), INTERVAL DAY(MIN(transaction_date)) - 1 DAY),
        v_curr_month_start
      ) AS month_start
    FROM sdao_tx
  ),
  sdao_months AS (
    SELECT month_start FROM sdao_series
    UNION ALL
    SELECT DATE_ADD(month_start, INTERVAL 1 MONTH)
    FROM sdao_months
    WHERE month_start < v_curr_month_start
  ),
  sdao_monthly AS (
    SELECT
      sm.month_start,
      SUM(CASE WHEN st.tcode = 'INCOME'  AND st.transaction_date BETWEEN sm.month_start AND LAST_DAY(sm.month_start) THEN st.amount ELSE 0 END) AS income_sum,
      SUM(CASE WHEN st.tcode = 'EXPENSE' AND st.transaction_date BETWEEN sm.month_start AND LAST_DAY(sm.month_start) THEN st.amount ELSE 0 END) AS expense_sum
    FROM sdao_months sm
    LEFT JOIN sdao_tx st
      ON st.transaction_date BETWEEN sm.month_start AND LAST_DAY(sm.month_start)
    GROUP BY sm.month_start
  ),
  sdao_monthly_bal AS (
    SELECT
      sm.month_start,
      COALESCE(sm.income_sum,0)  AS income_sum,
      COALESCE(sm.expense_sum,0) AS expense_sum,
      (COALESCE(sm.income_sum,0) - COALESCE(sm.expense_sum,0)) AS net_sum,
      SUM(COALESCE(sm.income_sum,0) - COALESCE(sm.expense_sum,0))
        OVER (ORDER BY sm.month_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS funds_to_month
    FROM sdao_monthly sm
  ),
  sdao_last_month AS (
    SELECT MAX(month_start) AS last_month_start
    FROM sdao_monthly_bal
  ),
  sdao_curr AS (
    SELECT
      sb.income_sum     AS income_this_month,
      sb.expense_sum    AS expense_this_month,
      sb.net_sum        AS net_this_month,
      sb.funds_to_month AS funds_this_month
    FROM sdao_monthly_bal sb
    JOIN sdao_last_month lm
      ON sb.month_start = lm.last_month_start
  ),
  sdao_prev AS (
    SELECT
      sb.income_sum     AS income_last_month,
      sb.expense_sum    AS expense_last_month,
      sb.net_sum        AS net_last_month,
      sb.funds_to_month AS funds_last_month
    FROM sdao_monthly_bal sb
    JOIN sdao_last_month lm
      ON sb.month_start = DATE_SUB(lm.last_month_start, INTERVAL 1 MONTH)
  ),
  sdao_cash_flow_json AS (
    SELECT CONCAT(
             '[',
             IFNULL(GROUP_CONCAT(
               JSON_OBJECT(
                 'month', DATE_FORMAT(sb.month_start, '%Y-%m'),
                 'income', COALESCE(sb.income_sum,0),
                 'expense', COALESCE(sb.expense_sum,0),
                 'net', COALESCE(sb.net_sum,0),
                 'funds', COALESCE(sb.funds_to_month,0)
               )
               ORDER BY sb.month_start SEPARATOR ','
             ), ''),
             ']'
           ) AS cash_flow_over_time
    FROM sdao_monthly_bal sb
  ),
  sdao_event_sums AS (
    SELECT
      e.event_id,
      e.title,
      SUM(CASE WHEN tt.code='INCOME' THEN t.amount ELSE 0 END) AS income,
      SUM(CASE WHEN tt.code='EXPENSE' THEN t.amount ELSE 0 END) AS expense
    FROM tbl_event e
    LEFT JOIN tbl_transaction_event te ON te.event_id = e.event_id
    LEFT JOIN tbl_transaction t ON t.transaction_id = te.transaction_id AND t.status='Completed'
    LEFT JOIN tbl_transaction_type tt ON tt.transaction_type_id = t.transaction_type_id
    WHERE e.organization_id IS NULL
    GROUP BY e.event_id, e.title
  ),
  sdao_event_revenue_json AS (
    SELECT CONCAT(
             '[',
             IFNULL(GROUP_CONCAT(
               JSON_OBJECT(
                 'event_id', es.event_id,
                 'title', es.title,
                 'income', COALESCE(es.income,0),
                 'expense', COALESCE(es.expense,0),
                 'net', COALESCE(es.income,0) - COALESCE(es.expense,0)
               )
               ORDER BY (COALESCE(es.income,0) - COALESCE(es.expense,0)) DESC, es.title SEPARATOR ','
             ), ''),
             ']'
           ) AS event_revenue
    FROM sdao_event_sums es
  )

  SELECT *
  FROM (
    -- All Organizations (aggregated)
    SELECT
      -1 AS organization_id,
      'All Organizations' AS organization_name,
      NULL AS cycle_number,

      gc.funds_this_month,
      gp.funds_last_month,
      (gc.funds_this_month - gp.funds_last_month) AS funds_change_amount,
      CASE WHEN gp.funds_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((gc.funds_this_month - gp.funds_last_month) / ABS(gp.funds_last_month)), 2)
      END AS funds_change_percent,
      CASE
        WHEN (gc.funds_this_month - gp.funds_last_month) > 0 THEN 'Increase'
        WHEN (gc.funds_this_month - gp.funds_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS funds_change_status,

      gc.income_this_month,
      gp.income_last_month,
      (gc.income_this_month - gp.income_last_month) AS income_change_amount,
      CASE WHEN gp.income_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((gc.income_this_month - gp.income_last_month) / ABS(gp.income_last_month)), 2)
      END AS income_change_percent,
      CASE
        WHEN (gc.income_this_month - gp.income_last_month) > 0 THEN 'Increase'
        WHEN (gc.income_this_month - gp.income_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS income_change_status,

      gc.expense_this_month,
      gp.expense_last_month,
      (gc.expense_this_month - gp.expense_last_month) AS expense_change_amount,
      CASE WHEN gp.expense_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((gc.expense_this_month - gp.expense_last_month) / ABS(gp.expense_last_month)), 2)
      END AS expense_change_percent,
      CASE
        WHEN (gc.expense_this_month - gp.expense_last_month) > 0 THEN 'Increase'
        WHEN (gc.expense_this_month - gp.expense_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS expense_change_status,

      gc.net_this_month,
      gp.net_last_month,
      (gc.net_this_month - gp.net_last_month) AS net_change_amount,
      CASE WHEN gp.net_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((gc.net_this_month - gp.net_last_month) / ABS(gp.net_last_month)), 2)
      END AS net_change_percent,
      CASE
        WHEN (gc.net_this_month - gp.net_last_month) > 0 THEN 'Increase'
        WHEN (gc.net_this_month - gp.net_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS net_change_status,

      (SELECT cash_flow_over_time FROM global_cash_flow_json) AS cash_flow_over_time,
      (SELECT event_revenue FROM global_event_revenue_json) AS event_revenue,

      (SELECT JSON_OBJECT(
          'is_required', COALESCE(ma.is_required, FALSE),
          'membership_fee_type', 'Mixed',
          'fee_amount', NULL,
          'total_members', COALESCE(ma.total_members, 0),
          'paid_members', COALESCE(ma.paid_members, 0),
          'unpaid_members', COALESCE(ma.unpaid_members, 0),
          'paid_percent', CASE WHEN COALESCE(ma.total_members,0) = 0 THEN NULL ELSE ROUND(100 * ma.paid_members / ma.total_members, 2) END,
          'unpaid_percent', CASE WHEN COALESCE(ma.total_members,0) = 0 THEN NULL ELSE ROUND(100 * ma.unpaid_members / ma.total_members, 2) END,
          'paid_amount_total', COALESCE(ma.paid_amount_total, 0)
        ) FROM membership_agg_all ma
      ) AS membership_fee_status,

      JSON_OBJECT(
        'funds_this_month', gc.funds_this_month,
        'funds_last_month', gp.funds_last_month,
        'funds_change_amount', (gc.funds_this_month - gp.funds_last_month),
        'funds_change_percent', CASE WHEN gp.funds_last_month = 0 THEN NULL
                                     ELSE ROUND(100 * ((gc.funds_this_month - gp.funds_last_month) / ABS(gp.funds_last_month)), 2)
                                END,
        'income_this_month', gc.income_this_month,
        'expense_this_month', gc.expense_this_month,
        'net_this_month', gc.net_this_month
      ) AS kpis

    FROM global_curr gc
    CROSS JOIN global_prev gp

    UNION ALL

    -- SDAO (events without org)
    SELECT
      NULL AS organization_id,
      'SDAO' AS organization_name,
      NULL AS cycle_number,

      sc.funds_this_month,
      sp.funds_last_month,
      (sc.funds_this_month - sp.funds_last_month) AS funds_change_amount,
      CASE WHEN sp.funds_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((sc.funds_this_month - sp.funds_last_month) / ABS(sp.funds_last_month)), 2)
      END AS funds_change_percent,
      CASE
        WHEN (sc.funds_this_month - sp.funds_last_month) > 0 THEN 'Increase'
        WHEN (sc.funds_this_month - sp.funds_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS funds_change_status,

      sc.income_this_month,
      sp.income_last_month,
      (sc.income_this_month - sp.income_last_month) AS income_change_amount,
      CASE WHEN sp.income_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((sc.income_this_month - sp.income_last_month) / ABS(sp.income_last_month)), 2)
      END AS income_change_percent,
      CASE
        WHEN (sc.income_this_month - sp.income_last_month) > 0 THEN 'Increase'
        WHEN (sc.income_this_month - sp.income_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS income_change_status,

      sc.expense_this_month,
      sp.expense_last_month,
      (sc.expense_this_month - sp.expense_last_month) AS expense_change_amount,
      CASE WHEN sp.expense_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((sc.expense_this_month - sp.expense_last_month) / ABS(sp.expense_last_month)), 2)
      END AS expense_change_percent,
      CASE
        WHEN (sc.expense_this_month - sp.expense_last_month) > 0 THEN 'Increase'
        WHEN (sc.expense_this_month - sp.expense_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS expense_change_status,

      sc.net_this_month,
      sp.net_last_month,
      (sc.net_this_month - sp.net_last_month) AS net_change_amount,
      CASE WHEN sp.net_last_month = 0 THEN NULL
           ELSE ROUND(100 * ((sc.net_this_month - sp.net_last_month) / ABS(sp.net_last_month)), 2)
      END AS net_change_percent,
      CASE
        WHEN (sc.net_this_month - sp.net_last_month) > 0 THEN 'Increase'
        WHEN (sc.net_this_month - sp.net_last_month) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS net_change_status,

      (SELECT cash_flow_over_time FROM sdao_cash_flow_json) AS cash_flow_over_time,
      (SELECT event_revenue FROM sdao_event_revenue_json) AS event_revenue,

      JSON_OBJECT(
        'is_required', FALSE,
        'membership_fee_type', NULL,
        'fee_amount', NULL,
        'total_members', 0,
        'paid_members', 0,
        'unpaid_members', 0,
        'paid_percent', NULL,
        'unpaid_percent', NULL,
        'paid_amount_total', 0
      ) AS membership_fee_status,

      JSON_OBJECT(
        'funds_this_month', sc.funds_this_month,
        'funds_last_month', sp.funds_last_month,
        'funds_change_amount', (sc.funds_this_month - sp.funds_last_month),
        'funds_change_percent', CASE WHEN sp.funds_last_month = 0 THEN NULL
                                     ELSE ROUND(100 * ((sc.funds_this_month - sp.funds_last_month) / ABS(sp.funds_last_month)), 2)
                                END,
        'income_this_month', sc.income_this_month,
        'expense_this_month', sc.expense_this_month,
        'net_this_month', sc.net_this_month
      ) AS kpis

    FROM sdao_curr sc
    CROSS JOIN sdao_prev sp

    UNION ALL

    -- Per-organization
    SELECT
      o.organization_id,
      o.organization_name,
      c.cycle_number,

      COALESCE(cb.funds_this_month, 0) AS funds_this_month,
      COALESCE(pb.funds_last_month, 0) AS funds_last_month,
      (COALESCE(cb.funds_this_month, 0) - COALESCE(pb.funds_last_month, 0)) AS funds_change_amount,
      CASE WHEN COALESCE(pb.funds_last_month,0) = 0 THEN NULL
           ELSE ROUND(100 * (
              (COALESCE(cb.funds_this_month,0) - COALESCE(pb.funds_last_month,0))
              / ABS(COALESCE(pb.funds_last_month,0))
           ), 2)
      END AS funds_change_percent,
      CASE
        WHEN (COALESCE(cb.funds_this_month,0) - COALESCE(pb.funds_last_month,0)) > 0 THEN 'Increase'
        WHEN (COALESCE(cb.funds_this_month,0) - COALESCE(pb.funds_last_month,0)) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS funds_change_status,

      COALESCE(cb.income_this_month, 0) AS income_this_month,
      COALESCE(pb.income_last_month, 0) AS income_last_month,
      (COALESCE(cb.income_this_month,0) - COALESCE(pb.income_last_month,0)) AS income_change_amount,
      CASE WHEN COALESCE(pb.income_last_month,0) = 0 THEN NULL
           ELSE ROUND(100 * (
             (COALESCE(cb.income_this_month,0) - COALESCE(pb.income_last_month,0))
             / ABS(COALESCE(pb.income_last_month,0))
           ), 2)
      END AS income_change_percent,
      CASE
        WHEN (COALESCE(cb.income_this_month,0) - COALESCE(pb.income_last_month,0)) > 0 THEN 'Increase'
        WHEN (COALESCE(cb.income_this_month,0) - COALESCE(pb.income_last_month,0)) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS income_change_status,

      COALESCE(cb.expense_this_month, 0) AS expense_this_month,
      COALESCE(pb.expense_last_month, 0) AS expense_last_month,
      (COALESCE(cb.expense_this_month,0) - COALESCE(pb.expense_last_month,0)) AS expense_change_amount,
      CASE WHEN COALESCE(pb.expense_last_month,0) = 0 THEN NULL
           ELSE ROUND(100 * (
             (COALESCE(cb.expense_this_month,0) - COALESCE(pb.expense_last_month,0))
             / ABS(COALESCE(pb.expense_last_month,0))
           ), 2)
      END AS expense_change_percent,
      CASE
        WHEN (COALESCE(cb.expense_this_month,0) - COALESCE(pb.expense_last_month,0)) > 0 THEN 'Increase'
        WHEN (COALESCE(cb.expense_this_month,0) - COALESCE(pb.expense_last_month,0)) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS expense_change_status,

      COALESCE(cb.net_this_month, 0) AS net_this_month,
      COALESCE(pb.net_last_month, 0) AS net_last_month,
      (COALESCE(cb.net_this_month,0) - COALESCE(pb.net_last_month,0)) AS net_change_amount,
      CASE WHEN COALESCE(pb.net_last_month,0) = 0 THEN NULL
           ELSE ROUND(100 * (
              (COALESCE(cb.net_this_month,0) - COALESCE(pb.net_last_month,0))
              / ABS(COALESCE(pb.net_last_month,0))
           ), 2)
      END AS net_change_percent,
      CASE
        WHEN (COALESCE(cb.net_this_month,0) - COALESCE(pb.net_last_month,0)) > 0 THEN 'Increase'
        WHEN (COALESCE(cb.net_this_month,0) - COALESCE(pb.net_last_month,0)) < 0 THEN 'Decrease'
        ELSE 'No change'
      END AS net_change_status,

      COALESCE(cf.cash_flow_over_time, '[]') AS cash_flow_over_time,
      COALESCE(er.event_revenue, '[]') AS event_revenue,

      JSON_OBJECT(
        'is_required', (o.membership_fee_type <> 'Free'),
        'membership_fee_type', o.membership_fee_type,
        'fee_amount', o.membership_fee_amount,
        'total_members', COALESCE(mt.members_total,0),
        'paid_members', COALESCE(mp.members_paid,0),
        'unpaid_members', GREATEST(COALESCE(mt.members_total,0) - COALESCE(mp.members_paid,0), 0),
        'paid_percent', CASE WHEN COALESCE(mt.members_total,0) = 0 THEN NULL ELSE ROUND(100 * COALESCE(mp.members_paid,0) / mt.members_total, 2) END,
        'unpaid_percent', CASE WHEN COALESCE(mt.members_total,0) = 0 THEN NULL ELSE ROUND(100 * (GREATEST(mt.members_total - COALESCE(mp.members_paid,0),0)) / mt.members_total, 2) END,
        'paid_amount_total', COALESCE(mp.paid_amount,0)
      ) AS membership_fee_status,

      JSON_OBJECT(
        'funds_this_month', COALESCE(cb.funds_this_month,0),
        'funds_last_month', COALESCE(pb.funds_last_month,0),
        'funds_change_amount', (COALESCE(cb.funds_this_month,0) - COALESCE(pb.funds_last_month,0)),
        'funds_change_percent', CASE WHEN COALESCE(pb.funds_last_month,0) = 0 THEN NULL
                                     ELSE ROUND(100 * (
                                       (COALESCE(cb.funds_this_month,0) - COALESCE(pb.funds_last_month,0))
                                       / ABS(COALESCE(pb.funds_last_month,0))
                                     ), 2) END,
        'income_this_month', COALESCE(cb.income_this_month,0),
        'expense_this_month', COALESCE(cb.expense_this_month,0),
        'net_this_month', COALESCE(cb.net_this_month,0)
      ) AS kpis

    FROM orgs o
    LEFT JOIN cycles c ON c.organization_id = o.organization_id
    LEFT JOIN curr_by_org cb ON cb.organization_id = o.organization_id
    LEFT JOIN prev_by_org pb ON pb.organization_id = o.organization_id
    LEFT JOIN cash_flow_json_by_org cf ON cf.organization_id = o.organization_id
    LEFT JOIN event_revenue_json_by_org er ON er.organization_id = o.organization_id
    LEFT JOIN members_total_by_org mt ON mt.organization_id = o.organization_id
    LEFT JOIN members_paid_by_org  mp ON mp.organization_id = o.organization_id
  ) AS U
  WHERE (p_organization_id IS NULL OR U.organization_id = p_organization_id)
  ORDER BY
    CASE
      WHEN U.organization_id = -1 THEN 0
      WHEN U.organization_id IS NULL THEN 1
      ELSE 2
    END,
    U.organization_name;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetMemberEngagement(IN p_organization_id INT)
BEGIN
  -- Large JSON strings


  DECLARE v_today DATE DEFAULT CURDATE();
  DECLARE v_curr_month_start DATE DEFAULT DATE_SUB(v_today, INTERVAL DAY(v_today)-1 DAY);
  DECLARE v_curr_month_end   DATE DEFAULT LAST_DAY(v_today);

  IF p_organization_id IS NULL THEN
    -- Return All Orgs (-1), SDAO (NULL), and each org
    SELECT *
    FROM (
      /* =========================
         All Organizations (-1)
         ========================= */
      SELECT
        -1 AS organization_id,
        'All Organizations' AS organization_name,
        NULL AS cycle_number,

        -- New members this month (current cycle, status Active)
        (
          SELECT COUNT(*)
          FROM tbl_organization_members om
          WHERE om.status='Active'
            AND DATE(om.joined_at) BETWEEN v_curr_month_start AND v_curr_month_end
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = om.organization_id
            )
        ) AS new_members_this_month,

        -- Registered members (current cycle, status Active)
        (
          SELECT COUNT(*)
          FROM tbl_organization_members om
          WHERE om.status='Active'
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = om.organization_id
            )
        ) AS registered_members,

        -- Active members this month (attended org events this month)
        (
          SELECT COUNT(DISTINCT ea.user_id)
          FROM tbl_event e
          JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
          JOIN tbl_organization_members om
            ON om.user_id = ea.user_id
           AND om.organization_id = e.organization_id
           AND om.status = 'Active'
           AND om.cycle_number = (
             SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
             WHERE rc.organization_id = om.organization_id
           )
          WHERE e.organization_id IS NOT NULL
            AND e.status='Approved'
            AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
            AND ea.status IN ('Attended','Evaluated')
        ) AS active_members_this_month,

        -- Inactive = registered - active
        GREATEST(
          (
            SELECT COUNT(*)
            FROM tbl_organization_members om
            WHERE om.status='Active'
              AND om.cycle_number = (
                SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
                WHERE rc.organization_id = om.organization_id
              )
          ) -
          (
            SELECT COUNT(DISTINCT ea.user_id)
            FROM tbl_event e
            JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
            JOIN tbl_organization_members om
              ON om.user_id = ea.user_id
             AND om.organization_id = e.organization_id
             AND om.status = 'Active'
             AND om.cycle_number = (
               SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
               WHERE rc.organization_id = om.organization_id
             )
            WHERE e.organization_id IS NOT NULL
              AND e.status='Approved'
              AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
              AND ea.status IN ('Attended','Evaluated')
          ),
          0
        ) AS inactive_members_this_month,

        -- Most engaged members across all orgs this month (top 10)
        (
          SELECT CONCAT(
            '[',
            IFNULL(GROUP_CONCAT(
              JSON_OBJECT(
                'user_id', u.user_id,
                'name', CONCAT(COALESCE(u.f_name,''),' ',COALESCE(u.l_name,'')),
                'email', u.email,
                'events_attended', x.cnt
              )
              ORDER BY x.cnt DESC, u.l_name ASC SEPARATOR ','
            ), ''),
            ']'
          )
          FROM (
            SELECT ea.user_id, COUNT(DISTINCT e.event_id) AS cnt
            FROM tbl_event e
            JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
            WHERE e.organization_id IS NOT NULL
              AND e.status='Approved'
              AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
              AND ea.status IN ('Attended','Evaluated')
            GROUP BY ea.user_id
            ORDER BY cnt DESC
            LIMIT 10
          ) x
          JOIN tbl_user u ON u.user_id = x.user_id
        ) AS most_engaged_members,

        -- Registration over time across all orgs (current cycles)
        (
          SELECT CONCAT(
            '[',
            IFNULL(GROUP_CONCAT(
              JSON_OBJECT(
                'month', DATE_FORMAT(m.month_start, '%Y-%m'),
                'total', m.total
              )
              ORDER BY m.month_start ASC SEPARATOR ','
            ), ''),
            ']'
          )
          FROM (
            SELECT DATE_FORMAT(om.joined_at, '%Y-%m-01') AS month_start,
                   COUNT(*) AS total
            FROM tbl_organization_members om
            WHERE om.status='Active'
              AND om.cycle_number = (
                SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
                WHERE rc.organization_id = om.organization_id
              )
            GROUP BY DATE_FORMAT(om.joined_at, '%Y-%m-01')
          ) m
        ) AS registration_over_time

      UNION ALL

      /* =========================
         SDAO (NULL)
         ========================= */
      SELECT
        NULL AS organization_id,
        'SDAO' AS organization_name,
        NULL AS cycle_number,
        0 AS new_members_this_month,
        0 AS registered_members,
        COALESCE((
          SELECT COUNT(DISTINCT ea.user_id)
          FROM tbl_event e
          JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
          WHERE e.organization_id IS NULL
            AND e.event_type='SDAO'
            AND e.status='Approved'
            AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
            AND ea.status IN ('Attended','Evaluated')
        ), 0) AS active_members_this_month,
        0 AS inactive_members_this_month,

        (
          SELECT CONCAT(
            '[',
            IFNULL(GROUP_CONCAT(
              JSON_OBJECT(
                'user_id', u.user_id,
                'name', CONCAT(COALESCE(u.f_name,''),' ',COALESCE(u.l_name,'')),
                'email', u.email,
                'events_attended', x.cnt
              )
              ORDER BY x.cnt DESC, u.l_name ASC SEPARATOR ','
            ), ''),
            ']'
          )
          FROM (
            SELECT ea.user_id, COUNT(DISTINCT e.event_id) AS cnt
            FROM tbl_event e
            JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
            WHERE e.organization_id IS NULL
              AND e.event_type='SDAO'
              AND e.status='Approved'
              AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
              AND ea.status IN ('Attended','Evaluated')
            GROUP BY ea.user_id
            ORDER BY cnt DESC
            LIMIT 10
          ) x
          JOIN tbl_user u ON u.user_id = x.user_id
        ) AS most_engaged_members,

        '[]' AS registration_over_time

      UNION ALL

      /* =========================
         Per-organization rows
         ========================= */
      SELECT
        o.organization_id,
        o.name AS organization_name,
        (
          SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
          WHERE rc.organization_id = o.organization_id
        ) AS cycle_number,

        -- New members this month
        (
          SELECT COUNT(*)
          FROM tbl_organization_members om
          WHERE om.organization_id = o.organization_id
            AND om.status='Active'
            AND DATE(om.joined_at) BETWEEN v_curr_month_start AND v_curr_month_end
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = o.organization_id
            )
        ) AS new_members_this_month,

        -- Registered members
        (
          SELECT COUNT(*)
          FROM tbl_organization_members om
          WHERE om.organization_id = o.organization_id
            AND om.status='Active'
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = o.organization_id
            )
        ) AS registered_members,

        -- Active members this month
        (
          SELECT COUNT(DISTINCT ea.user_id)
          FROM tbl_event e
          JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
          JOIN tbl_organization_members om
            ON om.user_id = ea.user_id
           AND om.organization_id = o.organization_id
           AND om.status='Active'
           AND om.cycle_number = (
             SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
             WHERE rc.organization_id = o.organization_id
           )
          WHERE e.organization_id = o.organization_id
            AND e.status='Approved'
            AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
            AND ea.status IN ('Attended','Evaluated')
        ) AS active_members_this_month,

        -- Inactive
        GREATEST(
          (
            SELECT COUNT(*)
            FROM tbl_organization_members om
            WHERE om.organization_id = o.organization_id
              AND om.status='Active'
              AND om.cycle_number = (
                SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
                WHERE rc.organization_id = o.organization_id
              )
          ) -
          (
            SELECT COUNT(DISTINCT ea.user_id)
            FROM tbl_event e
            JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
            JOIN tbl_organization_members om
              ON om.user_id = ea.user_id
             AND om.organization_id = o.organization_id
             AND om.status='Active'
             AND om.cycle_number = (
               SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
               WHERE rc.organization_id = o.organization_id
             )
            WHERE e.organization_id = o.organization_id
              AND e.status='Approved'
              AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
              AND ea.status IN ('Attended','Evaluated')
          ),
          0
        ) AS inactive_members_this_month,

        -- Most engaged members (top 10)
        (
          SELECT CONCAT(
            '[',
            IFNULL(GROUP_CONCAT(
              JSON_OBJECT(
                'user_id', u.user_id,
                'name', CONCAT(COALESCE(u.f_name,''),' ',COALESCE(u.l_name,'')),
                'email', u.email,
                'events_attended', y.cnt
              )
              ORDER BY y.cnt DESC, u.l_name ASC SEPARATOR ','
            ), ''),
            ']'
          )
          FROM (
            SELECT ea.user_id, COUNT(DISTINCT e.event_id) AS cnt
            FROM tbl_event e
            JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
            JOIN tbl_organization_members om
              ON om.user_id = ea.user_id
             AND om.organization_id = o.organization_id
             AND om.status='Active'
             AND om.cycle_number = (
               SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
               WHERE rc.organization_id = o.organization_id
             )
            WHERE e.organization_id = o.organization_id
              AND e.status='Approved'
              AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
              AND ea.status IN ('Attended','Evaluated')
            GROUP BY ea.user_id
            ORDER BY cnt DESC
            LIMIT 10
          ) y
          JOIN tbl_user u ON u.user_id = y.user_id
        ) AS most_engaged_members,

        -- Registration over time (current cycle)
        (
          SELECT CONCAT(
            '[',
            IFNULL(GROUP_CONCAT(
              JSON_OBJECT(
                'month', DATE_FORMAT(m.month_start, '%Y-%m'),
                'total', m.total
              )
              ORDER BY m.month_start ASC SEPARATOR ','
            ), ''),
            ']'
          )
          FROM (
            SELECT DATE_FORMAT(om.joined_at, '%Y-%m-01') AS month_start,
                   COUNT(*) AS total
            FROM tbl_organization_members om
            WHERE om.organization_id = o.organization_id
              AND om.status='Active'
              AND om.cycle_number = (
                SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
                WHERE rc.organization_id = o.organization_id
              )
            GROUP BY DATE_FORMAT(om.joined_at, '%Y-%m-01')
          ) m
        ) AS registration_over_time

      FROM tbl_organization o
      WHERE o.status IN ('Approved','Renewal')
    ) AS U
    ORDER BY
      CASE
        WHEN organization_id = -1 THEN 0
        WHEN organization_id IS NULL THEN 1
        ELSE 2
      END,
      organization_name;

  ELSE
    -- Single organization only
    SELECT
      o.organization_id,
      o.name AS organization_name,
      (
        SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
        WHERE rc.organization_id = o.organization_id
      ) AS cycle_number,

      -- New members this month
      (
        SELECT COUNT(*)
        FROM tbl_organization_members om
        WHERE om.organization_id = o.organization_id
          AND om.status='Active'
          AND DATE(om.joined_at) BETWEEN v_curr_month_start AND v_curr_month_end
          AND om.cycle_number = (
            SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
            WHERE rc.organization_id = o.organization_id
          )
      ) AS new_members_this_month,

      -- Registered members
      (
        SELECT COUNT(*)
        FROM tbl_organization_members om
        WHERE om.organization_id = o.organization_id
          AND om.status='Active'
          AND om.cycle_number = (
            SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
            WHERE rc.organization_id = o.organization_id
          )
      ) AS registered_members,

      -- Active members this month
      (
        SELECT COUNT(DISTINCT ea.user_id)
        FROM tbl_event e
        JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
        JOIN tbl_organization_members om
          ON om.user_id = ea.user_id
         AND om.organization_id = o.organization_id
         AND om.status='Active'
         AND om.cycle_number = (
           SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
           WHERE rc.organization_id = o.organization_id
         )
        WHERE e.organization_id = o.organization_id
          AND e.status='Approved'
          AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
          AND ea.status IN ('Attended','Evaluated')
      ) AS active_members_this_month,

      -- Inactive
      GREATEST(
        (
          SELECT COUNT(*)
          FROM tbl_organization_members om
          WHERE om.organization_id = o.organization_id
            AND om.status='Active'
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = o.organization_id
            )
        ) -
        (
          SELECT COUNT(DISTINCT ea.user_id)
          FROM tbl_event e
          JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
          JOIN tbl_organization_members om
            ON om.user_id = ea.user_id
           AND om.organization_id = o.organization_id
           AND om.status='Active'
           AND om.cycle_number = (
             SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
             WHERE rc.organization_id = o.organization_id
           )
          WHERE e.organization_id = o.organization_id
            AND e.status='Approved'
            AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
            AND ea.status IN ('Attended','Evaluated')
        ),
        0
      ) AS inactive_members_this_month,

      -- Most engaged members (top 10)
      (
        SELECT CONCAT(
          '[',
          IFNULL(GROUP_CONCAT(
            JSON_OBJECT(
              'user_id', u.user_id,
              'name', CONCAT(COALESCE(u.f_name,''),' ',COALESCE(u.l_name,'')),
              'email', u.email,
              'events_attended', y.cnt
            )
            ORDER BY y.cnt DESC, u.l_name ASC SEPARATOR ','
          ), ''),
          ']'
        )
        FROM (
          SELECT ea.user_id, COUNT(DISTINCT e.event_id) AS cnt
          FROM tbl_event e
          JOIN tbl_event_attendance ea ON ea.event_id = e.event_id
          JOIN tbl_organization_members om
            ON om.user_id = ea.user_id
           AND om.organization_id = o.organization_id
           AND om.status='Active'
           AND om.cycle_number = (
             SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
             WHERE rc.organization_id = o.organization_id
           )
          WHERE e.organization_id = o.organization_id
            AND e.status='Approved'
            AND DATE(e.start_date) BETWEEN v_curr_month_start AND v_curr_month_end
            AND ea.status IN ('Attended','Evaluated')
          GROUP BY ea.user_id
          ORDER BY cnt DESC
          LIMIT 10
        ) y
        JOIN tbl_user u ON u.user_id = y.user_id
      ) AS most_engaged_members,

      -- Registration over time (current cycle)
      (
        SELECT CONCAT(
          '[',
          IFNULL(GROUP_CONCAT(
            JSON_OBJECT(
              'month', DATE_FORMAT(m.month_start, '%Y-%m'),
              'total', m.total
            )
            ORDER BY m.month_start ASC SEPARATOR ','
          ), ''),
          ']'
        )
        FROM (
          SELECT DATE_FORMAT(om.joined_at, '%Y-%m-01') AS month_start,
                 COUNT(*) AS total
          FROM tbl_organization_members om
          WHERE om.organization_id = o.organization_id
            AND om.status='Active'
            AND om.cycle_number = (
              SELECT MAX(rc.cycle_number) FROM tbl_renewal_cycle rc
              WHERE rc.organization_id = o.organization_id
            )
          GROUP BY DATE_FORMAT(om.joined_at, '%Y-%m-01')
        ) m
      ) AS registration_over_time

    FROM tbl_organization o
    WHERE o.status IN ('Approved','Renewal')
      AND o.organization_id = p_organization_id
    LIMIT 1;

  END IF;

END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationDashboardOverview(
    IN p_organization_id INT
)
BEGIN
    DECLARE v_current_cycle INT;

    -- Get the latest cycle number for the organization
    SELECT MAX(cycle_number) INTO v_current_cycle
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id;

    -- Total members (including executives, committee, and regular members, unique users)
    SELECT COUNT(DISTINCT user_id) INTO @total_members
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
      AND cycle_number = v_current_cycle
      AND status = 'Active';

    -- Total approved events
    SELECT COUNT(*) INTO @total_approved_events
    FROM tbl_event
    WHERE organization_id = p_organization_id
      AND status = 'Approved';

    -- Total upcoming events (approved and ongoing/upcoming, not completed/past)
    SELECT COUNT(*) INTO @total_upcoming_events
    FROM tbl_event
    WHERE organization_id = p_organization_id
      AND status = 'Approved'
      AND (
            (end_date > CURDATE())
         OR (end_date = CURDATE() AND end_time >= CURTIME())
         OR (end_date IS NULL AND start_date >= CURDATE())
      );

    -- Total post-event requirements submitted (approved)
    SELECT COUNT(*) INTO @total_post_event_requirements_submitted
    FROM tbl_event_requirement_submissions ers
    JOIN tbl_event_application_requirement ear ON ers.requirement_id = ear.requirement_id
    WHERE ers.organization_id = p_organization_id
      AND ear.is_applicable_to = 'post-event'
      AND ers.status = 'Approved';

    -- Total event applications (all statuses)
    SELECT COUNT(*) INTO @total_event_applications
    FROM tbl_event_application
    WHERE organization_id = p_organization_id;

    -- Total organization applications (all statuses, new and renewal)
    SELECT COUNT(*) INTO @total_org_applications
    FROM tbl_application
    WHERE organization_id = p_organization_id
      AND application_type IN ('new', 'renewal');

    -- Return all as a single row
    SELECT
        @total_members AS total_members,
        @total_approved_events AS total_approved_events,
        @total_upcoming_events AS total_upcoming_events,
        @total_post_event_requirements_submitted AS total_post_event_requirements_submitted,
        @total_event_applications AS total_event_applications,
        @total_org_applications AS total_org_applications;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllApplicationsByOrganization(
    IN p_organization_id INT
)
BEGIN
    SELECT 
        a.application_id,
        a.organization_id,
        a.cycle_number,
        a.org_version_id,
        a.submitted_org_name,
        a.submitted_org_logo,
        a.application_type,
        a.period_id,
        a.applicant_user_id,
        u.f_name AS applicant_first_name,
        u.l_name AS applicant_last_name,
        u.email AS applicant_email,
        a.status,
        a.created_at,
        a.updated_at
    FROM tbl_application a
    LEFT JOIN tbl_user u ON a.applicant_user_id = u.user_id
    WHERE a.organization_id = p_organization_id
    ORDER BY a.created_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE PROCEDURE AnalyzeMultiOrgChatUsage(
  IN start_date DATE,
  IN end_date DATE
)
BEGIN
  SELECT 
    c.owner_id,
    COUNT(DISTINCT c.conversation_id) as total_conversations,
    COUNT(CASE WHEN m.message_scope = 'multi_org' THEN 1 END) as multi_org_messages,
    COUNT(CASE WHEN m.message_scope = 'current_view' THEN 1 END) as single_org_messages,
    COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(m.context_organizations, '$[0]'))) as unique_orgs_mentioned
  FROM tbl_ai_conversation c
  JOIN tbl_ai_message m ON c.conversation_id = m.conversation_id
  WHERE c.created_at BETWEEN start_date AND end_date
    AND c.is_archived = 0
    AND m.role = 'user'
  GROUP BY c.owner_id
  ORDER BY multi_org_messages DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveTransaction(
    IN p_transaction_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_category VARCHAR(50),
    IN p_approved_by_email VARCHAR(100)
)
BEGIN
    DECLARE v_approved_by_user_id VARCHAR(200);
    DECLARE v_payer_email VARCHAR(255);
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_event_id INT DEFAULT NULL;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Get approver user_id
    SELECT user_id INTO v_approved_by_user_id 
    FROM tbl_user 
    WHERE email = p_approved_by_email;
    
    -- Get transaction details
    SELECT t.payer_name, te.event_id, t.user_id
    INTO v_payer_email, v_event_id, v_user_id
    FROM tbl_transaction t
    LEFT JOIN tbl_transaction_event te ON t.transaction_id = te.transaction_id
    WHERE t.transaction_id = p_transaction_id;
    
    -- Update transaction status to 'Completed'
    UPDATE tbl_transaction 
    SET status = 'Completed',
        updated_at = NOW()
    WHERE transaction_id = p_transaction_id;
    
    -- Log the approval action
    CALL LogAction(
        p_approved_by_email,
        CONCAT('Approved transaction ', p_transaction_id, ' for category ', p_category),
        'TRANSACTION_APPROVE',
        JSON_OBJECT(
            'transaction_id', p_transaction_id,
            'organization_id', p_organization_id,
            'organization_version_id', p_organization_version_id,
            'category', p_category
        ),
        NULL,
        NULL
    );
    
    COMMIT;
    
    -- Return updated transaction
    CALL GetTransaction(p_transaction_id);
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetEventAttendeesWithDetails(
    IN p_event_id INT
)
BEGIN
    SELECT
        ea.attendance_id as id,
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
        tt.label AS transaction_type,
        t.status AS transaction_status,
        t.proof_image,
        t.created_at AS transaction_created_at
    FROM tbl_event_attendance ea
    LEFT JOIN tbl_user u ON ea.user_id = u.user_id
    LEFT JOIN tbl_transaction_event te ON ea.event_id = te.event_id 
    LEFT JOIN tbl_transaction t ON te.transaction_id = t.transaction_id AND ea.user_id = t.user_id
    LEFT JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
    WHERE ea.event_id = p_event_id;
END $$
DELIMITER ;


DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetAllNotification(
    In p_email VARCHAR(100)
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
    ORDER BY n.created_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE MarkAllNotificationsAsRead(
    IN p_email VARCHAR(100)
)
BEGIN
    DECLARE v_updated_count INT DEFAULT 0;
    
    -- Validate email parameter
    IF p_email IS NULL OR TRIM(p_email) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email parameter is required';
    END IF;
    
    -- Update all unread notifications for the user
    UPDATE tbl_notification_recipient 
    SET is_read = 1
    WHERE recipient_email = p_email 
      AND is_read = 0;
    
    -- Get the number of updated rows
    SET v_updated_count = ROW_COUNT();
    
    -- Return success message with count
    SELECT 
        v_updated_count AS notifications_marked_read,
        CONCAT(v_updated_count, ' notification(s) marked as read') AS message;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetNewNotificationCount(
    IN p_email VARCHAR(100)
)
BEGIN
    -- Validate email parameter
    IF p_email IS NULL OR TRIM(p_email) = '' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Email parameter is required';
    END IF;
    
    -- Return count of unread notifications
    SELECT COUNT(*) AS unread_count
    FROM tbl_notification n
    JOIN tbl_notification_recipient nr ON n.notification_id = nr.notification_id
    WHERE nr.recipient_email = p_email 
      AND nr.is_read = 0;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE GetPendingLeaveApplications(
    IN p_organization_id INT,
    IN p_organization_version_id INT
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle number using the organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Get all pending leave applications for this organization and cycle
    -- Use DISTINCT and GROUP BY to eliminate duplicates
    SELECT DISTINCT
        la.leave_application_id as id,
        la.organization_id,
        la.cycle_number,
        la.user_id,
        la.leave_reason,
        la.effective_date,
        la.status,
        la.applied_at,
        la.reviewed_by,
        la.reviewed_at,
        la.remarks,
        -- User details
        u.f_name,
        u.l_name,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        u.program_id,
        -- Program details
        p.name AS program_name,
        p.abbreviation AS program_abbreviation,
        -- College details
        c.name AS college_name,
        c.abbreviation AS college_abbreviation,
        -- Organization member details (get the most recent active membership)
        (SELECT member_type 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_type,
        (SELECT joined_at 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_since,
        -- Executive role details (if applicable)
        (SELECT er.role_title 
         FROM tbl_organization_members om_sub 
         LEFT JOIN tbl_executive_role er ON om_sub.executive_role_id = er.executive_role_id
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         AND om_sub.executive_role_id IS NOT NULL
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS executive_role,
        -- Organization details
        o.name AS organization_name,
        o.logo AS organization_logo
    FROM tbl_membership_leave_application la
    JOIN tbl_user u ON la.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_college c ON p.college_id = c.college_id
    JOIN tbl_organization o ON la.organization_id = o.organization_id
    WHERE la.organization_id = p_organization_id
      AND la.cycle_number = v_cycle_number
      AND la.status = 'Pending'
    ORDER BY la.applied_at DESC;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CreateLeaveApplication(
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_user_id VARCHAR(200),
    IN p_leave_reason TEXT
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_pending_count INT;
    DECLARE v_is_member INT;
    DECLARE v_application_id INT;
    
    -- Get the cycle number using the organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Check if user is an active member
    SELECT COUNT(*) INTO v_is_member
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
      AND cycle_number = v_cycle_number
      AND user_id = p_user_id
      AND status = 'Active';
    
    IF v_is_member = 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User is not an active member of this organization';
    END IF;
    
    -- Check for existing pending applications
    SELECT COUNT(*) INTO v_pending_count
    FROM tbl_membership_leave_application
    WHERE organization_id = p_organization_id
      AND cycle_number = v_cycle_number
      AND user_id = p_user_id
      AND status = 'Pending';
    
    IF v_pending_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'User already has a pending leave application for this organization';
    END IF;
    
    -- Create the leave application
    INSERT INTO tbl_membership_leave_application (
        organization_id,
        cycle_number,
        user_id,
        leave_reason,
        status,
        applied_at
    ) VALUES (
        p_organization_id,
        v_cycle_number,
        p_user_id,
        p_leave_reason,
        'Pending',
        CURRENT_TIMESTAMP
    );
    
    SET v_application_id = LAST_INSERT_ID();
    
    -- Return the created application
    SELECT 
        la.leave_application_id as id,
        la.organization_id,
        la.cycle_number,
        la.user_id,
        la.leave_reason,
        la.effective_date,
        la.status,
        la.applied_at,
        la.reviewed_by,
        la.reviewed_at,
        la.remarks,
        -- User details
        u.f_name,
        u.l_name,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        u.program_id,
        -- Program details
        p.name AS program_name,
        p.abbreviation AS program_abbreviation,
        -- College details
        c.name AS college_name,
        c.abbreviation AS college_abbreviation,
        -- Organization member details (get the most recent active membership)
        (SELECT member_type 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_type,
        (SELECT joined_at 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_since,
        -- Executive role details (if applicable)
        (SELECT er.role_title 
         FROM tbl_organization_members om_sub 
         LEFT JOIN tbl_executive_role er ON om_sub.executive_role_id = er.executive_role_id
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         AND om_sub.executive_role_id IS NOT NULL
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS executive_role,
        -- Organization details
        o.name AS organization_name,
        o.logo AS organization_logo
    FROM tbl_membership_leave_application la
    JOIN tbl_user u ON la.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_college c ON p.college_id = c.college_id
    JOIN tbl_organization o ON la.organization_id = o.organization_id
    WHERE la.leave_application_id = v_application_id;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE CheckPendingLeaveStatus(
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_cycle_number INT;
    
    -- Get the cycle number using the organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Check for pending leave applications
    SELECT 
        la.leave_application_id,
        la.organization_id,
        la.cycle_number,
        la.user_id,
        la.leave_reason,
        la.effective_date,
        la.status,
        la.applied_at,
        la.reviewed_by,
        la.reviewed_at,
        la.remarks,
        CASE 
            WHEN la.leave_application_id IS NOT NULL THEN TRUE 
            ELSE FALSE 
        END AS has_pending_application
    FROM tbl_membership_leave_application la
    WHERE la.organization_id = p_organization_id
      AND la.cycle_number = v_cycle_number
      AND la.user_id = p_user_id
      AND la.status = 'Pending'
    LIMIT 1;
    
    -- If no pending application found, return a default response
    IF ROW_COUNT() = 0 THEN
        SELECT 
            NULL AS leave_application_id,
            p_organization_id AS organization_id,
            v_cycle_number AS cycle_number,
            p_user_id AS user_id,
            NULL AS leave_reason,
            NULL AS effective_date,
            NULL AS status,
            NULL AS applied_at,
            NULL AS reviewed_by,
            NULL AS reviewed_at,
            NULL AS remarks,
            FALSE AS has_pending_application;
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ApproveLeaveApplication(
    IN p_leave_application_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_reviewer_email VARCHAR(255),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_reviewer_user_id VARCHAR(200);
    DECLARE v_application_status VARCHAR(50);
    DECLARE v_member_id INT;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Get the cycle number using the organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Get application details and validate
    SELECT user_id, status INTO v_user_id, v_application_status
    FROM tbl_membership_leave_application
    WHERE leave_application_id = p_leave_application_id
    AND organization_id = p_organization_id
    AND cycle_number = v_cycle_number;
    
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave application not found';
    END IF;
    
    IF v_application_status != 'Pending' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave application is not pending';
    END IF;
    
    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_user_id
    FROM tbl_user 
    WHERE email = p_reviewer_email
    LIMIT 1;
    
    IF v_reviewer_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer not found';
    END IF;
    
    -- Get member_id for archiving
    SELECT member_id INTO v_member_id
    FROM tbl_organization_members
    WHERE organization_id = p_organization_id
    AND cycle_number = v_cycle_number
    AND user_id = v_user_id
    AND status = 'Active'
    LIMIT 1;
    
    -- Update leave application status
    UPDATE tbl_membership_leave_application 
    SET 
        status = 'Approved',
        reviewed_at = NOW(),
        reviewed_by = v_reviewer_user_id,
        remarks = p_remarks,
        effective_date = NOW()
    WHERE leave_application_id = p_leave_application_id;
    
    -- Archive the member (remove from organization)
    IF v_member_id IS NOT NULL THEN
        -- First, copy to archived table
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
        )
        SELECT 
            om.member_id,
            om.organization_id,
            om.cycle_number,
            om.user_id,
            om.member_type,
            om.executive_role_id,
            NULL, -- committee_id
            NULL, -- committee_role
            NOW(),
            v_reviewer_user_id
        FROM tbl_organization_members om
        WHERE om.member_id = v_member_id;
        
        -- Then update status to Archived
        UPDATE tbl_organization_members
        SET status = 'Archived'
        WHERE member_id = v_member_id;
    END IF;
    
    COMMIT;
    
    -- Return the approved application with all details
    SELECT 
        la.leave_application_id as id,
        la.organization_id,
        la.cycle_number,
        la.user_id,
        la.leave_reason,
        la.effective_date,
        la.status,
        la.applied_at,
        la.reviewed_by,
        la.reviewed_at,
        la.remarks,
        -- User details
        u.f_name,
        u.l_name,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        u.program_id,
        -- Program details
        p.name AS program_name,
        p.abbreviation AS program_abbreviation,
        -- College details
        c.name AS college_name,
        c.abbreviation AS college_abbreviation,
        -- Organization member details (get the archived membership)
        (SELECT member_type 
         FROM tbl_archived_organization_members aom_sub 
         WHERE aom_sub.organization_id = la.organization_id 
         AND aom_sub.cycle_number = la.cycle_number 
         AND aom_sub.user_id = la.user_id
         ORDER BY aom_sub.archived_at DESC 
         LIMIT 1) AS member_type,
        (SELECT joined_at 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_since,
        -- Executive role details (if applicable)
        (SELECT er.role_title 
         FROM tbl_archived_organization_members aom_sub 
         LEFT JOIN tbl_executive_role er ON aom_sub.executive_role_id = er.executive_role_id
         WHERE aom_sub.organization_id = la.organization_id 
         AND aom_sub.cycle_number = la.cycle_number 
         AND aom_sub.user_id = la.user_id
         AND aom_sub.executive_role_id IS NOT NULL
         ORDER BY aom_sub.archived_at DESC 
         LIMIT 1) AS executive_role,
        -- Organization details
        o.name AS organization_name,
        o.logo AS organization_logo,
        -- Reviewer details
        reviewer.f_name AS reviewer_first_name,
        reviewer.l_name AS reviewer_last_name,
        CONCAT(reviewer.f_name, ' ', reviewer.l_name) AS reviewer_full_name
    FROM tbl_membership_leave_application la
    JOIN tbl_user u ON la.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_college c ON p.college_id = c.college_id
    JOIN tbl_organization o ON la.organization_id = o.organization_id
    LEFT JOIN tbl_user reviewer ON la.reviewed_by = reviewer.user_id
    WHERE la.leave_application_id = p_leave_application_id;
    
    -- Return archived members for SSE publishing (when member was archived)
    SELECT 
        aom.archived_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        aom.member_type,
        aom.archived_at,
        aom.archived_by,
        aom.committee_role,
        aom.executive_role_id,
        aom.committee_id
    FROM tbl_archived_organization_members aom
    JOIN tbl_user u ON aom.user_id = u.user_id
    WHERE aom.organization_id = p_organization_id
        AND aom.cycle_number = v_cycle_number
        AND aom.user_id = v_user_id
        AND aom.archived_by = v_reviewer_user_id
    ORDER BY aom.archived_at DESC;
    
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE RejectLeaveApplication(
    IN p_leave_application_id INT,
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_reviewer_email VARCHAR(255),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_cycle_number INT;
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_reviewer_user_id VARCHAR(200);
    DECLARE v_application_status VARCHAR(50);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Get the cycle number using the organization_version_id
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_organization_version_id;
    
    IF v_cycle_number IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No renewal cycle found for this organization version';
    END IF;
    
    -- Get application details and validate
    SELECT user_id, status INTO v_user_id, v_application_status
    FROM tbl_membership_leave_application
    WHERE leave_application_id = p_leave_application_id
    AND organization_id = p_organization_id
    AND cycle_number = v_cycle_number;
    
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave application not found';
    END IF;
    
    IF v_application_status != 'Pending' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Leave application is not pending';
    END IF;
    
    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_user_id
    FROM tbl_user 
    WHERE email = p_reviewer_email
    LIMIT 1;
    
    IF v_reviewer_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer not found';
    END IF;
    
    -- Update leave application status to rejected
    UPDATE tbl_membership_leave_application 
    SET 
        status = 'Rejected',
        reviewed_at = NOW(),
        reviewed_by = v_reviewer_user_id,
        remarks = p_remarks
    WHERE leave_application_id = p_leave_application_id;
    
    COMMIT;
    
    -- Return the rejected application with all details
    SELECT 
        la.leave_application_id as id,
        la.organization_id,
        la.cycle_number,
        la.user_id,
        la.leave_reason,
        la.effective_date,
        la.status,
        la.applied_at,
        la.reviewed_by,
        la.reviewed_at,
        la.remarks,
        -- User details
        u.f_name,
        u.l_name,
        CONCAT(u.f_name, ' ', u.l_name) AS full_name,
        u.email,
        u.profile_picture,
        u.program_id,
        -- Program details
        p.name AS program_name,
        p.abbreviation AS program_abbreviation,
        -- College details
        c.name AS college_name,
        c.abbreviation AS college_abbreviation,
        -- Organization member details (still active since rejected)
        (SELECT member_type 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_type,
        (SELECT joined_at 
         FROM tbl_organization_members om_sub 
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS member_since,
        -- Executive role details (if applicable)
        (SELECT er.role_title 
         FROM tbl_organization_members om_sub 
         LEFT JOIN tbl_executive_role er ON om_sub.executive_role_id = er.executive_role_id
         WHERE om_sub.organization_id = la.organization_id 
         AND om_sub.cycle_number = la.cycle_number 
         AND om_sub.user_id = la.user_id
         AND om_sub.status = 'Active'
         AND om_sub.executive_role_id IS NOT NULL
         ORDER BY om_sub.joined_at DESC 
         LIMIT 1) AS executive_role,
        -- Organization details
        o.name AS organization_name,
        o.logo AS organization_logo,
        -- Reviewer details
        reviewer.f_name AS reviewer_first_name,
        reviewer.l_name AS reviewer_last_name,
        CONCAT(reviewer.f_name, ' ', reviewer.l_name) AS reviewer_full_name
    FROM tbl_membership_leave_application la
    JOIN tbl_user u ON la.user_id = u.user_id
    LEFT JOIN tbl_program p ON u.program_id = p.program_id
    LEFT JOIN tbl_college c ON p.college_id = c.college_id
    JOIN tbl_organization o ON la.organization_id = o.organization_id
    LEFT JOIN tbl_user reviewer ON la.reviewed_by = reviewer.user_id
    WHERE la.leave_application_id = p_leave_application_id;
    
END$$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ProcessMembershipApproval(
    IN p_application_id INT,
    IN p_reviewer_email VARCHAR(255),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_transaction_id INT DEFAULT NULL;
    DECLARE v_application_status VARCHAR(50);
    DECLARE v_user_exists INT DEFAULT 0;
    DECLARE v_member_exists INT DEFAULT 0;
    DECLARE v_reviewer_user_id VARCHAR(200);
    DECLARE v_new_member_id INT;
    DECLARE v_org_version_id INT;
    DECLARE v_is_reactivating BOOLEAN DEFAULT FALSE;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Check if application exists and get details
    SELECT user_id, organization_id, cycle_number, status
    INTO v_user_id, v_organization_id, v_cycle_number, v_application_status
    FROM tbl_membership_application 
    WHERE application_id = p_application_id;
    
    -- Get the current organization version ID
    SELECT current_org_version_id INTO v_org_version_id
    FROM tbl_organization 
    WHERE organization_id = v_organization_id;
    
    -- Check if application was found
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application not found';
    END IF;
    
    IF v_application_status != 'Pending' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application is not pending';
    END IF;
    
    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_user_id
    FROM tbl_user 
    WHERE email = p_reviewer_email
    LIMIT 1;
    
    IF v_reviewer_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer not found';
    END IF;
    
    -- Check for existing transaction for this user and organization/cycle
    SELECT t.transaction_id INTO v_transaction_id
    FROM tbl_transaction t
    JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    WHERE t.user_id = v_user_id 
    AND tm.organization_id = v_organization_id 
    AND tm.cycle_number = v_cycle_number
    AND t.status IN ('Pending', 'Paid')
    ORDER BY 
        CASE t.status 
            WHEN 'Paid' THEN 1 
            WHEN 'Pending' THEN 2 
        END,
        t.created_at DESC
    LIMIT 1;
    
    -- Approve the membership application
    UPDATE tbl_membership_application 
    SET 
        status = 'Approved',
        reviewed_at = NOW(),
        reviewed_by = v_reviewer_user_id,
        remarks = p_remarks
    WHERE application_id = p_application_id;
    
    -- Update transaction status if exists
    IF v_transaction_id IS NOT NULL THEN
        UPDATE tbl_transaction 
        SET status = CASE 
            WHEN status = 'Pending' THEN 'Completed'
            WHEN status = 'Paid' THEN 'Completed'
            ELSE status 
        END
        WHERE transaction_id = v_transaction_id;
    END IF;
    
    -- Check if user exists
    SELECT COUNT(*) INTO v_user_exists
    FROM tbl_user 
    WHERE user_id = v_user_id;
    
    IF v_user_exists = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;
    
    -- Check if member already exists (either active or archived)
    SELECT COUNT(*) INTO v_member_exists
    FROM tbl_organization_members 
    WHERE user_id = v_user_id 
    AND organization_id = v_organization_id 
    AND cycle_number = v_cycle_number
    AND status = 'Active';
    
    IF v_member_exists > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User is already an active member of this organization';
    END IF;
    
    -- Check if there's an archived member that can be reactivated
    SELECT member_id INTO v_new_member_id
    FROM tbl_organization_members 
    WHERE user_id = v_user_id 
    AND organization_id = v_organization_id 
    AND cycle_number = v_cycle_number
    AND status = 'Archived'
    LIMIT 1;
    
    IF v_new_member_id IS NOT NULL THEN
        -- Set flag that we're reactivating an archived member
        SET v_is_reactivating = TRUE;
        
        -- Reactivate existing archived member
        UPDATE tbl_organization_members 
        SET 
            status = 'Active',
            joined_at = NOW(),
            org_version_id = v_org_version_id
        WHERE member_id = v_new_member_id;
        
    ELSE
        -- Create new organization member
        INSERT INTO tbl_organization_members (
            user_id, 
            organization_id, 
            cycle_number, 
            org_version_id,
            member_type,
            status,
            joined_at
        ) VALUES (
            v_user_id, 
            v_organization_id, 
            v_cycle_number, 
            v_org_version_id,
            'Member',
            'Active',
            NOW()
        );
        
        -- Get the newly created member ID
        SET v_new_member_id = LAST_INSERT_ID();
    END IF;
    
    COMMIT;
    
    -- Return approved application details
    SELECT
        ma.application_id as id,
        ma.organization_id,
        ma.cycle_number,
        ma.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        u.profile_picture,
        'Member' AS member_type, -- Default member type since it's a membership application
        ma.status AS status,
        ma.application_id,
        ma.status AS application_status,
        ma.applied_at,
        ma.reviewed_by,
        ma.reviewed_at,
        org.membership_fee_type,
        org.membership_fee_amount,
        latest_transaction.transaction_id,
        latest_transaction.amount AS paid_amount,
        latest_transaction.status AS payment_status,
        latest_transaction.proof_image,
        -- Application responses as JSON array
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'response_id', mr.response_id,
                    'question_id', mr.question_id,
                    'question_text', mq.question_text,
                    'question_type', mq.question_type,
                    'response_value', mr.response_value,
                    'is_required', mq.is_required
                )
            )
            FROM tbl_membership_response mr
            JOIN tbl_membership_question mq ON mr.question_id = mq.question_id
            WHERE mr.application_id = ma.application_id
        ) AS application_responses
    FROM tbl_membership_application ma
    JOIN tbl_user u ON ma.user_id = u.user_id
    LEFT JOIN tbl_organization org ON ma.organization_id = org.organization_id
    LEFT JOIN (
        -- Subquery to get the latest MEMBERSHIP transaction per user for this organization/cycle
        SELECT 
            tm.organization_id,
            tm.cycle_number,
            t.user_id,
            t.transaction_id,
            t.amount,
            t.status,
            t.proof_image,
            ROW_NUMBER() OVER (
                PARTITION BY tm.organization_id, tm.cycle_number, t.user_id 
                ORDER BY 
                    CASE t.status 
                        WHEN 'Completed' THEN 1 
                        WHEN 'Pending' THEN 2 
                        ELSE 3 
                    END,
                    t.created_at DESC
            ) as rn
        FROM tbl_transaction_membership tm
        JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
        JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
        JOIN tbl_financial_category fc ON t.category_id = fc.category_id
        WHERE tt.code = 'INCOME'
          AND fc.code = 'MEMBERSHIP'  -- Only get transactions with MEMBERSHIP category
          AND t.status IN ('Pending', 'Completed')
          AND tm.organization_id = v_organization_id
          AND tm.cycle_number = v_cycle_number
    ) latest_transaction 
        ON latest_transaction.organization_id = ma.organization_id
        AND latest_transaction.cycle_number = ma.cycle_number
        AND latest_transaction.user_id = ma.user_id
        AND latest_transaction.rn = 1
    WHERE ma.application_id = p_application_id;
    
    -- Return transaction details if exists
    IF v_transaction_id IS NOT NULL THEN
        CALL GetTransaction(v_transaction_id);
    ELSE
        -- Return empty result set if no transaction
        SELECT NULL as transaction_id WHERE FALSE;
    END IF;
    
    -- Return new member details using the LAST_INSERT_ID
    SELECT 
        om.member_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        om.member_type,
        om.status,
        om.joined_at,
        om.organization_id,
        om.cycle_number,
        om.org_version_id as organization_version_id
    FROM tbl_organization_members om
    JOIN tbl_user u ON om.user_id = u.user_id
    WHERE om.member_id = v_new_member_id;
    
    -- Return archived members for SSE publishing (only when reactivating)
    SELECT 
        aom.archived_id as id,
        u.f_name as first_name,
        u.l_name as last_name,
        u.email,
        aom.member_type,
        aom.archived_at,
        aom.archived_by,
        aom.committee_role,
        aom.executive_role_id,
        aom.committee_id
    FROM tbl_archived_organization_members aom
    JOIN tbl_user u ON aom.user_id = u.user_id
    WHERE v_is_reactivating = TRUE
        AND aom.organization_id = v_organization_id
        AND aom.cycle_number = v_cycle_number
        AND aom.user_id = v_user_id
    ORDER BY aom.archived_at DESC;
    
    -- Remove from archived table after selection (only if reactivating)
    IF v_is_reactivating = TRUE THEN
        DELETE FROM tbl_archived_organization_members
        WHERE organization_id = v_organization_id
        AND cycle_number = v_cycle_number
        AND user_id = v_user_id;
    END IF;
    
END $$
DELIMITER ;

DELIMITER $$
CREATE DEFINER='admin'@'%' PROCEDURE ProcessMembershipRejection(
    IN p_application_id INT,
    IN p_reviewer_email VARCHAR(255),
    IN p_remarks TEXT
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_transaction_id INT DEFAULT NULL;
    DECLARE v_application_status VARCHAR(50);
    DECLARE v_reviewer_user_id VARCHAR(200);
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Check if application exists and get details
    SELECT user_id, organization_id, cycle_number, status
    INTO v_user_id, v_organization_id, v_cycle_number, v_application_status
    FROM tbl_membership_application 
    WHERE application_id = p_application_id;
    
    -- Check if application was found
    IF v_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application not found';
    END IF;
    
    IF v_application_status != 'Pending' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application is not pending';
    END IF;
    
    -- Get reviewer user_id from email
    SELECT user_id INTO v_reviewer_user_id
    FROM tbl_user 
    WHERE email = p_reviewer_email
    LIMIT 1;
    
    IF v_reviewer_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer not found';
    END IF;
    
    -- Check for existing transaction for this user and organization/cycle
    SELECT t.transaction_id INTO v_transaction_id
    FROM tbl_transaction t
    JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
    WHERE t.user_id = v_user_id 
    AND tm.organization_id = v_organization_id 
    AND tm.cycle_number = v_cycle_number
    AND t.status IN ('Pending', 'Paid')
    ORDER BY 
        CASE t.status 
            WHEN 'Paid' THEN 1 
            WHEN 'Pending' THEN 2 
        END,
        t.created_at DESC
    LIMIT 1;
    
    -- Reject the membership application
    UPDATE tbl_membership_application 
    SET 
        status = 'Rejected',
        reviewed_at = NOW(),
        reviewed_by = v_reviewer_user_id,
        remarks = p_remarks
    WHERE application_id = p_application_id;
    
    -- Update transaction status to Failed if exists
    IF v_transaction_id IS NOT NULL THEN
        UPDATE tbl_transaction 
        SET status = 'Failed'
        WHERE transaction_id = v_transaction_id;
    END IF;
    
    COMMIT;
    
    -- Return rejected application details
    SELECT
        ma.application_id as id,
        ma.organization_id,
        ma.cycle_number,
        ma.user_id,
        CONCAT(u.f_name, ' ', u.l_name) AS name,
        u.email,
        u.profile_picture,
        'Member' AS member_type, -- Default member type since it's a membership application
        ma.status AS status,
        ma.application_id,
        ma.status AS application_status,
        ma.applied_at,
        ma.reviewed_by,
        ma.reviewed_at,
        ma.remarks,
        org.membership_fee_type,
        org.membership_fee_amount,
        latest_transaction.transaction_id,
        latest_transaction.amount AS paid_amount,
        latest_transaction.status AS payment_status,
        latest_transaction.proof_image,
        -- Application responses as JSON array
        (
            SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                    'response_id', mr.response_id,
                    'question_id', mr.question_id,
                    'question_text', mq.question_text,
                    'question_type', mq.question_type,
                    'response_value', mr.response_value,
                    'is_required', mq.is_required
                )
            )
            FROM tbl_membership_response mr
            JOIN tbl_membership_question mq ON mr.question_id = mq.question_id
            WHERE mr.application_id = ma.application_id
        ) AS application_responses
    FROM tbl_membership_application ma
    JOIN tbl_user u ON ma.user_id = u.user_id
    LEFT JOIN tbl_organization org ON ma.organization_id = org.organization_id
    LEFT JOIN (
        -- Subquery to get the latest MEMBERSHIP transaction per user for this organization/cycle
        SELECT 
            tm.organization_id,
            tm.cycle_number,
            t.user_id,
            t.transaction_id,
            t.amount,
            t.status,
            t.proof_image,
            ROW_NUMBER() OVER (
                PARTITION BY tm.organization_id, tm.cycle_number, t.user_id 
                ORDER BY 
                    CASE t.status 
                        WHEN 'Failed' THEN 1 
                        WHEN 'Pending' THEN 2 
                        ELSE 3 
                    END,
                    t.created_at DESC
            ) as rn
        FROM tbl_transaction_membership tm
        JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
        JOIN tbl_transaction_type tt ON t.transaction_type_id = tt.transaction_type_id
        JOIN tbl_financial_category fc ON t.category_id = fc.category_id
        WHERE tt.code = 'INCOME'
          AND fc.code = 'MEMBERSHIP'  -- Only get transactions with MEMBERSHIP category
          AND t.status IN ('Pending', 'Failed')
          AND tm.organization_id = v_organization_id
          AND tm.cycle_number = v_cycle_number
    ) latest_transaction 
        ON latest_transaction.organization_id = ma.organization_id
        AND latest_transaction.cycle_number = ma.cycle_number
        AND latest_transaction.user_id = ma.user_id
        AND latest_transaction.rn = 1
    WHERE ma.application_id = p_application_id;
    
    -- Return transaction details if exists
    IF v_transaction_id IS NOT NULL THEN
        CALL GetTransaction(v_transaction_id);
    ELSE
        -- Return empty result set if no transaction
        SELECT NULL as transaction_id WHERE FALSE;
    END IF;
    
END $$
DELIMITER ;

-- =====================================================
-- TERM PAYMENT GENERATION PROCEDURES
-- =====================================================

DELIMITER $$
-- Generate term payments for all Per Term organizations when a new term becomes active
CREATE DEFINER='admin'@'%' PROCEDURE GenerateTermPaymentsForAllPerTermOrganizations(
    IN p_term_id INT
)
proc_label: BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_org_id INT;
    DECLARE v_org_version_id INT;
    DECLARE v_membership_fee DECIMAL(10,2);
    DECLARE v_current_term_id INT;
    DECLARE v_term_name VARCHAR(100);
    DECLARE v_total_payments_generated INT DEFAULT 0;
    DECLARE v_organizations_processed INT DEFAULT 0;
    
    -- Cursor to get all Per Term organizations
    DECLARE org_cursor CURSOR FOR
        SELECT organization_id, current_org_version_id, membership_fee_amount
        FROM tbl_organization
        WHERE membership_fee_type = 'Per Term'
        AND status = 'Approved'
        AND membership_fee_amount > 0;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- If no term_id provided, get the current active term
    IF p_term_id IS NULL OR p_term_id = 0 THEN
        SELECT term_id, term_name INTO v_current_term_id, v_term_name
        FROM tbl_academic_term 
        WHERE is_active = TRUE AND status = 'Active'
        ORDER BY start_date DESC 
        LIMIT 1;
        
        IF v_current_term_id IS NULL THEN
            SELECT 'No active term found. Please ensure there is an active term set in the system.' as result, 
                   0 as total_payments_generated,
                   0 as organizations_processed,
                   'ERROR' as status;
            LEAVE proc_label;
        END IF;
        
        SET p_term_id = v_current_term_id;
    ELSE
        -- Validate provided term exists and is active
        SELECT term_name INTO v_term_name
        FROM tbl_academic_term 
        WHERE term_id = p_term_id AND is_active = TRUE AND status = 'Active';
        
        IF v_term_name IS NULL THEN
            SELECT CONCAT('Term ID ', p_term_id, ' is not found or not active.') as result,
                   0 as total_payments_generated,
                   0 as organizations_processed,
                   'ERROR' as status;
            LEAVE proc_label;
        END IF;
    END IF;
    
    -- Note: This procedure is now deprecated since we don't auto-generate payments
    -- Term payments should be created when users actually make payments
    
    SELECT CONCAT('Auto-generation disabled. Term payments are created when users submit payments for term "', v_term_name, '"') as result,
           0 as total_payments_generated,
           0 as organizations_processed,
           'INFO' as status,
           p_term_id as term_id,
           v_term_name as term_name;
           
END $$
DELIMITER ;

DELIMITER $$
-- Create term payment when user submits payment proof
CREATE DEFINER='admin'@'%' PROCEDURE CreateTermPaymentWithTransaction(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_term_id INT,
    IN p_proof_image VARCHAR(500)
)
BEGIN
    DECLARE v_org_version_id INT;
    DECLARE v_membership_fee DECIMAL(10,2);
    DECLARE v_fee_type VARCHAR(50);
    DECLARE v_payer_name VARCHAR(255);
    DECLARE v_org_name VARCHAR(100);
    DECLARE v_term_name VARCHAR(100);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_cycle_number INT DEFAULT 1;
    DECLARE v_due_date DATE;
    
    -- Variables for receipt generation
    DECLARE v_type_char CHAR(1);
    DECLARE v_yyyymm CHAR(6);
    DECLARE v_org_token VARCHAR(10);
    DECLARE v_prefix VARCHAR(50);
    
    -- Check if user is active member and get organization details
    SELECT 
        o.current_org_version_id, 
        o.membership_fee_amount, 
        o.membership_fee_type,
        o.name,
        CONCAT(u.f_name, ' ', u.l_name),
        at.term_name,
        DATE_ADD(at.start_date, INTERVAL 30 DAY)
    INTO v_org_version_id, v_membership_fee, v_fee_type, v_org_name, v_payer_name, v_term_name, v_due_date
    FROM tbl_organization o
    JOIN tbl_user u ON u.user_id = p_user_id
    JOIN tbl_academic_term at ON at.term_id = p_term_id
    WHERE o.organization_id = p_organization_id
    AND o.status = 'Approved'
    AND EXISTS (
        SELECT 1 FROM tbl_organization_members om 
        WHERE om.user_id = p_user_id 
        AND om.organization_id = p_organization_id 
        AND om.status = 'Active'
    );
    
    -- Validate organization and membership
    IF v_org_version_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User is not an active member of this organization or organization not found';
    END IF;
    
    -- Validate it's a Per Term organization
    IF v_fee_type != 'Per Term' OR v_membership_fee = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Organization is not configured for Per Term payments';
    END IF;
    
    -- Check if payment already exists for this term
    IF EXISTS (
        SELECT 1 FROM tbl_membership_term_payment 
        WHERE user_id = p_user_id 
        AND organization_id = p_organization_id 
        AND term_id = p_term_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment for this term already exists';
    END IF;
    
    -- Get required IDs for transaction
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type WHERE code = 'INCOME';
    
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type WHERE code = 'UPLOAD_PROOF';
    
    SELECT category_id INTO v_category_id 
    FROM tbl_financial_category 
    WHERE code = 'MEMBERSHIP_FEES' AND active = TRUE;
    
    -- Generate receipt number
    SET v_type_char = 'I'; -- Income
    SET v_yyyymm = DATE_FORMAT(NOW(), '%Y%m');
    SET v_org_token = CONCAT('ORG', LPAD(p_organization_id, 3, '0'));
    SET v_prefix = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
    SET v_receipt_no = CONCAT(v_prefix, LPAD(FLOOR(RAND() * 1000000), 6, '0'));
    
    -- Create transaction record FIRST
    INSERT INTO tbl_transaction (
        user_id, payer_name, payee_name, payment_description, amount,
        transaction_type_id, payment_type_id, category_id, org_version_id, status, 
        transaction_date, receipt_no, proof_image
    ) VALUES (
        p_user_id, v_payer_name, v_org_name, 
        CONCAT('Term Membership Fee - ', v_org_name, ' (', v_term_name, ')'), 
        v_membership_fee,
        v_transaction_type_id, v_payment_type_id, v_category_id, v_org_version_id, 
        'Pending',
        NOW(), v_receipt_no, p_proof_image
    );
    
    SET v_transaction_id = LAST_INSERT_ID();
    
    -- Link to organization membership
    INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
    VALUES (v_transaction_id, p_organization_id, v_cycle_number);
    
    -- Create term payment record with transaction reference
    INSERT INTO tbl_term_payments (
        user_id, organization_id, organization_version_id, term_id, transaction_id,
        payment_status
    ) VALUES (
        p_user_id, p_organization_id, p_org_version_id, p_term_id, v_transaction_id,
        'Pending'
    );
    
    -- Return success details
    SELECT 
        v_transaction_id as transaction_id,
        v_receipt_no as receipt_no,
        LAST_INSERT_ID() as payment_id,
        'Term payment created successfully and submitted for review' as message,
        v_membership_fee as amount,
        v_term_name as term_name,
        v_due_date as due_date;
END $$
DELIMITER ;

DELIMITER $$
-- Process term payment and create transaction when user pays
CREATE DEFINER='admin'@'%' PROCEDURE ProcessTermPaymentWithTransaction(
    IN p_payment_id INT,
    IN p_payment_method VARCHAR(50),
    IN p_transaction_reference VARCHAR(100),
    IN p_receipt_image VARCHAR(500)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_org_version_id INT;
    DECLARE v_payment_amount DECIMAL(10,2);
    DECLARE v_payer_name VARCHAR(255);
    DECLARE v_org_name VARCHAR(100);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_cycle_number INT DEFAULT 1;
    
    -- Variables for receipt generation
    DECLARE v_type_char CHAR(1);
    DECLARE v_yyyymm CHAR(6);
    DECLARE v_org_token VARCHAR(10);
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_series_key VARCHAR(50);
    DECLARE v_pad_len INT DEFAULT 6;
    
    -- Get payment details
    SELECT 
        mtp.user_id, mtp.organization_id, mtp.org_version_id, mtp.payment_amount,
        CONCAT(u.f_name, ' ', u.l_name) as payer_name,
        o.name as org_name
    INTO v_user_id, v_organization_id, v_org_version_id, v_payment_amount, v_payer_name, v_org_name
    FROM tbl_membership_term_payment mtp
    JOIN tbl_user u ON mtp.user_id = u.user_id
    JOIN tbl_organization o ON mtp.organization_id = o.organization_id
    WHERE mtp.payment_id = p_payment_id;
    
    -- Get required IDs for transaction
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type WHERE code = 'INCOME';
    
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type WHERE code = 'UPLOAD_PROOF';
    
    SELECT category_id INTO v_category_id 
    FROM tbl_financial_category 
    WHERE code = 'MEMBERSHIP_FEES' AND active = TRUE;
    
    -- Generate receipt number
    SET v_type_char = 'I'; -- Income
    SET v_yyyymm = DATE_FORMAT(NOW(), '%Y%m');
    SET v_org_token = CONCAT('ORG', LPAD(v_organization_id, 3, '0'));
    SET v_prefix = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
    SET v_series_key = v_prefix;
    
    -- Get next receipt number (simplified version)
    SET v_receipt_no = CONCAT(v_prefix, LPAD(FLOOR(RAND() * 1000000), 6, '0'));
    
    -- Create transaction record
    INSERT INTO tbl_transaction (
        user_id, payer_name, payee_name, payment_description, amount,
        transaction_type_id, payment_type_id, category_id, org_version_id, status, 
        transaction_date, receipt_no, proof_image
    ) VALUES (
        v_user_id, v_payer_name, v_org_name, CONCAT('Term Membership Fee - ', v_org_name), v_payment_amount,
        v_transaction_type_id, v_payment_type_id, v_category_id, v_org_version_id, 
        CASE WHEN p_receipt_image IS NOT NULL THEN 'Pending' ELSE 'Completed' END,
        NOW(), v_receipt_no, p_receipt_image
    );
    
    SET v_transaction_id = LAST_INSERT_ID();
    
    -- Link to organization membership
    INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
    VALUES (v_transaction_id, v_organization_id, v_cycle_number);
    
    -- Update term payment record
    UPDATE tbl_membership_term_payment 
    SET 
        payment_status = CASE WHEN p_receipt_image IS NOT NULL THEN 'Pending' ELSE 'Paid' END,
        payment_method = p_payment_method,
        transaction_reference = COALESCE(p_transaction_reference, v_receipt_no),
        payment_date = CURRENT_TIMESTAMP,
        transaction_id = v_transaction_id,
        receipt_url = p_receipt_image
    WHERE payment_id = p_payment_id;
    
    -- Return transaction details
    SELECT 
        v_transaction_id as transaction_id,
        v_receipt_no as receipt_no,
        CASE WHEN p_receipt_image IS NOT NULL 
             THEN 'Payment submitted for review with transaction record' 
             ELSE 'Payment completed and transaction created' 
        END as message;
END $$

DELIMITER ;


CREATE INDEX idx_conversation_global ON tbl_ai_conversation(owner_id, is_global, updated_at DESC);
CREATE INDEX idx_message_created ON tbl_ai_message(conversation_id, created_at ASC);
-- EVENTS

DELIMITER $$
CREATE FUNCTION GetUserOrganizations(user_id VARCHAR(200))
RETURNS JSON
READS SQL DATA
DETERMINISTIC
BEGIN
  DECLARE org_list JSON;
  
  SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'organization_id', o.organization_id,
      'name', o.name,
      'status', o.status,
      'category', o.category,
      'role', CASE 
        WHEN o.adviser_id = user_id THEN 'Adviser'
        WHEN om.member_type IS NOT NULL THEN om.member_type
        ELSE 'Member'
      END
    )
  ) INTO org_list
  FROM tbl_organization o
  LEFT JOIN tbl_organization_members om ON o.organization_id = om.organization_id AND om.user_id = user_id
  WHERE (o.adviser_id = user_id OR om.user_id = user_id)
    AND o.status = 'Approved';
  
  RETURN COALESCE(org_list, JSON_ARRAY());
END$$
DELIMITER ;

CREATE VIEW v_multi_org_messages AS
SELECT 
  m.message_id,
  m.conversation_id,
  m.content,
  m.message_scope,
  m.context_organizations,
  c.owner_id,
  c.entity_type,
  c.is_global,
  m.created_at
FROM tbl_ai_message m
JOIN tbl_ai_conversation c ON m.conversation_id = c.conversation_id
WHERE m.message_scope IN ('multi_org', 'global')
  AND c.is_archived = 0;

-- SAMPLE DATAS
INSERT INTO tbl_role(role_name, is_approver, hierarchy_order)
VALUES("Student",0,null), 
("Adviser",1,1),
("Program Chair",1,2),
("SDAO",1,5),
("Dean",1,3),
("Academic Director",1,4);

-- Create system user for automated logging
INSERT INTO tbl_user (user_id, f_name, l_name, email, role_id, status, created_at)
VALUES (
    'sys-system',
    'System',
    'User',
    'system@nu-dasma.edu.ph',
    (SELECT role_id FROM tbl_role WHERE LOWER(role_name) = 'sdao' LIMIT 1),
    'Active',
    CURRENT_TIMESTAMP
);

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
("VIEW_LOGS","Global"),
("WEB_ACCESS","Global"),
("MANAGE_REGISTRATION","SDAO"),
("SUBMIT_REQUIREMENTS","Global"),
("MANAGE_PROGRAMS","SDAO"),
("CREATE_SDAO_EVENT","SDAO"),
("APPLY_NEW_ORGANIZATION","Global"),
("APPLY_RENEWAL_ORGANIZATION","Organization"),
("VIEW_TRANSACTIONS","Global"),
("MANAGE_TRANSACTIONS","Organization"),
("MANAGE_SDAO_EVENT","SDAO"),
("MANAGE_COLLEGES","SDAO"),
("SCAN_QR", "Organization"),
("MANAGE_TERM_PAYMENTS", "Organization");

INSERT INTO tbl_role_permission (role_id, permission_id) 
VALUES
(4,2),
(4,3),
(4,4),
(4,7),
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
(4,32),
(4,33),
(2,1),
(2,6),
(2,9),
(2,14),
(2,16),
(2,17),
(2,21),
(2,22),
(2,23),
(2,28),
(2,30),
(2,31),
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
(1,24),
(1,25),
(1,17),
(1,19),
(1,20),
(1,21),
(1,22),
(1,29),
(1,31),
(1,34),
(1,35);

-- =====================================
-- TERM PAYMENT SYSTEM TABLES
-- =====================================

-- Academic Terms Table
CREATE TABLE tbl_academic_term (
    term_id INT PRIMARY KEY AUTO_INCREMENT,
    term_name VARCHAR(100) NOT NULL UNIQUE,
    term_description TEXT NULL,
    academic_year VARCHAR(20) NULL, -- e.g., '2024-2025', '2025'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    status ENUM('Draft', 'Active', 'Completed', 'Archived') DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(200) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- Individual Member Term Payments (Simplified)
CREATE TABLE tbl_term_payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(200) NOT NULL,
    organization_id INT NOT NULL,
    organization_version_id INT NOT NULL,
    term_id INT NOT NULL,
    transaction_id INT NOT NULL,  -- Required reference to transaction for payment details
    payment_status ENUM('Pending', 'Paid', 'Rejected', 'Cancelled') DEFAULT 'Pending',
    verified_by VARCHAR(200) NULL,
    verified_at TIMESTAMP NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE CASCADE,
    FOREIGN KEY (term_id) REFERENCES tbl_academic_term(term_id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    
    UNIQUE KEY unique_member_term_payment (user_id, organization_id, organization_version_id, term_id),
    INDEX idx_term_payments_user_org (user_id, organization_id, organization_version_id),
    INDEX idx_term_payments_term (term_id),
    INDEX idx_term_payments_status (payment_status),
    INDEX idx_term_payments_transaction (transaction_id)
);

-- Views for better data access
CREATE VIEW vw_term_payment_overview AS
SELECT 
    tp.payment_id,
    tp.user_id,
    tp.organization_id,
    tp.organization_version_id,
    tp.term_id,
    CONCAT(u.f_name, ' ', u.l_name) as member_name,
    u.email as member_email,
    o.name as organization_name,
    at.term_name,
    at.start_date as term_start,
    at.end_date as term_end,
    t.amount as payment_amount,
    tp.payment_status,
    pt.label as payment_method,
    t.receipt_no as transaction_reference,
    tp.transaction_id,
    t.receipt_no,
    t.transaction_date,
    t.proof_image as receipt_filename,
    CONCAT('/app/organizations/', tp.organization_id, '/', tp.organization_version_id, '/transactions/', t.proof_image) as receipt_url,
    tp.verified_by,
    tp.verified_at,
    tp.notes,
    tp.created_at,
    tp.updated_at
FROM tbl_term_payments tp
JOIN tbl_user u ON tp.user_id = u.user_id
JOIN tbl_organization o ON tp.organization_id = o.organization_id
JOIN tbl_academic_term at ON tp.term_id = at.term_id
JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id;

-- Stored Procedures for Term Payment Management

DELIMITER $$
-- Process Payment Transaction with Transaction System Integration
CREATE DEFINER='admin'@'%' PROCEDURE ProcessTermPaymentTransaction(
    IN p_payment_id INT,
    IN p_payment_method VARCHAR(50),
    IN p_transaction_reference VARCHAR(255)
)
BEGIN
    DECLARE v_user_id VARCHAR(200);
    DECLARE v_organization_id INT;
    DECLARE v_org_version_id INT;
    DECLARE v_payment_amount DECIMAL(10,2);
    DECLARE v_payer_name VARCHAR(255);
    DECLARE v_transaction_type_id INT;
    DECLARE v_payment_type_id INT;
    DECLARE v_category_id INT;
    DECLARE v_transaction_id INT;
    DECLARE v_cycle_number INT;
    DECLARE v_receipt_no VARCHAR(100);
    DECLARE v_series_key VARCHAR(100);
    DECLARE v_prefix VARCHAR(50);
    DECLARE v_type_char CHAR(1);
    DECLARE v_yyyymm VARCHAR(6);
    DECLARE v_org_token VARCHAR(10);
    DECLARE v_pad_len INT DEFAULT 6;

    -- Get payment details
    SELECT 
        mtp.user_id, 
        mtp.organization_id, 
        mtp.org_version_id, 
        mtp.payment_amount,
        CONCAT(u.first_name, ' ', u.last_name) as payer_name
    INTO 
        v_user_id, 
        v_organization_id, 
        v_org_version_id, 
        v_payment_amount,
        v_payer_name
    FROM tbl_membership_term_payment mtp
    JOIN tbl_user u ON mtp.user_id = u.user_id
    WHERE mtp.payment_id = p_payment_id;

    -- Get current renewal cycle for the organization
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle 
    WHERE organization_id = v_organization_id 
    AND is_active = TRUE 
    LIMIT 1;

    -- Get transaction type ID for INCOME
    SELECT transaction_type_id INTO v_transaction_type_id 
    FROM tbl_transaction_type 
    WHERE code = 'INCOME' LIMIT 1;

    -- Get payment type ID based on method
    SELECT payment_type_id INTO v_payment_type_id 
    FROM tbl_payment_type 
    WHERE code = UPPER(p_payment_method) LIMIT 1;
    
    -- If payment type not found, use default
    IF v_payment_type_id IS NULL THEN 
        SELECT payment_type_id INTO v_payment_type_id 
        FROM tbl_payment_type 
        WHERE code = 'CASH' LIMIT 1;
    END IF;

    -- Get category ID for Membership Fees
    SELECT category_id INTO v_category_id 
    FROM tbl_financial_category 
    WHERE code = 'MEMBERSHIP_FEES' 
      AND active = TRUE 
    LIMIT 1;
    
    -- If specific membership category not found, try any income category
    IF v_category_id IS NULL THEN
        SELECT category_id INTO v_category_id 
        FROM tbl_financial_category 
        WHERE kind = 'INCOME' 
          AND active = TRUE 
        LIMIT 1;
    END IF;

    -- Generate receipt number for transaction
    SET v_type_char = 'I'; -- Income
    SET v_yyyymm = DATE_FORMAT(NOW(), '%Y%m');
    SET v_org_token = CONCAT('ORG', LPAD(v_organization_id, 3, '0'));
    SET v_prefix = CONCAT(v_type_char, '-', v_yyyymm, '-', v_org_token, '-');
    SET v_series_key = v_prefix;
    CALL NextReceiptNo(v_series_key, v_prefix, v_pad_len, v_receipt_no);

    -- Create main transaction record
    INSERT INTO tbl_transaction (
        user_id, payer_name, payee_name, payment_description, amount,
        transaction_type_id, payment_type_id, category_id, org_version_id, status, 
        transaction_date, receipt_no, proof_image
    ) VALUES (
        v_user_id, v_payer_name, 'NU Connect', 'Term Membership Fee', v_payment_amount,
        v_transaction_type_id, v_payment_type_id, v_category_id, v_org_version_id, 'Completed', 
        NOW(), v_receipt_no, NULL
    );

    SET v_transaction_id = LAST_INSERT_ID();

    -- Link to organization (membership transaction)
    INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
    VALUES (v_transaction_id, v_organization_id, COALESCE(v_cycle_number, 1));

    -- Update term payment record with transaction details
    UPDATE tbl_membership_term_payment 
    SET 
        payment_status = 'Paid',
        payment_method = p_payment_method,
        transaction_reference = COALESCE(p_transaction_reference, v_receipt_no),
        payment_date = CURRENT_TIMESTAMP,
        transaction_id = v_transaction_id
    WHERE payment_id = p_payment_id;
    
    -- Log the payment history
    INSERT INTO tbl_term_payment_history (
        payment_id, previous_status, new_status, action_type, changed_by
    ) VALUES (
        p_payment_id, 'Pending', 'Paid', 'PAYMENT_RECEIVED', 'SYSTEM'
    );

    -- Return transaction details
    SELECT 
        v_transaction_id as transaction_id,
        v_receipt_no as receipt_no,
        'Term payment processed and transaction created' as message;
END $$
DELIMITER ;

DELIMITER $$
-- Get Member Term Payment History
CREATE DEFINER='admin'@'%' PROCEDURE GetMemberTermPaymentHistory(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT
)
BEGIN
    SELECT * FROM vw_term_payment_overview 
    WHERE user_id = p_user_id 
    AND organization_id = p_organization_id
    ORDER BY term_start DESC, created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
-- Generate Term Payments for Organization
CREATE DEFINER='admin'@'%' PROCEDURE GenerateTermPaymentsForOrganization(
    IN p_organization_id INT,
    IN p_org_version_id INT,
    IN p_term_id INT
)
BEGIN
    DECLARE v_payment_amount DECIMAL(10,2) DEFAULT 0.00;
    
    -- Get payment amount from organization configuration
    SELECT payment_amount INTO v_payment_amount
    FROM tbl_organization_term_config
    WHERE organization_id = p_organization_id 
    AND org_version_id = p_org_version_id
    AND term_id = p_term_id;
    
    -- Create payments for all active members
    INSERT INTO tbl_membership_term_payment (
        application_id, term_id, organization_id, org_version_id,
        user_id, payment_amount, due_date
    )
    SELECT 
        ma.application_id,
        p_term_id,
        p_organization_id,
        p_org_version_id,
        ma.user_id,
        v_payment_amount,
        COALESCE(otc.due_date, at.end_date)
    FROM tbl_membership_application ma
    JOIN tbl_academic_term at ON at.term_id = p_term_id
    LEFT JOIN tbl_organization_term_config otc ON otc.organization_id = p_organization_id 
        AND otc.org_version_id = p_org_version_id
        AND otc.term_id = p_term_id
    WHERE ma.organization_id = p_organization_id
    AND ma.status = 'Approved'
    AND NOT EXISTS (
        SELECT 1 FROM tbl_membership_term_payment mtp 
        WHERE mtp.application_id = ma.application_id 
        AND mtp.term_id = p_term_id
    );
END $$
DELIMITER ;

DELIMITER $$
-- Get Term Payment Analytics
CREATE DEFINER='admin'@'%' PROCEDURE GetTermPaymentAnalytics(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        COUNT(*) as total_members,
        SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN payment_status = 'Overdue' THEN 1 ELSE 0 END) as overdue_count,
        SUM(payment_amount) as total_expected,
        SUM(CASE WHEN payment_status = 'Paid' THEN payment_amount ELSE 0 END) as total_collected,
        ROUND(SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as payment_rate,
        AVG(DATEDIFF(payment_date, created_at)) as avg_payment_days
    FROM tbl_membership_term_payment
    WHERE organization_id = p_organization_id
    AND term_id = p_term_id;
END $$
DELIMITER ;

DELIMITER $$
-- Get user term payments by user and organization (Updated for simplified structure)
CREATE DEFINER='admin'@'%' PROCEDURE GetUserTermPayments(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT
)
BEGIN
    SELECT 
        tp.payment_id,
        tp.user_id,
        tp.organization_id,
        tp.term_id,
        tp.transaction_id,
        tp.payment_status,
        tp.verified_by,
        tp.verified_at,
        tp.notes,
        tp.created_at,
        tp.updated_at,
        -- From transaction table
        t.amount as payment_amount,
        pt.label as payment_method,
        t.receipt_no as transaction_reference,
        t.transaction_date as payment_date,
        t.proof_image as receipt_url,
        t.receipt_no,
        -- From term table
        at.term_name,
        at.start_date as term_start,
        at.end_date as term_end,
        -- From organization table
        o.name as organization_name
    FROM tbl_term_payments tp
    JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
    JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
    JOIN tbl_academic_term at ON tp.term_id = at.term_id
    JOIN tbl_organization o ON tp.organization_id = o.organization_id
    WHERE tp.user_id = p_user_id 
    AND tp.organization_id = p_organization_id
    ORDER BY at.start_date DESC, tp.created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
-- Update payment receipt (Updated for simplified structure)
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTermPaymentReceipt(
    IN p_payment_id INT,
    IN p_receipt_image VARCHAR(500),
    IN p_notes TEXT,
    IN p_user_id VARCHAR(200)
)
BEGIN
    DECLARE v_transaction_id INT;
    
    -- Get transaction ID from term payment
    SELECT transaction_id INTO v_transaction_id
    FROM tbl_term_payments 
    WHERE payment_id = p_payment_id 
    AND user_id = p_user_id;
    
    IF v_transaction_id IS NOT NULL THEN
        -- Update transaction with new proof image
        UPDATE tbl_transaction
        SET proof_image = p_receipt_image
        WHERE transaction_id = v_transaction_id;
        
        -- Update term payment with notes and set status to Pending
        UPDATE tbl_term_payments 
        SET 
            notes = p_notes,
            payment_status = 'Pending',
            updated_at = NOW()
        WHERE payment_id = p_payment_id 
        AND user_id = p_user_id;
        
        SELECT ROW_COUNT() as affected_rows;
    ELSE
        SELECT 0 as affected_rows;
    END IF;
END $$
DELIMITER ;

DELIMITER $$
-- Update payment status (Updated for simplified structure)
CREATE DEFINER='admin'@'%' PROCEDURE UpdateTermPaymentStatus(
    IN p_payment_id INT,
    IN p_payment_status VARCHAR(50),
    IN p_verified_by VARCHAR(200),
    IN p_notes TEXT
)
BEGIN
    DECLARE v_transaction_id INT;
    
    -- Get transaction ID from term payment
    SELECT transaction_id INTO v_transaction_id
    FROM tbl_term_payments 
    WHERE payment_id = p_payment_id;
    
    IF v_transaction_id IS NOT NULL THEN
        -- Update transaction status if payment is approved
        IF p_payment_status = 'Paid' THEN
            UPDATE tbl_transaction
            SET status = 'Completed'
            WHERE transaction_id = v_transaction_id;
        ELSEIF p_payment_status = 'Rejected' THEN
            UPDATE tbl_transaction
            SET status = 'Rejected'
            WHERE transaction_id = v_transaction_id;
        END IF;
        
        -- Update term payment status
        UPDATE tbl_term_payments 
        SET 
            payment_status = p_payment_status,
            verified_by = p_verified_by,
            verified_at = NOW(),
            notes = p_notes,
            updated_at = NOW()
        WHERE payment_id = p_payment_id;
        
        SELECT ROW_COUNT() as affected_rows;
    ELSE
        SELECT 0 as affected_rows;
    END IF;
END $$
DELIMITER ;

DELIMITER $$
-- Get current active term using date ranges
CREATE DEFINER='admin'@'%' PROCEDURE GetCurrentActiveTerm()
BEGIN
    SELECT 
        term_id,
        term_name,
        term_description,
        start_date,
        end_date,
        is_active,
        status,
        created_at,
        DATE(NOW()) BETWEEN start_date AND end_date as is_current_term
    FROM tbl_academic_term
    WHERE DATE(NOW()) BETWEEN start_date AND end_date
    ORDER BY start_date DESC
    LIMIT 1;
END $$
DELIMITER ;

DELIMITER $$
-- Get all term payments for an organization and term
CREATE DEFINER='admin'@'%' PROCEDURE GetOrganizationTermPayments(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT * FROM vw_term_payment_overview
    WHERE organization_id = p_organization_id 
    AND term_id = p_term_id
    ORDER BY member_name, created_at DESC;
END $$
DELIMITER ;

DELIMITER $$
-- Get term payment analytics for simplified structure
CREATE DEFINER='admin'@'%' PROCEDURE GetTermPaymentAnalyticsSimplified(
    IN p_organization_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        COUNT(*) as total_payments,
        SUM(CASE WHEN tp.payment_status = 'Paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN tp.payment_status = 'Pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN tp.payment_status = 'Rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN tp.payment_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(t.amount) as total_amount,
        SUM(CASE WHEN tp.payment_status = 'Paid' THEN t.amount ELSE 0 END) as collected_amount,
        ROUND(SUM(CASE WHEN tp.payment_status = 'Paid' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as payment_rate,
        AVG(CASE WHEN tp.payment_status = 'Paid' THEN DATEDIFF(tp.verified_at, tp.created_at) END) as avg_approval_days
    FROM tbl_term_payments tp
    JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
    WHERE tp.organization_id = p_organization_id
    AND tp.term_id = p_term_id;
END $$
DELIMITER ;

DELIMITER $$
-- Get pending term payments for approval
CREATE DEFINER='admin'@'%' PROCEDURE GetPendingTermPayments(
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT * FROM vw_term_payment_overview
    WHERE organization_id = p_organization_id 
    AND (p_organization_version_id IS NULL OR organization_version_id = p_organization_version_id)
    AND (p_term_id IS NULL OR term_id = p_term_id)
    AND payment_status = 'Pending'
    ORDER BY created_at ASC;
END $$
DELIMITER ;

DELIMITER $$
-- Check if user has paid for specific term
CREATE DEFINER='admin'@'%' PROCEDURE CheckUserTermPaymentStatus(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_term_id INT
)
BEGIN
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 'No Payment'
            WHEN SUM(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) > 0 THEN 'Paid'
            WHEN SUM(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) > 0 THEN 'Pending'
            ELSE 'Not Paid'
        END as payment_status,
        COUNT(*) as payment_count
    FROM tbl_term_payments
    WHERE user_id = p_user_id 
    AND organization_id = p_organization_id
    AND organization_version_id = p_organization_version_id
    AND term_id = p_term_id;
END $$
DELIMITER ;

-- Insert default transaction types
INSERT INTO tbl_transaction_type (code, label) VALUES
('INCOME', 'Income'),
('EXPENSE', 'Expense');

-- Insert default payment types
INSERT INTO tbl_payment_type (code, label, method_group) VALUES
('CASH', 'Cash', 'physical'),
('BANK', 'Bank Transfer', 'electronic'),
('GCASH', 'GCash', 'eWallet');

-- Insert default financial categories
INSERT INTO tbl_financial_category (code, label, kind, active) VALUES
('MEMBERSHIP', 'Membership Fees', 'INCOME', TRUE),
('EVENT_FEE', 'Event Fee', 'INCOME', TRUE),
('DONATION', 'Donation', 'INCOME', TRUE),
('SPONSORSHIP', 'Sponsorship', 'INCOME', TRUE),
('OFFICE_SUPPLIES', 'Office Supplies', 'EXPENSE', TRUE),
('VENUE_RENTAL', 'Venue Rental', 'EXPENSE', TRUE);

-- Link categories to transaction types
INSERT INTO tbl_transaction_type_category (transaction_type_id, category_id)
SELECT tt.transaction_type_id, fc.category_id
FROM tbl_transaction_type tt, tbl_financial_category fc
WHERE (tt.code = 'INCOME' AND fc.kind = 'INCOME')
   OR (tt.code = 'EXPENSE' AND fc.kind = 'EXPENSE');



-- =====================================
-- MOBILE TERM PAYMENT STORED PROCEDURES
-- =====================================

DELIMITER $$

-- Procedure 1: Create Transaction with Membership (Real-time for transactions)
CREATE DEFINER='root'@'%' PROCEDURE CreateTransactionWithMembership(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_receipt_filename VARCHAR(255),
    IN p_payment_method VARCHAR(50),
    OUT p_transaction_id INT,
    OUT p_cycle_number INT,
    OUT p_amount DECIMAL(10,2),
    OUT p_result_message VARCHAR(500)
)
BEGIN
    DECLARE v_payment_type_id INT DEFAULT 5;
    DECLARE v_payer_name VARCHAR(255);
    DECLARE v_org_name VARCHAR(255);
    DECLARE v_cycle_number INT DEFAULT 1;
    DECLARE v_payment_description TEXT;
    DECLARE v_membership_fee_amount DECIMAL(10,2) DEFAULT 100.00;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            p_result_message = MESSAGE_TEXT;
        SET p_result_message = CONCAT('Transaction Error: ', p_result_message);
    END;
    
    START TRANSACTION;
    
    -- Map payment method to payment_type_id
    CASE UPPER(p_payment_method)
        WHEN 'CASH' THEN SET v_payment_type_id = 1;
        WHEN 'BANK' THEN SET v_payment_type_id = 2;
        WHEN 'BANK_TRANSFER' THEN SET v_payment_type_id = 2;
        WHEN 'GCASH' THEN SET v_payment_type_id = 3;
        WHEN 'ONLINE_PAYMENT' THEN SET v_payment_type_id = 3;
        ELSE SET v_payment_type_id = 5; -- Default UPLOAD_PROOF
    END CASE;
    
    -- Get user details for payer name
    SELECT CONCAT(f_name, ' ', l_name) INTO v_payer_name
    FROM tbl_user 
    WHERE user_id = p_user_id;
    
    IF v_payer_name IS NULL THEN
        SET v_payer_name = 'Unknown User';
    END IF;
    
    -- Get organization details and membership fee amount
    SELECT name, membership_fee_amount INTO v_org_name, v_membership_fee_amount
    FROM tbl_organization 
    WHERE organization_id = p_organization_id;
    
    IF v_org_name IS NULL THEN
        SET v_org_name = 'Unknown Organization';
    END IF;
    
    -- If organization membership_fee_amount is NULL, try getting from organization version
    IF v_membership_fee_amount IS NULL THEN
        SELECT membership_fee_amount INTO v_membership_fee_amount
        FROM tbl_organization_version 
        WHERE organization_id = p_organization_id AND organization_version_id = p_organization_version_id;
    END IF;
    
    -- If still NULL, use default amount
    IF v_membership_fee_amount IS NULL THEN
        SET v_membership_fee_amount = 100.00;
    END IF;
    
    SET v_payment_description = CONCAT('Term membership payment for ', v_org_name);
    
    -- Create Transaction
    INSERT INTO tbl_transaction 
    (user_id, payer_name, payment_description, amount, transaction_type_id, payment_type_id, 
     category_id, org_version_id, status, transaction_date, proof_image, created_at, updated_at)
    VALUES (p_user_id, v_payer_name, v_payment_description, v_membership_fee_amount, 1, v_payment_type_id, 
            1, p_organization_version_id, 'Pending', NOW(), p_receipt_filename, NOW(), NOW());
    
    SET p_transaction_id = LAST_INSERT_ID();
    
    -- Get or Create Renewal Cycle
    SELECT cycle_number INTO v_cycle_number
    FROM tbl_renewal_cycle 
    WHERE organization_id = p_organization_id
    ORDER BY cycle_number DESC 
    LIMIT 1;
    
    -- If no cycle exists, create a default one
    IF v_cycle_number IS NULL THEN
        SET v_cycle_number = 1;
        INSERT INTO tbl_renewal_cycle (organization_id, org_version_id, cycle_number, created_at, updated_at)
        VALUES (p_organization_id, p_organization_version_id, v_cycle_number, NOW(), NOW());
    END IF;
    
    -- Create Transaction Membership
    INSERT INTO tbl_transaction_membership 
    (transaction_id, organization_id, cycle_number)
    VALUES (p_transaction_id, p_organization_id, v_cycle_number);
    
    SET p_cycle_number = v_cycle_number;
    SET p_amount = v_membership_fee_amount;
    SET p_result_message = 'Transaction and membership created successfully';
    
    COMMIT;
END$$

-- Procedure 2: Create Term Payment (Real-time for term payments)
CREATE DEFINER='admin'@'%' PROCEDURE CreateTermPayment(
    IN p_user_id VARCHAR(200),
    IN p_organization_id INT,
    IN p_organization_version_id INT,
    IN p_term_id INT,
    IN p_transaction_id INT,
    OUT p_payment_id INT,
    OUT p_result_message VARCHAR(500)
)
proc_label: BEGIN
    DECLARE v_current_term_id INT DEFAULT NULL;
    DECLARE v_existing_payment_id INT DEFAULT NULL;
    DECLARE v_existing_payment_status VARCHAR(50) DEFAULT NULL;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        GET DIAGNOSTICS CONDITION 1
            p_result_message = MESSAGE_TEXT;
        SET p_result_message = CONCAT('Payment Error: ', p_result_message);
        SET p_payment_id = NULL;
    END;
    
    -- Initialize OUT parameters
    SET p_payment_id = NULL;
    SET p_result_message = NULL;
    
    START TRANSACTION;
    
    -- Get current term if not provided
    IF p_term_id IS NULL THEN
        SELECT term_id INTO v_current_term_id
        FROM tbl_academic_term 
        WHERE CURDATE() BETWEEN start_date AND end_date 
        ORDER BY term_id DESC 
        LIMIT 1;
        
        IF v_current_term_id IS NULL THEN
            SET p_result_message = 'No active academic term found';
            SET p_payment_id = NULL;
            ROLLBACK;
            LEAVE proc_label;
        END IF;
    ELSE
        SET v_current_term_id = p_term_id;
    END IF;
    
    -- Check if payment already exists for this user, organization, and term
    SELECT payment_id, payment_status INTO v_existing_payment_id, v_existing_payment_status
    FROM tbl_term_payments 
    WHERE user_id = p_user_id 
    AND organization_id = p_organization_id 
    AND organization_version_id = p_organization_version_id 
    AND term_id = v_current_term_id;
    
    -- If payment exists and is not rejected, return error
    IF v_existing_payment_id IS NOT NULL THEN
        IF v_existing_payment_status = 'Rejected' THEN
            -- Delete the rejected payment to allow retry
            DELETE FROM tbl_term_payments WHERE payment_id = v_existing_payment_id;
        ELSEIF v_existing_payment_status = 'Pending' THEN
            SET p_result_message = 'Payment already exists and is pending review';
            SET p_payment_id = NULL;
            ROLLBACK;
            LEAVE proc_label;
        ELSEIF v_existing_payment_status = 'Paid' THEN
            SET p_result_message = 'Payment already completed for this term';
            SET p_payment_id = NULL;
            ROLLBACK;
            LEAVE proc_label;
        ELSE
            SET p_result_message = CONCAT('Payment already exists with status: ', v_existing_payment_status);
            SET p_payment_id = NULL;
            ROLLBACK;
            LEAVE proc_label;
        END IF;
    END IF;
    
    -- Create Term Payment
    INSERT INTO tbl_term_payments 
    (term_id, organization_id, organization_version_id, user_id, transaction_id, payment_status, created_at, updated_at)
    VALUES (v_current_term_id, p_organization_id, p_organization_version_id, p_user_id, p_transaction_id, 'Pending', NOW(), NOW());
    
    SET p_payment_id = LAST_INSERT_ID();
    SET p_result_message = 'Term payment created successfully';
    
    COMMIT;
END$$

DELIMITER ;

DELIMITER $$
DROP PROCEDURE IF EXISTS populate_all_demo $$

CREATE PROCEDURE populate_all_demo()
BEGIN
DECLARE ov1 INT; DECLARE ov2 INT; DECLARE ov3 INT; DECLARE ov4 INT;
DECLARE org1 INT; DECLARE org2 INT; DECLARE org3 INT; DECLARE org4 INT;
DECLARE er1 INT; DECLARE er2 INT; DECLARE er3 INT; DECLARE er4 INT;

DECLARE i INT; DECLARE n INT; DECLARE idx INT;
DECLARE mon CHAR(2); DECLARE day CHAR(2); DECLARE dt DATE;
DECLARE vt VARCHAR(20); DECLARE vv VARCHAR(100);
DECLARE stuid VARCHAR(20); DECLARE prog INT;

DECLARE cur_event_id INT; DECLARE cur_org_id INT; DECLARE cur_start_date DATE;
DECLARE done INT DEFAULT 0;

DECLARE perm_create_event INT; DECLARE perm_view_committee INT;
DECLARE perm_update_event INT; DECLARE perm_delete_event INT;

DECLARE txn_type_income INT; DECLARE txn_type_expense INT;
DECLARE pay_cash INT; DECLARE pay_bank INT; DECLARE pay_gcash INT;
DECLARE cat_membership INT; DECLARE cat_sponsorship INT; DECLARE cat_office INT; DECLARE cat_event_fee INT;

DECLARE app_period_id INT;

DECLARE ev_cur CURSOR FOR
SELECT e.event_id, e.organization_id, e.start_date
FROM tbl_event AS e;
DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

SET @sdao := '6mfvyVan6vlls4M78nSj7B5cGt1B7-bSSvPLzT28CQ0';

/* 1) Core users */
INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('ADV001','Ava','Adviser','ava.adviser@nu-dasma.edu.ph', NULL, 2, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('ADV002','Ben','Adviser','ben.adviser@nu-dasma.edu.ph', NULL, 2, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('ADV003','Cara','Adviser','cara.adviser@nu-dasma.edu.ph', NULL, 2, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('ADV004','Drew','Adviser','drew.adviser@nu-dasma.edu.ph', NULL, 2, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('PRE001','Paolo','Perez','pre001@students.nu-dasma.edu.ph', 13, 1, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('PRE002','Bianca','Bautista','pre002@students.nu-dasma.edu.ph', 8, 1, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('PRE003','Miguel','Morales','pre003@students.nu-dasma.edu.ph', 1, 1, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES ('PRE004','Sofia','Santos','pre004@students.nu-dasma.edu.ph', 12, 1, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;

/* 2) Organization versions */
INSERT INTO tbl_organization_version (name, status, created_by)
VALUES ('Tech Innovators Society AY2025', 'Approved', @sdao);
SET ov1 = LAST_INSERT_ID();

INSERT INTO tbl_organization_version (name, status, created_by)
VALUES ('Business Leaders Guild AY2025', 'Approved', @sdao);
SET ov2 = LAST_INSERT_ID();

INSERT INTO tbl_organization_version (name, status, created_by)
VALUES ('Arts & Culture Circle AY2025', 'Approved', @sdao);
SET ov3 = LAST_INSERT_ID();

INSERT INTO tbl_organization_version (name, status, created_by)
VALUES ('Green Earth Advocates AY2025', 'Approved', @sdao);
SET ov4 = LAST_INSERT_ID();

/* 3) Organizations */
INSERT INTO tbl_organization (adviser_id, current_org_version_id, name, description, base_program_id, logo, status, membership_fee_type, category, membership_fee_amount, is_recruiting, is_open_to_all_courses, archived_at, archived_by, archived_reason)
VALUES ('ADV001', ov1, 'Tech Innovators Society', 'Organization focused on technology innovation and hackathons', 13, NULL, 'Approved', 'Free', 'Co-Curricular Organization', NULL, TRUE, TRUE, NULL, NULL, NULL);
SET org1 = LAST_INSERT_ID();
UPDATE tbl_organization_version SET organization_id=org1, name='Tech Innovators Society' WHERE org_version_id=ov1;

INSERT INTO tbl_organization (adviser_id, current_org_version_id, name, description, base_program_id, logo, status, membership_fee_type, category, membership_fee_amount, is_recruiting, is_open_to_all_courses, archived_at, archived_by, archived_reason)
VALUES ('ADV002', ov2, 'Business Leaders Guild', 'Leadership and business case org', 8, NULL, 'Approved', 'Free', 'Co-Curricular Organization', NULL, TRUE, TRUE, NULL, NULL, NULL);
SET org2 = LAST_INSERT_ID();
UPDATE tbl_organization_version SET organization_id=org2, name='Business Leaders Guild' WHERE org_version_id=ov2;

INSERT INTO tbl_organization (adviser_id, current_org_version_id, name, description, base_program_id, logo, status, membership_fee_type, category, membership_fee_amount, is_recruiting, is_open_to_all_courses, archived_at, archived_by, archived_reason)
VALUES ('ADV003', ov3, 'Arts & Culture Circle', 'Fosters arts, culture, and performances', 1, NULL, 'Approved', 'Free', 'Co-Curricular Organization', NULL, TRUE, TRUE, NULL, NULL, NULL);
SET org3 = LAST_INSERT_ID();
UPDATE tbl_organization_version SET organization_id=org3, name='Arts & Culture Circle' WHERE org_version_id=ov3;

INSERT INTO tbl_organization (adviser_id, current_org_version_id, name, description, base_program_id, logo, status, membership_fee_type, category, membership_fee_amount, is_recruiting, is_open_to_all_courses, archived_at, archived_by, archived_reason)
VALUES ('ADV004', ov4, 'Green Earth Advocates', 'Environmental sustainability and green initiatives', 11, NULL, 'Approved', 'Free', 'Co-Curricular Organization', NULL, TRUE, TRUE, NULL, NULL, NULL);
SET org4 = LAST_INSERT_ID();
UPDATE tbl_organization_version SET organization_id=org4, name='Green Earth Advocates' WHERE org_version_id=ov4;

/* 4) Renewal cycles */
INSERT INTO tbl_renewal_cycle (organization_id, cycle_number, start_date, president_id, org_version_id, created_at)
VALUES (org1,1,'2025-06-01','PRE001',ov1,NOW()),
(org2,1,'2025-06-01','PRE002',ov2,NOW()),
(org3,1,'2025-06-01','PRE003',ov3,NOW()),
(org4,1,'2025-06-01','PRE004',ov4,NOW());

/* 5) Executive roles + memberships */
INSERT INTO tbl_executive_role (organization_id, cycle_number, role_title, rank_id, created_at)
VALUES (org1,1,'President',1,NOW());
SET er1 = LAST_INSERT_ID();

INSERT INTO tbl_executive_role (organization_id, cycle_number, role_title, rank_id, created_at)
VALUES (org2,1,'President',1,NOW());
SET er2 = LAST_INSERT_ID();

INSERT INTO tbl_executive_role (organization_id, cycle_number, role_title, rank_id, created_at)
VALUES (org3,1,'President',1,NOW());
SET er3 = LAST_INSERT_ID();

INSERT INTO tbl_executive_role (organization_id, cycle_number, role_title, rank_id, created_at)
VALUES (org4,1,'President',1,NOW());
SET er4 = LAST_INSERT_ID();

INSERT INTO tbl_organization_members (organization_id, cycle_number, user_id, org_version_id, member_type, status, executive_role_id, joined_at)
VALUES (org1,1,'PRE001',ov1,'Executive','Active',er1,NOW()),
(org2,1,'PRE002',ov2,'Executive','Active',er2,NOW()),
(org3,1,'PRE003',ov3,'Executive','Active',er3,NOW()),
(org4,1,'PRE004',ov4,'Executive','Active',er4,NOW());

/* 6) 600 student users */
SET i = 1;
WHILE i <= 600 DO
SET stuid = CONCAT('STU', LPAD(i, 3, '0'));
SET prog = 1 + FLOOR(RAND()*16);
INSERT INTO tbl_user (user_id, f_name, l_name, email, program_id, role_id, profile_picture, status, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES (stuid, CONCAT('Student', i), CONCAT('User', i), CONCAT('student', LPAD(i,3,'0'), '@students.nu-dasma.edu.ph'), prog, 1, NULL, 'Active', NOW(), NOW(), NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE user_id=user_id;
SET i = i + 1;
END WHILE;

/* 7) Members: 150 per org */
SET i = 1;
WHILE i <= 150 DO
SET stuid = CONCAT('STU', LPAD(i,3,'0'));
IF NOT EXISTS (SELECT 1 FROM tbl_organization_members m WHERE m.organization_id=org1 AND m.cycle_number=1 AND m.user_id=stuid) THEN
INSERT INTO tbl_organization_members (organization_id, cycle_number, user_id, org_version_id, member_type, status, executive_role_id, joined_at)
VALUES (org1,1,stuid,ov1,'Member','Active',NULL,NOW());
END IF;
SET i = i + 1;
END WHILE;

SET i = 151;
WHILE i <= 300 DO
SET stuid = CONCAT('STU', LPAD(i,3,'0'));
IF NOT EXISTS (SELECT 1 FROM tbl_organization_members m WHERE m.organization_id=org2 AND m.cycle_number=1 AND m.user_id=stuid) THEN
INSERT INTO tbl_organization_members (organization_id, cycle_number, user_id, org_version_id, member_type, status, executive_role_id, joined_at)
VALUES (org2,1,stuid,ov2,'Member','Active',NULL,NOW());
END IF;
SET i = i + 1;
END WHILE;

SET i = 301;
WHILE i <= 450 DO
SET stuid = CONCAT('STU', LPAD(i,3,'0'));
IF NOT EXISTS (SELECT 1 FROM tbl_organization_members m WHERE m.organization_id=org3 AND m.cycle_number=1 AND m.user_id=stuid) THEN
INSERT INTO tbl_organization_members (organization_id, cycle_number, user_id, org_version_id, member_type, status, executive_role_id, joined_at)
VALUES (org3,1,stuid,ov3,'Member','Active',NULL,NOW());
END IF;
SET i = i + 1;
END WHILE;

SET i = 451;
WHILE i <= 600 DO
SET stuid = CONCAT('STU', LPAD(i,3,'0'));
IF NOT EXISTS (SELECT 1 FROM tbl_organization_members m WHERE m.organization_id=org4 AND m.cycle_number=1 AND m.user_id=stuid) THEN
INSERT INTO tbl_organization_members (organization_id, cycle_number, user_id, org_version_id, member_type, status, executive_role_id, joined_at)
VALUES (org4,1,stuid,ov4,'Member','Active',NULL,NOW());
END IF;
SET i = i + 1;
END WHILE;

/* 8) Committees + roles + members */
INSERT INTO tbl_committee (organization_id, cycle_number, name, description, created_at)
VALUES (org1,1,'Technical Committee','Handles tech ops',NOW()),
(org1,1,'Finance Committee','Handles finances',NOW()),
(org1,1,'Marketing Committee','Handles promotions',NOW()),
(org2,1,'Strategy Committee','Business strategy',NOW()),
(org2,1,'Outreach Committee','Outreach and partners',NOW()),
(org2,1,'Logistics Committee','Operations/logistics',NOW()),
(org3,1,'Performance Committee','Arts performances',NOW()),
(org3,1,'Curation Committee','Arts curation',NOW()),
(org3,1,'Production Committee','Production and sets',NOW()),
(org4,1,'Sustainability Committee','Green projects',NOW()),
(org4,1,'Education Committee','Education and campaigns',NOW()),
(org4,1,'Operations Committee','Operations',NOW());

INSERT INTO tbl_committee_role (committee_id, role_name, created_at)
SELECT c.committee_id, 'Committee Head', NOW() FROM tbl_committee c
WHERE c.organization_id IN (org1,org2,org3,org4)
ON DUPLICATE KEY UPDATE committee_role_id=committee_role_id;

INSERT INTO tbl_committee_role (committee_id, role_name, created_at)
SELECT c.committee_id, 'Committee Officer', NOW() FROM tbl_committee c
WHERE c.organization_id IN (org1,org2,org3,org4)
ON DUPLICATE KEY UPDATE committee_role_id=committee_role_id;

SET i = 0;
WHILE i < 12 DO
SET @cid := (SELECT c2.committee_id FROM tbl_committee c2 ORDER BY c2.committee_id LIMIT i,1);
SET @corg := (SELECT c2.organization_id FROM tbl_committee c2 WHERE c2.committee_id=@cid);
SET @head_role := (SELECT cr.committee_role_id FROM tbl_committee_role cr WHERE cr.committee_id=@cid AND cr.role_name='Committee Head' LIMIT 1);
SET @off_role := (SELECT cr.committee_role_id FROM tbl_committee_role cr WHERE cr.committee_id=@cid AND cr.role_name='Committee Officer' LIMIT 1);
INSERT INTO tbl_committee_members (committee_id, user_id, committee_role_id, created_at)
SELECT @cid, m.user_id, @head_role, NOW()
FROM tbl_organization_members m
WHERE m.organization_id=@corg AND m.member_type='Member'
  AND NOT EXISTS (SELECT 1 FROM tbl_committee_members cm WHERE cm.user_id=m.user_id AND cm.committee_id=@cid)
ORDER BY RAND() LIMIT 1;

INSERT INTO tbl_committee_members (committee_id, user_id, committee_role_id, created_at)
SELECT @cid, m.user_id, @off_role, NOW()
FROM tbl_organization_members m
WHERE m.organization_id=@corg AND m.member_type='Member'
  AND NOT EXISTS (SELECT 1 FROM tbl_committee_members cm WHERE cm.user_id=m.user_id AND cm.committee_id=@cid)
ORDER BY RAND() LIMIT 5;

SET i = i + 1;
END WHILE;

SET perm_create_event = (SELECT p.permission_id FROM tbl_permission p WHERE p.permission_name='CREATE_EVENT' LIMIT 1);
SET perm_view_committee = (SELECT p.permission_id FROM tbl_permission p WHERE p.permission_name='VIEW_COMMITTEE' LIMIT 1);
SET perm_update_event = (SELECT p.permission_id FROM tbl_permission p WHERE p.permission_name='UPDATE_EVENT' LIMIT 1);
SET perm_delete_event = (SELECT p.permission_id FROM tbl_permission p WHERE p.permission_name='DELETE_EVENT' LIMIT 1);

INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id, created_at)
SELECT cr.committee_role_id, perm_view_committee, NOW() FROM tbl_committee_role cr
WHERE cr.role_name IN ('Committee Head','Committee Officer');

INSERT INTO tbl_committee_role_permission (committee_role_id, permission_id, created_at)
SELECT cr.committee_role_id, perm_create_event, NOW() FROM tbl_committee_role cr
WHERE cr.role_name='Committee Head';

/* 9) Events (9/org) */
-- Org1
SET n = 1;
WHILE n <= 9 DO
IF n<=3 THEN SET mon='07'; ELSEIF n<=6 THEN SET mon='08'; ELSE SET mon='09'; END IF;
SET idx = (n-1) MOD 3;
IF idx=0 THEN SET day='05'; ELSEIF idx=1 THEN SET day='15'; ELSE SET day='25'; END IF;
SET dt = STR_TO_DATE(CONCAT('2025-',mon,'-',day),'%Y-%m-%d');
IF MOD(n,2)=0 THEN SET vt='Online'; SET vv='Zoom'; ELSE SET vt='Face to face'; SET vv='Auditorium A'; END IF;
INSERT INTO tbl_event (organization_id, cycle_number, event_type, user_id, title, description, image, venue_type, venue, start_date, end_date, start_time, end_time, status, type, is_open_to, fee, capacity, created_at, certificate)
VALUES (org1,1,'Organization','PRE001',CONCAT('TIS Event ',n),CONCAT('Tech Innovators Society activity #',n),NULL,vt,vv,dt,dt,'09:00:00','12:00:00','Approved','Free','Members only',NULL,200,NOW(),NULL);
SET n = n + 1;
END WHILE;

-- Org2
SET n = 1;
WHILE n <= 9 DO
IF n<=3 THEN SET mon='07'; ELSEIF n<=6 THEN SET mon='08'; ELSE SET mon='09'; END IF;
SET idx = (n-1) MOD 3;
IF idx=0 THEN SET day='06'; ELSEIF idx=1 THEN SET day='16'; ELSE SET day='26'; END IF;
SET dt = STR_TO_DATE(CONCAT('2025-',mon,'-',day),'%Y-%m-%d');
IF MOD(n,2)=0 THEN SET vt='Online'; SET vv='Google Meet'; ELSE SET vt='Face to face'; SET vv='Lecture Hall B'; END IF;
INSERT INTO tbl_event (organization_id, cycle_number, event_type, user_id, title, description, image, venue_type, venue, start_date, end_date, start_time, end_time, status, type, is_open_to, fee, capacity, created_at, certificate)
VALUES (org2,1,'Organization','PRE002',CONCAT('BLG Event ',n),CONCAT('Business Leaders Guild activity #',n),NULL,vt,vv,dt,dt,'13:00:00','16:00:00','Approved','Free','Members only',NULL,250,NOW(),NULL);
SET n = n + 1;
END WHILE;

-- Org3
SET n = 1;
WHILE n <= 9 DO
IF n<=3 THEN SET mon='07'; ELSEIF n<=6 THEN SET mon='08'; ELSE SET mon='09'; END IF;
SET idx = (n-1) MOD 3;
IF idx=0 THEN SET day='07'; ELSEIF idx=1 THEN SET day='17'; ELSE SET day='27'; END IF;
SET dt = STR_TO_DATE(CONCAT('2025-',mon,'-',day),'%Y-%m-%d');
IF MOD(n,2)=0 THEN SET vt='Online'; SET vv='Teams'; ELSE SET vt='Face to face'; SET vv='Black Box Theater'; END IF;
INSERT INTO tbl_event (organization_id, cycle_number, event_type, user_id, title, description, image, venue_type, venue, start_date, end_date, start_time, end_time, status, type, is_open_to, fee, capacity, created_at, certificate)
VALUES (org3,1,'Organization','PRE003',CONCAT('ACC Event ',n),CONCAT('Arts & Culture Circle activity #',n),NULL,vt,vv,dt,dt,'10:00:00','13:00:00','Approved','Free','Members only',NULL,180,NOW(),NULL);
SET n = n + 1;
END WHILE;

-- Org4
SET n = 1;
WHILE n <= 9 DO
IF n<=3 THEN SET mon='07'; ELSEIF n<=6 THEN SET mon='08'; ELSE SET mon='09'; END IF;
SET idx = (n-1) MOD 3;
IF idx=0 THEN SET day='08'; ELSEIF idx=1 THEN SET day='18'; ELSE SET day='28'; END IF;
SET dt = STR_TO_DATE(CONCAT('2025-',mon,'-',day),'%Y-%m-%d');
IF MOD(n,2)=0 THEN SET vt='Online'; SET vv='Zoom'; ELSE SET vt='Face to face'; SET vv='Open Grounds'; END IF;
INSERT INTO tbl_event (organization_id, cycle_number, event_type, user_id, title, description, image, venue_type, venue, start_date, end_date, start_time, end_time, status, type, is_open_to, fee, capacity, created_at, certificate)
VALUES (org4,1,'Organization','PRE004',CONCAT('GEA Event ',n),CONCAT('Green Earth Advocates activity #',n),NULL,vt,vv,dt,dt,'08:00:00','11:00:00','Approved','Free','Members only',NULL,220,NOW(),NULL);
SET n = n + 1;
END WHILE;

/* 10) Collaborators (guarded to avoid dupes) */
INSERT INTO tbl_event_collaborator (event_id, organization_id)
SELECT e.event_id, org2
FROM tbl_event AS e
WHERE e.organization_id = org1
AND NOT EXISTS (
SELECT 1 FROM tbl_event_collaborator ec
WHERE ec.event_id = e.event_id AND ec.organization_id = org2
)
ORDER BY e.event_id
LIMIT 1;

INSERT INTO tbl_event_collaborator (event_id, organization_id)
SELECT e.event_id, org3
FROM tbl_event AS e
WHERE e.organization_id = org2
AND NOT EXISTS (
SELECT 1 FROM tbl_event_collaborator ec
WHERE ec.event_id = e.event_id AND ec.organization_id = org3
)
ORDER BY e.event_id
LIMIT 1;

/* 11) Evaluation config & settings */
INSERT INTO tbl_event_evaluation_config (event_id, group_id)
SELECT e.event_id, g.group_id
FROM tbl_event AS e
JOIN tbl_evaluation_question_group AS g ON g.is_active = TRUE;

INSERT INTO tbl_event_evaluation_settings (event_id, start_date, end_date, start_time, end_time, is_active)
SELECT e.event_id, e.start_date, e.end_date, '08:00:00', '23:59:59', TRUE
FROM tbl_event AS e
LEFT JOIN tbl_event_evaluation_settings AS s ON s.event_id = e.event_id
WHERE s.event_id IS NULL;

/* 12) Evaluations: 30 random members per event */
OPEN ev_cur;
read_events: LOOP
FETCH ev_cur INTO cur_event_id, cur_org_id, cur_start_date;
IF done = 1 THEN LEAVE read_events; END IF;
INSERT INTO tbl_evaluation (event_id, user_id, submitted_at, duration_seconds)
SELECT cur_event_id, m.user_id, DATE_ADD(cur_start_date, INTERVAL 1 DAY), 120 + FLOOR(RAND()*300)
FROM tbl_organization_members AS m
WHERE m.organization_id = cur_org_id AND m.member_type='Member'
ORDER BY RAND() LIMIT 30;
END LOOP;
CLOSE ev_cur;

INSERT INTO tbl_evaluation_response (evaluation_id, question_id, response_value)
SELECT ev.evaluation_id, q.question_id,
CASE WHEN q.question_type='likert_4' THEN CAST(1 + FLOOR(RAND()*4) AS CHAR)
ELSE CONCAT('Feedback for event ', ev.event_id, ' by ', ev.user_id) END
FROM tbl_evaluation AS ev
JOIN tbl_event_evaluation_config AS cfg ON cfg.event_id = ev.event_id
JOIN tbl_evaluation_question AS q ON q.group_id = cfg.group_id;

/* 13) Attendance (random) */
INSERT INTO tbl_event_attendance (event_id, user_id, status, time_in, time_out, created_at, deleted_at)
SELECT e.event_id, m.user_id,
ELT(1+FLOOR(RAND()*4),'Registered','Evaluated','Attended','Rejected'),
CASE WHEN RAND()>0.5 THEN CONCAT(e.start_date,' 09:05:00') ELSE NULL END,
CASE WHEN RAND()>0.5 THEN CONCAT(e.end_date,' 12:05:00') ELSE NULL END,
NOW(), NULL
FROM tbl_event AS e
JOIN tbl_organization_members AS m ON m.organization_id = e.organization_id AND m.member_type='Member'
WHERE RAND()<0.05;

/* 14) Certificates */
INSERT INTO tbl_certificate_template (event_id, template_path, uploaded_by, created_at)
SELECT e.event_id, CONCAT('templates/', e.event_id, '_template.pdf'), @sdao, NOW()
FROM tbl_event AS e
ORDER BY e.event_id LIMIT 4
ON DUPLICATE KEY UPDATE template_path = VALUES(template_path);

INSERT INTO tbl_event_certificate (event_id, user_id, template_id, certificate_path, verification_code, issued_at)
SELECT a.event_id, a.user_id, t.template_id,
CONCAT('certs/', a.event_id, '_', a.user_id, '.pdf'),
UUID(), NOW()
FROM tbl_event_attendance AS a
JOIN tbl_certificate_template AS t ON t.event_id = a.event_id
WHERE a.status='Attended' AND RAND()<0.5;

/* 15) Project heads (sample) */
INSERT INTO tbl_project_heads (organization_id, user_id, event_id, role_type, project_name, created_at)
SELECT e.organization_id, 'PRE001', e.event_id, 'Executive', CONCAT('Project ', e.event_id), NOW()
FROM tbl_event AS e WHERE e.organization_id = org1
ORDER BY e.event_id LIMIT 2;

/* 16) Application period */
INSERT INTO tbl_application_period (start_date, end_date, start_time, end_time, is_active, created_by, created_at, updated_at)
VALUES ('2025-06-01','2025-09-30','08:00:00','17:00:00', TRUE, @sdao, NOW(), NOW());
SET app_period_id = LAST_INSERT_ID();

/* 17) Applications (new + renewal) */
INSERT INTO tbl_application (organization_id, cycle_number, org_version_id, submitted_org_name, submitted_org_logo, application_type, period_id, applicant_user_id, status, created_at, updated_at)
VALUES (NULL,NULL,NULL,'Robotics Nexus',NULL,'new',app_period_id,'PRE001','Approved',NOW(),NOW()),
(NULL,NULL,NULL,'Business Analytics Club',NULL,'new',app_period_id,'PRE002','Pending',NOW(),NOW());

INSERT INTO tbl_application (organization_id, cycle_number, org_version_id, submitted_org_name, submitted_org_logo, application_type, period_id, applicant_user_id, status, created_at, updated_at)
VALUES (org1,1,ov1,'Tech Innovators Society',NULL,'renewal',app_period_id,'PRE001','Approved',NOW(),NOW()),
(org2,1,ov2,'Business Leaders Guild',NULL,'renewal',app_period_id,'PRE002','Approved',NOW(),NOW()),
(org3,1,ov3,'Arts & Culture Circle',NULL,'renewal',app_period_id,'PRE003','Approved',NOW(),NOW()),
(org4,1,ov4,'Green Earth Advocates',NULL,'renewal',app_period_id,'PRE004','Approved',NOW(),NOW());

/* 18) Application executives (sample) */
INSERT INTO tbl_application_executives (application_id, org_version_id, proposed_user_id, proposed_name, proposed_email, proposed_title, proposed_rank_id, created_at)
SELECT a.application_id, ov1, NULL, 'Juan Dela Cruz', 'juan.dela.cruz@students.nu-dasma.edu.ph', 'Secretary', 4, NOW()
FROM tbl_application AS a WHERE a.organization_id=org1 AND a.application_type='renewal' LIMIT 1;

/* 19) Application requirements + submissions */
INSERT INTO tbl_application_requirement (requirement_name, is_applicable_to, file_path, created_by, created_at, updated_at)
VALUES ('Letter of Intent', 'new', NULL, @sdao, NOW(), NOW())
ON DUPLICATE KEY UPDATE requirement_name = VALUES(requirement_name);

INSERT INTO tbl_application_requirement (requirement_name, is_applicable_to, file_path, created_by, created_at, updated_at)
VALUES ('Student Org Application Form', 'new', NULL, @sdao, NOW(), NOW())
ON DUPLICATE KEY UPDATE requirement_name = VALUES(requirement_name);

INSERT INTO tbl_application_requirement (requirement_name, is_applicable_to, file_path, created_by, created_at, updated_at)
VALUES ('By Laws of the Organization', 'both', NULL, @sdao, NOW(), NOW())
ON DUPLICATE KEY UPDATE requirement_name = VALUES(requirement_name);

INSERT INTO tbl_organization_requirement_submission (application_id, requirement_id, cycle_number, organization_id, org_version_id, file_path, submitted_by, submitted_at, status, submitted_requirement_title, submitted_requirement_hash)
SELECT a.application_id,
r.requirement_id,
1,
a.organization_id,
a.org_version_id,
CONCAT('uploads/org/', a.application_id, '-', r.requirement_id, '.pdf'),
@sdao,
NOW(),
'Approved',
CONCAT('Req-', r.requirement_id),
SHA2(CONCAT(a.application_id, '-', r.requirement_id), 256)
FROM tbl_application AS a
JOIN tbl_application_requirement AS r ON r.is_applicable_to IN ('renew','both')
WHERE a.application_type='renewal';

/* 20) Approval process + mapping */
INSERT INTO tbl_approval_process (application_id, period_id, approver_id, approval_role_id, application_type, status, comment, step, timestamp)
SELECT a.application_id, app_period_id, 'ADV001', (SELECT role_id FROM tbl_role WHERE role_name='Program Chair' LIMIT 1), a.application_type,
IF(a.status='Approved','Approved','Pending'), 'Reviewed', 1, NOW()
FROM tbl_application AS a;

INSERT INTO tbl_approval_process (application_id, period_id, approver_id, approval_role_id, application_type, status, comment, step, timestamp)
SELECT a.application_id, app_period_id, 'ADV004', (SELECT role_id FROM tbl_role WHERE role_name='Dean' LIMIT 1), a.application_type,
IF(a.status='Approved','Approved','Pending'), 'Reviewed', 2, NOW()
FROM tbl_application AS a;

INSERT INTO tbl_approval_process (application_id, period_id, approver_id, approval_role_id, application_type, status, comment, step, timestamp)
SELECT a.application_id, app_period_id, 'ADV003', (SELECT role_id FROM tbl_role WHERE role_name='Academic Director' LIMIT 1), a.application_type,
IF(a.status='Approved','Approved','Pending'), 'Reviewed', 3, NOW()
FROM tbl_application AS a;

INSERT INTO tbl_approval_process (application_id, period_id, approver_id, approval_role_id, application_type, status, comment, step, timestamp)
SELECT a.application_id, app_period_id, @sdao, (SELECT role_id FROM tbl_role WHERE role_name='SDAO' LIMIT 1), a.application_type,
a.status, 'Final step', 4, NOW()
FROM tbl_application AS a;

INSERT INTO tbl_application_approval (application_id, approval_id)
SELECT ap.application_id, ap.approval_id
FROM tbl_approval_process AS ap;

/* 21) Membership questions/apps/responses */
INSERT INTO tbl_membership_question (organization_id, cycle_number, question_text, question_type, is_required)
VALUES (org1,1,'Why do you want to join?', 'text', TRUE),
(org1,1,'Preferred role?', 'text', FALSE),
(org2,1,'What can you contribute?', 'text', TRUE),
(org2,1,'Availability per week?', 'text', FALSE),
(org3,1,'Your art interest?', 'text', TRUE),
(org3,1,'Portfolio link?', 'text', FALSE),
(org4,1,'Environmental advocacy?', 'text', TRUE),
(org4,1,'Volunteer experience?', 'text', FALSE);

INSERT INTO tbl_membership_application (organization_id, cycle_number, user_id, status, applied_at, reviewed_by, reviewed_at, remarks)
SELECT org1,1,m.user_id,'Approved',NOW(),@sdao,NOW(),'Welcome to the org'
FROM tbl_organization_members AS m
WHERE m.organization_id=org1 AND m.member_type='Member'
ORDER BY RAND() LIMIT 10;

INSERT INTO tbl_membership_application (organization_id, cycle_number, user_id, status, applied_at, reviewed_by, reviewed_at, remarks)
SELECT org2,1,m.user_id,'Approved',NOW(),@sdao,NOW(),'Welcome'
FROM tbl_organization_members AS m
WHERE m.organization_id=org2 AND m.member_type='Member'
ORDER BY RAND() LIMIT 10;

INSERT INTO tbl_membership_application (organization_id, cycle_number, user_id, status, applied_at, reviewed_by, reviewed_at, remarks)
SELECT org3,1,m.user_id,'Approved',NOW(),@sdao,NOW(),'Welcome'
FROM tbl_organization_members AS m
WHERE m.organization_id=org3 AND m.member_type='Member'
ORDER BY RAND() LIMIT 10;

INSERT INTO tbl_membership_application (organization_id, cycle_number, user_id, status, applied_at, reviewed_by, reviewed_at, remarks)
SELECT org4,1,m.user_id,'Approved',NOW(),@sdao,NOW(),'Welcome'
FROM tbl_organization_members AS m
WHERE m.organization_id=org4 AND m.member_type='Member'
ORDER BY RAND() LIMIT 10;

INSERT INTO tbl_membership_response (application_id, question_id, response_value)
SELECT ma.application_id, mq.question_id, 'I want to grow and contribute.'
FROM tbl_membership_application AS ma
JOIN tbl_membership_question AS mq
ON mq.organization_id=ma.organization_id AND mq.cycle_number=ma.cycle_number
WHERE mq.question_type='text';

/* 22) Event applications, approvals, requirements, submissions */
INSERT INTO tbl_event_application (organization_id, cycle_number, proposed_event_id, applicant_user_id, status, created_at, updated_at)
VALUES (org1,1,NULL,'PRE001','Approved',NOW(),NOW()),
(org2,1,NULL,'PRE002','Pending',NOW(),NOW());

INSERT INTO tbl_event_approval_process (event_application_id, approver_id, approval_role_id, status, comment, step_number, approved_at)
SELECT ea.event_application_id, @sdao, (SELECT role_id FROM tbl_role WHERE role_name='SDAO' LIMIT 1),
ea.status, 'Event application review', 1, IF(ea.status='Approved', NOW(), NULL)
FROM tbl_event_application AS ea;

INSERT INTO tbl_event_application_requirement (requirement_name, is_applicable_to, file_path, status, created_by, created_at, updated_at)
VALUES ('Event Proposal', 'pre-event', NULL, 'active', @sdao, NOW(), NOW())
ON DUPLICATE KEY UPDATE requirement_name=VALUES(requirement_name);

INSERT INTO tbl_event_application_requirement (requirement_name, is_applicable_to, file_path, status, created_by, created_at, updated_at)
VALUES ('Budget Plan', 'pre-event', NULL, 'active', @sdao, NOW(), NOW())
ON DUPLICATE KEY UPDATE requirement_name=VALUES(requirement_name);

INSERT INTO tbl_event_requirement_submissions (event_id, event_application_id, requirement_id, cycle_number, status, organization_id, file_path, submitted_by, submitted_at)
SELECT e.event_id, ea.event_application_id, r.requirement_id, 1, 'Approved', e.organization_id,
CONCAT('uploads/events/', e.event_id, '-', r.requirement_id, '.pdf'),
@sdao, NOW()
FROM tbl_event_application AS ea
JOIN tbl_event AS e ON e.organization_id = ea.organization_id
JOIN tbl_event_application_requirement AS r ON r.is_applicable_to='pre-event'
WHERE ea.status='Approved'
ORDER BY e.event_id LIMIT 4;

/* 23) Course mappings (guarded) */
INSERT INTO tbl_organization_course (organization_id, program_id)
SELECT org1 AS organization_id, p.program_id
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_course oc
WHERE oc.organization_id = org1 AND oc.program_id = p.program_id
);

INSERT INTO tbl_organization_course (organization_id, program_id)
SELECT org2 AS organization_id, p.program_id
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 4) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_course oc
WHERE oc.organization_id = org2 AND oc.program_id = p.program_id
);

INSERT INTO tbl_organization_course (organization_id, program_id)
SELECT org3 AS organization_id, p.program_id
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 8) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_course oc
WHERE oc.organization_id = org3 AND oc.program_id = p.program_id
);

INSERT INTO tbl_organization_course (organization_id, program_id)
SELECT org4 AS organization_id, p.program_id
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 12) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_course oc
WHERE oc.organization_id = org4 AND oc.program_id = p.program_id
);

INSERT INTO tbl_organization_version_course (org_version_id, program_id, created_at)
SELECT ov1 AS org_version_id, p.program_id, NOW()
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_version_course ovc
WHERE ovc.org_version_id = ov1 AND ovc.program_id = p.program_id
);

INSERT INTO tbl_organization_version_course (org_version_id, program_id, created_at)
SELECT ov2 AS org_version_id, p.program_id, NOW()
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 4) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_version_course ovc
WHERE ovc.org_version_id = ov2 AND ovc.program_id = p.program_id
);

INSERT INTO tbl_organization_version_course (org_version_id, program_id, created_at)
SELECT ov3 AS org_version_id, p.program_id, NOW()
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 8) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_version_course ovc
WHERE ovc.org_version_id = ov3 AND ovc.program_id = p.program_id
);

INSERT INTO tbl_organization_version_course (org_version_id, program_id, created_at)
SELECT ov4 AS org_version_id, p.program_id, NOW()
FROM (SELECT program_id FROM tbl_program ORDER BY program_id LIMIT 4 OFFSET 12) AS p
WHERE NOT EXISTS (
SELECT 1 FROM tbl_organization_version_course ovc
WHERE ovc.org_version_id = ov4 AND ovc.program_id = p.program_id
);

/* 24) Blocked period */
INSERT INTO tbl_blocked_period (start_date, end_date, reason, created_by, created_at, archived_at, archived_by, archived_reason, unarchived_at, unarchived_by, unarchived_reason)
VALUES ('2025-08-10','2025-08-15','Campus week – no events', @sdao, NOW(), NULL, NULL, NULL, NULL, NULL, NULL);

/* 25) Transaction setup (types, payment types, categories, mappings) */
INSERT INTO tbl_transaction_type (code, label) VALUES ('INCOME','Income')
ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO tbl_transaction_type (code, label) VALUES ('EXPENSE','Expense')
ON DUPLICATE KEY UPDATE code=VALUES(code);

SET txn_type_income = (SELECT tt.transaction_type_id FROM tbl_transaction_type tt WHERE tt.code='INCOME');
SET txn_type_expense = (SELECT tt.transaction_type_id FROM tbl_transaction_type tt WHERE tt.code='EXPENSE');

INSERT INTO tbl_payment_type (code, label, method_group) VALUES ('CASH','Cash','Cash')
ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO tbl_payment_type (code, label, method_group) VALUES ('BANK','Bank','Bank')
ON DUPLICATE KEY UPDATE code=VALUES(code);
INSERT INTO tbl_payment_type (code, label, method_group) VALUES ('GCASH','GCash','eWallet')
ON DUPLICATE KEY UPDATE code=VALUES(code);

SET pay_cash = (SELECT pt.payment_type_id FROM tbl_payment_type pt WHERE pt.code='CASH');
SET pay_bank = (SELECT pt.payment_type_id FROM tbl_payment_type pt WHERE pt.code='BANK');
SET pay_gcash = (SELECT pt.payment_type_id FROM tbl_payment_type pt WHERE pt.code='GCASH');

INSERT INTO tbl_financial_category (code, label, kind, parent_category_id, active)
VALUES ('MEMBERSHIP','Membership Dues','INCOME',NULL,TRUE)
ON DUPLICATE KEY UPDATE code=VALUES(code);

INSERT INTO tbl_financial_category (code, label, kind, parent_category_id, active)
VALUES ('SPONSORSHIP','Sponsorship','INCOME',NULL,TRUE)
ON DUPLICATE KEY UPDATE code=VALUES(code);

INSERT INTO tbl_financial_category (code, label, kind, parent_category_id, active)
VALUES ('OFFICE_SUPPLIES','Office Supplies','EXPENSE',NULL,TRUE)
ON DUPLICATE KEY UPDATE code=VALUES(code);

INSERT INTO tbl_financial_category (code, label, kind, parent_category_id, active)
VALUES ('EVENT_FEE','Event Fee','INCOME',NULL,TRUE)
ON DUPLICATE KEY UPDATE code=VALUES(code);

SET cat_membership = (SELECT fc.category_id FROM tbl_financial_category fc WHERE fc.code='MEMBERSHIP');
SET cat_sponsorship = (SELECT fc.category_id FROM tbl_financial_category fc WHERE fc.code='SPONSORSHIP');
SET cat_office = (SELECT fc.category_id FROM tbl_financial_category fc WHERE fc.code='OFFICE_SUPPLIES');
SET cat_event_fee = (SELECT fc.category_id FROM tbl_financial_category fc WHERE fc.code='EVENT_FEE');

INSERT INTO tbl_transaction_type_category (transaction_type_id, category_id)
VALUES (txn_type_income, cat_membership)
ON DUPLICATE KEY UPDATE transaction_type_id=transaction_type_id;

INSERT INTO tbl_transaction_type_category (transaction_type_id, category_id)
VALUES (txn_type_income, cat_sponsorship)
ON DUPLICATE KEY UPDATE transaction_type_id=transaction_type_id;

INSERT INTO tbl_transaction_type_category (transaction_type_id, category_id)
VALUES (txn_type_income, cat_event_fee)
ON DUPLICATE KEY UPDATE transaction_type_id=transaction_type_id;

INSERT INTO tbl_transaction_type_category (transaction_type_id, category_id)
VALUES (txn_type_expense, cat_office)
ON DUPLICATE KEY UPDATE transaction_type_id=transaction_type_id;

/* 26) Receipt sequences */
INSERT INTO tbl_receipt_sequence (series_key, prefix, pad_length, current_value, updated_at)
VALUES ('ORG','ORG-',6,0,NOW())
ON DUPLICATE KEY UPDATE series_key=series_key;

INSERT INTO tbl_receipt_sequence (series_key, prefix, pad_length, current_value, updated_at)
VALUES ('EVT','EVT-',6,0,NOW())
ON DUPLICATE KEY UPDATE series_key=series_key;

/* 27) Transactions (membership, sponsorship, expenses, event income/expense) */
SET i = 1;
WHILE i <= 4 DO
SET @org := CASE i WHEN 1 THEN org1 WHEN 2 THEN org2 WHEN 3 THEN org3 ELSE org4 END;
UPDATE tbl_receipt_sequence SET current_value=current_value+1, updated_at=NOW() WHERE series_key='ORG';
SET @num := (SELECT rs.current_value FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG');
SET @rcp := CONCAT((SELECT rs.prefix FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG'),
                   LPAD(@num, (SELECT rs.pad_length FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG'),'0'));

INSERT INTO tbl_transaction (user_id, payer_name, payee_name, payment_description, amount, transaction_type_id, payment_type_id, category_id, status, transaction_date, receipt_no, proof_image, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES (NULL, CONCAT('Donor ',i,'A'), CONCAT('Org ',i), 'Membership donation', 1500.00, txn_type_income, pay_cash, cat_membership, 'Completed', NOW(), @rcp, NULL, NOW(), NOW(), NULL, NULL, NULL);
INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
VALUES (LAST_INSERT_ID(), @org, 1);

UPDATE tbl_receipt_sequence SET current_value=current_value+1, updated_at=NOW() WHERE series_key='ORG';
SET @num := (SELECT rs.current_value FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG');
SET @rcp := CONCAT((SELECT rs.prefix FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG'),
                   LPAD(@num, (SELECT rs.pad_length FROM tbl_receipt_sequence rs WHERE rs.series_key='ORG'),'0'));

INSERT INTO tbl_transaction (user_id, payer_name, payee_name, payment_description, amount, transaction_type_id, payment_type_id, category_id, status, transaction_date, receipt_no, proof_image, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES (NULL, CONCAT('Sponsor ',i), CONCAT('Org ',i), 'Sponsorship', 5000.00, txn_type_income, pay_bank, cat_sponsorship, 'Completed', NOW(), @rcp, NULL, NOW(), NOW(), NULL, NULL, NULL);
INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
VALUES (LAST_INSERT_ID(), @org, 1);

INSERT INTO tbl_transaction (user_id, payer_name, payee_name, payment_description, amount, transaction_type_id, payment_type_id, category_id, status, transaction_date, receipt_no, proof_image, created_at, updated_at, archived_at, archived_by, archived_reason)
VALUES (NULL, 'Org Office', CONCAT('Vendor ',i), 'Office supplies', 1200.00, txn_type_expense, pay_gcash, cat_office, 'Completed', NOW(), NULL, NULL, NOW(), NOW(), NULL, NULL, NULL);
INSERT INTO tbl_transaction_membership (transaction_id, organization_id, cycle_number)
VALUES (LAST_INSERT_ID(), @org, 1);

SET i = i + 1;
END WHILE;

INSERT INTO tbl_transaction (user_id, payer_name, payee_name, payment_description, amount, transaction_type_id, payment_type_id, category_id, status, transaction_date, receipt_no, proof_image, created_at, updated_at, archived_at, archived_by, archived_reason)
SELECT NULL, 'Event Ticket', 'Org', 'Event tickets', 2000.00, txn_type_income, pay_cash, cat_event_fee, 'Completed', e.start_date, NULL, NULL, NOW(), NOW(), NULL, NULL, NULL
FROM tbl_event AS e ORDER BY e.event_id LIMIT 4;

INSERT INTO tbl_transaction_event (transaction_id, event_id, remarks, payer_name_override)
SELECT t.transaction_id, e.event_id, 'Ticket income', NULL
FROM (
SELECT tr.transaction_id, ROW_NUMBER() OVER (ORDER BY tr.transaction_id DESC) rn
FROM tbl_transaction tr
) AS t
JOIN (
SELECT ev.event_id, ROW_NUMBER() OVER (ORDER BY ev.event_id) rn
FROM tbl_event ev
) AS e ON t.rn = e.rn
WHERE t.rn <= 4;

INSERT INTO tbl_transaction (user_id, payer_name, payee_name, payment_description, amount, transaction_type_id, payment_type_id, category_id, status, transaction_date, receipt_no, proof_image, created_at, updated_at, archived_at, archived_by, archived_reason)
SELECT NULL, 'Event Expense', 'Supplier', 'Event supplies', 800.00, txn_type_expense, pay_bank, cat_office, 'Completed', e.start_date, NULL, NULL, NOW(), NOW(), NULL, NULL, NULL
FROM tbl_event AS e ORDER BY e.event_id LIMIT 4;

INSERT INTO tbl_transaction_event (transaction_id, event_id, remarks, payer_name_override)
SELECT t.transaction_id, e.event_id, 'Event supplies', NULL
FROM (
SELECT tr.transaction_id, ROW_NUMBER() OVER (ORDER BY tr.transaction_id DESC) rn
FROM tbl_transaction tr
) AS t
JOIN (
SELECT ev.event_id, ROW_NUMBER() OVER (ORDER BY ev.event_id) rn
FROM tbl_event ev
) AS e ON t.rn = e.rn
WHERE t.rn <= 4;

/* 28) Notifications + recipients */
INSERT INTO tbl_notification (sender_id, entity_type, entity_id, title, message, url, action, created_at)
VALUES (@sdao,'organization', org1, 'Welcome to the new cycle', 'Cycle 1 started for your organization.', '/org/details', NULL, NOW());

INSERT INTO tbl_notification_recipient (notification_id, recipient_email, is_read, created_at)
VALUES (LAST_INSERT_ID(), 'pre001@students.nu-dasma.edu.ph', FALSE, NOW());

/* 29) Logs */
INSERT INTO tbl_logs (user_id, timestamp, action_type, redirect_url, file_path, meta_data, type)
VALUES (@sdao, NOW(), 'Populate Demo Data', '/admin/seed', NULL, JSON_OBJECT('result','success'), 'system');

/* 30) Event courses (guarded) */
INSERT INTO tbl_event_course (event_id, program_id)
SELECT e.event_id, p.program_id
FROM (
SELECT ev.event_id, ROW_NUMBER() OVER (ORDER BY ev.event_id) rn
FROM tbl_event ev
) AS e
JOIN (
SELECT pr.program_id, ROW_NUMBER() OVER (ORDER BY pr.program_id) rn
FROM tbl_program pr
) AS p
ON (e.rn % 8) = (p.rn % 8)
WHERE NOT EXISTS (
SELECT 1 FROM tbl_event_course ec
WHERE ec.event_id = e.event_id AND ec.program_id = p.program_id
);

/* 31) Member permission overrides */
INSERT INTO tbl_member_permission_override (member_id, permission_id, is_allowed)
SELECT m.member_id, perm_update_event, TRUE
FROM tbl_organization_members AS m
WHERE m.member_type='Member' AND RAND()<0.01
LIMIT 10;

/* 32) Archived samples */
INSERT INTO tbl_archived_organization_members (member_id, organization_id, cycle_number, user_id, member_type, executive_role_id, committee_id, committee_role, archived_at, archived_by)
SELECT m.member_id, m.organization_id, m.cycle_number, m.user_id, m.member_type, m.executive_role_id, NULL, NULL, NOW(), @sdao
FROM tbl_organization_members AS m
WHERE m.member_type='Member'
ORDER BY m.member_id LIMIT 2;

INSERT INTO tbl_archived_committees (original_committee_id, organization_id, cycle_number, name, description, created_at, archived_at, archived_by, reason)
SELECT c.committee_id, c.organization_id, c.cycle_number, c.name, c.description, c.created_at, NOW(), @sdao, 'Restructure'
FROM tbl_committee AS c ORDER BY c.committee_id LIMIT 1;

/* 33) AI samples */
INSERT INTO tbl_ai_conversation (owner_id, title, system_prompt, model, temperature, top_p, entity_type, entity_id, summary, is_global, last_summary_message_id, is_archived, created_at, updated_at)
VALUES (@sdao, 'Demo Setup Q&A', 'Be helpful and concise', 'deepseek-chat', 0.7, 1.0, 'system', NULL, NULL, TRUE, NULL, FALSE, NOW(), NOW());
SET @conv := LAST_INSERT_ID();

INSERT INTO tbl_ai_message (conversation_id, role, user_id, content, model, context_organizations, message_scope, meta, created_at)
VALUES (@conv, 'user', @sdao, 'How to manage organizations?', NULL, NULL, 'global', NULL, NOW());

INSERT INTO tbl_ai_message (conversation_id, role, user_id, content, model, context_organizations, message_scope, meta, created_at)
VALUES (@conv, 'assistant', NULL, 'Use the admin console to manage organizations and members.', 'deepseek-chat', NULL, 'global', NULL, NOW());
END $$
DELIMITER ;
CALL populate_all_demo();
DROP PROCEDURE populate_all_demo;