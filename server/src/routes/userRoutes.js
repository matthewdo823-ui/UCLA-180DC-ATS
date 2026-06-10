const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireRoles } = require('../middleware/authMiddleware');

router.use(authenticateToken, requireRoles('admin'));

router.get('/users', userController.listUsers);
router.patch('/users/:userId/role', userController.updateUserRole);

module.exports = router;
