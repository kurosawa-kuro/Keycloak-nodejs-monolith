const express = require('express');
const session = require('express-session');
const Keycloak = require('keycloak-connect');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import custom modules
const { currentUser, ensureProfile, errorHandler } = require('./middleware');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Global middleware layer
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
  }));
} else {
  // Development: Disable CSP for easier debugging
  app.use(helmet({
    contentSecurityPolicy: false
  }));
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Rate limiting for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Keycloak configuration
const keycloakConfig = {
  "realm": process.env.KEYCLOAK_REALM || "demo",
  "auth-server-url": process.env.KEYCLOAK_AUTH_SERVER_URL || "http://localhost:8080",
  "ssl-required": "none",
  "resource": process.env.KEYCLOAK_CLIENT_ID || "express-monolith",
  "public-client": process.env.KEYCLOAK_PUBLIC_CLIENT === 'true',
  "confidential-port": 0
};

// Session store configuration
let store;
if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
  const RedisStore = require('connect-redis').default;
  const redis = require('redis');
  const redisClient = redis.createClient({ url: process.env.REDIS_URL });
  redisClient.connect().catch(console.error);
  store = new RedisStore({ client: redisClient });
} else {
  const MemoryStore = session.MemoryStore;
  store = new MemoryStore();
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  store: store,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: process.env.COOKIE_HTTPONLY === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Keycloak middleware
const keycloak = new Keycloak({ store }, keycloakConfig);
app.use(keycloak.middleware({
  logout: '/logout',
  admin: '/'
}));

// Initialize keycloak in routes
routes.initKeycloak(keycloak);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Application middleware
app.use(currentUser);
app.use(ensureProfile);

// Routes
app.use('/', routes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📖 Public page: http://localhost:${PORT}/public`);
  console.log(`🔐 Protected page: http://localhost:${PORT}/protected`);
  console.log(`👤 Login: http://localhost:${PORT}/login`);
});

module.exports = app; 