const express = require('express');
const router = express.Router();
const rankingController = require('../controllers/ranking.controller');

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    next();
};

// Get current user's ranking
router.get('/me', requireAuth, rankingController.getCurrentUserRanking);

// Calculate current user's ranking
router.post('/me/calculate', requireAuth, rankingController.calculateCurrentUserRanking);

// Get user ranking by ID
router.get('/user/:userId', rankingController.getUserRanking);

// Calculate user ranking by ID
router.post('/user/:userId/calculate', requireAuth, rankingController.calculateUserRanking);

// Get leaderboard
router.get('/leaderboard', rankingController.getLeaderboard);

// Get ranking statistics
router.get('/stats', rankingController.getRankingStats);

// Bulk calculate rankings (admin only - you might want to add admin middleware)
router.post('/bulk-calculate', requireAuth, rankingController.bulkCalculateRankings);

module.exports = router;