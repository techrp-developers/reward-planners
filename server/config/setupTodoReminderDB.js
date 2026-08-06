const db = require("./database");

async function setupTodoReminderDB() {
  try {
    console.log("[TodoReminderSetup] Ensuring todo_reminders table exists...");

    await db.execute(`
      CREATE TABLE IF NOT EXISTS todo_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        todo_id INT NOT NULL,
        user_id INT NOT NULL,
        reminder_type VARCHAR(20) NOT NULL,
        reminder_label VARCHAR(100) DEFAULT NULL,
        scheduled_for DATETIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempt_count INT NOT NULL DEFAULT 0,
        sent_at DATETIME DEFAULT NULL,
        last_error TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_todo_reminder (todo_id, reminder_type, scheduled_for),
        KEY idx_todo_reminders_due (status, scheduled_for),
        KEY idx_todo_reminders_todo (todo_id),
        KEY idx_todo_reminders_user (user_id)
      ) ENGINE=InnoDB;
    `);

    await db.execute(`
      INSERT IGNORE INTO todo_reminders
      (
        todo_id,
        user_id,
        reminder_type,
        reminder_label,
        scheduled_for,
        status
      )
      SELECT
        t.id,
        t.created_by,
        'START_15',
        '15 min before',
        DATE_SUB(TIMESTAMP(t.task_date, t.start_time), INTERVAL 15 MINUTE),
        'pending'
      FROM todos t
      WHERE t.completed = 0
        AND TIMESTAMP(t.task_date, t.start_time) > NOW();
    `);

    await db.execute(`
      INSERT IGNORE INTO todo_reminders
      (
        todo_id,
        user_id,
        reminder_type,
        reminder_label,
        scheduled_for,
        status
      )
      SELECT
        t.id,
        t.created_by,
        'CUSTOM',
        t.reminder_time,
        TIMESTAMP(t.task_date, t.reminder_time),
        'pending'
      FROM todos t
      WHERE t.completed = 0
        AND t.reminder_time IS NOT NULL
        AND t.reminder_time != ''
        AND TIMESTAMP(t.task_date, t.reminder_time) > NOW();
    `);

    console.log("[TodoReminderSetup] todo_reminders setup complete.");
  } catch (error) {
    console.error("[TodoReminderSetup] Failed to setup todo reminders:", error.message);
  }
}

module.exports = setupTodoReminderDB;
