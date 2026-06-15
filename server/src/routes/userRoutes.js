const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

const adminAuth = [authenticateToken, requireRoles('admin')];

router.get('/users', ...adminAuth, userController.listUsers);
router.patch('/users/:userId/role', ...adminAuth, userController.updateUserRole);

module.exports = router;
