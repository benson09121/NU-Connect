-- AlterTable
ALTER TABLE "tbl_user" ALTER COLUMN "user_id" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "tbl_user_application" ADD COLUMN "college" VARCHAR(255);
