CREATE TABLE "account_audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "safe_data" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "account_audit_logs_actor_user_id_created_at_idx" ON "account_audit_logs"("actor_user_id", "created_at" DESC);
CREATE INDEX "account_audit_logs_action_created_at_idx" ON "account_audit_logs"("action", "created_at" DESC);
ALTER TABLE "account_audit_logs" ADD CONSTRAINT "account_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
