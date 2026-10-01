const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

const adminAuth = [authenticateToken, requireRoles('admin')];

router.get('/users', ...adminAuth, userController.listUsers);
router.patch('/users/:userId/role', ...adminAuth, userController.updateUserRole);
router.post('/users/:userId/approve', ...adminAuth, userController.approveUser);
router.post('/users/:userId/deactivate', ...adminAuth, userController.deactivateUser);
router.post('/users/:userId/reactivate', ...adminAuth, userController.reactivateUser);
router.delete('/users/:userId', ...adminAuth, userController.deletePendingUser);

module.exports = router;
