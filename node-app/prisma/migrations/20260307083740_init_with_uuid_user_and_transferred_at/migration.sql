-- CreateEnum
CREATE TYPE "ai_entity_type" AS ENUM ('general', 'user', 'organization', 'event', 'application', 'approval', 'system');

-- CreateEnum
CREATE TYPE "ai_message_scope" AS ENUM ('current_view', 'multi_org', 'global');

-- CreateEnum
CREATE TYPE "ai_role" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "application_type" AS ENUM ('new', 'renewal');

-- CreateEnum
CREATE TYPE "audit_action_type" AS ENUM ('CREATE', 'UPDATE', 'ARCHIVE', 'UNARCHIVE', 'COMPLETE', 'CANCEL', 'DELETE');

-- CreateEnum
CREATE TYPE "committee_role_enum" AS ENUM ('Committee Head', 'Committee Officer');

-- CreateEnum
CREATE TYPE "event_fee_type" AS ENUM ('Paid', 'Free');

-- CreateEnum
CREATE TYPE "event_open_to" AS ENUM ('Members only', 'Open to all', 'NU Students only');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('Organization', 'SDAO', 'System');

-- CreateEnum
CREATE TYPE "financial_kind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "is_applicable_to_new_renew" AS ENUM ('new', 'renew', 'both');

-- CreateEnum
CREATE TYPE "is_applicable_to_pre_post" AS ENUM ('pre-event', 'post-event');

-- CreateEnum
CREATE TYPE "member_type" AS ENUM ('Member', 'Executive', 'Committee');

-- CreateEnum
CREATE TYPE "membership_fee_type" AS ENUM ('Per Term', 'Whole Academic Year', 'Free');

-- CreateEnum
CREATE TYPE "notification_entity_type" AS ENUM ('user', 'organization', 'event', 'transaction', 'system', 'approval', 'general', 'application', 'period', 'requirement');

-- CreateEnum
CREATE TYPE "org_category" AS ENUM ('Co-Curricular Organization', 'Extra Curricular Organization');

-- CreateEnum
CREATE TYPE "org_version_status" AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');

-- CreateEnum
CREATE TYPE "permission_scope" AS ENUM ('Global', 'SDAO', 'Organization', 'Approver');

-- CreateEnum
CREATE TYPE "question_type_evaluation" AS ENUM ('textbox', 'likert_4');

-- CreateEnum
CREATE TYPE "question_type_membership" AS ENUM ('text', 'multiple_choice', 'checkbox', 'file_upload');

-- CreateEnum
CREATE TYPE "reminder_type" AS ENUM ('week_before', 'day_before', 'day_of');

-- CreateEnum
CREATE TYPE "requirement_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "role_name_committee" AS ENUM ('Committee Head', 'Committee Officer');

-- CreateEnum
CREATE TYPE "role_type_exec_committee" AS ENUM ('Executive', 'Committee');

-- CreateEnum
CREATE TYPE "status_active_archived" AS ENUM ('Active', 'Archived');

-- CreateEnum
CREATE TYPE "status_active_pending_archive" AS ENUM ('Active', 'Pending', 'Archive');

