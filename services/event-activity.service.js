const EventParticipation = require('../models/EventParticipation');
const EventActivity = require('../models/EventActivity');
const githubService = require('./github.service');
const Event = require('../models/Event');

class EventActivityService {
  /**
   * Track and sync activities for all active event participations
   */
  async syncAllEventActivities() {
    try {
      const { getDB } = require('../config/db');
      const sql = getDB();
      
      // Get all active participations
      const participations = await sql`
        SELECT ep.*, u.access_token, u.username, e.github_repo
        FROM event_participations ep
        JOIN users u ON ep.user_id = u.id
        JOIN events e ON ep.event_id = e.id
        WHERE ep.is_active = true 
        AND e.active = true 
        AND e.end_date > NOW()
        AND u.access_token IS NOT NULL
      `;


      for (const participation of participations) {
        try {
          await this.syncParticipationActivities(participation);
        } catch (error) {
          console.error(`Error syncing activities for participation ${participation.id}:`, error.message);
        }
      }

    } catch (error) {
      console.error('Error in syncAllEventActivities:', error);
      throw error;
    }
  }

  /**
   * Sync activities for a specific participation
   */
  async syncParticipationActivities(participation) {
    try {

      const { owner, repo } = githubService.extractRepoInfo(participation.github_repo);
      const forkOwner = participation.username; // Assuming fork is in user's account

      // Get the last activity date to only fetch new activities
      const lastActivityDate = participation.last_activity_date || participation.participation_date;
      
      // Fetch commits from the user's fork branch
      const commits = await this.fetchCommitsFromBranch(
        forkOwner,
        repo,
        participation.branch_name,
        participation.access_token,
        lastActivityDate
      );

      // Process commits
      for (const commit of commits) {
        await this.processCommitActivity(participation, commit);
      }

      // Fetch pull requests created by this user for this repo
      const pullRequests = await this.fetchUserPullRequests(
        owner,
        repo,
        forkOwner,
        participation.access_token,
        lastActivityDate
      );

      // Process pull requests
      for (const pr of pullRequests) {
        await this.processPullRequestActivity(participation, pr);
      }

      // Update participation stats
      const participationObj = new EventParticipation(participation);
      await participationObj.updateStatsFromActivities();

    } catch (error) {
      console.error(`Error syncing participation ${participation.id}:`, error);
      throw error;
    }
  }

