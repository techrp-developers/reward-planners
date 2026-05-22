const express = require("express");
const router = express.Router();
const SudokuController = require("../controller/sudokuController");
// const auth = require("../../../common/middlewares/auth");

router.post("/start", SudokuController.startGame);
router.post("/complete", SudokuController.completeGame);
router.get("/leaderboard", SudokuController.getLeaderboard);    

module.exports = router;
