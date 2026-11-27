const db = require('../config/database');
async function main() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS celebration_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL, created_by INT NOT NULL,
      kind VARCHAR(20) NOT NULL,
      scheduled_at DATETIME NOT NULL COMMENT 'India local time (Asia/Kolkata)',
      details JSON NOT NULL,
      request_key VARCHAR(64) NOT NULL, request_hash CHAR(64) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'new', manager_reply TEXT NULL,
      updated_by INT NULL, version INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_celebration_request (company_id, request_key),
      KEY idx_celebration_company (company_id, kind, id),
      KEY idx_celebration_status (status, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    console.log('Celebration requests table is ready.');
  } finally { await db.end(); }
}
main().catch(error => { console.error('Celebration migration failed:', error.code || error.message); process.exitCode = 1; });
