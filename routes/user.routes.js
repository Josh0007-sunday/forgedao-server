const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');

router.put('/wallet', userController.updateWalletAddress);
router.get('/:id', authMiddleware.isAuthenticated, userController.getUserById);
router.get('/:id/activities', authMiddleware.isAuthenticated, userController.getUserActivities);
router.get('/:id/stats', authMiddleware.isAuthenticated, userController.getUserStats);

module.exports = router;