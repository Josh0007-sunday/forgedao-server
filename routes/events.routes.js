const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/events.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Middleware to verify admin JWT token
const verifyAdminToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || req.body.token || req.query.token;
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'your-secret-key');
        
        if (decoded.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }
        
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Invalid token.'
        });
    }
};

// Optional user authentication middleware for public endpoints
const optionalUserAuth = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'your-secret-key');
            
            if (decoded.type === 'user') {
                req.user = decoded;
            }
        } catch (error) {
            // Ignore invalid tokens for optional auth
        }
    }
    
    next();
};


// Public routes
router.get('/ranks', eventsController.getAvailableRanks);
router.get('/user', optionalUserAuth, eventsController.getEventsForUser);
router.get('/user-rank/:rank', eventsController.getEventsByRank);
router.get('/:id', eventsController.getEventById);

// Event participation routes (require user authentication)
router.post('/:id/participate', authMiddleware.isAuthenticated, eventsController.participateInEvent);
router.get('/:id/participation-status', authMiddleware.isAuthenticated, eventsController.getUserParticipationStatus);
router.get('/:id/leaderboard', eventsController.getEventLeaderboard);
router.get('/:id/activity-feed', eventsController.getEventActivityFeed);

// User participation routes
router.get('/user/participations', authMiddleware.isAuthenticated, eventsController.getUserEventParticipations);

// Protected admin routes
router.use(verifyAdminToken);
router.post('/', eventsController.createEvent);
router.get('/', eventsController.getAllEvents);
router.put('/:id', eventsController.updateEvent);
router.delete('/:id', eventsController.deleteEvent);

module.exports = router;