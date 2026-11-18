-- REVIEW ONLY. Take a backup and run checks/service_manager_pre_check.sql first.
-- MySQL DDL auto-commits. Run once in a maintenance window after deployment review.
-- No existing record is automatically classified; NULL requires manual review.
ALTER TABLE service_categories
  ADD COLUMN service_scope ENUM('in_house','partner') NULL,
  ADD COLUMN description TEXT NULL,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD INDEX idx_sm_category_scope (service_scope, status, sort_order);
ALTER TABLE services
  ADD COLUMN service_scope ENUM('in_house','partner') NULL,
  ADD INDEX idx_sm_service_scope (service_scope, status, category_id);
CREATE TABLE service_manager_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NOT NULL,
  service_scope ENUM('in_house','partner') NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT NOT NULL,
  action VARCHAR(60) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sm_audit_actor FOREIGN KEY (actor_id) REFERENCES eusers(user_id),
  INDEX idx_sm_audit_scope_date (service_scope, created_at, id),
  INDEX idx_sm_audit_entity (entity_type, entity_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- No cascading deletes: history is retained. Existing parent IDs are validated in
-- transactions; adding FKs to legacy tables requires a separate orphan review.
-- Rollback: first revert application routes. Export audit rows. Remove ONLY new
-- indexes/columns if no downstream consumers use them. Retain the audit table.
-- Do not drop existing tables or rewrite order, reward, refund or wallet records.
