const { getDB } = require('../config/db');

class EventActivity {
  constructor(data) {
    this.id = data.id;
    this.participationId = data.participation_id || data.participationId;
    this.eventId = data.event_id || data.eventId;
    this.userId = data.user_id || data.userId;
    this.activityType = data.activity_type || data.activityType;
    this.githubSha = data.github_sha || data.githubSha;
    this.commitMessage = data.commit_message || data.commitMessage;
    this.filesChanged = data.files_changed || data.filesChanged || 0;
    this.linesAdded = data.lines_added || data.linesAdded || 0;
    this.linesDeleted = data.lines_deleted || data.linesDeleted || 0;
    this.scoreEarned = data.score_earned || data.scoreEarned || 0;
    this.metadata = data.metadata || {};
    this.activityDate = data.activity_date || data.activityDate;
    this.createdAt = data.created_at || data.createdAt;
  }

  static async findById(id) {
    const sql = getDB();
    const result = await sql`
      SELECT ea.*, u.username, e.title as event_title
      FROM event_activities ea
      LEFT JOIN users u ON ea.user_id = u.id
      LEFT JOIN events e ON ea.event_id = e.id
      WHERE ea.id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new EventActivity(result[0]);
  }

  static async findByParticipationId(participationId, options = {}) {
    const sql = getDB();
    const { limit = 50, offset = 0, activityType } = options;
    
    let query = sql`
      SELECT ea.*, u.username
      FROM event_activities ea
      LEFT JOIN users u ON ea.user_id = u.id
      WHERE ea.participation_id = ${participationId}
    `;
    
    if (activityType) {
      query = sql`${query} AND ea.activity_type = ${activityType}`;
    }
    
    query = sql`${query} ORDER BY ea.activity_date DESC LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await query;
    return result.map(row => new EventActivity(row));
  }

