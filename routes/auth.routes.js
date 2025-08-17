const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.get('/github', authController.githubAuth);
router.get('/github/callback', authController.githubAuthCallback, (req, res) => {
  res.redirect(`${process.env.FRONTEND_URL || ''}/dashboard`);
});
router.get('/logout', authController.logout);
router.get('/current_user', authController.getCurrentUser);

module.exports = router;