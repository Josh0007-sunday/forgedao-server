const { Octokit } = require('@octokit/core');
const User = require('../models/User');
const Proposal = require('../models/Proposal');
const EventParticipation = require('../models/EventParticipation');
const EventActivity = require('../models/EventActivity');

class RankingService {
    constructor() {
        const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
        if (!githubToken) {
            console.warn('Warning: No GitHub token found. GitHub API requests may be rate limited.');
        }
        this.octokit = new Octokit({
            auth: githubToken
        });
        
        // Ranking thresholds (0-100%)
        this.ranks = [
            { name: 'Code Novice', min: 0, max: 20 },
            { name: 'Dev Savage', min: 20, max: 40 },
            { name: 'Forge Elite', min: 40, max: 60 },
            { name: 'Tech Maestro', min: 60, max: 80 },
            { name: 'Forge Master', min: 80, max: 100 }
        ];
    }

    /**
     * Calculate user ranking based on GitHub activities and platform contributions
     * @param {string} userId - User ID
     * @param {string} githubUsername - GitHub username
     * @returns {Object} Ranking data with score and rank
     */
    async calculateUserRanking(userId, githubUsername) {
        try {
            const scores = {
                githubStars: 0,        // 8%
                totalCommits: 0,       // 15%
                pullRequests: 0,       // 8%
                issues: 0,             // 4%
                recentActivity: 0,     // 8%
                proposals: 0,          // 25%
                contributions: 0,      // 15%
                eventParticipation: 0, // 12%
                eventActivities: 0     // 5%
            };

            // Get GitHub data
            const githubData = await this.getGitHubMetrics(githubUsername);
            
            // Calculate GitHub Stars score (10%)
            scores.githubStars = this.calculateStarsScore(githubData.stars);
            
            // Calculate Total Commits score (20%)
            scores.totalCommits = this.calculateCommitsScore(githubData.commits);
            
            // Calculate Pull Requests score (10%)
            scores.pullRequests = this.calculatePRScore(githubData.pullRequests);
            
            // Calculate Issues score (5%)
            scores.issues = this.calculateIssuesScore(githubData.issues);
            
            // Calculate Recent Activity score (10%)
            scores.recentActivity = this.calculateRecentActivityScore(githubData.recentActivity);
            
            // Get platform data
            const platformData = await this.getPlatformMetrics(userId);
            
            // Calculate Proposals score (30%)
            scores.proposals = this.calculateProposalsScore(platformData.proposalCount);
            
            // Calculate Contributions score (15%)
            scores.contributions = this.calculateContributionsScore(platformData.contributionCount);
            
            // Get event participation data
            const eventData = await this.getEventMetrics(userId);
            
            // Calculate Event Participation score (12%)
            scores.eventParticipation = this.calculateEventParticipationScore(eventData.activeParticipations, eventData.totalScore);
            
            // Calculate Event Activities score (5%)
            scores.eventActivities = this.calculateEventActivitiesScore(eventData.totalActivities, eventData.recentActivities);
            
            // Calculate total score
            const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
            
            // Determine rank
            const rank = this.getRankFromScore(totalScore);
            
            return {
                totalScore: Math.round(totalScore * 100) / 100,
                rank: rank.name,
                breakdown: {
                    githubStars: { score: scores.githubStars, weight: '8%', value: githubData.stars },
                    totalCommits: { score: scores.totalCommits, weight: '15%', value: githubData.commits },
                    pullRequests: { score: scores.pullRequests, weight: '8%', value: githubData.pullRequests },
                    issues: { score: scores.issues, weight: '4%', value: githubData.issues },
                    recentActivity: { score: scores.recentActivity, weight: '8%', value: githubData.recentActivity },
                    proposals: { score: scores.proposals, weight: '25%', value: platformData.proposalCount },
                    contributions: { score: scores.contributions, weight: '15%', value: platformData.contributionCount },
                    eventParticipation: { score: scores.eventParticipation, weight: '12%', value: eventData.activeParticipations },
                    eventActivities: { score: scores.eventActivities, weight: '5%', value: eventData.totalActivities }
                }
            };
        } catch (error) {
            console.error('Error calculating user ranking:', error);
            console.error('Error details:', {
                message: error.message,
                status: error.status,
                userId: userId,
                githubUsername: githubUsername
            });
            throw error;
        }
    }

