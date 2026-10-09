const express = require("express");
const router = express.Router();
const interviewController = require("../controllers/interviewController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

router.use(authenticateToken, requireRoles("admin", "member", "board"));

router.get("/interviews/candidates", interviewController.listInterviewCandidates);
router.get("/interviews/stats", interviewController.getInterviewStats);
router.get("/coffee-chat-grader-scoreboard", requireRoles("admin"), interviewController.getCoffeeChatGraderScoreboard);
router.post("/interviews/groups", requireRoles("admin"), interviewController.assignInterviewGroups);
router.put("/interviews/coffee-chat/starting-table", interviewController.setMyCoffeeChatStartingTable);
router.post("/interviews/coffee-chat/table-evaluations", interviewController.upsertCoffeeChatTableEvaluations);
router.post("/interviews/evaluations", interviewController.upsertInterviewEvaluation);

module.exports = router;
