const { getDB } = require('../config/db');
const bcrypt = require('bcrypt');

class Admin {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.status = data.status || 'admin'; // 'admin' or 'product'
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  static async findByEmail(email) {
    const sql = getDB();
    const result = await sql`
      SELECT * FROM admins 
      WHERE email = ${email}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new Admin(result[0]);
  }

  static async findById(id) {
    const sql = getDB();
    const result = await sql`
      SELECT * FROM admins 
      WHERE id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) return null;
    return new Admin(result[0]);
  }

  static async create(adminData) {
    const sql = getDB();
    
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(adminData.password, 12);
    
    const result = await sql`
      INSERT INTO admins (name, email, password, status)
      VALUES (${adminData.name}, ${adminData.email}, ${hashedPassword}, ${adminData.status || 'admin'})
      RETURNING *
    `;
    
    if (result.length === 0) return null;
    return new Admin(result[0]);
  }

  static async findAll() {
    const sql = getDB();
    const result = await sql`
      SELECT id, name, email, status, created_at, updated_at 
      FROM admins 
      ORDER BY created_at DESC
    `;
    
    return result.map(row => {
      const admin = new Admin(row);
      // Don't include password in the returned data
      delete admin.password;
      return admin;
    });
  }

  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  async save() {
    const sql = getDB();
    
    if (this.id) {
      // Update existing admin
      const result = await sql`
        UPDATE admins 
        SET 
          name = ${this.name},
          email = ${this.email},
          status = ${this.status},
          updated_at = NOW()
        WHERE id = ${this.id}
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Admin(result[0]));
      }
    } else {
      // Create new admin
      const hashedPassword = await bcrypt.hash(this.password, 12);
      const result = await sql`
        INSERT INTO admins (name, email, password, status)
        VALUES (${this.name}, ${this.email}, ${hashedPassword}, ${this.status || 'admin'})
        RETURNING *
      `;
      
      if (result.length > 0) {
        Object.assign(this, new Admin(result[0]));
      }
    }
    
    return this;
  }

  async updatePassword(newPassword) {
    const sql = getDB();
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const result = await sql`
      UPDATE admins 
      SET password = ${hashedPassword}, updated_at = NOW()
      WHERE id = ${this.id}
      RETURNING *
    `;
    
    if (result.length > 0) {
      Object.assign(this, new Admin(result[0]));
    }
    
    return this;
  }

  // Convert to JSON for API responses (exclude password)
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Admin;