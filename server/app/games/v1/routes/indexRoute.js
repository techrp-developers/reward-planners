const express = require("express");
const router = express.Router();
const SudokuRoutes = require("./sudokuRoute");
const QuizRoutes = require("./quizRoute");

router.use("/sudoku", SudokuRoutes);
router.use("/daily-challenge", QuizRoutes);

module.exports = router;
