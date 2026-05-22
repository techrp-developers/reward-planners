const express = require("express");
const router = express.Router();

const TodoController = require("../controller/todoController");

router.post("/", TodoController.createTodo);

router.get("/", TodoController.getTodos);

router.put("/:id", TodoController.updateTodo);

router.patch("/:id/complete", TodoController.completeTodo);

router.patch("/complete/multiple", TodoController.completeMultipleTodos);

router.patch("/:id/reminder", TodoController.updateReminder);

router.delete("/:id", TodoController.deleteTodo);

router.post("/delete/multiple", TodoController.deleteMultipleTodos);

module.exports = router;