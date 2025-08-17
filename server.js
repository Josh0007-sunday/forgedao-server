require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const passport = require('passport');

// Database connection
const { connectDB } = require('./config/db');

// Passport configuration
require('./config/passport');

const app = express();

// Initialize database connection
connectDB();

// Middleware
app.use(cors());

app.use(express.json());

// Configure session with PostgreSQL store
app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Debug middleware (remove in production)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Session ID:', req.sessionID);
  console.log('User:', req.user ? req.user.username : 'No user');
  console.log('Is authenticated:', req.isAuthenticated && req.isAuthenticated());
  next();
});

// Routes
app.use('/auth', require('./routes/auth.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/proposals', require('./routes/proposal.routes'));
app.use('/api/ranking', require('./routes/ranking.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/events', require('./routes/events.routes'));

// Health check route
app.get('/health', async (req, res) => {
  try {
    const { getDB } = require('./config/db');
    const sql = getDB();
    const result = await sql`SELECT version()`;
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      version: result[0].version 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;