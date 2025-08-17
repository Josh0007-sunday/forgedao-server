const { neon } = require('@neondatabase/serverless');

let sql;

const connectDB = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    sql = neon(process.env.DATABASE_URL);
    
    // Test the connection
    const result = await sql`SELECT version()`;
    console.log('Neon PostgreSQL Connected:', result[0].version);
    
    // Initialize tables
    await initializeTables();
    
  } catch (error) {
    console.error('Database Connection Error:', error);
    process.exit(1);
  }
};

const initializeTables = async () => {
  try {
    console.log('Initializing database tables...');
    
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        github_id VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) NOT NULL,
        bio TEXT DEFAULT '',
        wallet_address VARCHAR(255) DEFAULT '',
        access_token TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✓ Users table created/verified');

    // Create proposals table
    await sql`
      CREATE TABLE IF NOT EXISTS proposals (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        repository_link VARCHAR(500),
        github_issue_link VARCHAR(500),
        branch_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✓ Proposals table created/verified');

    // Create updated_at trigger function
    try {
      await sql`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $ language 'plpgsql'
      `;
      console.log('✓ Update trigger function created');
    } catch (triggerError) {
      console.log('Note: Trigger function may already exist');
    }

    // Create trigger for users table
    try {
      await sql`DROP TRIGGER IF EXISTS update_users_updated_at ON users`;
      await sql`
        CREATE TRIGGER update_users_updated_at 
          BEFORE UPDATE ON users 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `;
      console.log('✓ Users trigger created');
    } catch (triggerError) {
      console.log('Note: Users trigger setup skipped');
    }

    // Create trigger for proposals table
    try {
      await sql`DROP TRIGGER IF EXISTS update_proposals_updated_at ON proposals`;
      await sql`
        CREATE TRIGGER update_proposals_updated_at 
          BEFORE UPDATE ON proposals 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
      `;
      console.log('✓ Proposals trigger created');
    } catch (triggerError) {
      console.log('Note: Proposals trigger setup skipped');
    }

    console.log('🎉 Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing tables:', error);
    throw error;
  }
};

const getDB = () => {
  if (!sql) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return sql;
};

module.exports = { connectDB, getDB };