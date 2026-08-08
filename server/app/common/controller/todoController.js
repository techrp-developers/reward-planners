const TodoModel = require("../models/todoModel");
const {
  getCustomReminderInputs,
  replaceReminderSchedule,
  cancelReminderScheduleByTodoId,
  cancelReminderScheduleByTodoIds,
  deleteReminderScheduleByTodoId,
  deleteReminderScheduleByTodoIds,
} = require("../../../services/Todo/todoReminderService");

function formatTodoTime(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;

  const hours24 = Number(match[1]);
  const minutes = match[2];
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return `${hours12}:${minutes} ${meridiem}`;
}

function normalizeTodoTime(value) {
  if (value == null || value === "") return null;

  const normalized = String(value)
    .trim()
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ");

  const match12h = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (match12h) {
    let hours = Number(match12h[1]);
    const minutes = Number(match12h[2]);
    const seconds = Number(match12h[3] || 0);
    const meridiem = match12h[4].toUpperCase();

    if (hours < 1 || hours > 12 || minutes > 59 || seconds > 59) return null;

    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;

    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  const match24h = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24h) {
    const hours = Number(match24h[1]);
    const minutes = Number(match24h[2]);
    const seconds = Number(match24h[3] || 0);

    if (hours > 23 || minutes > 59 || seconds > 59) return null;

    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  return null;
}

function timeToSeconds(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  return (hours * 3600) + (minutes * 60) + seconds;
}

function secondsToTime(totalSeconds) {
  const secondsInDay = 24 * 60 * 60;
  const normalizedSeconds = ((totalSeconds % secondsInDay) + secondsInDay) % secondsInDay;
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function resolveRelativeReminderTime(reminderValue, baseStartTime) {
  if (!reminderValue || !baseStartTime) return null;

  const normalizedLabel = String(reminderValue).trim().toLowerCase();
  const startSeconds = timeToSeconds(baseStartTime);

  if (startSeconds == null) return null;

  const presets = {
    "at time of event": 0,
    "at time": 0,
    "on time": 0,
    "5 min before": 5,
    "10 min before": 10,
    "15 min before": 15,
    "30 min before": 30,
    "45 min before": 45,
    "1 hour before": 60,
    "2 hours before": 120,
  };

  if (Object.prototype.hasOwnProperty.call(presets, normalizedLabel)) {
    return secondsToTime(startSeconds - (presets[normalizedLabel] * 60));
  }

  const relativeMatch = normalizedLabel.match(/^(\d+)\s*(minute|minutes|min|hour|hours|hr|hrs)\s*before$/);
  if (!relativeMatch) return null;

  const amount = Number(relativeMatch[1]);
  const unit = relativeMatch[2];
  const totalMinutes = /hour|hr/.test(unit) ? amount * 60 : amount;

  return secondsToTime(startSeconds - (totalMinutes * 60));
}

function extractTimeFromDateTime(value) {
  if (!value) return null;

  const normalized = String(value).trim();
  const match = normalized.match(/(?:T|\s)(\d{2}:\d{2})(?::(\d{2}))?/);

  if (!match) return null;

  return `${match[1]}:${match[2] || "00"}`;
}

function resolveReminderTimeInput(reminderValue, baseStartTime) {
  if (reminderValue == null || reminderValue === "") return null;

  const directTime = normalizeTodoTime(reminderValue);
  if (directTime) return directTime;

  const extractedTime = extractTimeFromDateTime(reminderValue);
  if (extractedTime) {
    const normalizedExtractedTime = normalizeTodoTime(extractedTime);
    if (normalizedExtractedTime) return normalizedExtractedTime;
  }

  return resolveRelativeReminderTime(reminderValue, baseStartTime);
}

function normalizeReminderEntry(reminderValue, baseStartTime) {
  const normalizedTime = resolveReminderTimeInput(reminderValue, baseStartTime);

  if (!normalizedTime) {
    return null;
  }

  return {
    time: normalizedTime,
    label: String(reminderValue).trim(),
  };
}

function resolveReminderEntries(payload, baseStartTime, fallbackReminderInputs = []) {
  const rawReminderValues = Array.isArray(payload.reminders) && payload.reminders.length
    ? payload.reminders
    : (() => {
        const singleReminder = payload.reminder_time ?? payload.reminder_date ?? payload.reminder;
        return singleReminder != null && singleReminder !== ""
          ? [singleReminder]
          : fallbackReminderInputs;
      })();

  const normalizedEntries = [];
  const seenTimes = new Set();

  for (const value of rawReminderValues) {
    const normalizedEntry = normalizeReminderEntry(value, baseStartTime);

    if (!normalizedEntry) {
      return null;
    }

    if (!seenTimes.has(normalizedEntry.time)) {
      seenTimes.add(normalizedEntry.time);
      normalizedEntries.push(normalizedEntry);
    }
  }

  return normalizedEntries;
}

const formatTodoForFrontend = (todo) => {
  const startTime = formatTodoTime(todo.start_time);
  const endTime = formatTodoTime(todo.end_time);
  const reminder = formatTodoTime(todo.reminder_time);

  return {
    id: String(todo.id),
    createdBy: todo.created_by,
    date: todo.task_date,
    startTime,
    endTime,
    time: `${startTime} - ${endTime}`,
    title: todo.title,
    subtitle: todo.subtitle,
    reminder,
    completed: Boolean(todo.completed),
    status: todo.status,
  };
};

const TodoController = {
  async createTodo(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
        reminder_date,
        reminder,
      } = req.body;

      if (!task_date) {
        return res.status(400).json({
          success: false,
          message: "task_date is required",
        });
      }

      if (!start_time || !end_time) {
        return res.status(400).json({
          success: false,
          message: "start_time and end_time are required",
        });
      }

      const normalizedStartTime = normalizeTodoTime(start_time);
      const normalizedEndTime = normalizeTodoTime(end_time);
      const normalizedReminderEntries = resolveReminderEntries(
        req.body,
        normalizedStartTime,
      );
      const normalizedReminderTime = normalizedReminderEntries?.[0]?.time || null;

      if (!normalizedStartTime || !normalizedEndTime) {
        return res.status(400).json({
          success: false,
          message: "start_time and end_time must be valid times",
        });
      }

      if (normalizedReminderEntries === null) {
        return res.status(400).json({
          success: false,
          message: "Reminder must be a valid time, datetime, or supported relative value",
        });
      }

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "title is required",
        });
      }

      const todoId = await TodoModel.createTodo({
        created_by: userId,
        task_date,
        start_time: normalizedStartTime,
        end_time: normalizedEndTime,
        title,
        subtitle,
        reminder_time: normalizedReminderTime,
      });

      const createdTodo = await TodoModel.getTodoById(todoId, userId);
      await replaceReminderSchedule(createdTodo, normalizedReminderEntries || []);

      return res.status(201).json({
        success: true,
        message: "Todo created successfully",
        todoId,
      });
    } catch (error) {
      console.error("Create todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async getTodos(req, res) {
    try {
      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const { date, filter } = req.query;

      let todos = [];

      if (date) {
        todos = await TodoModel.getTodosByUserAndDate(userId, date, filter);
      } else {
        todos = await TodoModel.getAllTodosByUser(userId, filter);
      }

      return res.status(200).json({
        success: true,
        count: todos.length,
        data: todos.map(formatTodoForFrontend),
      });
    } catch (error) {
      console.error("Get todos error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async updateTodo(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const updateData = { ...req.body };

      if (
        updateData.reminder_time === undefined &&
        updateData.reminder_date !== undefined
      ) {
        updateData.reminder_time = updateData.reminder_date;
      }

      if (
        updateData.reminder_time === undefined &&
        updateData.reminder !== undefined
      ) {
        updateData.reminder_time = updateData.reminder;
      }

      const existingTodo = await TodoModel.getTodoById(id, userId);

      if (!existingTodo) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

      if (updateData.start_time !== undefined) {
        updateData.start_time = normalizeTodoTime(updateData.start_time);
      }

      if (updateData.end_time !== undefined) {
        updateData.end_time = normalizeTodoTime(updateData.end_time);
      }

      let fallbackReminderInputs = [];

      if (
        req.body.reminders === undefined &&
        req.body.reminder_time === undefined &&
        req.body.reminder_date === undefined &&
        req.body.reminder === undefined
      ) {
        fallbackReminderInputs = await getCustomReminderInputs(id);

        if (!fallbackReminderInputs.length && existingTodo.reminder_time) {
          fallbackReminderInputs = [existingTodo.reminder_time];
        }
      }

      const normalizedReminderEntries = resolveReminderEntries(
        updateData,
        updateData.start_time || existingTodo.start_time,
        fallbackReminderInputs,
      );
      updateData.reminder_time = normalizedReminderEntries?.[0]?.time || null;

      if (
        (req.body.start_time !== undefined && updateData.start_time === null) ||
        (req.body.end_time !== undefined && updateData.end_time === null) ||
        ((req.body.reminders !== undefined ||
          req.body.reminder_time !== undefined ||
          req.body.reminder_date !== undefined ||
          req.body.reminder !== undefined) &&
          normalizedReminderEntries === null)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid todo time",
        });
      }

      const result = await TodoModel.updateTodo(id, userId, updateData);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

      const updatedTodo = await TodoModel.getTodoById(id, userId);
      await replaceReminderSchedule(updatedTodo, normalizedReminderEntries || []);

      return res.status(200).json({
        success: true,
        message: "Todo updated successfully",
      });
    } catch (error) {
      console.error("Update todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async completeTodo(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const result = await TodoModel.markTodoCompleted(id, userId);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

      await cancelReminderScheduleByTodoId(id);

      return res.status(200).json({
        success: true,
        message: "Todo marked as completed",
      });
    } catch (error) {
      console.error("Complete todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async completeMultipleTodos(req, res) {
    try {
      const { ids } = req.body;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "ids array is required",
        });
      }

      const validTodoIds = await TodoModel.getTodoIdsByUser(ids, userId);
      await TodoModel.markMultipleCompleted(ids, userId);
      await cancelReminderScheduleByTodoIds(validTodoIds);

      return res.status(200).json({
        success: true,
        message: "Selected todos marked as completed",
      });
    } catch (error) {
      console.error("Complete multiple todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async updateReminder(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const existingTodo = await TodoModel.getTodoById(id, userId);

      if (!existingTodo) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

      const normalizedReminderEntries = resolveReminderEntries(
        req.body,
        existingTodo.start_time,
      );
      const normalizedReminderTime = normalizedReminderEntries?.[0]?.time || null;

      if (normalizedReminderEntries === null) {
        return res.status(400).json({
          success: false,
          message: "Reminder must be a valid time, datetime, or supported relative value",
        });
      }

      const result = await TodoModel.updateReminder(
        id,
        userId,
        normalizedReminderTime,
      );

      const updatedTodo = await TodoModel.getTodoById(id, userId);
      await replaceReminderSchedule(updatedTodo, normalizedReminderEntries || []);

      return res.status(200).json({
        success: true,
        message: "Reminder updated successfully",
      });
    } catch (error) {
      console.error("Reminder update error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async deleteTodo(req, res) {
    try {
      const { id } = req.params;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const result = await TodoModel.deleteTodo(id, userId);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

      await deleteReminderScheduleByTodoId(id);

      return res.status(200).json({
        success: true,
        message: "Todo deleted successfully",
      });
    } catch (error) {
      console.error("Delete todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },

  async deleteMultipleTodos(req, res) {
    try {
      const { ids } = req.body;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "ids array is required",
        });
      }

      const validTodoIds = await TodoModel.getTodoIdsByUser(ids, userId);
      await TodoModel.deleteMultipleTodos(ids, userId);
      await deleteReminderScheduleByTodoIds(validTodoIds);

      return res.status(200).json({
        success: true,
        message: "Selected todos deleted successfully",
      });
    } catch (error) {
      console.error("Delete multiple todo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  },
};

module.exports = TodoController;
