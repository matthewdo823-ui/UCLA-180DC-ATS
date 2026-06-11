const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { loginRateLimit } = require('../middleware/rateLimitMiddleware');

router.post('/login', loginRateLimit, authController.login);
router.post('/register', authController.register);
router.get('/me', authenticateToken, authController.me);

module.exports = router;
