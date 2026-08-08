const db = require("../../config/database");
const {
  createInAppNotification,
  sendPushNotification,
} = require("../../app/common/utils/notification");

function toDateTimeString(date, time) {
  if (!date || !time) return null;
  return `${date} ${String(time).slice(0, 8)}`;
}

function toDateObject(dateTimeString) {
  if (!dateTimeString) return null;

  const normalized = String(dateTimeString).replace(" ", "T");
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
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
  const startReminderAt = toDateObject(toDateTimeString(todo.task_date, todo.start_time));

  if (startReminderAt) {
    startReminderAt.setMinutes(startReminderAt.getMinutes() - 15);
    if (startReminderAt.getTime() > Date.now()) {
      reminderRows.push([
        todo.id,
        todo.created_by,
        "START_15",
        "15 min before",
        `${startReminderAt.toISOString().slice(0, 19).replace("T", " ")}`,
      ]);
    }
  }

  for (const reminder of customReminders) {
    if (!reminder?.time) continue;

    const scheduledAt = toDateObject(toDateTimeString(todo.task_date, reminder.time));
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
      continue;
    }

    reminderRows.push([
      todo.id,
      todo.created_by,
      "CUSTOM",
      reminder.label || reminder.time,
      `${scheduledAt.toISOString().slice(0, 19).replace("T", " ")}`,
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
      const pushResult = await sendPushNotification(payload);

      if (!pushResult.success) {
        throw new Error(pushResult.reason || pushResult.error?.message || "Push delivery failed");
      }

      await createInAppNotification(payload);
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