-- CreateEnum
CREATE TYPE "status_pending_approved_rejected" AS ENUM ('Pending', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "status_pending_approved_rejected_archived" AS ENUM ('Pending', 'Approved', 'Rejected', 'Archived');

-- CreateEnum
CREATE TYPE "status_pending_approved_rejected_renewal_archived" AS ENUM ('Pending', 'Approved', 'Rejected', 'Renewal', 'Archived');

-- CreateEnum
CREATE TYPE "status_pending_approved_rejected_revision" AS ENUM ('Pending', 'Approved', 'Rejected', 'Revision');

-- CreateEnum
CREATE TYPE "status_pending_completed_failed_cancelled" AS ENUM ('Pending', 'Completed', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "status_pending_registered_evaluated_attended_rejected" AS ENUM ('Pending', 'Registered', 'Evaluated', 'Attended', 'Rejected');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('Pending', 'Approved', 'Rejected', 'Viewed');

-- CreateEnum
CREATE TYPE "term_exclusion_policy" AS ENUM ('NONE', 'CURRENT_TERM', 'PRORATED');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('Pending', 'Completed', 'Failed', 'Cancelled');

-- CreateEnum
CREATE TYPE "venue_type" AS ENUM ('Face to face', 'Online');

-- CreateEnum
CREATE TYPE "payment_status_enum" AS ENUM ('Pending', 'Paid', 'Rejected', 'Cancelled');

-- CreateEnum
CREATE TYPE "approval_chain_status" AS ENUM ('Pending', 'Endorsed', 'Received', 'Signed', 'Approved', 'Rejected');

-- CreateTable
CREATE TABLE "tbl_academic_term" (
    "term_id" SERIAL NOT NULL,
    "term_name" VARCHAR(100) NOT NULL,
    "term_description" TEXT,
    "academic_year" VARCHAR(20),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(200) NOT NULL,

    CONSTRAINT "tbl_academic_term_pkey" PRIMARY KEY ("term_id")
);

-- CreateTable
CREATE TABLE "tbl_ai_conversation" (
    "conversation_id" BIGSERIAL NOT NULL,
    "owner_id" VARCHAR(200) NOT NULL,
    "title" VARCHAR(255),
    "system_prompt" TEXT,
    "model" VARCHAR(100) DEFAULT 'deepseek-chat',
    "temperature" DECIMAL(3,2) DEFAULT 0.7,
    "top_p" DECIMAL(3,2) DEFAULT 1.0,
    "entity_type" "ai_entity_type" DEFAULT 'general',
    "entity_id" INTEGER,
    "summary" TEXT,
    "is_global" BOOLEAN DEFAULT true,
    "last_summary_message_id" BIGINT,
    "is_archived" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_ai_conversation_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "tbl_ai_message" (
    "message_id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "role" "ai_role" NOT NULL,
    "user_id" VARCHAR(200),
    "content" TEXT NOT NULL,
    "model" VARCHAR(100),
    "context_organizations" JSONB,
    "message_scope" "ai_message_scope" DEFAULT 'current_view',
    "meta" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_ai_message_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "tbl_application" (
    "application_id" SERIAL NOT NULL,
    "organization_id" INTEGER,
    "cycle_number" INTEGER,
    "org_version_id" INTEGER,
    "submitted_org_name" VARCHAR(255),
    "submitted_org_logo" VARCHAR(500),
    "description" TEXT,
    "category" "org_category",
    "base_program_id" INTEGER,
    "student_id" VARCHAR(200),
    "submitter_contact_no" VARCHAR(20),
    "application_type" "application_type" NOT NULL,
    "period_id" INTEGER NOT NULL,
    "applicant_user_id" VARCHAR(200) NOT NULL,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "docx_path" VARCHAR(500),
    "pdf_path" VARCHAR(500),
    "docx_generated_at" TIMESTAMP(6),
    "pdf_generated_at" TIMESTAMP(6),
    "document_generation_status" TEXT DEFAULT 'pending',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "tbl_application_approval" (
    "application_id" INTEGER NOT NULL,
    "approval_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_application_approval_pkey" PRIMARY KEY ("application_id","approval_id")
);

-- CreateTable
CREATE TABLE "tbl_application_executives" (
    "app_exec_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "org_version_id" INTEGER,
    "proposed_name" VARCHAR(255),
    "proposed_email" VARCHAR(255),
    "proposed_title" VARCHAR(100),
    "proposed_rank_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_executives_pkey" PRIMARY KEY ("app_exec_id")
);

-- CreateTable
CREATE TABLE "tbl_application_requirement" (
    "requirement_id" SERIAL NOT NULL,
    "requirement_name" VARCHAR(255) NOT NULL,
    "is_applicable_to" "is_applicable_to_new_renew" DEFAULT 'new',
    "file_path" VARCHAR(255),
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_requirement_pkey" PRIMARY KEY ("requirement_id")
);

-- CreateTable
CREATE TABLE "tbl_approval_process" (
    "approval_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "period_id" INTEGER,
    "approver_id" VARCHAR(200) NOT NULL,
    "approval_role_id" INTEGER NOT NULL,
    "application_type" "application_type" NOT NULL DEFAULT 'new',
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "comment" TEXT,
    "step" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_approval_process_pkey" PRIMARY KEY ("approval_id")
);

-- CreateTable
CREATE TABLE "tbl_archived_committees" (
    "archive_id" SERIAL NOT NULL,
    "original_committee_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL,
    "archived_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_by" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "tbl_archived_committees_pkey" PRIMARY KEY ("archive_id")
);

-- CreateTable
CREATE TABLE "tbl_archived_organization_members" (
    "archived_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "member_type" "member_type" NOT NULL,
    "executive_role_id" INTEGER,
    "committee_id" INTEGER,
    "committee_role" "committee_role_enum",
    "archived_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_by" VARCHAR(200) NOT NULL,

    CONSTRAINT "tbl_archived_organization_members_pkey" PRIMARY KEY ("archived_id")
);

-- CreateTable
CREATE TABLE "tbl_blocked_period" (
    "blocked_period_id" SERIAL NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),
    "unarchived_at" TIMESTAMP(6),
    "unarchived_by" VARCHAR(200),
    "unarchived_reason" VARCHAR(255),

    CONSTRAINT "tbl_blocked_period_pkey" PRIMARY KEY ("blocked_period_id")
);

-- CreateTable
CREATE TABLE "tbl_certificate_template" (
    "template_id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "template_path" VARCHAR(255) NOT NULL,
    "uploaded_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_certificate_template_pkey" PRIMARY KEY ("template_id")
);

-- CreateTable
CREATE TABLE "tbl_college" (
    "college_id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "abbreviation" VARCHAR(20) NOT NULL,
    "status" "status_active_archived" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_college_pkey" PRIMARY KEY ("college_id")
);

-- CreateTable
CREATE TABLE "tbl_committee" (
    "committee_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_committee_pkey" PRIMARY KEY ("committee_id")
);

-- CreateTable
CREATE TABLE "tbl_committee_members" (
    "committee_member_id" SERIAL NOT NULL,
    "committee_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "committee_role_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_committee_members_pkey" PRIMARY KEY ("committee_member_id")
);

-- CreateTable
CREATE TABLE "tbl_committee_role" (
    "committee_role_id" SERIAL NOT NULL,
    "committee_id" INTEGER NOT NULL,
    "role_name" "role_name_committee" DEFAULT 'Committee Officer',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_committee_role_pkey" PRIMARY KEY ("committee_role_id")
);

-- CreateTable
CREATE TABLE "tbl_committee_role_permission" (
    "committee_role_permission_id" SERIAL NOT NULL,
    "committee_role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_committee_role_permission_pkey" PRIMARY KEY ("committee_role_permission_id")
);

-- CreateTable
CREATE TABLE "tbl_evaluation" (
    "evaluation_id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "submitted_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "duration_seconds" INTEGER,

    CONSTRAINT "tbl_evaluation_pkey" PRIMARY KEY ("evaluation_id")
);

-- CreateTable
CREATE TABLE "tbl_evaluation_question" (
    "question_id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "question_type_evaluation" NOT NULL,
    "is_required" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_evaluation_question_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "tbl_evaluation_question_group" (
    "group_id" SERIAL NOT NULL,
    "group_title" VARCHAR(255) NOT NULL,
    "group_description" TEXT,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_evaluation_question_group_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "tbl_evaluation_response" (
    "response_id" SERIAL NOT NULL,
    "evaluation_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "response_value" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_evaluation_response_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "tbl_event" (
    "event_id" SERIAL NOT NULL,
    "organization_id" INTEGER,
    "cycle_number" INTEGER,
    "event_type" "event_type" DEFAULT 'Organization',
    "user_id" VARCHAR(200) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "venue_type" "venue_type" DEFAULT 'Face to face',
    "venue" VARCHAR(200),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "status" "event_status" DEFAULT 'Pending',
    "type" "event_fee_type",
    "is_open_to" "event_open_to" DEFAULT 'Members only',
    "fee" INTEGER,
    "capacity" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "certificate" VARCHAR(1000),

    CONSTRAINT "tbl_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tbl_event_application" (
    "event_application_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "proposed_event_id" INTEGER,
    "applicant_user_id" VARCHAR(200) NOT NULL,
    "status" "status_pending_approved_rejected_revision" DEFAULT 'Pending',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_event_application_pkey" PRIMARY KEY ("event_application_id")
);

-- CreateTable
CREATE TABLE "tbl_event_application_requirement" (
    "requirement_id" SERIAL NOT NULL,
    "requirement_name" VARCHAR(255) NOT NULL,
    "is_applicable_to" "is_applicable_to_pre_post" DEFAULT 'pre-event',
    "file_path" VARCHAR(255),
    "status" "requirement_status" DEFAULT 'active',
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_event_application_requirement_pkey" PRIMARY KEY ("requirement_id")
);

-- CreateTable
CREATE TABLE "tbl_event_approval_process" (
    "event_approval_id" SERIAL NOT NULL,
    "event_application_id" INTEGER NOT NULL,
    "approver_id" VARCHAR(200) NOT NULL,
    "approval_role_id" INTEGER NOT NULL,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "comment" TEXT,
    "step_number" INTEGER NOT NULL,
    "approved_at" TIMESTAMP(6),

    CONSTRAINT "tbl_event_approval_process_pkey" PRIMARY KEY ("event_approval_id")
);

-- CreateTable
CREATE TABLE "tbl_event_attendance" (
    "attendance_id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "transaction_id" INTEGER,
    "status" "status_pending_registered_evaluated_attended_rejected" NOT NULL,
    "time_in" TIMESTAMP(6),
    "time_out" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "tbl_event_attendance_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "tbl_event_certificate" (
    "certificate_id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "template_id" INTEGER NOT NULL,
    "certificate_path" VARCHAR(255) NOT NULL,
    "verification_code" VARCHAR(36) NOT NULL,
    "issued_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_event_certificate_pkey" PRIMARY KEY ("certificate_id")
);

-- CreateTable
CREATE TABLE "tbl_event_collaborator" (
    "event_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_event_collaborator_pkey" PRIMARY KEY ("event_id","organization_id")
);

-- CreateTable
CREATE TABLE "tbl_event_course" (
    "event_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_event_course_pkey" PRIMARY KEY ("event_id","program_id")
);

-- CreateTable
CREATE TABLE "tbl_event_evaluation_config" (
    "event_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_event_evaluation_config_pkey" PRIMARY KEY ("event_id","group_id")
);

-- CreateTable
CREATE TABLE "tbl_event_evaluation_settings" (
    "event_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6),
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "tbl_event_evaluation_settings_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tbl_event_reminder_log" (
    "log_id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "reminder_type" "reminder_type" NOT NULL,
    "sent_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "recipient_email" VARCHAR(255) NOT NULL,

    CONSTRAINT "tbl_event_reminder_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "tbl_event_requirement_submissions" (
    "submission_id" SERIAL NOT NULL,
    "event_id" INTEGER,
    "event_application_id" INTEGER,
    "requirement_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "status" "submission_status" DEFAULT 'Pending',
    "organization_id" INTEGER NOT NULL,
    "file_path" VARCHAR(255) NOT NULL,
    "submitted_by" VARCHAR(200) NOT NULL,
    "submitted_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "viewed_by" VARCHAR(200),
    "viewed_at" TIMESTAMP(6),

    CONSTRAINT "tbl_event_requirement_submissions_pkey" PRIMARY KEY ("submission_id")
);

-- CreateTable
CREATE TABLE "tbl_executive_member_permission" (
    "executive_permission_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "organization_id" INTEGER,
    "permission_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_executive_member_permission_pkey" PRIMARY KEY ("executive_permission_id")
);

-- CreateTable
CREATE TABLE "tbl_executive_rank" (
    "rank_id" SERIAL NOT NULL,
    "rank_level" INTEGER NOT NULL,
    "default_title" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_executive_rank_pkey" PRIMARY KEY ("rank_id")
);

-- CreateTable
CREATE TABLE "tbl_executive_role" (
    "executive_role_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "role_title" VARCHAR(100) NOT NULL,
    "rank_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_executive_role_pkey" PRIMARY KEY ("executive_role_id")
);

-- CreateTable
CREATE TABLE "tbl_financial_category" (
    "category_id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "kind" "financial_kind" NOT NULL,
    "parent_category_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tbl_financial_category_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "tbl_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "user_email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "action" TEXT NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" INTEGER,
    "organization_id" INTEGER,
    "redirect_url" VARCHAR(500),
    "meta_data" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "tbl_member_permission_override" (
    "override_id" SERIAL NOT NULL,
    "member_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "is_allowed" BOOLEAN NOT NULL,

    CONSTRAINT "tbl_member_permission_override_pkey" PRIMARY KEY ("override_id")
);

-- CreateTable
CREATE TABLE "tbl_membership_application" (
    "application_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "applied_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" VARCHAR(200),
    "reviewed_at" TIMESTAMP(6),
    "remarks" TEXT,

    CONSTRAINT "tbl_membership_application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "tbl_membership_leave_application" (
    "leave_application_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "leave_reason" TEXT NOT NULL,
    "effective_date" DATE,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "applied_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" VARCHAR(200),
    "reviewed_at" TIMESTAMP(6),
    "remarks" TEXT,

    CONSTRAINT "tbl_membership_leave_application_pkey" PRIMARY KEY ("leave_application_id")
);

-- CreateTable
CREATE TABLE "tbl_membership_question" (
    "question_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "question_type_membership" DEFAULT 'text',
    "is_required" BOOLEAN DEFAULT true,
    "options" JSONB,

    CONSTRAINT "tbl_membership_question_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "tbl_membership_response" (
    "response_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "response_value" TEXT NOT NULL,

    CONSTRAINT "tbl_membership_response_pkey" PRIMARY KEY ("response_id")
);

-- CreateTable
CREATE TABLE "tbl_notification" (
    "notification_id" SERIAL NOT NULL,
    "sender_id" VARCHAR(200),
    "sender_name" VARCHAR(255),
    "type" VARCHAR(50) NOT NULL DEFAULT 'general',
    "entity_type" "notification_entity_type" NOT NULL,
    "entity_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "redirect_url" VARCHAR(500),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "tbl_notification_recipient" (
    "notification_recipient_id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "recipient_id" VARCHAR(200) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_notification_recipient_pkey" PRIMARY KEY ("notification_recipient_id")
);

-- CreateTable
CREATE TABLE "tbl_organization" (
    "organization_id" SERIAL NOT NULL,
    "adviser_id" VARCHAR(200) NOT NULL,
    "current_org_version_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(150),
    "status" "status_pending_approved_rejected_renewal_archived" DEFAULT 'Pending',
    "term_option" BOOLEAN,
    "term_exclusion_policy" "term_exclusion_policy" DEFAULT 'CURRENT_TERM',
    "payment_calculation_rules" JSONB,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_organization_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_course" (
    "organization_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_organization_course_pkey" PRIMARY KEY ("organization_id","program_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_members" (
    "member_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "org_version_id" INTEGER,
    "member_type" "member_type" DEFAULT 'Member',
    "status" "status_active_pending_archive" DEFAULT 'Active',
    "executive_role_id" INTEGER,
    "joined_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "payment_start_term_id" INTEGER,
    "excluded_terms" JSONB,

    CONSTRAINT "tbl_organization_members_pkey" PRIMARY KEY ("member_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_requirement_submission" (
    "submission_id" SERIAL NOT NULL,
    "application_id" INTEGER,
    "requirement_id" INTEGER NOT NULL,
    "cycle_number" INTEGER,
    "organization_id" INTEGER,
    "org_version_id" INTEGER,
    "file_path" VARCHAR(255) NOT NULL,
    "submitted_by" VARCHAR(200) NOT NULL,
    "submitted_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "submitted_requirement_title" VARCHAR(255),
    "submitted_requirement_hash" VARCHAR(64),

    CONSTRAINT "tbl_organization_requirement_submission_pkey" PRIMARY KEY ("submission_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_version" (
    "org_version_id" SERIAL NOT NULL,
    "organization_id" INTEGER,
    "name" VARCHAR(255) NOT NULL,
    "status" "org_version_status" DEFAULT 'Pending',
    "logo_path" VARCHAR(500),
    "description" TEXT,
    "base_program_id" INTEGER,
    "membership_fee_type" "membership_fee_type" DEFAULT 'Free',
    "category" "org_category" DEFAULT 'Co-Curricular Organization',
    "membership_fee_amount" DECIMAL(10,2),
    "is_recruiting" BOOLEAN DEFAULT true,
    "is_open_to_all_courses" BOOLEAN DEFAULT false,
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "valid_from" DATE,
    "valid_to" DATE,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_organization_version_pkey" PRIMARY KEY ("org_version_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_version_course" (
    "org_version_course_id" SERIAL NOT NULL,
    "org_version_id" INTEGER NOT NULL,
    "program_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_organization_version_course_pkey" PRIMARY KEY ("org_version_course_id")
);

-- CreateTable
CREATE TABLE "tbl_payment_type" (
    "payment_type_id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "method_group" VARCHAR(50) NOT NULL,

    CONSTRAINT "tbl_payment_type_pkey" PRIMARY KEY ("payment_type_id")
);

-- CreateTable
CREATE TABLE "tbl_application_period" (
    "period_id" SERIAL NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_by" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_period_pkey" PRIMARY KEY ("period_id")
);

-- CreateTable
CREATE TABLE "tbl_application_period_requirement" (
    "period_id" INTEGER NOT NULL,
    "requirement_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_application_period_requirement_pkey" PRIMARY KEY ("period_id","requirement_id")
);

-- CreateTable
CREATE TABLE "tbl_permission" (
    "permission_id" SERIAL NOT NULL,
    "permission_name" VARCHAR(200) NOT NULL,
    "scope" "permission_scope" DEFAULT 'Global',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_permission_pkey" PRIMARY KEY ("permission_id")
);

-- CreateTable
CREATE TABLE "tbl_program" (
    "program_id" SERIAL NOT NULL,
    "college_id" INTEGER NOT NULL,
    "name" VARCHAR(200),
    "abbreviation" VARCHAR(20),
    "status" "status_active_archived" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_program_pkey" PRIMARY KEY ("program_id")
);

-- CreateTable
CREATE TABLE "tbl_project_heads" (
    "project_head_id" SERIAL NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "event_id" INTEGER NOT NULL,
    "role_type" "role_type_exec_committee" NOT NULL,
    "project_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_project_heads_pkey" PRIMARY KEY ("project_head_id")
);

-- CreateTable
CREATE TABLE "tbl_rank_permission" (
    "rank_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_rank_permission_pkey" PRIMARY KEY ("rank_id","permission_id")
);

-- CreateTable
CREATE TABLE "tbl_receipt_sequence" (
    "series_key" VARCHAR(100) NOT NULL,
    "prefix" VARCHAR(50) NOT NULL,
    "pad_length" SMALLINT NOT NULL DEFAULT 6,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_receipt_sequence_pkey" PRIMARY KEY ("series_key")
);

-- CreateTable
CREATE TABLE "tbl_renewal_cycle" (
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "president_id" VARCHAR(200) NOT NULL,
    "org_version_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_renewal_cycle_pkey" PRIMARY KEY ("organization_id","cycle_number")
);

-- CreateTable
CREATE TABLE "tbl_role" (
    "role_id" SERIAL NOT NULL,
    "role_name" VARCHAR(100) NOT NULL,
    "is_approver" BOOLEAN DEFAULT false,
    "hierarchy_order" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_role_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "tbl_role_permission" (
    "role_permission_id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_role_permission_pkey" PRIMARY KEY ("role_permission_id")
);

-- CreateTable
CREATE TABLE "tbl_sdao_approver" (
    "user_id" VARCHAR(200) NOT NULL,
    "sdao_rank" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_sdao_approver_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tbl_section" (
    "section_id" SERIAL NOT NULL,
    "section_name" VARCHAR(100) NOT NULL,
    "program_id" INTEGER NOT NULL,
    "year_level" INTEGER,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_section_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction" (
    "transaction_id" SERIAL NOT NULL,
    "user_id" VARCHAR(200),
    "payer_name" VARCHAR(255),
    "payee_name" VARCHAR(255),
    "payment_description" VARCHAR(255) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "transaction_type_id" INTEGER NOT NULL,
    "payment_type_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "org_version_id" INTEGER,
    "status" "transaction_status" DEFAULT 'Pending',
    "transaction_date" TIMESTAMP(6) NOT NULL,
    "receipt_no" VARCHAR(100),
    "proof_image" VARCHAR(500),
    "remarks" TEXT,
    "qr_token" VARCHAR(500),
    "qr_enabled" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_transaction_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_audit_trail" (
    "audit_id" BIGSERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "action_type" "audit_action_type" NOT NULL,
    "changed_by" VARCHAR(200),
    "changed_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "old_status" "transaction_status",
    "new_status" "transaction_status",
    "old_amount" DECIMAL(10,2),
    "new_amount" DECIMAL(10,2),
    "old_payment_type_id" INTEGER,
    "new_payment_type_id" INTEGER,
    "old_category_id" INTEGER,
    "new_category_id" INTEGER,
    "old_proof_image" VARCHAR(500),
    "new_proof_image" VARCHAR(500),
    "changes_json" JSONB,
    "reason" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),

    CONSTRAINT "tbl_transaction_audit_trail_pkey" PRIMARY KEY ("audit_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_event" (
    "transaction_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "remarks" VARCHAR(255),
    "payer_name_override" VARCHAR(255),

    CONSTRAINT "tbl_transaction_event_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_membership" (
    "transaction_id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "cycle_number" INTEGER NOT NULL,

    CONSTRAINT "tbl_transaction_membership_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_type" (
    "transaction_type_id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,

    CONSTRAINT "tbl_transaction_type_pkey" PRIMARY KEY ("transaction_type_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_type_category" (
    "transaction_type_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,

    CONSTRAINT "tbl_transaction_type_category_pkey" PRIMARY KEY ("transaction_type_id","category_id")
);

-- CreateTable
CREATE TABLE "tbl_transaction_verification" (
    "verification_id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "jwt_token_id" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "generated_by" VARCHAR(200) NOT NULL,
    "generated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "verification_count" INTEGER DEFAULT 0,
    "last_verified_at" TIMESTAMP(6),
    "last_verified_ip" VARCHAR(45),
    "last_verified_user_agent" TEXT,
    "is_revoked" BOOLEAN DEFAULT false,
    "revoked_at" TIMESTAMP(6),
    "revoked_by" VARCHAR(200),
    "revoke_reason" VARCHAR(255),

    CONSTRAINT "tbl_transaction_verification_pkey" PRIMARY KEY ("verification_id")
);

-- CreateTable
CREATE TABLE "tbl_user" (
    "user_id" VARCHAR(200) NOT NULL DEFAULT gen_random_uuid()::text,
    "f_name" VARCHAR(50),
    "l_name" VARCHAR(50),
    "email" VARCHAR(100) NOT NULL,
    "program_id" INTEGER,
    "section_id" INTEGER,
    "role_id" INTEGER NOT NULL,
    "profile_picture" VARCHAR(255),
    "status" "status_active_pending_archive" DEFAULT 'Active',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "archived_reason" VARCHAR(255),

    CONSTRAINT "tbl_user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tbl_user_application" (
    "application_id" SERIAL NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "role_id" INTEGER NOT NULL,
    "program_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "status_pending_approved_rejected" DEFAULT 'Pending',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "rejected_reason" TEXT,
    "rejected_at" TIMESTAMP(6),
    "rejected_by" VARCHAR(200),
    "archived_at" TIMESTAMP(6),
    "archived_by" VARCHAR(200),
    "transferred_at" TIMESTAMP(6),

    CONSTRAINT "tbl_user_application_pkey" PRIMARY KEY ("application_id")
);

-- CreateTable
CREATE TABLE "tbl_term_payments" (
    "payment_id" SERIAL NOT NULL,
    "user_id" VARCHAR(200) NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "organization_version_id" INTEGER NOT NULL,
    "term_id" INTEGER NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "payment_status" TEXT DEFAULT 'Pending',
    "verified_by" VARCHAR(200),
    "verified_at" TIMESTAMP(6),
    "notes" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_term_payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "tbl_organization_approval_chain" (
    "chain_id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "period_id" INTEGER,
    "approver_user_id" VARCHAR(200) NOT NULL,
    "approver_role_id" INTEGER NOT NULL,
    "approval_order" INTEGER NOT NULL,
    "is_final_approval" BOOLEAN NOT NULL DEFAULT false,
    "uses_endorsed" BOOLEAN NOT NULL DEFAULT false,
    "status" "approval_chain_status" NOT NULL DEFAULT 'Pending',
    "signature_path" VARCHAR(255),
    "remarks" TEXT,
    "endorsed_at" TIMESTAMP(6),
    "received_at" TIMESTAMP(6),
    "signed_at" TIMESTAMP(6),
    "approved_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_organization_approval_chain_pkey" PRIMARY KEY ("chain_id")
);

-- CreateTable
CREATE TABLE "tbl_user_esignature" (
    "user_id" VARCHAR(200) NOT NULL,
    "signature_path" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_user_esignature_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "tbl_college_dean" (
    "id" SERIAL NOT NULL,
    "college_id" INTEGER NOT NULL,
    "dean_user_id" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tbl_college_dean_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_academic_term_term_name_key" ON "tbl_academic_term"("term_name");

-- CreateIndex
CREATE INDEX "idx_owner_updated" ON "tbl_ai_conversation"("owner_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_scope" ON "tbl_ai_conversation"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_conv_msg" ON "tbl_ai_message"("conversation_id", "message_id");

-- CreateIndex
CREATE INDEX "idx_conv_time" ON "tbl_ai_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_message_scope" ON "tbl_ai_message"("conversation_id", "message_scope");

-- CreateIndex
CREATE INDEX "idx_document_status" ON "tbl_application"("document_generation_status");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_certificate_template_event_id_key" ON "tbl_certificate_template"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_college_name_key" ON "tbl_college"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_college_abbreviation_key" ON "tbl_college"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "unique_committee_head" ON "tbl_committee_role"("committee_id", "role_name");

-- CreateIndex
CREATE INDEX "idx_dates" ON "tbl_event"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_event_type" ON "tbl_event"("event_type");

-- CreateIndex
CREATE INDEX "idx_org_cycle" ON "tbl_event"("organization_id", "cycle_number");

-- CreateIndex
CREATE INDEX "idx_status" ON "tbl_event"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_event_certificate_verification_code_key" ON "tbl_event_certificate"("verification_code");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_event_certificate_event_id_user_id_key" ON "tbl_event_certificate"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_event_user" ON "tbl_event_reminder_log"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_reminder_type" ON "tbl_event_reminder_log"("reminder_type");

-- CreateIndex
CREATE INDEX "idx_sent_at" ON "tbl_event_reminder_log"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "unique_reminder" ON "tbl_event_reminder_log"("event_id", "user_id", "reminder_type");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_executive_rank_rank_level_key" ON "tbl_executive_rank"("rank_level");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_financial_category_code_key" ON "tbl_financial_category"("code");

-- CreateIndex
CREATE INDEX "tbl_logs_user_id_idx" ON "tbl_logs"("user_id");

-- CreateIndex
CREATE INDEX "tbl_logs_action_type_idx" ON "tbl_logs"("action_type");

-- CreateIndex
CREATE INDEX "tbl_logs_created_at_idx" ON "tbl_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "tbl_logs_organization_id_idx" ON "tbl_logs"("organization_id");

-- CreateIndex
CREATE INDEX "tbl_logs_entity_type_entity_id_idx" ON "tbl_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "tbl_notification_created_at_idx" ON "tbl_notification"("created_at" DESC);

-- CreateIndex
CREATE INDEX "tbl_notification_recipient_recipient_id_is_read_idx" ON "tbl_notification_recipient"("recipient_id", "is_read");

-- CreateIndex
CREATE INDEX "tbl_notification_recipient_recipient_id_idx" ON "tbl_notification_recipient"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_organization_name_key" ON "tbl_organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_organization_slug_key" ON "tbl_organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_organization_version_course_org_version_id_program_id_key" ON "tbl_organization_version_course"("org_version_id", "program_id");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_payment_type_code_key" ON "tbl_payment_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_permission_permission_name_key" ON "tbl_permission"("permission_name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_program_name_key" ON "tbl_program"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_program_abbreviation_key" ON "tbl_program"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_role_role_name_key" ON "tbl_role"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_role_hierarchy_order_key" ON "tbl_role"("hierarchy_order");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_sdao_approver_sdao_rank_key" ON "tbl_sdao_approver"("sdao_rank");

-- CreateIndex
CREATE INDEX "idx_section_active" ON "tbl_section"("is_active");

-- CreateIndex
CREATE INDEX "idx_section_program" ON "tbl_section"("program_id");

-- CreateIndex
CREATE INDEX "idx_section_year" ON "tbl_section"("year_level");

-- CreateIndex
CREATE UNIQUE INDEX "uk_section_program_name" ON "tbl_section"("program_id", "section_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_transaction_receipt_no" ON "tbl_transaction"("receipt_no");

-- CreateIndex
CREATE INDEX "idx_qr_token" ON "tbl_transaction"("qr_token");

-- CreateIndex
CREATE INDEX "idx_txn_org_version" ON "tbl_transaction"("org_version_id");

-- CreateIndex
CREATE INDEX "idx_txn_org_version_date" ON "tbl_transaction"("org_version_id", "transaction_date");

-- CreateIndex
CREATE INDEX "idx_action_type" ON "tbl_transaction_audit_trail"("action_type");

-- CreateIndex
CREATE INDEX "idx_changed_by" ON "tbl_transaction_audit_trail"("changed_by");

-- CreateIndex
CREATE INDEX "idx_transaction_audit" ON "tbl_transaction_audit_trail"("transaction_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transaction_type_code_key" ON "tbl_transaction_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transaction_verification_jwt_token_id_key" ON "tbl_transaction_verification"("jwt_token_id");

-- CreateIndex
CREATE INDEX "idx_expires_at" ON "tbl_transaction_verification"("expires_at");

-- CreateIndex
CREATE INDEX "idx_generated_by" ON "tbl_transaction_verification"("generated_by");

-- CreateIndex
CREATE INDEX "idx_jwt_id" ON "tbl_transaction_verification"("jwt_token_id");

-- CreateIndex
CREATE INDEX "idx_token_hash" ON "tbl_transaction_verification"("token_hash");

-- CreateIndex
CREATE INDEX "idx_transaction_id" ON "tbl_transaction_verification"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_verification_count" ON "tbl_transaction_verification"("verification_count");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_user_email_key" ON "tbl_user"("email");

-- CreateIndex
CREATE INDEX "idx_user_section" ON "tbl_user"("section_id");

-- CreateIndex
CREATE INDEX "tbl_organization_approval_chain_application_id_approval_ord_idx" ON "tbl_organization_approval_chain"("application_id", "approval_order");

-- CreateIndex
CREATE INDEX "tbl_organization_approval_chain_approver_user_id_status_idx" ON "tbl_organization_approval_chain"("approver_user_id", "status");

-- CreateIndex
CREATE INDEX "tbl_college_dean_college_id_is_active_idx" ON "tbl_college_dean"("college_id", "is_active");

-- AddForeignKey
ALTER TABLE "tbl_academic_term" ADD CONSTRAINT "tbl_academic_term_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_ai_conversation" ADD CONSTRAINT "tbl_ai_conversation_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_ai_message" ADD CONSTRAINT "tbl_ai_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tbl_ai_conversation"("conversation_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_ai_message" ADD CONSTRAINT "tbl_ai_message_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_base_program_id_fkey" FOREIGN KEY ("base_program_id") REFERENCES "tbl_program"("program_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "tbl_application_period"("period_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application" ADD CONSTRAINT "tbl_application_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "tbl_user"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_approval" ADD CONSTRAINT "tbl_application_approval_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_approval" ADD CONSTRAINT "tbl_application_approval_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "tbl_approval_process"("approval_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_executives" ADD CONSTRAINT "tbl_application_executives_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_executives" ADD CONSTRAINT "tbl_application_executives_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_requirement" ADD CONSTRAINT "tbl_application_requirement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_approval_process" ADD CONSTRAINT "tbl_approval_process_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_approval_process" ADD CONSTRAINT "tbl_approval_process_approval_role_id_fkey" FOREIGN KEY ("approval_role_id") REFERENCES "tbl_role"("role_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_approval_process" ADD CONSTRAINT "tbl_approval_process_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_approval_process" ADD CONSTRAINT "tbl_approval_process_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "tbl_application_period"("period_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_archived_committees" ADD CONSTRAINT "tbl_archived_committees_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_archived_committees" ADD CONSTRAINT "tbl_archived_committees_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_archived_organization_members" ADD CONSTRAINT "tbl_archived_organization_mem_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_archived_organization_members" ADD CONSTRAINT "tbl_archived_organization_members_executive_role_id_fkey" FOREIGN KEY ("executive_role_id") REFERENCES "tbl_executive_role"("executive_role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_archived_organization_members" ADD CONSTRAINT "tbl_archived_organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_blocked_period" ADD CONSTRAINT "tbl_blocked_period_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_blocked_period" ADD CONSTRAINT "tbl_blocked_period_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_blocked_period" ADD CONSTRAINT "tbl_blocked_period_unarchived_by_fkey" FOREIGN KEY ("unarchived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_certificate_template" ADD CONSTRAINT "tbl_certificate_template_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_certificate_template" ADD CONSTRAINT "tbl_certificate_template_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_college" ADD CONSTRAINT "fk_college_archived_by" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_committee" ADD CONSTRAINT "tbl_committee_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_committee_members" ADD CONSTRAINT "tbl_committee_members_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "tbl_committee"("committee_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_committee_members" ADD CONSTRAINT "tbl_committee_members_committee_role_id_fkey" FOREIGN KEY ("committee_role_id") REFERENCES "tbl_committee_role"("committee_role_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_committee_members" ADD CONSTRAINT "tbl_committee_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_committee_role" ADD CONSTRAINT "tbl_committee_role_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "tbl_committee"("committee_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_committee_role_permission" ADD CONSTRAINT "tbl_committee_role_permission_committee_role_id_fkey" FOREIGN KEY ("committee_role_id") REFERENCES "tbl_committee_role"("committee_role_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_committee_role_permission" ADD CONSTRAINT "tbl_committee_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_evaluation" ADD CONSTRAINT "tbl_evaluation_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_evaluation" ADD CONSTRAINT "tbl_evaluation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_evaluation_question" ADD CONSTRAINT "tbl_evaluation_question_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tbl_evaluation_question_group"("group_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_evaluation_response" ADD CONSTRAINT "tbl_evaluation_response_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "tbl_evaluation"("evaluation_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event" ADD CONSTRAINT "tbl_event_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event" ADD CONSTRAINT "tbl_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_application" ADD CONSTRAINT "tbl_event_application_applicant_user_id_fkey" FOREIGN KEY ("applicant_user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_application" ADD CONSTRAINT "tbl_event_application_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_application" ADD CONSTRAINT "tbl_event_application_proposed_event_id_fkey" FOREIGN KEY ("proposed_event_id") REFERENCES "tbl_event"("event_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_application_requirement" ADD CONSTRAINT "tbl_event_application_requirement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_approval_process" ADD CONSTRAINT "tbl_event_approval_process_approval_role_id_fkey" FOREIGN KEY ("approval_role_id") REFERENCES "tbl_role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_approval_process" ADD CONSTRAINT "tbl_event_approval_process_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_approval_process" ADD CONSTRAINT "tbl_event_approval_process_event_application_id_fkey" FOREIGN KEY ("event_application_id") REFERENCES "tbl_event_application"("event_application_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_attendance" ADD CONSTRAINT "tbl_event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_attendance" ADD CONSTRAINT "tbl_event_attendance_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_attendance" ADD CONSTRAINT "tbl_event_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_certificate" ADD CONSTRAINT "tbl_event_certificate_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_certificate" ADD CONSTRAINT "tbl_event_certificate_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "tbl_certificate_template"("template_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_certificate" ADD CONSTRAINT "tbl_event_certificate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_collaborator" ADD CONSTRAINT "tbl_event_collaborator_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_collaborator" ADD CONSTRAINT "tbl_event_collaborator_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_course" ADD CONSTRAINT "tbl_event_course_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_course" ADD CONSTRAINT "tbl_event_course_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_evaluation_config" ADD CONSTRAINT "tbl_event_evaluation_config_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_evaluation_config" ADD CONSTRAINT "tbl_event_evaluation_config_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "tbl_evaluation_question_group"("group_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_evaluation_settings" ADD CONSTRAINT "tbl_event_evaluation_settings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_reminder_log" ADD CONSTRAINT "fk_reminder_event" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_reminder_log" ADD CONSTRAINT "fk_reminder_user" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submiss_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submissions_event_application_id_fkey" FOREIGN KEY ("event_application_id") REFERENCES "tbl_event_application"("event_application_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submissions_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "tbl_event_application_requirement"("requirement_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_event_requirement_submissions" ADD CONSTRAINT "tbl_event_requirement_submissions_viewed_by_fkey" FOREIGN KEY ("viewed_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_executive_member_permission" ADD CONSTRAINT "tbl_executive_member_permission_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tbl_organization_members"("member_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_executive_member_permission" ADD CONSTRAINT "tbl_executive_member_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_executive_role" ADD CONSTRAINT "tbl_executive_role_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_executive_role" ADD CONSTRAINT "tbl_executive_role_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "tbl_executive_rank"("rank_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_financial_category" ADD CONSTRAINT "tbl_financial_category_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "tbl_financial_category"("category_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_logs" ADD CONSTRAINT "tbl_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_logs" ADD CONSTRAINT "tbl_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_member_permission_override" ADD CONSTRAINT "tbl_member_permission_override_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "tbl_organization_members"("member_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_member_permission_override" ADD CONSTRAINT "tbl_member_permission_override_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_application" ADD CONSTRAINT "tbl_membership_application_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_application" ADD CONSTRAINT "tbl_membership_application_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_application" ADD CONSTRAINT "tbl_membership_application_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_leave_application" ADD CONSTRAINT "tbl_membership_leave_applicat_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_leave_application" ADD CONSTRAINT "tbl_membership_leave_application_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_leave_application" ADD CONSTRAINT "tbl_membership_leave_application_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_question" ADD CONSTRAINT "tbl_membership_question_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_response" ADD CONSTRAINT "tbl_membership_response_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_membership_application"("application_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_membership_response" ADD CONSTRAINT "tbl_membership_response_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "tbl_membership_question"("question_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_notification" ADD CONSTRAINT "tbl_notification_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "tbl_user"("user_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_notification_recipient" ADD CONSTRAINT "tbl_notification_recipient_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "tbl_notification"("notification_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_notification_recipient" ADD CONSTRAINT "tbl_notification_recipient_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization" ADD CONSTRAINT "fk_org_current_version" FOREIGN KEY ("current_org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization" ADD CONSTRAINT "tbl_organization_adviser_id_fkey" FOREIGN KEY ("adviser_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization" ADD CONSTRAINT "tbl_organization_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization_course" ADD CONSTRAINT "tbl_organization_course_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_course" ADD CONSTRAINT "tbl_organization_course_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_members" ADD CONSTRAINT "tbl_organization_members_executive_role_id_fkey" FOREIGN KEY ("executive_role_id") REFERENCES "tbl_executive_role"("executive_role_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_members" ADD CONSTRAINT "tbl_organization_members_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_members" ADD CONSTRAINT "tbl_organization_members_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_members" ADD CONSTRAINT "tbl_organization_members_payment_start_term_id_fkey" FOREIGN KEY ("payment_start_term_id") REFERENCES "tbl_academic_term"("term_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_members" ADD CONSTRAINT "tbl_organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization_requirement_submission" ADD CONSTRAINT "fk_org_req_sub_version" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_requirement_submission" ADD CONSTRAINT "tbl_organization_requirement__organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_requirement_submission" ADD CONSTRAINT "tbl_organization_requirement_submission_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_requirement_submission" ADD CONSTRAINT "tbl_organization_requirement_submission_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "tbl_application_requirement"("requirement_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_requirement_submission" ADD CONSTRAINT "tbl_organization_requirement_submission_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_version" ADD CONSTRAINT "fk_org_version_org" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_version" ADD CONSTRAINT "tbl_organization_version_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization_version" ADD CONSTRAINT "tbl_organization_version_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_version_course" ADD CONSTRAINT "tbl_organization_version_course_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_version_course" ADD CONSTRAINT "tbl_organization_version_course_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_period" ADD CONSTRAINT "tbl_application_period_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_application_period_requirement" ADD CONSTRAINT "tbl_application_period_requirement_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "tbl_application_period"("period_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_application_period_requirement" ADD CONSTRAINT "tbl_application_period_requirement_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "tbl_application_requirement"("requirement_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_program" ADD CONSTRAINT "fk_program_archived_by" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_program" ADD CONSTRAINT "fk_program_college" FOREIGN KEY ("college_id") REFERENCES "tbl_college"("college_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_project_heads" ADD CONSTRAINT "tbl_project_heads_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_project_heads" ADD CONSTRAINT "tbl_project_heads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_project_heads" ADD CONSTRAINT "tbl_project_heads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_rank_permission" ADD CONSTRAINT "tbl_rank_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_rank_permission" ADD CONSTRAINT "tbl_rank_permission_rank_id_fkey" FOREIGN KEY ("rank_id") REFERENCES "tbl_executive_rank"("rank_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_renewal_cycle" ADD CONSTRAINT "tbl_renewal_cycle_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_renewal_cycle" ADD CONSTRAINT "tbl_renewal_cycle_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_renewal_cycle" ADD CONSTRAINT "tbl_renewal_cycle_president_id_fkey" FOREIGN KEY ("president_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_role_permission" ADD CONSTRAINT "tbl_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tbl_permission"("permission_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_role_permission" ADD CONSTRAINT "tbl_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("role_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_sdao_approver" ADD CONSTRAINT "tbl_sdao_approver_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_section" ADD CONSTRAINT "fk_section_program" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "fk_txn_type_category" FOREIGN KEY ("transaction_type_id", "category_id") REFERENCES "tbl_transaction_type_category"("transaction_type_id", "category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tbl_financial_category"("category_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_org_version_id_fkey" FOREIGN KEY ("org_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "tbl_payment_type"("payment_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_transaction_type_id_fkey" FOREIGN KEY ("transaction_type_id") REFERENCES "tbl_transaction_type"("transaction_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction" ADD CONSTRAINT "tbl_transaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction_audit_trail" ADD CONSTRAINT "tbl_transaction_audit_trail_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction_audit_trail" ADD CONSTRAINT "tbl_transaction_audit_trail_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_event" ADD CONSTRAINT "tbl_transaction_event_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "tbl_event"("event_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_event" ADD CONSTRAINT "tbl_transaction_event_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_membership" ADD CONSTRAINT "tbl_transaction_membership_organization_id_cycle_number_fkey" FOREIGN KEY ("organization_id", "cycle_number") REFERENCES "tbl_renewal_cycle"("organization_id", "cycle_number") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_membership" ADD CONSTRAINT "tbl_transaction_membership_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_type_category" ADD CONSTRAINT "tbl_transaction_type_category_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tbl_financial_category"("category_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_type_category" ADD CONSTRAINT "tbl_transaction_type_category_transaction_type_id_fkey" FOREIGN KEY ("transaction_type_id") REFERENCES "tbl_transaction_type"("transaction_type_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_transaction_verification" ADD CONSTRAINT "tbl_transaction_verification_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction_verification" ADD CONSTRAINT "tbl_transaction_verification_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_transaction_verification" ADD CONSTRAINT "tbl_transaction_verification_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user" ADD CONSTRAINT "tbl_user_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user" ADD CONSTRAINT "tbl_user_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user" ADD CONSTRAINT "tbl_user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user" ADD CONSTRAINT "tbl_user_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "tbl_section"("section_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_application" ADD CONSTRAINT "tbl_user_application_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_application" ADD CONSTRAINT "tbl_user_application_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "tbl_program"("program_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user_application" ADD CONSTRAINT "tbl_user_application_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_user_application" ADD CONSTRAINT "tbl_user_application_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tbl_role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "tbl_organization"("organization_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_organization_version_id_fkey" FOREIGN KEY ("organization_version_id") REFERENCES "tbl_organization_version"("org_version_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "tbl_academic_term"("term_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "tbl_transaction"("transaction_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_term_payments" ADD CONSTRAINT "tbl_term_payments_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_organization_approval_chain" ADD CONSTRAINT "tbl_organization_approval_chain_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "tbl_application"("application_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_approval_chain" ADD CONSTRAINT "tbl_organization_approval_chain_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "tbl_application_period"("period_id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_approval_chain" ADD CONSTRAINT "tbl_organization_approval_chain_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_organization_approval_chain" ADD CONSTRAINT "tbl_organization_approval_chain_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "tbl_role"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_user_esignature" ADD CONSTRAINT "tbl_user_esignature_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tbl_user"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_college_dean" ADD CONSTRAINT "tbl_college_dean_college_id_fkey" FOREIGN KEY ("college_id") REFERENCES "tbl_college"("college_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tbl_college_dean" ADD CONSTRAINT "tbl_college_dean_dean_user_id_fkey" FOREIGN KEY ("dean_user_id") REFERENCES "tbl_user"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
