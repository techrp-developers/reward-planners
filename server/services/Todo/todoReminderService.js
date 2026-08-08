const db = require("../../config/database");
const {
  saveInAppNotification,
  sendDirectPushNotification,
} = require("../push/separatePushService");

function buildLocalDateTime(date, time) {
  if (!date || !time) return null;

  const dateMatch = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(time).slice(0, 8).match(/^(\d{2}):(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const monthIndex = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const seconds = Number(timeMatch[3]);

  const localDate = new Date(year, monthIndex, day, hours, minutes, seconds, 0);
  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

function formatLocalDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildReminderPayload(todo, reminder) {
  const isStartReminder = reminder.reminder_type === "START_15";
  const title = isStartReminder
    ? `Upcoming Task: ${todo.title}`
    : `Reminder: ${todo.title}`;
  const message = isStartReminder
    ? `Starts in 15 minutes at ${todo.start_time}!`
    : (todo.subtitle || "It's time for your task!");

  return {
    userId: todo.created_by,
    module: "todo",
    type: "todo_reminder",
    title,
    message,
    icon: "clock",
    reference_type: "todo",
    reference_id: String(todo.id),
    action_url: "/todo",
    screen: "TodoList",
    metadata: {
      task_date: todo.task_date,
      start_time: todo.start_time,
      end_time: todo.end_time,
      reminder_type: reminder.reminder_type,
      reminder_label: reminder.reminder_label,
      scheduled_for: reminder.scheduled_for,
    },
  };
}

async function getCustomReminderInputs(todoId) {
  const [rows] = await db.query(
    `
    SELECT
      reminder_label,
      DATE_FORMAT(scheduled_for, '%H:%i:%s') AS scheduled_time
    FROM todo_reminders
    WHERE todo_id = ?
      AND reminder_type = 'CUSTOM'
      AND status IN ('pending', 'failed', 'processing')
    ORDER BY scheduled_for ASC, id ASC
    `,
    [todoId]
  );

  return rows.map((row) => row.reminder_label || row.scheduled_time);
}

async function replaceReminderSchedule(todo, customReminders = []) {
  if (!todo?.id) return;

  await db.query(
    `
    DELETE FROM todo_reminders
    WHERE todo_id = ?
      AND status IN ('pending', 'failed', 'processing')
    `,
    [todo.id]
  );

  if (Number(todo.completed) === 1 || todo.status === "COMPLETED") {
    return;
  }

  const reminderRows = [];
  const startReminderAt = buildLocalDateTime(todo.task_date, todo.start_time);

  if (startReminderAt) {
    startReminderAt.setMinutes(startReminderAt.getMinutes() - 15);
    if (startReminderAt.getTime() > Date.now()) {
      reminderRows.push([
        todo.id,
        todo.created_by,
        "START_15",
        "15 min before",
        formatLocalDateTime(startReminderAt),
      ]);
    }
  }

  for (const reminder of customReminders) {
    if (!reminder?.time) continue;

    const scheduledAt = buildLocalDateTime(todo.task_date, reminder.time);
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      continue;
    }

    reminderRows.push([
      todo.id,
      todo.created_by,
      "CUSTOM",
      reminder.label || reminder.time,
      formatLocalDateTime(scheduledAt),
    ]);
  }

  if (!reminderRows.length) {
    return;
  }

  await db.query(
    `
    INSERT INTO todo_reminders
    (
      todo_id,
      user_id,
      reminder_type,
      reminder_label,
      scheduled_for,
      status,
      created_at,
      updated_at
    )
    VALUES ?
    `,
    [reminderRows.map((row) => [...row, "pending", new Date(), new Date()])]
  );
}

async function cancelReminderScheduleByTodoId(todoId) {
  await db.query(
    `
    UPDATE todo_reminders
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE todo_id = ?
      AND status IN ('pending', 'failed', 'processing')
    `,
    [todoId]
  );
}

async function cancelReminderScheduleByTodoIds(todoIds) {
  if (!Array.isArray(todoIds) || !todoIds.length) return;

  await db.query(
    `
    UPDATE todo_reminders
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE todo_id IN (?)
      AND status IN ('pending', 'failed', 'processing')
    `,
    [todoIds]
  );
}

async function deleteReminderScheduleByTodoId(todoId) {
  await db.query(
    `
    DELETE FROM todo_reminders
    WHERE todo_id = ?
    `,
    [todoId]
  );
}

async function deleteReminderScheduleByTodoIds(todoIds) {
  if (!Array.isArray(todoIds) || !todoIds.length) return;

  await db.query(
    `
    DELETE FROM todo_reminders
    WHERE todo_id IN (?)
    `,
    [todoIds]
  );
}

async function getDueReminders(limit = 100) {
  const [rows] = await db.query(
    `
    SELECT
      tr.id,
      tr.todo_id,
      tr.user_id,
      tr.reminder_type,
      tr.reminder_label,
      tr.scheduled_for,
      tr.attempt_count,
      t.created_by,
      t.task_date,
      t.start_time,
      t.end_time,
      t.title,
      t.subtitle,
      t.completed,
      t.status
    FROM todo_reminders tr
    INNER JOIN todos t ON t.id = tr.todo_id
    WHERE tr.status IN ('pending', 'failed')
      AND tr.scheduled_for <= NOW()
      AND tr.attempt_count < 5
      AND t.completed = 0
    ORDER BY tr.scheduled_for ASC, tr.id ASC
    LIMIT ?
    `,
    [Number(limit)]
  );

  return rows;
}

async function markReminderProcessing(reminderId) {
  const [result] = await db.query(
    `
    UPDATE todo_reminders
    SET status = 'processing',
        updated_at = NOW()
    WHERE id = ?
      AND status IN ('pending', 'failed')
    `,
    [reminderId]
  );

  return result.affectedRows > 0;
}

async function markReminderSent(reminderId) {
  await db.query(
    `
    UPDATE todo_reminders
    SET status = 'sent',
        attempt_count = attempt_count + 1,
        sent_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
    WHERE id = ?
    `,
    [reminderId]
  );
}

async function markReminderFailed(reminderId, error) {
  await db.query(
    `
    UPDATE todo_reminders
    SET status = 'failed',
        attempt_count = attempt_count + 1,
        last_error = ?,
        updated_at = NOW()
    WHERE id = ?
    `,
    [String(error || "Unknown reminder error").slice(0, 1000), reminderId]
  );
}

async function processDueReminders(limit = 100) {
  const reminders = await getDueReminders(limit);

  for (const reminder of reminders) {
    const claimed = await markReminderProcessing(reminder.id);
    if (!claimed) {
      continue;
    }

    const payload = buildReminderPayload(reminder, reminder);

    try {
      const pushResult = await sendDirectPushNotification(payload);

      if (!pushResult.success) {
        throw new Error(pushResult.reason || pushResult.error?.message || "Push delivery failed");
      }

      await saveInAppNotification(payload);
      await markReminderSent(reminder.id);
      console.log(
        `[TodoReminder] Reminder ${reminder.id} sent for Todo ${reminder.todo_id} (${reminder.reminder_type}).`,
      );
    } catch (error) {
      await markReminderFailed(reminder.id, error.message);
      console.error(
        `[TodoReminder] Reminder ${reminder.id} failed for Todo ${reminder.todo_id}:`,
        error.message,
      );
    }
  }
}

module.exports = {
  getCustomReminderInputs,
  replaceReminderSchedule,
  cancelReminderScheduleByTodoId,
  cancelReminderScheduleByTodoIds,
  deleteReminderScheduleByTodoId,
  deleteReminderScheduleByTodoIds,
  processDueReminders,
};
