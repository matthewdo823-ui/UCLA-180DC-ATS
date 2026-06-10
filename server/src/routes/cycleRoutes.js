const express = require("express");
const router = express.Router();
const cycleController = require("../controllers/cycleController");
const { authenticateToken, requireRoles } = require("../middleware/authMiddleware");

router.get("/cycles/active", authenticateToken, requireRoles("admin", "member"), cycleController.getActiveCycle);

router.use(authenticateToken, requireRoles("admin"));

router.get("/cycles", cycleController.listCycles);
router.post("/cycles", cycleController.createCycle);
router.patch("/cycles/:cycleId", cycleController.patchCycle);
router.post("/cycles/:cycleId/activate", cycleController.activateCycle);
router.patch("/rounds/:roundId", cycleController.patchRound);
router.post("/rounds/:roundId/activate", cycleController.activateRound);
router.post("/rounds/:roundId/close", cycleController.closeRound);

module.exports = router;
