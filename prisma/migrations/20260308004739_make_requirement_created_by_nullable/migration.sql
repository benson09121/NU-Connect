-- DropIndex
DROP INDEX "idx_tbl_user_email_trgm";

-- AlterTable
ALTER TABLE "tbl_application_requirement" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tbl_event_application_requirement" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tbl_user" ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid()::text;
