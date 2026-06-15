const express = require("express");
const router = express.Router();
const cycleController = require("../controllers/cycleController");
const notificationController = require("../controllers/notificationController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

const adminAuth = [authenticateToken, requireRoles("admin")];

router.get("/cycles/active", authenticateToken, requireRoles("admin", "member"), cycleController.getActiveCycle);

router.get("/cycles", ...adminAuth, cycleController.listCycles);
router.post("/cycles", ...adminAuth, cycleController.createCycle);
router.patch("/cycles/:cycleId", ...adminAuth, cycleController.patchCycle);
router.post("/cycles/:cycleId/discover-form-fields", ...adminAuth, cycleController.discoverCycleFormFields);
router.post("/cycles/:cycleId/sync-form", ...adminAuth, cycleController.syncCycleForm);
router.post("/cycles/:cycleId/activate", ...adminAuth, cycleController.activateCycle);
router.patch("/rounds/:roundId", ...adminAuth, cycleController.patchRound);
router.post("/rounds/:roundId/activate", ...adminAuth, cycleController.activateRound);
router.post("/rounds/:roundId/close", ...adminAuth, cycleController.closeRound);
router.post("/rounds/:roundId/advance-to-next", ...adminAuth, cycleController.advanceToNextRound);
router.get("/rounds/:roundId/advance-notification", ...adminAuth, notificationController.getAdvanceNotificationContext);
router.patch("/rounds/:roundId/advance-notification", ...adminAuth, notificationController.patchAdvanceNotification);
router.post("/rounds/:roundId/advance-notification/test", ...adminAuth, notificationController.sendAdvanceNotificationTest);
router.post("/rounds/:roundId/advance-notification/send", ...adminAuth, notificationController.sendAdvanceNotifications);

module.exports = router;
