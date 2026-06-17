const TodoModel = require("../models/todoModel");

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
      const normalizedReminderTime = normalizeTodoTime(reminder_time);

      if (!normalizedStartTime || !normalizedEndTime) {
        return res.status(400).json({
          success: false,
          message: "start_time and end_time must be valid times",
        });
      }

      if (reminder_time && !normalizedReminderTime) {
        return res.status(400).json({
          success: false,
          message: "reminder_time must be a valid time",
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

      if (updateData.start_time !== undefined) {
        updateData.start_time = normalizeTodoTime(updateData.start_time);
      }

      if (updateData.end_time !== undefined) {
        updateData.end_time = normalizeTodoTime(updateData.end_time);
      }

      if (updateData.reminder_time !== undefined) {
        updateData.reminder_time = normalizeTodoTime(updateData.reminder_time);
      }

      if (
        updateData.start_time === null ||
        updateData.end_time === null ||
        (req.body.reminder_time && updateData.reminder_time === null)
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

      await TodoModel.markMultipleCompleted(ids, userId);

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
      const { reminder_time } = req.body;

      const userId = req.user?.user_id;
      // const userId = 1;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const normalizedReminderTime = normalizeTodoTime(reminder_time);

      if (reminder_time && !normalizedReminderTime) {
        return res.status(400).json({
          success: false,
          message: "reminder_time must be a valid time",
        });
      }

      const result = await TodoModel.updateReminder(
        id,
        userId,
        normalizedReminderTime,
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Todo not found",
        });
      }

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

      await TodoModel.deleteMultipleTodos(ids, userId);

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