  /**
   * Fetch commits from a specific branch
   */
  async fetchCommitsFromBranch(owner, repo, branchName, accessToken, since) {
    try {
      const axios = require('axios');
      
      // Get commits from the specific branch
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/commits`,
        {
          params: {
            sha: branchName,
            since: since ? new Date(since).toISOString() : undefined,
            per_page: 100
          },
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );

      return response.data.map(commit => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author,
        date: commit.commit.author.date,
        stats: commit.stats || { total: 0, additions: 0, deletions: 0 },
        files: commit.files || []
      }));
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }
      console.error('Error fetching commits:', error.message);
      return [];
    }
  }

  /**
   * Fetch pull requests created by a user
   */
  async fetchUserPullRequests(owner, repo, userLogin, accessToken, since) {
    try {
      const axios = require('axios');
      
      // Get all pull requests and filter by user
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          params: {
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 100
          },
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );

      // Filter PRs by user and date
      const sinceDate = since ? new Date(since) : new Date(0);
      
      return response.data.filter(pr => 
        pr.user.login === userLogin && 
        new Date(pr.created_at) > sinceDate
      );
    } catch (error) {
      console.error('Error fetching pull requests:', error.message);
      return [];
    }
  }

  /**
   * Process a commit and create activity record
   */
  async processCommitActivity(participation, commit) {
    try {
      // Check if we already have this commit
      const existingActivity = await EventActivity.findByParticipationId(participation.id, {
        limit: 1000 // Get all to check SHA
      });

      const alreadyExists = existingActivity.some(activity => 
        activity.githubSha === commit.sha && activity.activityType === 'commit'
      );

      if (alreadyExists) {
        return; // Skip if already processed
      }

      // Get detailed commit info if we don't have stats
      let commitStats = commit.stats;
      let commitFiles = commit.files;

      if (!commitStats || commitStats.total === 0) {
        try {
          const detailedCommit = await githubService.getFileChanges(
            participation.username, // Fork owner
            githubService.extractRepoInfo(participation.github_repo).repo,
            commit.sha,
            participation.access_token
          );
          commitStats = detailedCommit.stats;
          commitFiles = detailedCommit.files;
        } catch (error) {
          commitStats = { total: 0, additions: 0, deletions: 0 };
          commitFiles = [];
        }
      }

      // Calculate score for this commit
      const scoreData = {
        linesAdded: commitStats.additions || 0,
        linesDeleted: commitStats.deletions || 0,
        filesChanged: commitFiles.length || 0
      };
      const score = EventActivity.calculateScore('commit', scoreData);

      // Create activity record
      await EventActivity.create({
        participationId: participation.id,
        eventId: participation.event_id,
        userId: participation.user_id,
        activityType: 'commit',
        githubSha: commit.sha,
        commitMessage: commit.message,
        filesChanged: commitFiles.length || 0,
        linesAdded: commitStats.additions || 0,
        linesDeleted: commitStats.deletions || 0,
        scoreEarned: score,
        metadata: {
          commitUrl: `https://github.com/${participation.username}/${githubService.extractRepoInfo(participation.github_repo).repo}/commit/${commit.sha}`,
          author: commit.author
        },
        activityDate: new Date(commit.date)
      });

    } catch (error) {
      console.error('Error processing commit activity:', error);
    }
  }

  /**
   * Process a pull request and create activity record
   */
  async processPullRequestActivity(participation, pr) {
    try {
      // Check if we already have this PR
      const existingActivity = await EventActivity.findByParticipationId(participation.id, {
        limit: 1000
      });

      const alreadyExists = existingActivity.some(activity => 
        activity.githubSha === pr.number.toString() && 
        (activity.activityType === 'pr_created' || activity.activityType === 'pr_merged')
      );

      if (alreadyExists) {
        // Check if PR status changed (merged)
        if (pr.state === 'closed' && pr.merged_at) {
          const hasMergedActivity = existingActivity.some(activity => 
            activity.githubSha === pr.number.toString() && 
            activity.activityType === 'pr_merged'
          );
          
          if (!hasMergedActivity) {
            // Create merged activity
            const mergeScore = EventActivity.calculateScore('pr_merged');
            await EventActivity.create({
              participationId: participation.id,
              eventId: participation.event_id,
              userId: participation.user_id,
              activityType: 'pr_merged',
              githubSha: pr.number.toString(),
              commitMessage: `Merged: ${pr.title}`,
              scoreEarned: mergeScore,
              metadata: {
                prUrl: pr.html_url,
                prTitle: pr.title,
                mergedAt: pr.merged_at
              },
              activityDate: new Date(pr.merged_at)
            });
          }
        }
        return;
      }

      // Calculate score for PR creation
      const createScore = EventActivity.calculateScore('pr_created');

      // Create PR created activity
      await EventActivity.create({
        participationId: participation.id,
        eventId: participation.event_id,
        userId: participation.user_id,
        activityType: 'pr_created',
        githubSha: pr.number.toString(),
        commitMessage: pr.title,
        scoreEarned: createScore,
        metadata: {
          prUrl: pr.html_url,
          prTitle: pr.title,
          prBody: pr.body,
          state: pr.state
        },
        activityDate: new Date(pr.created_at)
      });


      // If PR is merged, also create merged activity
      if (pr.state === 'closed' && pr.merged_at) {
        const mergeScore = EventActivity.calculateScore('pr_merged');
        await EventActivity.create({
          participationId: participation.id,
          eventId: participation.event_id,
          userId: participation.user_id,
          activityType: 'pr_merged',
          githubSha: pr.number.toString(),
          commitMessage: `Merged: ${pr.title}`,
          scoreEarned: mergeScore,
          metadata: {
            prUrl: pr.html_url,
            prTitle: pr.title,
            mergedAt: pr.merged_at
          },
          activityDate: new Date(pr.merged_at)
        });
      }
    } catch (error) {
      console.error('Error processing PR activity:', error);
    }
  }

  /**
   * Sync activities for a specific event
   */
  async syncEventActivities(eventId) {
    try {
      const { getDB } = require('../config/db');
      const sql = getDB();
      
      const participations = await sql`
        SELECT ep.*, u.access_token, u.username, e.github_repo
        FROM event_participations ep
        JOIN users u ON ep.user_id = u.id
        JOIN events e ON ep.event_id = e.id
        WHERE ep.event_id = ${eventId}
        AND ep.is_active = true 
        AND u.access_token IS NOT NULL
      `;


      for (const participation of participations) {
        await this.syncParticipationActivities(participation);
      }

    } catch (error) {
      console.error(`Error syncing activities for event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Get activity summary for an event
   */
  async getEventActivitySummary(eventId) {
    try {
      const stats = await EventActivity.getEventActivityStats(eventId);
      const recentActivities = await EventActivity.getRecentActivities(eventId, 10);
      const leaderboard = await EventParticipation.getEventLeaderboard(eventId, { limit: 10 });

      return {
        stats,
        recentActivities,
        topParticipants: leaderboard
      };
    } catch (error) {
      console.error('Error getting event activity summary:', error);
      throw error;
    }
  }
}

module.exports = new EventActivityService();