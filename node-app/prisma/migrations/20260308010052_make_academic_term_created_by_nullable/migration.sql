-- AlterTable
ALTER TABLE "tbl_academic_term" ALTER COLUMN "created_by" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tbl_user" ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid()::text;
