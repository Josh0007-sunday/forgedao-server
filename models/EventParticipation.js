const { getDB } = require('../config/db');

class EventParticipation {
  constructor(data) {
    this.id = data.id;
    this.eventId = data.event_id || data.eventId;
    this.userId = data.user_id || data.userId;
    this.githubForkUrl = data.github_fork_url || data.githubForkUrl;
    this.branchName = data.branch_name || data.branchName;
    this.participationDate = data.participation_date || data.participationDate;
    this.isActive = data.is_active !== undefined ? data.is_active : data.isActive;
    this.totalCommits = data.total_commits || data.totalCommits || 0;
    this.totalPrs = data.total_prs || data.totalPrs || 0;
    this.linesAdded = data.lines_added || data.linesAdded || 0;
    this.linesDeleted = data.lines_deleted || data.linesDeleted || 0;
    this.score = data.score || 0;
    this.lastActivityDate = data.last_activity_date || data.lastActivityDate;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static async findById(id) {
    const sql = getDB();
    const result = await sql`
      SELECT ep.*, u.username, e.title as event_title
      FROM event_participations ep
      LEFT JOIN users u ON ep.user_id = u.id
      LEFT JOIN events e ON ep.event_id = e.id
      WHERE ep.id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new EventParticipation(result[0]);
  }

  static async findByEventAndUser(eventId, userId) {
    const sql = getDB();
    const result = await sql`
      SELECT ep.*, u.username, e.title as event_title
      FROM event_participations ep
      LEFT JOIN users u ON ep.user_id = u.id
      LEFT JOIN events e ON ep.event_id = e.id
      WHERE ep.event_id = ${eventId} AND ep.user_id = ${userId}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new EventParticipation(result[0]);
  }

  static async findByEventId(eventId, options = {}) {
    const sql = getDB();
    const { limit = 50, offset = 0, orderBy = 'score', orderDirection = 'DESC' } = options;
    
    const result = await sql`
      SELECT ep.*, u.username, u.rank as user_rank
      FROM event_participations ep
      LEFT JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = ${eventId} AND ep.is_active = true
      ORDER BY ${sql(orderBy)} ${sql.unsafe(orderDirection)}
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    return result.map(row => new EventParticipation(row));
  }

  static async findByUserId(userId, options = {}) {
    const sql = getDB();
    const { limit = 50, offset = 0, activeOnly = true } = options;
    
    let query = sql`
      SELECT ep.*, e.title as event_title, e.end_date, e.active as event_active
      FROM event_participations ep
      LEFT JOIN events e ON ep.event_id = e.id
      WHERE ep.user_id = ${userId}
    `;
    
    if (activeOnly) {
      query = sql`${query} AND ep.is_active = true AND e.active = true`;
    }
    
    query = sql`${query} ORDER BY ep.participation_date DESC LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await query;
    return result.map(row => new EventParticipation(row));
  }

  static async create(participationData) {
    const sql = getDB();
    
    const result = await sql`
      INSERT INTO event_participations (
        event_id, user_id, github_fork_url, branch_name, 
        participation_date, is_active
      )
      VALUES (
        ${participationData.eventId}, 
        ${participationData.userId}, 
        ${participationData.githubForkUrl}, 
        ${participationData.branchName},
        ${participationData.participationDate || new Date()},
        ${participationData.isActive !== undefined ? participationData.isActive : true}
      )
      RETURNING *
    `;
    
    if (result.length === 0) return null;
    return new EventParticipation(result[0]);
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing participation
      const result = await sql`
        UPDATE event_participations 
        SET 
          github_fork_url = ${this.githubForkUrl},
          branch_name = ${this.branchName},
          is_active = ${this.isActive},
          total_commits = ${this.totalCommits},
          total_prs = ${this.totalPrs},
          lines_added = ${this.linesAdded},
          lines_deleted = ${this.linesDeleted},
          score = ${this.score},
          last_activity_date = ${this.lastActivityDate},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new EventParticipation(result[0]));
      }
    } else {
      // Create new participation
      const result = await sql`
        INSERT INTO event_participations (
          event_id, user_id, github_fork_url, branch_name,
          is_active, total_commits, total_prs, lines_added,
          lines_deleted, score, last_activity_date
        )
        VALUES (
          ${this.eventId}, ${this.userId}, ${this.githubForkUrl}, 
          ${this.branchName}, ${this.isActive}, ${this.totalCommits},
          ${this.totalPrs}, ${this.linesAdded}, ${this.linesDeleted},
          ${this.score}, ${this.lastActivityDate}
        )
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new EventParticipation(result[0]));
      }
    }
    
    return this;
  }

  async delete() {
    const sql = getDB();
    
    // Soft delete by setting is_active to false
    await sql`
      UPDATE event_participations 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${this.id}
    `;
    
    this.isActive = false;
    return this;
  }

  // Get leaderboard for an event
  static async getEventLeaderboard(eventId, options = {}) {
    const sql = getDB();
    const { limit = 20 } = options;
    
    const result = await sql`
      SELECT 
        ep.*,
        u.username,
        u.rank as user_rank,
        ROW_NUMBER() OVER (ORDER BY ep.score DESC, ep.total_commits DESC, ep.participation_date ASC) as position
      FROM event_participations ep
      LEFT JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = ${eventId} AND ep.is_active = true
      ORDER BY ep.score DESC, ep.total_commits DESC, ep.participation_date ASC
      LIMIT ${limit}
    `;
    
    return result.map(row => ({
      ...new EventParticipation(row).toJSON(),
      position: parseInt(row.position),
      username: row.username,
      userRank: row.user_rank
    }));
  }

  // Update participation stats from activities
  async updateStatsFromActivities() {
    const sql = getDB();
    
    const stats = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE activity_type = 'commit') as total_commits,
        COUNT(*) FILTER (WHERE activity_type IN ('pr_created', 'pr_merged')) as total_prs,
        COALESCE(SUM(lines_added), 0) as lines_added,
        COALESCE(SUM(lines_deleted), 0) as lines_deleted,
        COALESCE(SUM(score_earned), 0) as score,
        MAX(activity_date) as last_activity_date
      FROM event_activities 
      WHERE participation_id = ${this.id}
    `;
    
    if (stats.length > 0) {
      const stat = stats[0];
      this.totalCommits = parseInt(stat.total_commits) || 0;
      this.totalPrs = parseInt(stat.total_prs) || 0;
      this.linesAdded = parseInt(stat.lines_added) || 0;
      this.linesDeleted = parseInt(stat.lines_deleted) || 0;
      this.score = parseInt(stat.score) || 0;
      this.lastActivityDate = stat.last_activity_date;
      
      await this.save();
    }
    
    return this;
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.id,
      eventId: this.eventId,
      userId: this.userId,
      githubForkUrl: this.githubForkUrl,
      branchName: this.branchName,
      participationDate: this.participationDate,
      isActive: this.isActive,
      totalCommits: this.totalCommits,
      totalPrs: this.totalPrs,
      linesAdded: this.linesAdded,
      linesDeleted: this.linesDeleted,
      score: this.score,
      lastActivityDate: this.lastActivityDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = EventParticipation;