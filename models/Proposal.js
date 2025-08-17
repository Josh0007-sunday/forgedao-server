const { getDB } = require('../config/db');

class Proposal {
  constructor(data) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.repositoryLink = data.repository_link || data.repositoryLink;
    this.githubIssueLink = data.github_issue_link || data.githubIssueLink;
    this.branchName = data.branch_name || data.branchName;
    this.createdBy = data.created_by || data.createdBy;
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static async find(criteria = {}) {
    const sql = getDB();
    
    const result = await sql`
      SELECT 
        p.*,
        u.id as creator_id,
        u.username as creator_username,
        u.wallet_address as creator_wallet_address
      FROM proposals p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
    `;

    return result.map(row => {
      const proposal = new Proposal(row);
      // Handle the case where created_by might be null
      if (row.creator_id) {
        proposal.createdBy = {
          _id: row.creator_id,
          id: row.creator_id,
          username: row.creator_username || 'Unknown User',
          walletAddress: row.creator_wallet_address
        };
      } else {
        proposal.createdBy = {
          _id: null,
          id: null,
          username: 'Unknown User',
          walletAddress: null
        };
      }
      return proposal;
    });
  }

  static async findById(id) {
    const sql = getDB();
    
    const result = await sql`
      SELECT 
        p.*,
        u.id as creator_id,
        u.username as creator_username,
        u.wallet_address as creator_wallet_address
      FROM proposals p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ${id}
      LIMIT 1
    `;

    if (result.length === 0) return null;
    
    const proposal = new Proposal(result[0]);
    proposal.createdBy = {
      _id: result[0].creator_id,
      id: result[0].creator_id,
      username: result[0].creator_username,
      walletAddress: result[0].creator_wallet_address
    };
    
    return proposal;
  }

  static async populate(proposal, path, select) {
    // This method is for compatibility with mongoose-style populate
    if (path === 'createdBy' && proposal.createdBy) {
      const sql = getDB();
      const result = await sql`
        SELECT * FROM users WHERE id = ${proposal.createdBy}
      `;
      
      if (result.length > 0) {
        const user = result[0];
        proposal.createdBy = {
          _id: user.id,
          username: user.username,
          walletAddress: user.wallet_address
        };
      }
    }
    return proposal;
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing proposal
      const result = await sql`
        UPDATE proposals 
        SET 
          title = ${this.title},
          description = ${this.description},
          repository_link = ${this.repositoryLink},
          github_issue_link = ${this.githubIssueLink},
          branch_name = ${this.branchName}
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Proposal(result[0]));
      }
    } else {
      // Create new proposal
      const result = await sql`
        INSERT INTO proposals (
          title, 
          description, 
          repository_link, 
          github_issue_link, 
          created_by
        )
        VALUES (
          ${this.title}, 
          ${this.description}, 
          ${this.repositoryLink}, 
          ${this.githubIssueLink}, 
          ${this.createdBy}
        )
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Proposal(result[0]));
      }
    }
    
    return this;
  }

  static async countDocuments(criteria = {}) {
    const sql = getDB();
    
    if (criteria['createdBy.id']) {
      const result = await sql`
        SELECT COUNT(*) as count 
        FROM proposals 
        WHERE created_by = ${criteria['createdBy.id']}
      `;
      return parseInt(result[0].count);
    }
    
    const result = await sql`
      SELECT COUNT(*) as count FROM proposals
    `;
    return parseInt(result[0].count);
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      repositoryLink: this.repositoryLink,
      githubIssueLink: this.githubIssueLink,
      branchName: this.branchName,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Proposal;