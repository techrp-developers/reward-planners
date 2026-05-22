const express = require("express");
const router = express.Router();
const SudokuRoutes = require("./sudokuRoute");

router.use("/sudoku", SudokuRoutes);

module.exports = router;
