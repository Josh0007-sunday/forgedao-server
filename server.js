require('dotenv').config();
const express = require('express');
const session = require('express-session');
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
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  console.log('Session ID:', req.sessionID);
  console.log('User:', req.user ? req.user.username : 'No user');
  next();
});
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
