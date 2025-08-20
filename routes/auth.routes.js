// const express = require('express');
// const router = express.Router();
// const authController = require('../controllers/auth.controller');

// router.get('/github', authController.githubAuth);
// router.get('/github/callback', authController.githubAuthCallback, (req, res) => {
//   // Fixed redirect - remove the extra /login path
//   const frontendUrl = process.env.FRONTEND_URL || 'https://forge-dao.vercel.app';
//   const redirectUrl = `${frontendUrl}/dashboard`;
  
//   console.log('GitHub callback success, redirecting to:', redirectUrl);
//   res.redirect(redirectUrl);
// });
// router.get('/logout', authController.logout);
// router.get('/current_user', authController.getCurrentUser);

// module.exports = router;

const express = require('express');
const router = express.Router();
const passport = require('passport');

router.get('/github', passport.authenticate('github'));

router.get('/github/callback', 
  passport.authenticate('github', { 
    failureRedirect: '/login',
    failureMessage: true 
  }),
  (req, res) => {
    console.log('GitHub callback successful, user:', req.user ? req.user.id : 'none');
    
    // Debug session
    console.log('Session after auth:', req.session);
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://forge-dao.vercel.app';
    const redirectUrl = `${frontendUrl}/dashboard`;
    
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  }
);

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Error logging out' });
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ message: 'Error destroying session' });
      }
      
      res.clearCookie('connect.sid');
      
      // Redirect to frontend login instead of returning JSON
      const frontendUrl = process.env.FRONTEND_URL || '';
      res.redirect(`${frontendUrl}/login`);
    });
  });
});

router.get('/current_user', (req, res) => {
  console.log('=== CURRENT_USER REQUEST ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session:', req.session);
  console.log('User:', req.user);
  console.log('Authenticated:', req.isAuthenticated());
  
  if (!req.user) {
    return res.status(401).json({ 
      authenticated: false,
      message: 'Not authenticated',
      sessionId: req.sessionID
    });
  }
  
  res.json({
    id: req.user.id,
    username: req.user.username,
    bio: req.user.bio,
    walletAddress: req.user.walletAddress,
    githubId: req.user.githubId,
    createdAt: req.user.createdAt,
    rank: req.user.rank || 'Code Novice'
  });
});

module.exports = router;