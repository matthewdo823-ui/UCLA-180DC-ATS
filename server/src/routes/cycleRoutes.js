const express = require("express");
const router = express.Router();
const cycleController = require("../controllers/cycleController");
const notificationController = require("../controllers/notificationController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

router.get("/cycles/active", authenticateToken, requireRoles("admin", "member"), cycleController.getActiveCycle);

router.use(authenticateToken, requireRoles("admin"));

router.get("/cycles", cycleController.listCycles);
router.post("/cycles", cycleController.createCycle);
router.patch("/cycles/:cycleId", cycleController.patchCycle);
router.post("/cycles/:cycleId/discover-form-fields", cycleController.discoverCycleFormFields);
router.post("/cycles/:cycleId/sync-form", cycleController.syncCycleForm);
router.post("/cycles/:cycleId/activate", cycleController.activateCycle);
router.patch("/rounds/:roundId", cycleController.patchRound);
router.post("/rounds/:roundId/activate", cycleController.activateRound);
router.post("/rounds/:roundId/close", cycleController.closeRound);
router.post("/rounds/:roundId/advance-to-next", cycleController.advanceToNextRound);
router.get("/rounds/:roundId/advance-notification", notificationController.getAdvanceNotificationContext);
router.patch("/rounds/:roundId/advance-notification", notificationController.patchAdvanceNotification);
router.post("/rounds/:roundId/advance-notification/test", notificationController.sendAdvanceNotificationTest);
router.post("/rounds/:roundId/advance-notification/send", notificationController.sendAdvanceNotifications);

module.exports = router;
