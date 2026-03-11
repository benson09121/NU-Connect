-- Enable pg_trgm extension for trigram-based substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index for trigram search on email
CREATE INDEX IF NOT EXISTS idx_tbl_user_email_trgm
  ON tbl_user USING GIN (email gin_trgm_ops);

-- GIN index for trigram search on full name (lowercase concatenated)
CREATE INDEX IF NOT EXISTS idx_tbl_user_fullname_trgm
  ON tbl_user USING GIN ((LOWER(COALESCE(f_name, '')) || ' ' || LOWER(COALESCE(l_name, ''))) gin_trgm_ops);
