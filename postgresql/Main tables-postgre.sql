-- ============================================================
-- PostgreSQL Schema Conversion
-- ============================================================

-- ============================================================
-- ENUM TYPE DEFINITIONS
-- ============================================================

CREATE TYPE status_active_archived AS ENUM ('Active', 'Archived');
CREATE TYPE status_active_pending_archive AS ENUM ('Active', 'Pending', 'Archive');
CREATE TYPE status_pending_approved_rejected AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE status_pending_approved_rejected_archived AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');
CREATE TYPE status_pending_approved_rejected_renewal_archived AS ENUM ('Pending', 'Approved', 'Rejected', 'Renewal', 'Archived');
CREATE TYPE status_pending_completed_failed_cancelled AS ENUM ('Pending', 'Completed', 'Failed', 'Cancelled');
CREATE TYPE status_pending_approved_rejected_revision AS ENUM ('Pending', 'Approved', 'Rejected', 'Revision');
CREATE TYPE status_pending_registered_evaluated_attended_rejected AS ENUM ('Pending', 'Registered', 'Evaluated', 'Attended', 'Rejected');

CREATE TYPE membership_fee_type AS ENUM ('Per Term', 'Whole Academic Year', 'Free');
CREATE TYPE org_category AS ENUM ('Co-Curricular Organization', 'Extra Curricular Organization');
CREATE TYPE org_version_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');

CREATE TYPE application_type AS ENUM ('new', 'renewal');
CREATE TYPE member_type AS ENUM ('Member', 'Executive', 'Committee');
CREATE TYPE permission_scope AS ENUM ('Global', 'SDAO', 'Organization', 'Approver');
CREATE TYPE term_exclusion_policy AS ENUM ('NONE', 'CURRENT_TERM', 'PRORATED');
CREATE TYPE venue_type AS ENUM ('Face to face', 'Online');
CREATE TYPE event_type AS ENUM ('Organization', 'SDAO', 'System');
CREATE TYPE event_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');
CREATE TYPE event_fee_type AS ENUM ('Paid', 'Free');
CREATE TYPE event_open_to AS ENUM ('Members only', 'Open to all', 'NU Students only');
CREATE TYPE is_applicable_to_pre_post AS ENUM ('pre-event', 'post-event');
CREATE TYPE is_applicable_to_new_renew AS ENUM ('new', 'renew', 'both');
CREATE TYPE requirement_status AS ENUM ('active', 'archived');
CREATE TYPE submission_status AS ENUM ('Pending', 'Approved', 'Rejected', 'Viewed');
CREATE TYPE role_name_committee AS ENUM ('Committee Head', 'Committee Officer');
CREATE TYPE committee_role_enum AS ENUM ('Committee Head', 'Committee Officer');
CREATE TYPE transaction_status AS ENUM ('Pending', 'Completed', 'Failed', 'Cancelled');
CREATE TYPE audit_action_type AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'UNARCHIVE', 'COMPLETE', 'CANCEL', 'DELETE');
CREATE TYPE notification_entity_type AS ENUM ('user', 'organization', 'event', 'transaction', 'system', 'approval', 'general');
CREATE TYPE ai_entity_type AS ENUM ('general', 'user', 'organization', 'event', 'application', 'approval', 'system');
CREATE TYPE ai_role AS ENUM ('system', 'user', 'assistant', 'tool');
CREATE TYPE ai_message_scope AS ENUM ('current_view', 'multi_org', 'global');
CREATE TYPE question_type_membership AS ENUM ('text', 'multiple_choice', 'checkbox', 'file_upload');
CREATE TYPE question_type_evaluation AS ENUM ('textbox', 'likert_4');
CREATE TYPE reminder_type AS ENUM ('week_before', 'day_before', 'day_of');
CREATE TYPE role_type_exec_committee AS ENUM ('Executive', 'Committee');
CREATE TYPE financial_kind AS ENUM ('INCOME', 'EXPENSE');

-- ============================================================
-- HELPER: updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- tbl_role
-- ============================================================

