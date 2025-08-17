const passport = require('passport');

exports.githubAuth = passport.authenticate('github');

exports.githubAuthCallback = passport.authenticate('github', { 
  failureRedirect: '/login' 
});

exports.logout = (req, res) => {
  // Use the callback version of req.logout for newer versions of passport
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ message: 'Error logging out' });
    }
    
    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ message: 'Error destroying session' });
      }
      
      // Clear the session cookie
      res.clearCookie('connect.sid'); // This is the default session cookie name
      
      // Redirect to frontend
      res.redirect(process.env.FRONTEND_URL || '');
    });
  });
};

exports.getCurrentUser = (req, res) => {
  console.log('Session ID:', req.sessionID);
  console.log('Session:', req.session);
  console.log('User:', req.user);
  console.log('Is authenticated:', req.isAuthenticated());
  
  if (!req.user) {
     return res.status(401).json({ 
      authenticated: false,
      message: 'Not authenticated',
      sessionId: req.sessionID
    });
  }
  
  res.json({
    id: req.user.id || req.user._id,
    username: req.user.username,
    bio: req.user.bio,
    walletAddress: req.user.walletAddress,
    githubId: req.user.githubId,
    createdAt: req.user.createdAt,
    rank: req.user.rank || 'Code Novice'
  });
};
