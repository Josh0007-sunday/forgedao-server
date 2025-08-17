const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.get('/github', authController.githubAuth);
router.get('/github/callback', authController.githubAuthCallback, (req, res) => {
  // Fixed redirect - remove the extra /login path
  const frontendUrl = process.env.FRONTEND_URL || 'https://forge-dao.vercel.app';
  const redirectUrl = `${frontendUrl}/dashboard`;
  
  console.log('GitHub callback success, redirecting to:', redirectUrl);
  res.redirect(redirectUrl);
});
router.get('/logout', authController.logout);
router.get('/current_user', authController.getCurrentUser);

module.exports = router;