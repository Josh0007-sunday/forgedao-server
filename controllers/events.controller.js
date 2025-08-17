const Event = require('../models/Event');
const EventParticipation = require('../models/EventParticipation');
const EventActivity = require('../models/EventActivity');
const githubService = require('../services/github.service');
const User = require('../models/User');

class EventsController {
    /**
     * Create a new event (admin/product only)
     */
    async createEvent(req, res) {
        try {
            const { title, description, githubRepo, visibleRanks, endDate } = req.body;
            const createdBy = req.admin.adminId;

            // Validation
            if (!title || !description || !githubRepo || !visibleRanks || !endDate) {
                return res.status(400).json({
                    success: false,
                    message: 'All fields are required: title, description, githubRepo, visibleRanks, endDate'
                });
            }

            // Validate visible ranks
            const validRanks = ['Code Novice', 'Dev Savage', 'Forge Elite', 'Tech Maestro', 'Forge Master'];
            const invalidRanks = visibleRanks.filter(rank => !validRanks.includes(rank));
            if (invalidRanks.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ranks: ${invalidRanks.join(', ')}. Valid ranks are: ${validRanks.join(', ')}`
                });
            }

            // Validate end date
            const endDateTime = new Date(endDate);
            if (endDateTime <= new Date()) {
                return res.status(400).json({
                    success: false,
                    message: 'End date must be in the future'
                });
            }

            // Validate GitHub repo URL format
            const githubRepoRegex = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
            if (!githubRepoRegex.test(githubRepo)) {
                return res.status(400).json({
                    success: false,
                    message: 'GitHub repository URL must be in format: https://github.com/username/repository'
                });
            }

            const event = await Event.create({
                title,
                description,
                githubRepo,
                visibleRanks,
                endDate: endDateTime,
                createdBy
            });

            res.status(201).json({
                success: true,
                data: event.toJSON(),
                message: 'Event created successfully'
            });

        } catch (error) {
            console.error('Create event error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create event',
                error: error.message
            });
        }
    }

    /**
     * Get all events (admin only)
     */
    async getAllEvents(req, res) {
        try {
            const { page = 1, limit = 20, activeOnly } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            
            const options = {
                activeOnly: activeOnly !== 'false', // default to true unless explicitly false
                limit: parseInt(limit),
                offset
            };

            const events = await Event.findAll(options);

            // Get total count for pagination
            const sql = require('../config/db').getDB();
            const totalCount = await sql`
                SELECT COUNT(*) as count FROM events 
                ${options.activeOnly ? sql`WHERE active = true` : sql``}
            `;

            res.json({
                success: true,
                data: {
                    events: events.map(event => event.toJSON()),
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(totalCount[0].count / parseInt(limit)),
                        totalEvents: parseInt(totalCount[0].count),
                        limit: parseInt(limit)
                    }
                }
            });

        } catch (error) {
            console.error('Get all events error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch events',
                error: error.message
            });
        }
    }

    /**
     * Get events visible to current user (public endpoint)
     */
    async getEventsForUser(req, res) {
        try {
            const userId = req.user?.id;
            let userRank = 'Code Novice'; // Default rank for unauthenticated users

            // If user is authenticated, get their rank
            if (userId) {
                const User = require('../models/User');
                const user = await User.findById(userId);
                if (user) {
                    userRank = user.rank;
                }
            }

            const events = await Event.findByUserRank(userRank, {
                activeOnly: true,
                includeExpired: false
            });

            res.json(events.map(event => event.toJSON()));

        } catch (error) {
            console.error('Get events for user error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch events',
                error: error.message
            });
        }
    }

    /**
     * Get events visible to specific rank (public endpoint)
     */
    async getEventsByRank(req, res) {
        try {
            const { rank } = req.params;
            
            // Validate rank
            const validRanks = ['Code Novice', 'Dev Savage', 'Forge Elite', 'Tech Maestro', 'Forge Master'];
            if (!validRanks.includes(rank)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid rank: ${rank}. Valid ranks are: ${validRanks.join(', ')}`
                });
            }

