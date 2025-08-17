-- Create event participation table
CREATE TABLE IF NOT EXISTS event_participations (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    github_fork_url VARCHAR(255),
    branch_name VARCHAR(100),
    participation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    total_commits INTEGER DEFAULT 0,
    total_prs INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    last_activity_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

-- Create event activities table for detailed activity tracking
CREATE TABLE IF NOT EXISTS event_activities (
    id SERIAL PRIMARY KEY,
    participation_id INTEGER NOT NULL REFERENCES event_participations(id) ON DELETE CASCADE,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'commit', 'pr_created', 'pr_merged', 'fork_created', 'branch_created'
    github_sha VARCHAR(50), -- commit SHA or PR number
    commit_message TEXT,
    files_changed INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_deleted INTEGER DEFAULT 0,
    score_earned INTEGER DEFAULT 0,
    metadata JSONB, -- Additional data like PR details, commit details
    activity_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_event_participations_event_id ON event_participations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participations_user_id ON event_participations(user_id);
CREATE INDEX IF NOT EXISTS idx_event_participations_score ON event_participations(score DESC);
CREATE INDEX IF NOT EXISTS idx_event_activities_participation_id ON event_activities(participation_id);
CREATE INDEX IF NOT EXISTS idx_event_activities_event_id ON event_activities(event_id);
CREATE INDEX IF NOT EXISTS idx_event_activities_user_id ON event_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_event_activities_activity_type ON event_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_event_activities_activity_date ON event_activities(activity_date);

-- Add trigger to update event_participations.updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_event_participations_updated_at 
    BEFORE UPDATE ON event_participations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();