CREATE TABLE tbl_role (
    role_id     SERIAL PRIMARY KEY,
    role_name   VARCHAR(100) UNIQUE NOT NULL,
    is_approver BOOLEAN DEFAULT FALSE,
    hierarchy_order INT UNIQUE NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- tbl_college
-- ============================================================

CREATE TABLE tbl_college (
    college_id      SERIAL PRIMARY KEY,
    name            VARCHAR(100) UNIQUE NOT NULL,
    abbreviation    VARCHAR(20)  UNIQUE NOT NULL,
    status          status_active_archived NOT NULL DEFAULT 'Active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at     TIMESTAMP NULL,
    archived_by     VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL
);

-- ============================================================
-- tbl_program
-- ============================================================

CREATE TABLE tbl_program (
    program_id      SERIAL PRIMARY KEY,
    college_id      INT NOT NULL,
    name            VARCHAR(200) UNIQUE,
    abbreviation    VARCHAR(20)  UNIQUE,
    status          status_active_archived NOT NULL DEFAULT 'Active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at     TIMESTAMP NULL,
    archived_by     VARCHAR(200) NULL,
    archived_reason VARCHAR(255) NULL,
    CONSTRAINT fk_program_college
        FOREIGN KEY (college_id) REFERENCES tbl_college(college_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_section
-- ============================================================

CREATE TABLE tbl_section (
    section_id   SERIAL PRIMARY KEY,
    section_name VARCHAR(100) NOT NULL,
    program_id   INT NOT NULL,
    year_level   INT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_section_program
        FOREIGN KEY (program_id) REFERENCES tbl_program(program_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uk_section_program_name
        UNIQUE (program_id, section_name)
);

CREATE INDEX idx_section_program ON tbl_section(program_id);
CREATE INDEX idx_section_active  ON tbl_section(is_active);
CREATE INDEX idx_section_year    ON tbl_section(year_level);

CREATE TRIGGER trg_section_updated_at
    BEFORE UPDATE ON tbl_section
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_user
-- ============================================================

CREATE TABLE tbl_user (
    user_id         VARCHAR(200) PRIMARY KEY,
    f_name          VARCHAR(50)  NULL,
    l_name          VARCHAR(50)  NULL,
    email           VARCHAR(100) UNIQUE NOT NULL,
    program_id      INT NULL,
    section_id      INT NULL,
    role_id         INT NOT NULL,
    profile_picture VARCHAR(255),
    status          status_active_pending_archive DEFAULT 'Active',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at     TIMESTAMP NULL,
    archived_by     VARCHAR(200) NULL,
    archived_reason VARCHAR(255),
    FOREIGN KEY (role_id)    REFERENCES tbl_role(role_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id),
    FOREIGN KEY (section_id) REFERENCES tbl_section(section_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_user_section ON tbl_user(section_id);

CREATE TRIGGER trg_user_updated_at
    BEFORE UPDATE ON tbl_user
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Deferred FK additions (depend on tbl_user existing)
ALTER TABLE tbl_college
    ADD CONSTRAINT fk_college_archived_by
        FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE;

ALTER TABLE tbl_program
    ADD CONSTRAINT fk_program_archived_by
        FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE;

-- ============================================================
-- tbl_user_application
-- ============================================================

CREATE TABLE tbl_user_application (
    application_id  SERIAL PRIMARY KEY,
    email           VARCHAR(100) NOT NULL,
    role_id         INT NOT NULL,
    program_id      INT NULL,
    reason          TEXT NOT NULL,
    status          status_pending_approved_rejected DEFAULT 'Pending',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rejected_reason TEXT NULL,
    rejected_at     TIMESTAMP NULL,
    rejected_by     VARCHAR(200) NULL,
    archived_at     TIMESTAMP NULL,
    archived_by     VARCHAR(200) NULL,
    FOREIGN KEY (role_id)     REFERENCES tbl_role(role_id),
    FOREIGN KEY (program_id)  REFERENCES tbl_program(program_id),
    FOREIGN KEY (rejected_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- ============================================================
-- tbl_permission
-- ============================================================

CREATE TABLE tbl_permission (
    permission_id   SERIAL PRIMARY KEY,
    permission_name VARCHAR(200) UNIQUE NOT NULL,
    scope           permission_scope DEFAULT 'Global',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- tbl_role_permission
-- ============================================================

CREATE TABLE tbl_role_permission (
    role_permission_id SERIAL PRIMARY KEY,
    role_id            INT NOT NULL,
    permission_id      INT NOT NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id)       REFERENCES tbl_role(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_sdao_approver
-- ============================================================

CREATE TABLE tbl_sdao_approver (
    user_id    VARCHAR(200) PRIMARY KEY,
    sdao_rank  INT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_sdao_rank CHECK (sdao_rank BETWEEN 1 AND 3)
);

CREATE TRIGGER trg_sdao_approver_updated_at
    BEFORE UPDATE ON tbl_sdao_approver
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_organization  (created without circular FK first)
-- ============================================================

CREATE TABLE tbl_organization (
    organization_id          SERIAL PRIMARY KEY,
    adviser_id               VARCHAR(200) NOT NULL,
    current_org_version_id   INT NOT NULL,
    name                     VARCHAR(100) NOT NULL UNIQUE,
    description              TEXT,
    base_program_id          INT NULL,
    logo                     VARCHAR(255),
    status                   status_pending_approved_rejected_renewal_archived DEFAULT 'Pending',
    membership_fee_type      membership_fee_type NOT NULL DEFAULT 'Free',
    category                 org_category DEFAULT 'Co-Curricular Organization',
    membership_fee_amount    DECIMAL(10,2) NULL,
    is_recruiting            BOOLEAN DEFAULT TRUE,
    term_option              BOOLEAN DEFAULT NULL,
    is_open_to_all_courses   BOOLEAN DEFAULT FALSE,
    term_exclusion_policy    term_exclusion_policy DEFAULT 'CURRENT_TERM',
    payment_calculation_rules JSONB DEFAULT NULL,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at              TIMESTAMP NULL,
    archived_by              VARCHAR(200) NULL,
    archived_reason          VARCHAR(255) NULL,
    FOREIGN KEY (adviser_id)    REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (archived_by)   REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- ============================================================
-- tbl_organization_version
-- ============================================================

CREATE TABLE tbl_organization_version (
    org_version_id        SERIAL PRIMARY KEY,
    organization_id       INT NULL,
    name                  VARCHAR(255) NOT NULL,
    status                org_version_status DEFAULT 'Pending',
    logo_path             VARCHAR(500) NULL,
    description           TEXT NULL,
    base_program_id       INT NULL,
    membership_fee_type   membership_fee_type DEFAULT 'Free',
    category              org_category DEFAULT 'Co-Curricular Organization',
    membership_fee_amount DECIMAL(10,2) NULL,
    is_recruiting         BOOLEAN DEFAULT TRUE,
    is_open_to_all_courses BOOLEAN DEFAULT FALSE,
    created_by            VARCHAR(200) NOT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valid_from            DATE NULL,
    valid_to              DATE NULL,
    archived_at           TIMESTAMP NULL,
    archived_by           VARCHAR(200) NULL,
    archived_reason       VARCHAR(255) NULL,
    FOREIGN KEY (created_by)    REFERENCES tbl_user(user_id),
    FOREIGN KEY (archived_by)   REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE SET NULL
);

-- Add circular FKs after both tables exist
ALTER TABLE tbl_organization
    ADD CONSTRAINT fk_org_current_version
        FOREIGN KEY (current_org_version_id)
        REFERENCES tbl_organization_version(org_version_id) ON UPDATE CASCADE;

ALTER TABLE tbl_organization_version
    ADD CONSTRAINT fk_org_version_org
        FOREIGN KEY (organization_id)
        REFERENCES tbl_organization(organization_id) ON DELETE SET NULL;

-- ============================================================
-- tbl_renewal_cycle
-- ============================================================

CREATE TABLE tbl_renewal_cycle (
    organization_id INT NOT NULL,
    cycle_number    INT NOT NULL,
    start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    president_id    VARCHAR(200) NOT NULL,
    org_version_id  INT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, cycle_number),
    FOREIGN KEY (organization_id)  REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (president_id)     REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (org_version_id)   REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL
);

-- ============================================================
-- tbl_organization_course
-- ============================================================

CREATE TABLE tbl_organization_course (
    organization_id INT NOT NULL,
    program_id      INT NOT NULL,
    PRIMARY KEY (organization_id, program_id),
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (program_id)      REFERENCES tbl_program(program_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_organization_version_course
-- ============================================================

CREATE TABLE tbl_organization_version_course (
    org_version_course_id SERIAL PRIMARY KEY,
    org_version_id        INT NOT NULL,
    program_id            INT NOT NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id) ON DELETE CASCADE,
    FOREIGN KEY (program_id)     REFERENCES tbl_program(program_id) ON DELETE CASCADE,
    UNIQUE (org_version_id, program_id)
);

-- ============================================================
-- tbl_academic_term
-- ============================================================

CREATE TABLE tbl_academic_term (
    term_id          SERIAL PRIMARY KEY,
    term_name        VARCHAR(100) NOT NULL UNIQUE,
    term_description TEXT NULL,
    academic_year    VARCHAR(20) NULL,
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(200) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TRIGGER trg_academic_term_updated_at
    BEFORE UPDATE ON tbl_academic_term
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_executive_rank
-- ============================================================

CREATE TABLE tbl_executive_rank (
    rank_id       SERIAL PRIMARY KEY,
    rank_level    INT UNIQUE NOT NULL,
    default_title VARCHAR(50) NOT NULL,
    description   VARCHAR(255),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- tbl_executive_role
-- ============================================================

CREATE TABLE tbl_executive_role (
    executive_role_id SERIAL PRIMARY KEY,
    organization_id   INT NOT NULL,
    cycle_number      INT NOT NULL,
    role_title        VARCHAR(100) NOT NULL,
    rank_id           INT NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (rank_id) REFERENCES tbl_executive_rank(rank_id)
);

-- ============================================================
-- tbl_rank_permission
-- ============================================================

CREATE TABLE tbl_rank_permission (
    rank_id       INT NOT NULL,
    permission_id INT NOT NULL,
    PRIMARY KEY (rank_id, permission_id),
    FOREIGN KEY (rank_id)       REFERENCES tbl_executive_rank(rank_id),
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id)
);

-- ============================================================
-- tbl_organization_members
-- ============================================================

CREATE TABLE tbl_organization_members (
    member_id           SERIAL PRIMARY KEY,
    organization_id     INT NOT NULL,
    cycle_number        INT NOT NULL,
    user_id             VARCHAR(200) NOT NULL,
    org_version_id      INT NULL,
    member_type         member_type DEFAULT 'Member',
    status              status_active_pending_archive DEFAULT 'Active',
    executive_role_id   INT DEFAULT NULL,
    joined_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_start_term_id INT DEFAULT NULL,
    excluded_terms      JSONB DEFAULT NULL,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    FOREIGN KEY (user_id)             REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (executive_role_id)   REFERENCES tbl_executive_role(executive_role_id) ON DELETE SET NULL,
    FOREIGN KEY (org_version_id)      REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL,
    FOREIGN KEY (payment_start_term_id) REFERENCES tbl_academic_term(term_id) ON DELETE SET NULL
);

-- ============================================================
-- tbl_period
-- ============================================================

CREATE TABLE tbl_period (
    period_id  SERIAL PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time   TIME NOT NULL,
    is_active  BOOLEAN DEFAULT TRUE,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TRIGGER trg_period_updated_at
    BEFORE UPDATE ON tbl_period
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_application
-- ============================================================

CREATE TABLE tbl_application (
    application_id              SERIAL PRIMARY KEY,
    organization_id             INT NULL,
    cycle_number                INT NULL,
    org_version_id              INT NULL,
    submitted_org_name          VARCHAR(255) NULL,
    submitted_org_logo          VARCHAR(500) NULL,
    description                 TEXT NULL,
    category                    org_category NULL,
    base_program_id             INT NULL,
    student_id                  VARCHAR(200) NULL,
    submitter_contact_no        VARCHAR(20) NULL,
    application_type            application_type NOT NULL,
    period_id                   INT NOT NULL,
    applicant_user_id           VARCHAR(200) NOT NULL,
    status                      status_pending_approved_rejected DEFAULT 'Pending',
    docx_path                   VARCHAR(500) NULL,
    pdf_path                    VARCHAR(500) NULL,
    docx_generated_at           TIMESTAMP NULL,
    pdf_generated_at            TIMESTAMP NULL,
    document_generation_status  TEXT CHECK (document_generation_status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
    created_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE SET NULL,
    FOREIGN KEY (org_version_id)   REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL,
    FOREIGN KEY (period_id)        REFERENCES tbl_period(period_id),
    FOREIGN KEY (base_program_id)  REFERENCES tbl_program(program_id) ON DELETE SET NULL,
    FOREIGN KEY (student_id)       REFERENCES tbl_user(user_id) ON DELETE SET NULL,
    FOREIGN KEY (applicant_user_id) REFERENCES tbl_user(user_id)
);

CREATE INDEX idx_document_status ON tbl_application(document_generation_status);

CREATE TRIGGER trg_application_updated_at
    BEFORE UPDATE ON tbl_application
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_application_executives
-- ============================================================

CREATE TABLE tbl_application_executives (
    app_exec_id      SERIAL PRIMARY KEY,
    application_id   INT NOT NULL,
    org_version_id   INT NULL,
    proposed_user_id VARCHAR(200) NULL,
    proposed_name    VARCHAR(255) NULL,
    proposed_email   VARCHAR(255) NULL,
    proposed_title   VARCHAR(100) NULL,
    proposed_rank_id INT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id) ON DELETE CASCADE,
    FOREIGN KEY (org_version_id) REFERENCES tbl_organization_version(org_version_id)
);

-- ============================================================
-- tbl_membership_application
-- ============================================================

CREATE TABLE tbl_membership_application (
    application_id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number    INT NOT NULL,
    user_id         VARCHAR(200) NOT NULL,
    status          status_pending_approved_rejected DEFAULT 'Pending',
    applied_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by     VARCHAR(200),
    reviewed_at     TIMESTAMP NULL,
    remarks         TEXT NULL,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id)      REFERENCES tbl_user(user_id),
    FOREIGN KEY (reviewed_by)  REFERENCES tbl_user(user_id)
);

-- ============================================================
-- tbl_membership_question
-- ============================================================

CREATE TABLE tbl_membership_question (
    question_id     SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number    INT NOT NULL,
    question_text   TEXT NOT NULL,
    question_type   question_type_membership DEFAULT 'text',
    is_required     BOOLEAN DEFAULT TRUE,
    options         JSONB NULL,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number)
);

-- ============================================================
-- tbl_membership_response
-- ============================================================

CREATE TABLE tbl_membership_response (
    response_id    SERIAL PRIMARY KEY,
    application_id INT NOT NULL,
    question_id    INT NOT NULL,
    response_value TEXT NOT NULL,
    FOREIGN KEY (application_id)
        REFERENCES tbl_membership_application(application_id),
    FOREIGN KEY (question_id)
        REFERENCES tbl_membership_question(question_id)
);

-- ============================================================
-- tbl_executive_member_permission
-- ============================================================

CREATE TABLE tbl_executive_member_permission (
    executive_permission_id SERIAL PRIMARY KEY,
    member_id               INT NOT NULL,
    organization_id         INT NULL,
    permission_id           INT NOT NULL,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_id)     REFERENCES tbl_organization_members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_committee
-- ============================================================

CREATE TABLE tbl_committee (
    committee_id    SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number    INT NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
);

-- ============================================================
-- tbl_committee_role
-- ============================================================

CREATE TABLE tbl_committee_role (
    committee_role_id SERIAL PRIMARY KEY,
    committee_id      INT NOT NULL,
    role_name         role_name_committee DEFAULT 'Committee Officer',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES tbl_committee(committee_id) ON DELETE CASCADE,
    CONSTRAINT unique_committee_head UNIQUE (committee_id, role_name)
);

-- ============================================================
-- tbl_committee_members
-- ============================================================

CREATE TABLE tbl_committee_members (
    committee_member_id SERIAL PRIMARY KEY,
    committee_id        INT NOT NULL,
    user_id             VARCHAR(200) NOT NULL,
    committee_role_id   INT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id)      REFERENCES tbl_committee(committee_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)           REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (committee_role_id) REFERENCES tbl_committee_role(committee_role_id) ON DELETE SET NULL
);

-- ============================================================
-- tbl_committee_role_permission
-- ============================================================

CREATE TABLE tbl_committee_role_permission (
    committee_role_permission_id SERIAL PRIMARY KEY,
    committee_role_id            INT NOT NULL,
    permission_id                INT NOT NULL,
    created_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_role_id) REFERENCES tbl_committee_role(committee_role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id)     REFERENCES tbl_permission(permission_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_archived_organization_members
-- ============================================================

CREATE TABLE tbl_archived_organization_members (
    archived_id       SERIAL PRIMARY KEY,
    member_id         INT NOT NULL,
    organization_id   INT NOT NULL,
    cycle_number      INT NOT NULL,
    user_id           VARCHAR(200) NOT NULL,
    member_type       member_type NOT NULL,
    executive_role_id INT DEFAULT NULL,
    committee_id      INT DEFAULT NULL,
    committee_role    committee_role_enum DEFAULT NULL,
    archived_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by       VARCHAR(200) NOT NULL,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id)           REFERENCES tbl_user(user_id),
    FOREIGN KEY (executive_role_id) REFERENCES tbl_executive_role(executive_role_id)
);

-- ============================================================
-- tbl_archived_committees
-- ============================================================

CREATE TABLE tbl_archived_committees (
    archive_id            SERIAL PRIMARY KEY,
    original_committee_id INT NOT NULL,
    organization_id       INT NOT NULL,
    cycle_number          INT NOT NULL,
    name                  VARCHAR(100) NOT NULL,
    description           TEXT,
    created_at            TIMESTAMP NOT NULL,
    archived_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by           VARCHAR(200) NOT NULL,
    reason                VARCHAR(255),
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (archived_by) REFERENCES tbl_user(user_id)
);

-- ============================================================
-- tbl_event
-- ============================================================

CREATE TABLE tbl_event (
    event_id        SERIAL PRIMARY KEY,
    organization_id INT NULL,
    cycle_number    INT NULL,
    event_type      event_type DEFAULT 'Organization',
    user_id         VARCHAR(200) NOT NULL,
    title           VARCHAR(300) NOT NULL,
    description     TEXT NOT NULL,
    image           TEXT NULL,
    venue_type      venue_type DEFAULT 'Face to face',
    venue           VARCHAR(200) NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    status          event_status DEFAULT 'Pending',
    type            event_fee_type,
    is_open_to      event_open_to DEFAULT 'Members only',
    fee             INT NULL,
    capacity        INT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    certificate     VARCHAR(1000) DEFAULT NULL,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_event_type  ON tbl_event(event_type);
CREATE INDEX idx_org_cycle   ON tbl_event(organization_id, cycle_number);
CREATE INDEX idx_dates       ON tbl_event(start_date, end_date);
CREATE INDEX idx_status      ON tbl_event(status);

-- ============================================================
-- tbl_blocked_period
-- ============================================================

CREATE TABLE tbl_blocked_period (
    blocked_period_id SERIAL PRIMARY KEY,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    reason            VARCHAR(255) NOT NULL,
    created_by        VARCHAR(200) NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at       TIMESTAMP NULL,
    archived_by       VARCHAR(200) NULL,
    archived_reason   VARCHAR(255) NULL,
    unarchived_at     TIMESTAMP NULL,
    unarchived_by     VARCHAR(200) NULL,
    unarchived_reason VARCHAR(255) NULL,
    FOREIGN KEY (created_by)    REFERENCES tbl_user(user_id),
    FOREIGN KEY (archived_by)   REFERENCES tbl_user(user_id),
    FOREIGN KEY (unarchived_by) REFERENCES tbl_user(user_id)
);

-- ============================================================
-- tbl_event_collaborator
-- ============================================================

CREATE TABLE tbl_event_collaborator (
    event_id        INT NOT NULL,
    organization_id INT NOT NULL,
    PRIMARY KEY (event_id, organization_id),
    FOREIGN KEY (event_id)        REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_event_application
-- ============================================================

CREATE TABLE tbl_event_application (
    event_application_id SERIAL PRIMARY KEY,
    organization_id      INT NOT NULL,
    cycle_number         INT NOT NULL,
    proposed_event_id    INT NULL,
    applicant_user_id    VARCHAR(200) NOT NULL,
    status               status_pending_approved_rejected_revision DEFAULT 'Pending',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (applicant_user_id)  REFERENCES tbl_user(user_id),
    FOREIGN KEY (proposed_event_id)  REFERENCES tbl_event(event_id)
);

CREATE TRIGGER trg_event_application_updated_at
    BEFORE UPDATE ON tbl_event_application
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_event_application_requirement
-- ============================================================

CREATE TABLE tbl_event_application_requirement (
    requirement_id    SERIAL PRIMARY KEY,
    requirement_name  VARCHAR(255) NOT NULL,
    is_applicable_to  is_applicable_to_pre_post DEFAULT 'pre-event',
    file_path         VARCHAR(255) NULL,
    status            requirement_status DEFAULT 'active',
    created_by        VARCHAR(200) NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TRIGGER trg_event_app_req_updated_at
    BEFORE UPDATE ON tbl_event_application_requirement
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_event_approval_process
-- ============================================================

CREATE TABLE tbl_event_approval_process (
    event_approval_id    SERIAL PRIMARY KEY,
    event_application_id INT NOT NULL,
    approver_id          VARCHAR(200) NOT NULL,
    approval_role_id     INT NOT NULL,
    status               status_pending_approved_rejected DEFAULT 'Pending',
    comment              TEXT,
    step_number          INT NOT NULL,
    approved_at          TIMESTAMP NULL,
    FOREIGN KEY (event_application_id) REFERENCES tbl_event_application(event_application_id),
    FOREIGN KEY (approver_id)          REFERENCES tbl_user(user_id),
    FOREIGN KEY (approval_role_id)     REFERENCES tbl_role(role_id)
);

-- ============================================================
-- tbl_event_requirement_submissions
-- ============================================================

CREATE TABLE tbl_event_requirement_submissions (
    submission_id        SERIAL PRIMARY KEY,
    event_id             INT,
    event_application_id INT,
    requirement_id       INT NOT NULL,
    cycle_number         INT NOT NULL,
    status               submission_status DEFAULT 'Pending',
    organization_id      INT NOT NULL,
    file_path            VARCHAR(255) NOT NULL,
    submitted_by         VARCHAR(200) NOT NULL,
    submitted_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    viewed_by            VARCHAR(200) NULL,
    viewed_at            TIMESTAMP NULL,
    FOREIGN KEY (event_id)             REFERENCES tbl_event(event_id),
    FOREIGN KEY (event_application_id) REFERENCES tbl_event_application(event_application_id),
    FOREIGN KEY (requirement_id)       REFERENCES tbl_event_application_requirement(requirement_id),
    FOREIGN KEY (submitted_by)         REFERENCES tbl_user(user_id),
    FOREIGN KEY (viewed_by)            REFERENCES tbl_user(user_id),
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE
);

-- ============================================================
-- tbl_event_course
-- ============================================================

CREATE TABLE tbl_event_course (
    event_id   INT NOT NULL,
    program_id INT NOT NULL,
    PRIMARY KEY (event_id, program_id),
    FOREIGN KEY (event_id)   REFERENCES tbl_event(event_id),
    FOREIGN KEY (program_id) REFERENCES tbl_program(program_id)
);

-- ============================================================
-- tbl_certificate_template
-- ============================================================

CREATE TABLE tbl_certificate_template (
    template_id   SERIAL PRIMARY KEY,
    event_id      INT NOT NULL UNIQUE,
    template_path VARCHAR(255) NOT NULL,
    uploaded_by   VARCHAR(200) NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id)    REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- ============================================================
-- tbl_event_certificate
-- ============================================================

CREATE TABLE tbl_event_certificate (
    certificate_id    SERIAL PRIMARY KEY,
    event_id          INT NOT NULL,
    user_id           VARCHAR(200) NOT NULL,
    template_id       INT NOT NULL,
    certificate_path  VARCHAR(255) NOT NULL,
    verification_code VARCHAR(36) UNIQUE NOT NULL,
    issued_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id)    REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (template_id) REFERENCES tbl_certificate_template(template_id) ON DELETE CASCADE,
    UNIQUE (event_id, user_id)
);

-- ============================================================
-- tbl_project_heads
-- ============================================================

CREATE TABLE tbl_project_heads (
    project_head_id SERIAL PRIMARY KEY,
    organization_id INT NOT NULL,
    user_id         VARCHAR(200) NOT NULL,
    event_id        INT NOT NULL,
    role_type       role_type_exec_committee NOT NULL,
    project_name    VARCHAR(255) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES tbl_organization(organization_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)         REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (event_id)        REFERENCES tbl_event(event_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_evaluation_question_group
-- ============================================================

CREATE TABLE tbl_evaluation_question_group (
    group_id          SERIAL PRIMARY KEY,
    group_title       VARCHAR(255) NOT NULL,
    group_description TEXT,
    is_active         BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- tbl_evaluation_question
-- ============================================================

CREATE TABLE tbl_evaluation_question (
    question_id   SERIAL PRIMARY KEY,
    group_id      INT NOT NULL,
    question_text TEXT NOT NULL,
    question_type question_type_evaluation NOT NULL,
    is_required   BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (group_id) REFERENCES tbl_evaluation_question_group(group_id)
);

-- ============================================================
-- tbl_event_evaluation_config
-- ============================================================

CREATE TABLE tbl_event_evaluation_config (
    event_id INT NOT NULL,
    group_id INT NOT NULL,
    PRIMARY KEY (event_id, group_id),
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES tbl_evaluation_question_group(group_id)
);

-- ============================================================
-- tbl_event_evaluation_settings
-- ============================================================

CREATE TABLE tbl_event_evaluation_settings (
    event_id   INT PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date   DATE NULL,
    start_time TIME NOT NULL,
    end_time   TIME NULL,
    is_active  BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_evaluation
-- ============================================================

CREATE TABLE tbl_evaluation (
    evaluation_id    SERIAL PRIMARY KEY,
    event_id         INT NOT NULL,
    user_id          VARCHAR(200) NOT NULL,
    submitted_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_seconds INT DEFAULT NULL,
    FOREIGN KEY (event_id) REFERENCES tbl_event(event_id),
    FOREIGN KEY (user_id)  REFERENCES tbl_user(user_id)
);

-- ============================================================
-- tbl_evaluation_response
-- ============================================================

CREATE TABLE tbl_evaluation_response (
    response_id    SERIAL PRIMARY KEY,
    evaluation_id  INT NOT NULL,
    question_id    INT NOT NULL,
    response_value TEXT NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluation_id) REFERENCES tbl_evaluation(evaluation_id)
);

-- ============================================================
-- tbl_approval_process
-- ============================================================

CREATE TABLE tbl_approval_process (
    approval_id      SERIAL PRIMARY KEY,
    application_id   INT NOT NULL,
    period_id        INT NULL,
    approver_id      VARCHAR(200) NOT NULL,
    approval_role_id INT NOT NULL,
    application_type application_type NOT NULL DEFAULT 'new',
    status           status_pending_approved_rejected DEFAULT 'Pending',
    comment          TEXT,
    step             INT NOT NULL,
    timestamp        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id)   REFERENCES tbl_application(application_id) ON DELETE CASCADE,
    FOREIGN KEY (period_id)        REFERENCES tbl_period(period_id) ON DELETE CASCADE,
    FOREIGN KEY (approver_id)      REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (approval_role_id) REFERENCES tbl_role(role_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_application_approval
-- ============================================================

CREATE TABLE tbl_application_approval (
    application_id INT NOT NULL,
    approval_id    INT NOT NULL,
    PRIMARY KEY (application_id, approval_id),
    FOREIGN KEY (application_id) REFERENCES tbl_application(application_id),
    FOREIGN KEY (approval_id)    REFERENCES tbl_approval_process(approval_id)
);

-- ============================================================
-- tbl_application_requirement
-- ============================================================

CREATE TABLE tbl_application_requirement (
    requirement_id   SERIAL PRIMARY KEY,
    requirement_name VARCHAR(255) NOT NULL,
    is_applicable_to is_applicable_to_new_renew DEFAULT 'new',
    file_path        VARCHAR(255) NULL,
    created_by       VARCHAR(200) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES tbl_user(user_id)
);

CREATE TRIGGER trg_app_requirement_updated_at
    BEFORE UPDATE ON tbl_application_requirement
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_organization_requirement_submission
-- ============================================================

CREATE TABLE tbl_organization_requirement_submission (
    submission_id               SERIAL PRIMARY KEY,
    application_id              INT,
    requirement_id              INT NOT NULL,
    cycle_number                INT NULL,
    organization_id             INT NULL,
    org_version_id              INT NULL,
    file_path                   VARCHAR(255) NOT NULL,
    submitted_by                VARCHAR(200) NOT NULL,
    submitted_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status                      status_pending_approved_rejected DEFAULT 'Pending',
    submitted_requirement_title VARCHAR(255) NULL,
    submitted_requirement_hash  VARCHAR(64) NULL,
    FOREIGN KEY (application_id)   REFERENCES tbl_application(application_id),
    FOREIGN KEY (requirement_id)   REFERENCES tbl_application_requirement(requirement_id),
    FOREIGN KEY (submitted_by)     REFERENCES tbl_user(user_id),
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE CASCADE,
    CONSTRAINT fk_org_req_sub_version
        FOREIGN KEY (org_version_id)
        REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL
);

-- ============================================================
-- tbl_notification
-- ============================================================

CREATE TABLE tbl_notification (
    notification_id SERIAL PRIMARY KEY,
    sender_id       VARCHAR(200) DEFAULT NULL,
    entity_type     notification_entity_type NOT NULL,
    entity_id       INT DEFAULT NULL,
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    url             VARCHAR(255) DEFAULT NULL,
    action          VARCHAR(100) DEFAULT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- tbl_notification_recipient
-- ============================================================

CREATE TABLE tbl_notification_recipient (
    notification_recipient_id SERIAL PRIMARY KEY,
    notification_id           INT NOT NULL,
    recipient_email           VARCHAR(100) NOT NULL,
    is_read                   BOOLEAN DEFAULT FALSE,
    created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (notification_id) REFERENCES tbl_notification(notification_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_logs
-- ============================================================

CREATE TABLE tbl_logs (
    log_id       SERIAL PRIMARY KEY,
    user_id      VARCHAR(200) NOT NULL,
    timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    action_type  TEXT NOT NULL,
    redirect_url VARCHAR(500) DEFAULT NULL,
    file_path    TEXT DEFAULT NULL,
    meta_data    JSONB DEFAULT NULL,
    type         VARCHAR(100) DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

-- ============================================================
-- tbl_transaction_type
-- ============================================================

CREATE TABLE tbl_transaction_type (
    transaction_type_id SERIAL PRIMARY KEY,
    code                VARCHAR(50) UNIQUE NOT NULL,
    label               VARCHAR(100) NOT NULL
);

-- ============================================================
-- tbl_payment_type
-- ============================================================

CREATE TABLE tbl_payment_type (
    payment_type_id SERIAL PRIMARY KEY,
    code            VARCHAR(50) UNIQUE NOT NULL,
    label           VARCHAR(100) NOT NULL,
    method_group    VARCHAR(50) NOT NULL
);

-- ============================================================
-- tbl_financial_category
-- ============================================================

CREATE TABLE tbl_financial_category (
    category_id        SERIAL PRIMARY KEY,
    code               VARCHAR(50) UNIQUE NOT NULL,
    label              VARCHAR(100) NOT NULL,
    kind               financial_kind NOT NULL,
    parent_category_id INT NULL,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    FOREIGN KEY (parent_category_id)
        REFERENCES tbl_financial_category(category_id) ON DELETE SET NULL
);

-- ============================================================
-- tbl_transaction_type_category
-- ============================================================

CREATE TABLE tbl_transaction_type_category (
    transaction_type_id INT NOT NULL,
    category_id         INT NOT NULL,
    PRIMARY KEY (transaction_type_id, category_id),
    FOREIGN KEY (transaction_type_id)
        REFERENCES tbl_transaction_type(transaction_type_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id)
        REFERENCES tbl_financial_category(category_id) ON DELETE CASCADE
);

-- ============================================================
-- tbl_transaction
-- ============================================================

CREATE TABLE tbl_transaction (
    transaction_id      SERIAL PRIMARY KEY,
    user_id             VARCHAR(200) NULL,
    payer_name          VARCHAR(255) NULL,
    payee_name          VARCHAR(255) NULL,
    payment_description VARCHAR(255) NOT NULL,
    amount              DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    transaction_type_id INT NOT NULL,
    payment_type_id     INT NOT NULL,
    category_id         INT NULL,
    org_version_id      INT NULL,
    status              transaction_status DEFAULT 'Pending',
    transaction_date    TIMESTAMP NOT NULL,
    receipt_no          VARCHAR(100) NULL,
    proof_image         VARCHAR(500) DEFAULT NULL,
    remarks             TEXT NULL,
    qr_token            VARCHAR(500) NULL,
    qr_enabled          BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_at         TIMESTAMP NULL,
    archived_by         VARCHAR(200) NULL,
    archived_reason     VARCHAR(255) NULL,
    CONSTRAINT uq_transaction_receipt_no UNIQUE (receipt_no),
    FOREIGN KEY (user_id)
        REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (payment_type_id)
        REFERENCES tbl_payment_type(payment_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (transaction_type_id)
        REFERENCES tbl_transaction_type(transaction_type_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (category_id)
        REFERENCES tbl_financial_category(category_id) ON DELETE SET NULL,
    FOREIGN KEY (archived_by)
        REFERENCES tbl_user(user_id) ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (org_version_id)
        REFERENCES tbl_organization_version(org_version_id) ON DELETE SET NULL,
    CONSTRAINT fk_txn_type_category
        FOREIGN KEY (transaction_type_id, category_id)
        REFERENCES tbl_transaction_type_category(transaction_type_id, category_id)
);

CREATE INDEX idx_txn_org_version      ON tbl_transaction(org_version_id);
CREATE INDEX idx_txn_org_version_date ON tbl_transaction(org_version_id, transaction_date);
CREATE INDEX idx_qr_token             ON tbl_transaction(qr_token);

CREATE TRIGGER trg_transaction_updated_at
    BEFORE UPDATE ON tbl_transaction
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tbl_transaction.remarks   IS 'Additional notes about the transaction (e.g., reason for failure, special instructions)';
COMMENT ON COLUMN tbl_transaction.qr_token  IS 'Encrypted QR verification token';
COMMENT ON COLUMN tbl_transaction.qr_enabled IS 'Whether QR verification is enabled for this transaction';

-- ============================================================
-- tbl_transaction_verification
-- ============================================================

CREATE TABLE tbl_transaction_verification (
    verification_id       SERIAL PRIMARY KEY,
    transaction_id        INT NOT NULL,
    jwt_token_id          VARCHAR(255) NOT NULL UNIQUE,
    token_hash            VARCHAR(255) NOT NULL,
    generated_by          VARCHAR(200) NOT NULL,
    generated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at            TIMESTAMP NOT NULL,
    verification_count    INT DEFAULT 0,
    last_verified_at      TIMESTAMP NULL,
    last_verified_ip      VARCHAR(45) NULL,
    last_verified_user_agent TEXT NULL,
    is_revoked            BOOLEAN DEFAULT FALSE,
    revoked_at            TIMESTAMP NULL,
    revoked_by            VARCHAR(200) NULL,
    revoke_reason         VARCHAR(255) NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (generated_by)   REFERENCES tbl_user(user_id) ON UPDATE CASCADE,
    FOREIGN KEY (revoked_by)     REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_token_hash        ON tbl_transaction_verification(token_hash);
CREATE INDEX idx_jwt_id            ON tbl_transaction_verification(jwt_token_id);
CREATE INDEX idx_transaction_id    ON tbl_transaction_verification(transaction_id);
CREATE INDEX idx_expires_at        ON tbl_transaction_verification(expires_at);
CREATE INDEX idx_verification_count ON tbl_transaction_verification(verification_count);
CREATE INDEX idx_generated_by      ON tbl_transaction_verification(generated_by);

-- ============================================================
-- tbl_event_attendance
-- ============================================================

CREATE TABLE tbl_event_attendance (
    attendance_id  SERIAL PRIMARY KEY,
    event_id       INT NOT NULL,
    user_id        VARCHAR(200) NOT NULL,
    transaction_id INT NULL,
    status         status_pending_registered_evaluated_attended_rejected NOT NULL,
    time_in        TIMESTAMP DEFAULT NULL,
    time_out       TIMESTAMP DEFAULT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at     TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE SET NULL,
    FOREIGN KEY (event_id)       REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)        REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE TRIGGER trg_event_attendance_updated_at
    BEFORE UPDATE ON tbl_event_attendance
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_event_reminder_log
-- ============================================================

CREATE TABLE IF NOT EXISTS tbl_event_reminder_log (
    log_id          SERIAL PRIMARY KEY,
    event_id        INT NOT NULL,
    user_id         VARCHAR(200) NOT NULL,
    reminder_type   reminder_type NOT NULL,
    sent_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recipient_email VARCHAR(255) NOT NULL,
    CONSTRAINT unique_reminder UNIQUE (event_id, user_id, reminder_type),
    CONSTRAINT fk_reminder_event
        FOREIGN KEY (event_id) REFERENCES tbl_event(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_reminder_user
        FOREIGN KEY (user_id) REFERENCES tbl_user(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX idx_event_user    ON tbl_event_reminder_log(event_id, user_id);
CREATE INDEX idx_reminder_type ON tbl_event_reminder_log(reminder_type);
CREATE INDEX idx_sent_at       ON tbl_event_reminder_log(sent_at);

-- ============================================================
-- tbl_transaction_membership
-- ============================================================

CREATE TABLE tbl_transaction_membership (
    transaction_id  INT PRIMARY KEY,
    organization_id INT NOT NULL,
    cycle_number    INT NOT NULL,
    FOREIGN KEY (transaction_id)
        REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number) ON DELETE RESTRICT
);

-- ============================================================
-- tbl_transaction_event
-- ============================================================

CREATE TABLE tbl_transaction_event (
    transaction_id       INT PRIMARY KEY,
    event_id             INT NOT NULL,
    remarks              VARCHAR(255) DEFAULT NULL,
    payer_name_override  VARCHAR(255) NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id)       REFERENCES tbl_event(event_id) ON DELETE RESTRICT
);

-- ============================================================
-- tbl_receipt_sequence
-- ============================================================

CREATE TABLE tbl_receipt_sequence (
    series_key    VARCHAR(100) PRIMARY KEY,
    prefix        VARCHAR(50)  NOT NULL,
    pad_length    SMALLINT     NOT NULL DEFAULT 6,
    current_value INT          NOT NULL DEFAULT 0,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_receipt_sequence_updated_at
    BEFORE UPDATE ON tbl_receipt_sequence
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_transaction_audit_trail
-- ============================================================

CREATE TABLE tbl_transaction_audit_trail (
    audit_id            BIGSERIAL PRIMARY KEY,
    transaction_id      INT NOT NULL,
    action_type         audit_action_type NOT NULL,
    changed_by          VARCHAR(200) NULL,
    changed_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    old_status          transaction_status NULL,
    new_status          transaction_status NULL,
    old_amount          DECIMAL(10,2) NULL,
    new_amount          DECIMAL(10,2) NULL,
    old_payment_type_id INT NULL,
    new_payment_type_id INT NULL,
    old_category_id     INT NULL,
    new_category_id     INT NULL,
    old_proof_image     VARCHAR(500) NULL,
    new_proof_image     VARCHAR(500) NULL,
    changes_json        JSONB NULL,
    reason              VARCHAR(500) NULL,
    ip_address          VARCHAR(45) NULL,
    user_agent          VARCHAR(255) NULL,
    FOREIGN KEY (transaction_id) REFERENCES tbl_transaction(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by)     REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_transaction_audit ON tbl_transaction_audit_trail(transaction_id, changed_at);
CREATE INDEX idx_action_type       ON tbl_transaction_audit_trail(action_type);
CREATE INDEX idx_changed_by        ON tbl_transaction_audit_trail(changed_by);

COMMENT ON TABLE tbl_transaction_audit_trail IS 'Immutable audit log for all transaction changes';
COMMENT ON COLUMN tbl_transaction_audit_trail.changes_json IS 'Detailed field-by-field changes';
COMMENT ON COLUMN tbl_transaction_audit_trail.reason       IS 'Reason for change (especially for archives/cancellations)';

-- ============================================================
-- tbl_ai_conversation
-- ============================================================

CREATE TABLE tbl_ai_conversation (
    conversation_id        BIGSERIAL PRIMARY KEY,
    owner_id               VARCHAR(200) NOT NULL,
    title                  VARCHAR(255) NULL,
    system_prompt          TEXT NULL,
    model                  VARCHAR(100) DEFAULT 'deepseek-chat',
    temperature            DECIMAL(3,2) DEFAULT 0.7,
    top_p                  DECIMAL(3,2) DEFAULT 1.0,
    entity_type            ai_entity_type DEFAULT 'general',
    entity_id              INT NULL,
    summary                TEXT NULL,
    is_global              BOOLEAN DEFAULT TRUE,
    last_summary_message_id BIGINT NULL,
    is_archived            BOOLEAN DEFAULT FALSE,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_owner_updated ON tbl_ai_conversation(owner_id, updated_at DESC);
CREATE INDEX idx_scope         ON tbl_ai_conversation(entity_type, entity_id);

CREATE TRIGGER trg_ai_conversation_updated_at
    BEFORE UPDATE ON tbl_ai_conversation
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- tbl_ai_message
-- ============================================================

CREATE TABLE tbl_ai_message (
    message_id             BIGSERIAL PRIMARY KEY,
    conversation_id        BIGINT NOT NULL,
    role                   ai_role NOT NULL,
    user_id                VARCHAR(200) NULL,
    content                TEXT NOT NULL,
    model                  VARCHAR(100) NULL,
    context_organizations  JSONB NULL,
    message_scope          ai_message_scope DEFAULT 'current_view',
    meta                   JSONB NULL,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES tbl_ai_conversation(conversation_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)         REFERENCES tbl_user(user_id) ON UPDATE CASCADE
);

CREATE INDEX idx_conv_time    ON tbl_ai_message(conversation_id, created_at);
CREATE INDEX idx_conv_msg     ON tbl_ai_message(conversation_id, message_id);
CREATE INDEX idx_message_scope ON tbl_ai_message(conversation_id, message_scope);

COMMENT ON COLUMN tbl_ai_message.context_organizations IS 'Organizations referenced in this message';
COMMENT ON COLUMN tbl_ai_message.meta                  IS 'tool_calls, function args, etc.';

-- ============================================================
-- tbl_member_permission_override
-- ============================================================

CREATE TABLE tbl_member_permission_override (
    override_id   SERIAL PRIMARY KEY,
    member_id     INT NOT NULL,
    permission_id INT NOT NULL,
    is_allowed    BOOLEAN NOT NULL,
    FOREIGN KEY (member_id)     REFERENCES tbl_organization_members(member_id),
    FOREIGN KEY (permission_id) REFERENCES tbl_permission(permission_id)
);

-- ============================================================
-- tbl_membership_leave_application
-- ============================================================

CREATE TABLE tbl_membership_leave_application (
    leave_application_id SERIAL PRIMARY KEY,
    organization_id      INT NOT NULL,
    cycle_number         INT NOT NULL,
    user_id              VARCHAR(200) NOT NULL,
    leave_reason         TEXT NOT NULL,
    effective_date       DATE NULL,
    status               status_pending_approved_rejected DEFAULT 'Pending',
    applied_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_by          VARCHAR(200) NULL,
    reviewed_at          TIMESTAMP NULL,
    remarks              TEXT NULL,
    FOREIGN KEY (organization_id, cycle_number)
        REFERENCES tbl_renewal_cycle(organization_id, cycle_number),
    FOREIGN KEY (user_id)     REFERENCES tbl_user(user_id),
    FOREIGN KEY (reviewed_by) REFERENCES tbl_user(user_id)
);