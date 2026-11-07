CREATE TABLE IF NOT EXISTS "auth_session" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ NULL,
  "revoked_reason" TEXT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_session_user_id_expires_at_idx" ON "auth_session"("user_id", "expires_at");
