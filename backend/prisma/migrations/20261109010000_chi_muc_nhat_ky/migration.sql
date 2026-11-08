-- Tra cứu nhật ký theo người thực hiện và theo hành động, kèm thứ tự thời gian.
CREATE INDEX "audit_log_user_id_created_at_idx" ON "audit_log"("user_id", "created_at");

CREATE INDEX "audit_log_action_created_at_idx" ON "audit_log"("action", "created_at");
