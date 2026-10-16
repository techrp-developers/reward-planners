const express = require("express");
const router = express.Router();
const SudokuRoutes = require("./sudokuRoute");

router.use("/sudoku", SudokuRoutes);

router.use("/quiz", require("./quizRoute"));

module.exports = router;
