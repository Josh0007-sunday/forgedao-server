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

// CORS Configuration - PRODUCTION COOKIE FIX
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://forge-dao.vercel.app',
      'https://forgedao-frontend.vercel.app'
    ];
    
    // Check if the origin is in the allowed list or is a subdomain of vercel.app
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (origin === allowedOrigin) return true;
      // Allow any subdomain of vercel.app
      if (origin.endsWith('.vercel.app') && origin.includes('forge')) return true;
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // CRITICAL: This must be true for cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept',
    'Origin',
    'Cookie' // Explicitly allow Cookie header
  ],
  exposedHeaders: ['set-cookie'], // Expose set-cookie header
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// Apply trust proxy for production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors(corsOptions));

// Handle preflight OPTIONS requests explicitly - EXPRESS 5 COMPATIBLE
app.options('/{*path}', cors(corsOptions));

app.use(express.json());

// Configure session with PostgreSQL store - PRODUCTION COOKIE FIX
app.use(session({
  store: new pgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions',
    createTableIfMissing: true,
    ttl: 24 * 60 * 60,
    errorLog: console.error
  }),
  secret: process.env.SESSION_SECRET || 'ForgeDaoSecret',
  resave: false,
  saveUninitialized: false,
  name: 'connect.sid', // Use default session name for better compatibility
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-site cookies
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    // Don't set domain - let browser handle it automatically
    domain: undefined
  },
  rolling: true, // Reset expiration on each request
  proxy: process.env.NODE_ENV === 'production' // Trust proxy in production
}));

app.use(passport.initialize());
app.use(passport.session());

// Debug middleware (remove in production)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Origin:', req.get('Origin'));
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
    
    // Test session store
    const sessionStoreOk = req.sessionStore ? true : false;
    
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      sessionStore: sessionStoreOk ? 'connected' : 'error',
      version: result[0].version,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      session: {
        id: req.sessionID,
        authenticated: req.isAuthenticated ? req.isAuthenticated() : false
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Session debug endpoint
app.get('/debug/session', (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    user: req.user,
    isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
    cookies: req.headers.cookie
  });
});

// Enhanced session middleware debugging
app.use((req, res, next) => {
  console.log('=== SESSION MIDDLEWARE ===');
  console.log('Session ID:', req.sessionID);
  console.log('Session data:', req.session);
  console.log('User:', req.user);
  console.log('==========================');
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err.stack);
  
  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      message: 'CORS policy violation',
      origin: req.get('Origin')
    });
  }
  
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler - EXPRESS 5 COMPATIBLE: Named wildcard
app.all('/{*path}', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    params: req.params // This will show the captured path
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`Session Secret: ${process.env.SESSION_SECRET ? 'Set' : 'Not Set'}`);
  console.log('Express 5 compatible wildcards enabled');
});

module.exports = app;