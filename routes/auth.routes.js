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

// routes/auth.routes.js - Fixed authentication flow
// routes/auth.routes.js - Fixed authentication flow
const express = require('express');
const router = express.Router();
const passport = require('passport');

// GitHub OAuth initiation
router.get('/github', (req, res, next) => {
  console.log('Starting GitHub OAuth...');
  passport.authenticate('github', {
    scope: ['user:email', 'repo']
  })(req, res, next);
});

// GitHub OAuth callback - Enhanced with better error handling
router.get('/github/callback', 
  (req, res, next) => {
    console.log('GitHub callback received...');
    next();
  },
  passport.authenticate('github', { 
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=auth_failed`,
    failureMessage: true 
  }),
  async (req, res) => {
    try {
      console.log('GitHub callback successful!');
      console.log('User authenticated:', req.user ? req.user.username : 'No user');
      console.log('Session ID after auth:', req.sessionID);
      console.log('Session data after auth:', JSON.stringify(req.session, null, 2));
      
      // Force save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect(`${process.env.FRONTEND_URL}/login?error=session_error`);
        }
        
        console.log('Session saved successfully');
        
        // Redirect to dashboard
        const frontendUrl = process.env.FRONTEND_URL || 'https://forge-dao.vercel.app';
        const redirectUrl = `${frontendUrl}/dashboard`;
        
        console.log('Redirecting to:', redirectUrl);
        res.redirect(redirectUrl);
      });
      
    } catch (error) {
      console.error('Callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=callback_error`);
    }
  }
);

// Logout endpoint
router.get('/logout', (req, res) => {
  console.log('Logout requested for user:', req.user ? req.user.username : 'No user');
  
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
      
      // Clear all possible session cookies
      res.clearCookie('connect.sid');
      res.clearCookie('connect.sid', { 
        domain: undefined,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      
      const frontendUrl = process.env.FRONTEND_URL || 'https://forge-dao.vercel.app';
      res.redirect(`${frontendUrl}/login`);
    });
  });
});

// Current user endpoint - Enhanced with better debugging
router.get('/current_user', (req, res) => {
  console.log('=== CURRENT_USER REQUEST ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Session ID:', req.sessionID);
  console.log('Session exists:', !!req.session);
  console.log('Session data:', JSON.stringify(req.session, null, 2));
  console.log('User object:', req.user);
  console.log('Is authenticated:', req.isAuthenticated ? req.isAuthenticated() : 'N/A');
  console.log('Cookies received:', req.headers.cookie);
  console.log('Origin:', req.get('Origin'));
  console.log('User-Agent:', req.get('User-Agent'));
  console.log('==========================');
  
  // Check if user is authenticated
  if (!req.user || !req.isAuthenticated()) {
    console.log('User not authenticated, returning 401');
    return res.status(401).json({ 
      authenticated: false,
      message: 'Not authenticated',
      sessionId: req.sessionID,
      debug: {
        hasSession: !!req.session,
        hasUser: !!req.user,
        isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false
      }
    });
  }
  
  console.log('User authenticated, returning user data');
  res.json({
    authenticated: true,
    id: req.user.id,
    username: req.user.username,
    bio: req.user.bio,
    walletAddress: req.user.walletAddress,
    githubId: req.user.githubId,
    createdAt: req.user.createdAt,
    rank: req.user.rank || 'Code Novice'
  });
});

// Session test endpoint
router.get('/test-session', (req, res) => {
  req.session.testValue = 'Hello from session!';
  req.session.timestamp = new Date().toISOString();
  
  req.session.save((err) => {
    if (err) {
      return res.status(500).json({ error: 'Session save failed', details: err.message });
    }
    
    res.json({
      message: 'Session test successful',
      sessionId: req.sessionID,
      testValue: req.session.testValue,
      timestamp: req.session.timestamp
    });
  });
});

module.exports = router;