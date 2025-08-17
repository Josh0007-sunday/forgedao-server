-- Add ranking columns to users table
-- Run this migration to add the new ranking fields

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rank VARCHAR(50) DEFAULT 'Code Novice',
ADD COLUMN IF NOT EXISTS total_score DECIMAL(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS last_rank_update TIMESTAMP DEFAULT NULL;

-- Create index for faster ranking queries
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_rank ON users(rank);

-- Update existing users to have default rank
UPDATE users 
SET rank = 'Code Novice', total_score = 0.00 
WHERE rank IS NULL OR rank = '';