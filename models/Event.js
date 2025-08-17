const { getDB } = require('../config/db');

class Event {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.githubRepo = data.github_repo || data.githubRepo;
    this.visibleRanks = data.visible_ranks || data.visibleRanks || [];
    this.endDate = data.end_date || data.endDate;
    this.createdBy = data.created_by || data.createdBy;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
    this.active = data.active !== undefined ? data.active : true;
  }

  static async findById(id) {
    const sql = getDB();
    const result = await sql`
      SELECT * FROM events 
      WHERE id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new Event(result[0]);
  }

  static async findAll(options = {}) {
    const sql = getDB();
    const { activeOnly = true, limit = 50, offset = 0 } = options;
    
    let query = sql`
      SELECT e.*, a.name as creator_name
      FROM events e
      LEFT JOIN admins a ON e.created_by = a.id
    `;
    
    if (activeOnly) {
      query = sql`
        SELECT e.*, a.name as creator_name
        FROM events e
        LEFT JOIN admins a ON e.created_by = a.id
        WHERE e.active = true
      `;
    }
    
    const result = await sql`
      ${query}
      ORDER BY e.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    return result.map(row => new Event(row));
  }

  static async findByUserRank(userRank, options = {}) {
    const sql = getDB();
    const { activeOnly = true, includeExpired = false } = options;
    
    // Build the query with proper parameterization
    let query = sql`
      SELECT e.*, a.name as creator_name
      FROM events e
      LEFT JOIN admins a ON e.created_by = a.id
      WHERE ${userRank} = ANY(e.visible_ranks)
    `;
    
    if (activeOnly) {
      query = sql`${query} AND e.active = true`;
    }
    
    if (!includeExpired) {
      query = sql`${query} AND e.end_date > NOW()`;
    }
    
    query = sql`${query} ORDER BY e.end_date ASC`;
    
    const result = await query;
    
    return result.map(row => new Event(row));
  }

  static async create(eventData) {
    const sql = getDB();
    
    const result = await sql`
      INSERT INTO events (title, description, github_repo, visible_ranks, end_date, created_by)
      VALUES (
        ${eventData.title}, 
        ${eventData.description}, 
        ${eventData.githubRepo}, 
        ${eventData.visibleRanks}, 
        ${eventData.endDate}, 
        ${eventData.createdBy}
      )
      RETURNING *
    `;
    
    if (result.length === 0) return null;
    return new Event(result[0]);
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing event
      const result = await sql`
        UPDATE events 
        SET 
          title = ${this.title},
          description = ${this.description},
          github_repo = ${this.githubRepo},
          visible_ranks = ${this.visibleRanks},
          end_date = ${this.endDate},
          active = ${this.active},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Event(result[0]));
      }
    } else {
      // Create new event
      const result = await sql`
        INSERT INTO events (title, description, github_repo, visible_ranks, end_date, created_by)
        VALUES (${this.title}, ${this.description}, ${this.githubRepo}, ${this.visibleRanks}, ${this.endDate}, ${this.createdBy})
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Event(result[0]));
      }
    }
    
    return this;
  }

  async delete() {
    const sql = getDB();
    
    // Soft delete by setting active to false
    await sql`
      UPDATE events 
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${this.id}
    `;
    
    this.active = false;
    return this;
  }

  // Check if event is visible to a specific user rank
  isVisibleToRank(userRank) {
    return this.visibleRanks.includes(userRank);
  }

  // Check if event is expired
  isExpired() {
    return new Date(this.endDate) < new Date();
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      githubRepo: this.githubRepo,
      visibleRanks: this.visibleRanks,
      endDate: this.endDate,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      active: this.active,
      isExpired: this.isExpired()
    };
  }
}

module.exports = Event;