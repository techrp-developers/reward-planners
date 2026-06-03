const express = require("express");
const router = express.Router();
const TodoController = require("../controller/todoController");
const auth = require("../middlewares/auth");

router.post("/", auth, TodoController.createTodo);

router.get("/", auth, TodoController.getTodos);

router.put("/:id", auth, TodoController.updateTodo);

router.patch("/:id/complete", auth, TodoController.completeTodo);

router.patch("/complete/multiple", auth, TodoController.completeMultipleTodos);

router.patch("/:id/reminder", auth, TodoController.updateReminder);

router.delete("/:id", auth, TodoController.deleteTodo);

router.post("/delete/multiple", auth, TodoController.deleteMultipleTodos);

module.exports = router;
