const { getDB } = require('../config/db');

class User {
  constructor(data) {
    this.id = data.id;
    this.githubId = data.github_id || data.githubId;
    this.username = data.username;
    this.bio = data.bio || '';
    this.walletAddress = data.wallet_address || data.walletAddress || '';
    this.accessToken = data.access_token || data.accessToken || '';
    this.rank = data.rank || 'Code Novice';
    this.totalScore = data.total_score || data.totalScore || 0;
    this.lastRankUpdate = data.last_rank_update || data.lastRankUpdate || null;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static async findOne(criteria) {
    const sql = getDB();
    let result;

    if (criteria.githubId) {
      result = await sql`
        SELECT * FROM users 
        WHERE github_id = ${criteria.githubId}
        LIMIT 1
      `;
    } else if (criteria.id) {
      result = await sql`
        SELECT * FROM users 
        WHERE id = ${criteria.id}
        LIMIT 1
      `;
    } else {
      throw new Error('Invalid criteria for findOne');
    }

    if (result.length === 0) return null;
    return new User(result[0]);
  }

  static async findById(id) {
    const sql = getDB();
    const result = await sql`
      SELECT * FROM users 
      WHERE id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new User(result[0]);
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    const sql = getDB();
    
    if (Object.keys(updateData).length === 0) {
      return await User.findById(id);
    }

    // Build update query dynamically
    let result;
    
    if (updateData.walletAddress !== undefined && updateData.rank !== undefined && updateData.totalScore !== undefined && updateData.lastRankUpdate !== undefined) {
      result = await sql`
        UPDATE users 
        SET wallet_address = ${updateData.walletAddress}, rank = ${updateData.rank}, total_score = ${updateData.totalScore}, last_rank_update = ${updateData.lastRankUpdate}
        WHERE id = ${id}
        RETURNING *
      `;
    } else if (updateData.rank !== undefined && updateData.totalScore !== undefined && updateData.lastRankUpdate !== undefined) {
      result = await sql`
        UPDATE users 
        SET rank = ${updateData.rank}, total_score = ${updateData.totalScore}, last_rank_update = ${updateData.lastRankUpdate}
        WHERE id = ${id}
        RETURNING *
      `;
    } else if (updateData.walletAddress !== undefined) {
      result = await sql`
        UPDATE users 
        SET wallet_address = ${updateData.walletAddress}
        WHERE id = ${id}
        RETURNING *
      `;
    } else if (updateData.rank !== undefined) {
      result = await sql`
        UPDATE users 
        SET rank = ${updateData.rank}
        WHERE id = ${id}
        RETURNING *
      `;
    } else if (updateData.totalScore !== undefined) {
      result = await sql`
        UPDATE users 
        SET total_score = ${updateData.totalScore}
        WHERE id = ${id}
        RETURNING *
      `;
    } else if (updateData.lastRankUpdate !== undefined) {
      result = await sql`
        UPDATE users 
        SET last_rank_update = ${updateData.lastRankUpdate}
        WHERE id = ${id}
        RETURNING *
      `;
    } else {
      return await User.findById(id);
    }

    if (result.length === 0) return null;
    return new User(result[0]);
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing user
      const result = await sql`
        UPDATE users 
        SET 
          username = ${this.username},
          bio = ${this.bio},
          wallet_address = ${this.walletAddress},
          access_token = ${this.accessToken}
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new User(result[0]));
      }
    } else {
      // Create new user
      const result = await sql`
        INSERT INTO users (github_id, username, bio, wallet_address, access_token)
        VALUES (${this.githubId}, ${this.username}, ${this.bio}, ${this.walletAddress}, ${this.accessToken})
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new User(result[0]));
      }
    }
    
    return this;
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.id,
      githubId: this.githubId,
      username: this.username,
      bio: this.bio,
      walletAddress: this.walletAddress,
      rank: this.rank,
      totalScore: this.totalScore,
      lastRankUpdate: this.lastRankUpdate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = User;