            const events = await Event.findByUserRank(rank, {
                activeOnly: true,
                includeExpired: false
            });

            res.json(events.map(event => event.toJSON()));

        } catch (error) {
            console.error('Get events by rank error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch events',
                error: error.message
            });
        }
    }

    /**
     * Get event by ID
     */
    async getEventById(req, res) {
        try {
            const { id } = req.params;
            const event = await Event.findById(id);

            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            res.json({
                success: true,
                data: event.toJSON()
            });

        } catch (error) {
            console.error('Get event by ID error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch event',
                error: error.message
            });
        }
    }

    /**
     * Update event (admin only)
     */
    async updateEvent(req, res) {
        try {
            const { id } = req.params;
            const { title, description, githubRepo, visibleRanks, endDate, active } = req.body;

            const event = await Event.findById(id);
            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            // Update fields if provided
            if (title !== undefined) event.title = title;
            if (description !== undefined) event.description = description;
            if (githubRepo !== undefined) {
                // Validate GitHub repo URL format
                const githubRepoRegex = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/;
                if (!githubRepoRegex.test(githubRepo)) {
                    return res.status(400).json({
                        success: false,
                        message: 'GitHub repository URL must be in format: https://github.com/username/repository'
                    });
                }
                event.githubRepo = githubRepo;
            }
            if (visibleRanks !== undefined) {
                // Validate visible ranks
                const validRanks = ['Code Novice', 'Dev Savage', 'Forge Elite', 'Tech Maestro', 'Forge Master'];
                const invalidRanks = visibleRanks.filter(rank => !validRanks.includes(rank));
                if (invalidRanks.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid ranks: ${invalidRanks.join(', ')}. Valid ranks are: ${validRanks.join(', ')}`
                    });
                }
                event.visibleRanks = visibleRanks;
            }
            if (endDate !== undefined) {
                const endDateTime = new Date(endDate);
                if (endDateTime <= new Date()) {
                    return res.status(400).json({
                        success: false,
                        message: 'End date must be in the future'
                    });
                }
                event.endDate = endDateTime;
            }
            if (active !== undefined) event.active = active;

            await event.save();

            res.json({
                success: true,
                data: event.toJSON(),
                message: 'Event updated successfully'
            });

        } catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update event',
                error: error.message
            });
        }
    }

    /**
     * Delete event (admin only)
     */
    async deleteEvent(req, res) {
        try {
            const { id } = req.params;
            const event = await Event.findById(id);

            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            await event.delete();

            res.json({
                success: true,
                message: 'Event deleted successfully'
            });

        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete event',
                error: error.message
            });
        }
    }

    /**
     * Get available ranks for event creation
     */
    async getAvailableRanks(req, res) {
        try {
            const ranks = ['Code Novice', 'Dev Savage', 'Forge Elite', 'Tech Maestro', 'Forge Master'];
            
            res.json({
                success: true,
                data: ranks
            });

        } catch (error) {
            console.error('Get available ranks error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch available ranks',
                error: error.message
            });
        }
    }

    /**
     * Participate in an event (one-click fork and branch creation)
     */
    async participateInEvent(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            // Get event
            const event = await Event.findById(id);
            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            // Check if event is active and not expired
            if (!event.active || event.isExpired()) {
                return res.status(400).json({
                    success: false,
                    message: 'Event is not active or has expired'
                });
            }

            // Get user and check rank eligibility
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            if (!event.isVisibleToRank(user.rank)) {
                return res.status(403).json({
                    success: false,
                    message: 'Your current rank does not have access to this event'
                });
            }

            // Check if user already participating
            const existingParticipation = await EventParticipation.findByEventAndUser(id, userId);
            if (existingParticipation && existingParticipation.isActive) {
                return res.status(400).json({
                    success: false,
                    message: 'You are already participating in this event',
                    data: {
                        participation: existingParticipation.toJSON(),
                        githubForkUrl: existingParticipation.githubForkUrl,
                        branchName: existingParticipation.branchName
                    }
                });
            }

            // Check if user has GitHub access token
            if (!user.accessToken) {
                return res.status(403).json({
                    success: false,
                    message: 'GitHub account not connected. Please connect your GitHub account to participate in events.'
                });
            }

            // Extract repo info from event
            const { owner, repo } = githubService.extractRepoInfo(event.githubRepo);
            
            // Create unique branch name for this user and event
            const branchName = `event-${id}-${user.username}-${Date.now()}`;

            // Fork repository and create branch
            const forkResult = await githubService.createBranchInFork(
                owner,
                repo,
                branchName,
                user.accessToken
            );

            // Create participation record
            const participation = await EventParticipation.create({
                eventId: id,
                userId: userId,
                githubForkUrl: forkResult.forkUrl,
                branchName: branchName,
                participationDate: new Date(),
                isActive: true
            });

            // Log fork and branch creation activities
            await EventActivity.create({
                participationId: participation.id,
                eventId: id,
                userId: userId,
                activityType: 'fork_created',
                scoreEarned: EventActivity.calculateScore('fork_created'),
                metadata: {
                    forkUrl: forkResult.forkUrl,
                    originalRepo: `${owner}/${repo}`
                },
                activityDate: new Date()
            });

            await EventActivity.create({
                participationId: participation.id,
                eventId: id,
                userId: userId,
                activityType: 'branch_created',
                scoreEarned: EventActivity.calculateScore('branch_created'),
                metadata: {
                    branchName: branchName,
                    branchUrl: forkResult.branchUrl
                },
                activityDate: new Date()
            });

            // Update participation stats
            await participation.updateStatsFromActivities();

            res.status(201).json({
                success: true,
                message: 'Successfully joined the event! Your fork and branch have been created.',
                data: {
                    participation: participation.toJSON(),
                    github: {
                        forkUrl: forkResult.forkUrl,
                        branchUrl: forkResult.branchUrl,
                        cloneUrl: forkResult.cloneUrl,
                        branchName: branchName,
                        workingInstructions: forkResult.workingInstructions
                    }
                }
            });

        } catch (error) {
            console.error('Participate in event error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to participate in event',
                error: error.message
            });
        }
    }

    /**
     * Get user's participation status for an event
     */
    async getUserParticipationStatus(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const participation = await EventParticipation.findByEventAndUser(id, userId);
            
            res.json({
                success: true,
                data: {
                    isParticipating: !!participation,
                    participation: participation ? participation.toJSON() : null
                }
            });

        } catch (error) {
            console.error('Get participation status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get participation status',
                error: error.message
            });
        }
    }

    /**
     * Get event leaderboard
     */
    async getEventLeaderboard(req, res) {
        try {
            const { id } = req.params;
            const { limit = 20 } = req.query;

            const event = await Event.findById(id);
            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            const leaderboard = await EventParticipation.getEventLeaderboard(id, { limit: parseInt(limit) });

            res.json({
                success: true,
                data: {
                    event: event.toJSON(),
                    leaderboard: leaderboard
                }
            });

        } catch (error) {
            console.error('Get event leaderboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get event leaderboard',
                error: error.message
            });
        }
    }

    /**
     * Get event activity feed
     */
    async getEventActivityFeed(req, res) {
        try {
            const { id } = req.params;
            const { limit = 20 } = req.query;

            const event = await Event.findById(id);
            if (!event) {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found'
                });
            }

            const activities = await EventActivity.getRecentActivities(id, parseInt(limit));

            res.json({
                success: true,
                data: {
                    event: event.toJSON(),
                    activities: activities
                }
            });

        } catch (error) {
            console.error('Get event activity feed error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get event activity feed',
                error: error.message
            });
        }
    }

    /**
     * Get user's event participations
     */
    async getUserEventParticipations(req, res) {
        try {
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const participations = await EventParticipation.findByUserId(userId);

            res.json({
                success: true,
                data: participations.map(p => p.toJSON())
            });

        } catch (error) {
            console.error('Get user participations error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get user participations',
                error: error.message
            });
        }
    }
}

module.exports = new EventsController();