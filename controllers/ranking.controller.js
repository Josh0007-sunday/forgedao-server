const rankingService = require('../services/ranking.service');
const User = require('../models/User');

class RankingController {
    /**
     * Calculate and update user ranking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async calculateUserRanking(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Calculate ranking
            const rankingData = await rankingService.calculateUserRanking(userId, user.username);
            
            // Update user rank in database
            await rankingService.updateUserRank(userId, rankingData);
            
            res.json({
                success: true,
                data: {
                    userId: userId,
                    username: user.username,
                    ...rankingData
                },
                message: 'User ranking calculated successfully'
            });
        } catch (error) {
            console.error('Error calculating user ranking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate user ranking',
                error: error.message
            });
        }
    }

    /**
     * Get user ranking by user ID
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getUserRanking(req, res) {
        try {
            const { userId } = req.params;
            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.json({
                success: true,
                data: {
                    userId: user.id,
                    username: user.username,
                    rank: user.rank,
                    totalScore: user.totalScore,
                    lastRankUpdate: user.lastRankUpdate
                }
            });
        } catch (error) {
            console.error('Error fetching user ranking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch user ranking',
                error: error.message
            });
        }
    }

    /**
     * Get current user's ranking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getCurrentUserRanking(req, res) {
        try {
            const userId = req.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            res.json({
                success: true,
                data: {
                    userId: user.id,
                    username: user.username,
                    rank: user.rank,
                    totalScore: user.totalScore,
                    lastRankUpdate: user.lastRankUpdate
                }
            });
        } catch (error) {
            console.error('Error fetching current user ranking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch user ranking',
                error: error.message
            });
        }
    }

    /**
     * Calculate current user's ranking
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async calculateCurrentUserRanking(req, res) {
        try {
            const userId = req.user?.id;
            
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const user = await User.findById(userId);
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Calculate ranking
            const rankingData = await rankingService.calculateUserRanking(userId, user.username);
            
            // Update user rank in database
            await rankingService.updateUserRank(userId, rankingData);
            
            res.json({
                success: true,
                data: {
                    userId: userId,
                    username: user.username,
                    ...rankingData
                },
                message: 'User ranking calculated successfully'
            });
        } catch (error) {
            console.error('Error calculating current user ranking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate user ranking',
                error: error.message
            });
        }
    }

    /**
     * Get leaderboard with all user rankings
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getLeaderboard(req, res) {
        try {
            const { page = 1, limit = 20 } = req.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            
            const users = await rankingService.getAllUserRankings();
            
            // Paginate results
            const paginatedUsers = users.slice(skip, skip + parseInt(limit));
            
            res.json({
                success: true,
                data: {
                    users: paginatedUsers,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(users.length / parseInt(limit)),
                        totalUsers: users.length,
                        limit: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch leaderboard',
                error: error.message
            });
        }
    }

    /**
     * Get ranking statistics
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getRankingStats(req, res) {
        try {
            const users = await rankingService.getAllUserRankings();
            
            // Calculate statistics
            const validScores = users.filter(u => u.totalScore !== null && u.totalScore !== undefined).map(u => Number(u.totalScore || 0));
            const stats = {
                totalUsers: users.length,
                ranks: {
                    'Code Novice': users.filter(u => u.rank === 'Code Novice').length,
                    'Dev Savage': users.filter(u => u.rank === 'Dev Savage').length,
                    'Forge Elite': users.filter(u => u.rank === 'Forge Elite').length,
                    'Tech Maestro': users.filter(u => u.rank === 'Tech Maestro').length,
                    'Forge Master': users.filter(u => u.rank === 'Forge Master').length
                },
                averageScore: validScores.length > 0 ? 
                    validScores.reduce((sum, score) => sum + score, 0) / validScores.length : 0,
                topScore: validScores.length > 0 ? Math.max(...validScores) : 0
            };
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching ranking stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch ranking statistics',
                error: error.message
            });
        }
    }

    /**
     * Bulk calculate rankings for all users
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async bulkCalculateRankings(req, res) {
        try {
            // This is an admin operation that might take a while
            // You might want to implement this as a background job
            
            const { getDB } = require('../config/db');
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
            console.error('Error in bulk ranking calculation:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate rankings for all users',
                error: error.message
            });
        }
    }
}

module.exports = new RankingController();