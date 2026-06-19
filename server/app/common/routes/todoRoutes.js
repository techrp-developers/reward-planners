const express = require("express");
const router = express.Router();
const TodoController = require("../controller/todoController");
const auth = require("../middlewares/auth");

// create a task
router.post("/", auth, TodoController.createTodo);

// get all the tasks
router.get("/", auth, TodoController.getTodos);

// update task
router.put("/:id", auth, TodoController.updateTodo);

// complete single task
router.patch("/:id/complete", auth, TodoController.completeTodo);

// complete multiple task
router.patch("/complete/multiple", auth, TodoController.completeMultipleTodos);

// update reminder
router.patch("/:id/reminder", auth, TodoController.updateReminder);

// single delete task
router.delete("/:id", auth, TodoController.deleteTodo);

// delete multiple tasks
router.post("/delete/multiple", auth, TodoController.deleteMultipleTodos);

module.exports = router;