  static async findByEventId(eventId, options = {}) {
    const sql = getDB();
    const { limit = 100, offset = 0, activityType, userId } = options;
    
    let query = sql`
      SELECT ea.*, u.username
      FROM event_activities ea
      LEFT JOIN users u ON ea.user_id = u.id
      WHERE ea.event_id = ${eventId}
    `;
    
    if (activityType) {
      query = sql`${query} AND ea.activity_type = ${activityType}`;
    }
    
    if (userId) {
      query = sql`${query} AND ea.user_id = ${userId}`;
    }
    
    query = sql`${query} ORDER BY ea.activity_date DESC LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await query;
    return result.map(row => new EventActivity(row));
  }

  static async create(activityData) {
    const sql = getDB();
    
    const result = await sql`
      INSERT INTO event_activities (
        participation_id, event_id, user_id, activity_type,
        github_sha, commit_message, files_changed, lines_added,
        lines_deleted, score_earned, metadata, activity_date
      )
      VALUES (
        ${activityData.participationId}, 
        ${activityData.eventId}, 
        ${activityData.userId}, 
        ${activityData.activityType},
        ${activityData.githubSha},
        ${activityData.commitMessage},
        ${activityData.filesChanged || 0},
        ${activityData.linesAdded || 0},
        ${activityData.linesDeleted || 0},
        ${activityData.scoreEarned || 0},
        ${JSON.stringify(activityData.metadata || {})},
        ${activityData.activityDate || new Date()}
      )
      RETURNING *
    `;
    
    if (result.length === 0) return null;
    return new EventActivity(result[0]);
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing activity
      const result = await sql`
        UPDATE event_activities 
        SET 
          activity_type = ${this.activityType},
          github_sha = ${this.githubSha},
          commit_message = ${this.commitMessage},
          files_changed = ${this.filesChanged},
          lines_added = ${this.linesAdded},
          lines_deleted = ${this.linesDeleted},
          score_earned = ${this.scoreEarned},
          metadata = ${JSON.stringify(this.metadata)},
          activity_date = ${this.activityDate}
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new EventActivity(result[0]));
      }
    } else {
      // Create new activity
      const result = await sql`
        INSERT INTO event_activities (
          participation_id, event_id, user_id, activity_type,
          github_sha, commit_message, files_changed, lines_added,
          lines_deleted, score_earned, metadata, activity_date
        )
        VALUES (
          ${this.participationId}, ${this.eventId}, ${this.userId}, 
          ${this.activityType}, ${this.githubSha}, ${this.commitMessage},
          ${this.filesChanged}, ${this.linesAdded}, ${this.linesDeleted},
          ${this.scoreEarned}, ${JSON.stringify(this.metadata)}, 
          ${this.activityDate}
        )
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new EventActivity(result[0]));
      }
    }
    
    return this;
  }

  async delete() {
    const sql = getDB();
    
    await sql`
      DELETE FROM event_activities 
      WHERE id = ${this.id}
    `;
    
    return this;
  }

  // Calculate score based on activity type and data
  static calculateScore(activityType, data = {}) {
    const scoring = {
      fork_created: 5,
      branch_created: 3,
      commit: 2,
      pr_created: 10,
      pr_merged: 20,
      // Additional points based on lines changed
      per_line_added: 0.1,
      per_line_deleted: 0.05,
      per_file_changed: 0.5
    };

    let baseScore = scoring[activityType] || 0;
    let bonusScore = 0;

    // Add bonus points for code changes
    if (data.linesAdded) {
      bonusScore += Math.min(data.linesAdded * scoring.per_line_added, 20); // Max 20 points from lines added
    }
    
    if (data.linesDeleted) {
      bonusScore += Math.min(data.linesDeleted * scoring.per_line_deleted, 10); // Max 10 points from lines deleted
    }
    
    if (data.filesChanged) {
      bonusScore += Math.min(data.filesChanged * scoring.per_file_changed, 15); // Max 15 points from files changed
    }

    return Math.round(baseScore + bonusScore);
  }

  // Get activity statistics for an event
  static async getEventActivityStats(eventId) {
    const sql = getDB();
    
    const result = await sql`
      SELECT 
        activity_type,
        COUNT(*) as count,
        COALESCE(SUM(score_earned), 0) as total_score,
        COALESCE(SUM(lines_added), 0) as total_lines_added,
        COALESCE(SUM(lines_deleted), 0) as total_lines_deleted,
        COALESCE(SUM(files_changed), 0) as total_files_changed
      FROM event_activities 
      WHERE event_id = ${eventId}
      GROUP BY activity_type
      ORDER BY activity_type
    `;
    
    return result.reduce((stats, row) => {
      stats[row.activity_type] = {
        count: parseInt(row.count),
        totalScore: parseInt(row.total_score),
        totalLinesAdded: parseInt(row.total_lines_added),
        totalLinesDeleted: parseInt(row.total_lines_deleted),
        totalFilesChanged: parseInt(row.total_files_changed)
      };
      return stats;
    }, {});
  }

  // Get recent activities for an event (for activity feed)
  static async getRecentActivities(eventId, limit = 20) {
    const sql = getDB();
    
    const result = await sql`
      SELECT 
        ea.*,
        u.username,
        u.rank as user_rank
      FROM event_activities ea
      LEFT JOIN users u ON ea.user_id = u.id
      WHERE ea.event_id = ${eventId}
      ORDER BY ea.activity_date DESC
      LIMIT ${limit}
    `;
    
    return result.map(row => ({
      ...new EventActivity(row).toJSON(),
      username: row.username,
      userRank: row.user_rank
    }));
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.id,
      participationId: this.participationId,
      eventId: this.eventId,
      userId: this.userId,
      activityType: this.activityType,
      githubSha: this.githubSha,
      commitMessage: this.commitMessage,
      filesChanged: this.filesChanged,
      linesAdded: this.linesAdded,
      linesDeleted: this.linesDeleted,
      scoreEarned: this.scoreEarned,
      metadata: this.metadata,
      activityDate: this.activityDate,
      createdAt: this.createdAt
    };
  }
}

module.exports = EventActivity;