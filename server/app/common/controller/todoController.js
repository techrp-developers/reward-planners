const TodoModel = require("../models/todoModel");

const formatTodoForFrontend = todo => {
  return {
    id: String(todo.id),
    createdBy: todo.created_by,
    date: todo.task_date,
    startTime: todo.start_time,
    endTime: todo.end_time,
    time: `${todo.start_time} - ${todo.end_time}`,
    title: todo.title,
    subtitle: todo.subtitle,
    reminder: todo.reminder_time,
    completed: Boolean(todo.completed),
    status: todo.status,
  };
};

const TodoController = {
  async createTodo(req, res) {
    try {
      const {
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
      } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

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

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "title is required",
        });
      }

      const todoId = await TodoModel.createTodo({
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
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
      const { created_by, date, filter } = req.query;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      let todos = [];

      if (date) {
        todos = await TodoModel.getTodosByUserAndDate(
          created_by,
          date,
          filter
        );
      } else {
        todos = await TodoModel.getAllTodosByUser(created_by, filter);
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
      const { created_by } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      const result = await TodoModel.updateTodo(id, created_by, req.body);

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
      const { created_by } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      const result = await TodoModel.markTodoCompleted(id, created_by);

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
      const { ids, created_by } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "ids array is required",
        });
      }

      await TodoModel.markMultipleCompleted(ids, created_by);

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
      const { created_by, reminder_time } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      const result = await TodoModel.updateReminder(
        id,
        created_by,
        reminder_time
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
      const { created_by } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      const result = await TodoModel.deleteTodo(id, created_by);

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
      const { ids, created_by } = req.body;

      if (!created_by) {
        return res.status(400).json({
          success: false,
          message: "created_by is required",
        });
      }

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: "ids array is required",
        });
      }

      await TodoModel.deleteMultipleTodos(ids, created_by);

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