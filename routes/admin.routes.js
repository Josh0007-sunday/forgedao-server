const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

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

// Middleware to verify super admin status
const verifySuperAdmin = (req, res, next) => {
    if (req.admin.status !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Super admin privileges required.'
        });
    }
    next();
};

// Public routes
router.post('/login', adminController.login);

// Protected admin routes
router.use(verifyAdminToken);

// Admin signup (requires existing admin authentication)
router.post('/signup', adminController.signup);

// Dashboard and stats
router.get('/dashboard/stats', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getAllUsers);

// Proposal management
router.get('/proposals', adminController.getAllProposals);

// Ranking management
router.post('/rankings/bulk-calculate', adminController.bulkCalculateRankings);

// Admin management (super admin only)
router.get('/admins', verifySuperAdmin, adminController.getAllAdmins);
router.post('/admins', verifySuperAdmin, adminController.createAdmin);

module.exports = router;