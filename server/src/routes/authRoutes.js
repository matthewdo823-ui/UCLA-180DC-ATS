const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { loginRateLimit, registerRateLimit, passwordResetRateLimit } = require('../middleware/rateLimitMiddleware');

router.post('/login', loginRateLimit, authController.login);
router.post('/register', registerRateLimit, authController.register);
router.post('/forgot-password', passwordResetRateLimit, authController.requestPasswordReset);
router.post('/reset-password', passwordResetRateLimit, authController.resetPassword);
router.get('/me', authenticateToken, authController.me);

module.exports = router;
