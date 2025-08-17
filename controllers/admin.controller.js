const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const rankingService = require('../services/ranking.service');
const { getDB } = require('../config/db');

class AdminController {
    /**
     * Admin login
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and password are required'
                });
            }

            // Find admin by email
            const admin = await Admin.findByEmail(email);
            if (!admin) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Check password
            const isValidPassword = await admin.comparePassword(password);
            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Generate JWT token
            const token = jwt.sign(
                { 
                    adminId: admin.id, 
                    email: admin.email,
                    status: admin.status,
                    type: 'admin'
                },
                process.env.SESSION_SECRET || 'your-secret-key',
                { expiresIn: '24h' }
            );

            res.json({
                success: true,
                data: {
                    admin: admin.toJSON(),
                    token
                },
                message: 'Login successful'
            });

        } catch (error) {
            console.error('Admin login error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to login',
                error: error.message
            });
        }
    }

    /**
     * Get admin dashboard stats
     */
    async getDashboardStats(req, res) {
        try {
            const sql = getDB();

            // Get user stats
            const userStats = await sql`
                SELECT 
                    COUNT(*) as total_users,
                    COUNT(CASE WHEN rank IS NOT NULL THEN 1 END) as ranked_users,
                    AVG(total_score) as avg_score
                FROM users
            `;

            // Get proposal stats  
            const proposalStats = await sql`
                SELECT 
                    COUNT(*) as total_proposals
                FROM proposals
            `;

            // Get recent activity
            const recentUsers = await sql`
                SELECT username, created_at, rank, total_score
                FROM users 
                ORDER BY created_at DESC 
                LIMIT 10
            `;

            const recentProposals = await sql`
                SELECT p.title, p.created_at, u.username as creator
                FROM proposals p
                LEFT JOIN users u ON p.created_by = u.id
                ORDER BY p.created_at DESC
                LIMIT 10
            `;

            res.json({
                success: true,
                data: {
                    userStats: userStats[0],
                    proposalStats: proposalStats[0],
                    recentUsers,
                    recentProposals
                }
            });

        } catch (error) {
            console.error('Dashboard stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch dashboard stats',
                error: error.message
            });
        }
    }

    /**
     * Get all users for admin management
     */
    async getAllUsers(req, res) {
        try {
            const { page = 1, limit = 20, search = '' } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            
            const sql = getDB();
            
            let whereClause = '';
            let searchParams = [];
            
            if (search) {
                whereClause = 'WHERE username ILIKE $1 OR bio ILIKE $1';
                searchParams = [`%${search}%`];
            }

            const users = await sql`
                SELECT id, github_id, username, bio, wallet_address, rank, total_score, last_rank_update, created_at
                FROM users 
                ${whereClause ? sql.unsafe(whereClause) : sql``}
                ORDER BY created_at DESC
                LIMIT ${parseInt(limit)} OFFSET ${offset}
            `;

            const totalCount = await sql`
                SELECT COUNT(*) as count FROM users 
                ${whereClause ? sql.unsafe(whereClause) : sql``}
            `;

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalCount[0].count / parseInt(limit)),
                        totalUsers: parseInt(totalCount[0].count),
                        limit: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Get all users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch users',
                error: error.message
            });
        }
    }

    /**
     * Get all proposals for admin management
     */
    async getAllProposals(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            
            const sql = getDB();

            const proposals = await sql`
                SELECT 
                    p.*,
                    u.username as creator_username,
                    u.wallet_address as creator_wallet
                FROM proposals p
                LEFT JOIN users u ON p.created_by = u.id
                ORDER BY p.created_at DESC
                LIMIT ${parseInt(limit)} OFFSET ${offset}
            `;

            const totalCount = await sql`
                SELECT COUNT(*) as count FROM proposals p
            `;

            res.json({
                success: true,
                data: {
                    proposals,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalCount[0].count / parseInt(limit)),
                        totalProposals: parseInt(totalCount[0].count),
                        limit: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Get all proposals error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch proposals',
                error: error.message
            });
        }
    }

    /**
     * Bulk calculate rankings (admin only)
     */
    async bulkCalculateRankings(req, res) {
        try {
            const sql = getDB();
            const users = await sql`SELECT id, username FROM users`;
            const results = [];
            
            for (const user of users) {
                try {
                    const rankingData = await rankingService.calculateUserRanking(user.id, user.username);
                    await rankingService.updateUserRank(user.id, rankingData);
                    results.push({
                        userId: user.id,
                        username: user.username,
                        success: true,
                        rank: rankingData.rank,
                        score: rankingData.totalScore
                    });
                } catch (error) {
                    results.push({
                        userId: user.id,
                        username: user.username,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            res.json({
                success: true,
                data: {
                    processedUsers: results.length,
                    successfulUpdates: results.filter(r => r.success).length,
                    failedUpdates: results.filter(r => !r.success).length,
                    results: results
                },
                message: 'Bulk ranking calculation completed'
            });

        } catch (error) {
            console.error('Bulk calculate rankings error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate rankings for all users',
                error: error.message
            });
        }
    }


    /**
     * Admin signup - allows existing admins to create new admin accounts
     */
    async signup(req, res) {
        try {
            const { name, email, password, status = 'product' } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, email, and password are required'
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address'
                });
            }

            // Validate password strength
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters long'
                });
            }

            // Check if admin already exists
            const existingAdmin = await Admin.findByEmail(email);
            if (existingAdmin) {
                return res.status(409).json({
                    success: false,
                    message: 'Admin with this email already exists'
                });
            }

            // Create admin (default to 'product' status for signup, can be changed by super admin later)
            const admin = await Admin.create({
                name,
                email,
                password,
                status
            });

            res.status(201).json({
                success: true,
                data: admin.toJSON(),
                message: 'Admin account created successfully'
            });

        } catch (error) {
            console.error('Admin signup error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create admin account',
                error: error.message
            });
        }
    }

    /**
     * Create admin account (super admin only)
     */
    async createAdmin(req, res) {
        try {
            const { name, email, password, status = 'admin' } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, email, and password are required'
                });
            }

            // Check if admin already exists
            const existingAdmin = await Admin.findByEmail(email);
            if (existingAdmin) {
                return res.status(409).json({
                    success: false,
                    message: 'Admin with this email already exists'
                });
            }

            // Create admin
            const admin = await Admin.create({
                name,
                email,
                password,
                status
            });

            res.status(201).json({
                success: true,
                data: admin.toJSON(),
                message: 'Admin created successfully'
            });

        } catch (error) {
            console.error('Create admin error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create admin',
                error: error.message
            });
        }
    }

    /**
     * Get all admins
     */
    async getAllAdmins(req, res) {
        try {
            const admins = await Admin.findAll();
            
            res.json({
                success: true,
                data: admins
            });

        } catch (error) {
            console.error('Get all admins error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch admins',
                error: error.message
            });
        }
    }
}

module.exports = new AdminController();