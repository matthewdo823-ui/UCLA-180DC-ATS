const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken, requireRoles('admin', 'member'));

router.get('/next-resume', resumeController.getNextResume);
router.get('/resume/:id', resumeController.getResumeById);
router.get('/reviews', resumeController.listMyReviews);
router.get('/reviews/:reviewId/resume', resumeController.getReviewResume);
router.post('/reviews', resumeController.saveReview);
router.patch('/reviews/:reviewId', resumeController.patchMyReview);
router.post('/candidate-flags', resumeController.createCandidateFlag);
router.get('/candidate-flags', requireRoles('admin'), resumeController.getCandidateFlags);
router.patch('/candidate-flags/:id/resolve', requireRoles('admin'), resumeController.resolveCandidateFlag);
router.get('/resume/:id/file', resumeController.getResumeFile);
router.get('/view/pdf', resumeController.viewPdf);
router.get('/view/image', resumeController.viewImage);
router.get('/scoreboard/:resumeId/application', resumeController.getScoreboardApplication);
router.get('/scoreboard', resumeController.getScoreboard);
router.post('/scoreboard/decisions', requireRoles('admin', 'member'), resumeController.upsertRoundDecision);
router.get('/scoreboard/decisions/export', requireRoles('admin'), resumeController.exportScoreboardDecisions);
router.get('/grader-scoreboard', requireRoles('admin'), resumeController.getGraderScoreboard);

module.exports = router;
