const express = require("express");
const router = express.Router();
const interviewController = require("../controllers/interviewController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

router.use(authenticateToken, requireRoles("admin", "member"));

router.get("/interviews/candidates", interviewController.listInterviewCandidates);
router.get("/interviews/stats", interviewController.getInterviewStats);
router.post("/interviews/evaluations", interviewController.upsertInterviewEvaluation);

module.exports = router;
