const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

router.use(authenticateToken, requireRoles("admin", "member"));

router.get("/dashboard/grader", dashboardController.getGraderDashboard);
router.get("/dashboard/admin", requireRoles("admin"), dashboardController.getAdminDashboard);

module.exports = router;