    /**
     * Get GitHub metrics for a user
     * @param {string} username - GitHub username
     * @returns {Object} GitHub metrics
     */
    async getGitHubMetrics(username) {
        try {
                
            // Get user data
            const userResponse = await this.octokit.request('GET /users/{username}', {
                username: username,
                headers: { 'X-GitHub-Api-Version': '2022-11-28' }
            });

            // Get starred repositories count
            const starsResponse = await this.octokit.request('GET /users/{username}/starred', {
                username: username,
                per_page: 1,
                headers: { 'X-GitHub-Api-Version': '2022-11-28' }
            });
            const stars = this.getTotalCountFromResponse(starsResponse);

            // Get user repositories
            const reposResponse = await this.octokit.request('GET /users/{username}/repos', {
                username: username,
                per_page: 100,
                headers: { 'X-GitHub-Api-Version': '2022-11-28' }
            });

            let totalCommits = 0;
            let totalPRs = 0;
            let totalIssues = 0;
            let recentActivity = 0;

            // Calculate commits, PRs, and issues across all repos
            for (const repo of reposResponse.data) {
                try {
                    // Get commit count for user in this repo
                    const commitsResponse = await this.octokit.request('GET /repos/{owner}/{repo}/commits', {
                        owner: repo.owner.login,
                        repo: repo.name,
                        author: username,
                        per_page: 1,
                        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                    });
                    totalCommits += this.getTotalCountFromResponse(commitsResponse);

                    // Get PR count
                    const prsResponse = await this.octokit.request('GET /repos/{owner}/{repo}/pulls', {
                        owner: repo.owner.login,
                        repo: repo.name,
                        creator: username,
                        state: 'all',
                        per_page: 1,
                        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                    });
                    totalPRs += this.getTotalCountFromResponse(prsResponse);

                    // Get issues count
                    const issuesResponse = await this.octokit.request('GET /repos/{owner}/{repo}/issues', {
                        owner: repo.owner.login,
                        repo: repo.name,
                        creator: username,
                        state: 'all',
                        per_page: 1,
                        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                    });
                    totalIssues += this.getTotalCountFromResponse(issuesResponse);

                    // Check for recent activity (past 4 years)
                    const fourYearsAgo = new Date();
                    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);

                    const recentCommitsResponse = await this.octokit.request('GET /repos/{owner}/{repo}/commits', {
                        owner: repo.owner.login,
                        repo: repo.name,
                        author: username,
                        since: fourYearsAgo.toISOString(),
                        per_page: 1,
                        headers: { 'X-GitHub-Api-Version': '2022-11-28' }
                    });
                    recentActivity += this.getTotalCountFromResponse(recentCommitsResponse);

                } catch (repoError) {
                    // Skip repos that we can't access
                    console.warn(`Skipping repo ${repo.name}:`, repoError.message);
                }
            }

            return {
                stars,
                commits: totalCommits,
                pullRequests: totalPRs,
                issues: totalIssues,
                recentActivity
            };
        } catch (error) {
            console.error('Error fetching GitHub metrics:', error);
            // Return default values if API fails
            return {
                stars: 0,
                commits: 0,
                pullRequests: 0,
                issues: 0,
                recentActivity: 0
            };
        }
    }

    /**
     * Get platform metrics for a user
     * @param {string} userId - User ID
     * @returns {Object} Platform metrics
     */
    async getPlatformMetrics(userId) {
        try {
            // Count user proposals
            const proposalCount = await Proposal.countDocuments({ 'createdBy.id': userId });
            
            // Count user contributions (branches and PRs)
            const contributionCount = await this.getUserContributionCount(userId);
            
            return {
                proposalCount,
                contributionCount
            };
        } catch (error) {
            console.error('Error fetching platform metrics:', error);
            return {
                proposalCount: 0,
                contributionCount: 0
            };
        }
    }

    /**
     * Get user contribution count from activities
     * @param {string} userId - User ID
     * @returns {number} Contribution count
     */
    async getUserContributionCount(userId) {
        // This would require querying your activities collection
        // For now, returning 0 - you can implement based on your activity tracking
        return 0;
    }

    /**
     * Calculate GitHub stars score (10% weight)
     * @param {number} stars - Number of starred repos
     * @returns {number} Score (0-10)
     */
    calculateStarsScore(stars) {
        // Scale: 0-50 stars = 0-10 points
        return Math.min((stars / 50) * 10, 10);
    }

    /**
     * Calculate commits score (20% weight)
     * @param {number} commits - Number of commits
     * @returns {number} Score (0-20)
     */
    calculateCommitsScore(commits) {
        // Scale: 0-1000 commits = 0-20 points
        return Math.min((commits / 1000) * 20, 20);
    }

    /**
     * Calculate pull requests score (10% weight)
     * @param {number} prs - Number of pull requests
     * @returns {number} Score (0-10)
     */
    calculatePRScore(prs) {
        // Scale: 0-100 PRs = 0-10 points
        return Math.min((prs / 100) * 10, 10);
    }

    /**
     * Calculate issues score (5% weight)
     * @param {number} issues - Number of issues
     * @returns {number} Score (0-5)
     */
    calculateIssuesScore(issues) {
        // Scale: 0-50 issues = 0-5 points
        return Math.min((issues / 50) * 5, 5);
    }

    /**
     * Calculate recent activity score (10% weight)
     * @param {number} recentActivity - Recent commits count
     * @returns {number} Score (0-10)
     */
    calculateRecentActivityScore(recentActivity) {
        // Scale: 0-200 recent commits = 0-10 points
        return Math.min((recentActivity / 200) * 10, 10);
    }

    /**
     * Calculate proposals score (30% weight)
     * @param {number} proposalCount - Number of proposals
     * @returns {number} Score (0-30)
     */
    calculateProposalsScore(proposalCount) {
        // Scale: 5+ proposals = full 30 points
        if (proposalCount >= 5) return 30;
        return (proposalCount / 5) * 30;
    }

    /**
     * Calculate contributions score (20% weight)
     * @param {number} contributionCount - Number of contributions
     * @returns {number} Score (0-20)
     */
    calculateContributionsScore(contributionCount) {
        // Scale: 0-50 contributions = 0-20 points
        return Math.min((contributionCount / 50) * 20, 20);
    }

    /**
     * Get rank from total score
     * @param {number} score - Total score (0-100)
     * @returns {Object} Rank object
     */
    getRankFromScore(score) {
        const percentage = Math.min(score, 100);
        return this.ranks.find(rank => percentage >= rank.min && percentage < rank.max) || this.ranks[this.ranks.length - 1];
    }

    /**
     * Get event participation metrics for a user
     * @param {string} userId - User ID
     * @returns {Object} Event metrics
     */
    async getEventMetrics(userId) {
        try {
            // Get active participations
            const activeParticipations = await EventParticipation.findByUserId(userId, { 
                activeOnly: true 
            });

            // Get total score from all participations
            const totalScore = activeParticipations.reduce((sum, participation) => sum + (participation.score || 0), 0);

            // Get total activities across all participations
            const { getDB } = require('../config/db');
            const sql = getDB();
            
            const activityStats = await sql`
                SELECT 
                    COUNT(*) as total_activities,
                    COUNT(*) FILTER (WHERE activity_date > NOW() - INTERVAL '30 days') as recent_activities,
                    COALESCE(SUM(score_earned), 0) as total_activity_score
                FROM event_activities ea
                JOIN event_participations ep ON ea.participation_id = ep.id
                WHERE ep.user_id = ${userId} AND ep.is_active = true
            `;

            const stats = activityStats[0] || { 
                total_activities: 0, 
                recent_activities: 0, 
                total_activity_score: 0 
            };

            return {
                activeParticipations: activeParticipations.length,
                totalScore: parseInt(totalScore) || 0,
                totalActivities: parseInt(stats.total_activities) || 0,
                recentActivities: parseInt(stats.recent_activities) || 0,
                totalActivityScore: parseInt(stats.total_activity_score) || 0
            };
        } catch (error) {
            console.error('Error getting event metrics:', error);
            return {
                activeParticipations: 0,
                totalScore: 0,
                totalActivities: 0,
                recentActivities: 0,
                totalActivityScore: 0
            };
        }
    }

    /**
     * Calculate event participation score (12% weight)
     * @param {number} activeParticipations - Number of active participations
     * @param {number} totalScore - Total score from events
     * @returns {number} Score (0-12)
     */
    calculateEventParticipationScore(activeParticipations, totalScore) {
        // Base score for participation count (up to 6 points)
        const participationScore = Math.min((activeParticipations / 5) * 6, 6);
        
        // Score for total points earned (up to 6 points)
        const pointsScore = Math.min((totalScore / 100) * 6, 6);
        
        return participationScore + pointsScore;
    }

    /**
     * Calculate event activities score (5% weight)
     * @param {number} totalActivities - Total number of activities
     * @param {number} recentActivities - Recent activities (last 30 days)
     * @returns {number} Score (0-5)
     */
    calculateEventActivitiesScore(totalActivities, recentActivities) {
        // Score based on total activities (up to 3 points)
        const totalScore = Math.min((totalActivities / 50) * 3, 3);
        
        // Score based on recent activity (up to 2 points)
        const recentScore = Math.min((recentActivities / 10) * 2, 2);
        
        return totalScore + recentScore;
    }

    /**
     * Get total count from GitHub API response
     * @param {Object} response - GitHub API response
     * @returns {number} Total count
     */
    getTotalCountFromResponse(response) {
        const linkHeader = response.headers.link;
        if (linkHeader) {
            const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            if (lastPageMatch) {
                return parseInt(lastPageMatch[1]) * response.data.length;
            }
        }
        return response.data.length;
    }

    /**
     * Update user rank in database
     * @param {string} userId - User ID
     * @param {Object} rankingData - Ranking data
     */
    async updateUserRank(userId, rankingData) {
        try {
            await User.findByIdAndUpdate(userId, {
                rank: rankingData.rank,
                totalScore: rankingData.totalScore,
                lastRankUpdate: new Date()
            });
        } catch (error) {
            console.error('Error updating user rank:', error);
            throw error;
        }
    }

    /**
     * Get all users with their rankings
     * @returns {Array} Users with rankings
     */
    async getAllUserRankings() {
        try {
            const { getDB } = require('../config/db');
            const sql = getDB();
            const result = await sql`
                SELECT id, username, rank, total_score as "totalScore", last_rank_update as "lastRankUpdate"
                FROM users 
                ORDER BY total_score DESC NULLS LAST
            `;
            return result;
        } catch (error) {
            console.error('Error fetching user rankings:', error);
            throw error;
        }
    }
}

module.exports = new RankingService();