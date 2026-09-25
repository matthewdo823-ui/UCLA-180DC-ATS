const express = require("express");
const router = express.Router();
const interestController = require("../controllers/interestController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

const adminAuth = [authenticateToken, requireRoles("admin")];

router.get("/cycles/:cycleId/interest-events", ...adminAuth, interestController.listInterestEvents);
router.post("/cycles/:cycleId/interest-events", ...adminAuth, interestController.createInterestEvent);
router.patch("/interest-events/:eventId", ...adminAuth, interestController.patchInterestEvent);
router.delete("/interest-events/:eventId", ...adminAuth, interestController.deleteInterestEvent);
router.post("/interest-events/:eventId/discover-fields", ...adminAuth, interestController.discoverInterestEventFields);
router.post("/interest-events/:eventId/sync", ...adminAuth, interestController.syncInterestEventNow);
router.get("/cycles/:cycleId/interest-attendance", ...adminAuth, interestController.listInterestAttendance);
router.patch("/interest-attendance/:attendanceId", ...adminAuth, interestController.resolveInterestAttendance);

module.exports = router;
