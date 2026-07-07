const express = require('express');
const router = express.Router();
const resumeController = require('../controllers/resumeController');
const demographicsController = require('../controllers/demographicsController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken, requireRoles('admin', 'member'));

router.get('/next-frq', requireRoles('admin'), resumeController.getNextFrq);
router.get('/frq-reviews', requireRoles('admin'), resumeController.listMyFrqReviews);
router.get('/frq-reviews/:reviewId/candidate', requireRoles('admin'), resumeController.getFrqReviewCandidate);
router.post('/frq-reviews', requireRoles('admin'), resumeController.saveFrqReview);
router.patch('/frq-reviews/:reviewId', requireRoles('admin'), resumeController.patchMyFrqReview);
router.get('/next-resume', resumeController.getNextResume);
router.get('/resume/:id', resumeController.getResumeById);
router.get('/reviews', resumeController.listMyReviews);
router.get('/reviews/:reviewId/resume', resumeController.getReviewResume);
router.post('/reviews', resumeController.saveReview);
router.patch('/reviews/:reviewId', resumeController.patchMyReview);
router.post('/candidate-flags', resumeController.createCandidateFlag);
router.post('/candidate-referrals', resumeController.createCandidateReferral);
router.get('/candidate-flags', requireRoles('admin'), resumeController.getCandidateFlags);
router.patch('/candidate-flags/:id/resolve', requireRoles('admin'), resumeController.resolveCandidateFlag);
router.get('/resume/:id/file', resumeController.getResumeFile);
router.get('/view/pdf', resumeController.viewPdf);
router.get('/view/image', resumeController.viewImage);
router.get('/scoreboard/:resumeId/application/summary', resumeController.getScoreboardApplicationSummary);
router.get('/scoreboard/:resumeId/application', resumeController.getScoreboardApplication);
router.get('/scoreboard/:resumeId/application/admin-override', requireRoles('admin'), resumeController.getAdminOverride);
router.patch('/scoreboard/:resumeId/application/admin-override', requireRoles('admin'), resumeController.upsertAdminOverride);
router.get('/scoreboard/:resumeId/review-overrides', requireRoles('admin'), resumeController.getReviewOverrides);
router.patch('/scoreboard/:resumeId/review-overrides/:reviewId', requireRoles('admin'), resumeController.upsertReviewOverride);
router.get('/scoreboard', resumeController.getScoreboard);
router.get('/demographics', demographicsController.getDemographics);
router.post('/scoreboard/decisions', requireRoles('admin'), resumeController.upsertRoundDecision);
router.get('/scoreboard/decisions/export', requireRoles('admin'), resumeController.exportScoreboardDecisions);
router.get('/grader-scoreboard', requireRoles('admin'), resumeController.getGraderScoreboard);

module.exports = router;
