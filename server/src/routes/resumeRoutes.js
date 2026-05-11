const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken, requireRoles('admin', 'member'));

router.get('/next-resume', resumeController.getNextResume);
router.post('/reviews', resumeController.saveReview);
router.get('/resume/:id/file', resumeController.getResumeFile);
router.get('/view/pdf', resumeController.viewPdf);
router.get('/scoreboard', resumeController.getScoreboard);

module.exports = router;
