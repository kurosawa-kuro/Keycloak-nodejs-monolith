const express = require('express');
const Keycloak = require('keycloak-connect');
const { requireAuth, requireRole } = require('./middleware');
const { getUserProfile, updateUserProfile, getAllProfiles, getDatabaseStats } = require('./services/database');

const router = express.Router();

// Keycloak instance (will be initialized in app.js)
let keycloak;

// Initialize keycloak instance
const initKeycloak = (keycloakInstance) => {
  keycloak = keycloakInstance;
};

/**
 * Public Routes
 */

// GET / - Home page
router.get('/', (req, res) => {
  res.redirect('/public');
});

// GET /public - Public page
router.get('/public', (req, res) => {
  res.render('public', {
    title: 'Public Page',
    user: req.user,
    userProfile: req.userProfile
  });
});

// GET /register - Self-registration redirect
router.get('/register', (req, res) => {
  const realm = process.env.KEYCLOAK_REALM || 'demo';
  const authServerUrl = process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080';
  const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/callback`);
  
  const registrationUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/registrations?client_id=${process.env.KEYCLOAK_CLIENT_ID}&response_type=code&scope=openid%20profile%20email&redirect_uri=${redirectUri}`;
  
  res.redirect(registrationUrl);
});

/**
 * Authentication Routes
 */

// GET /login - Login redirect
router.get('/login', (req, res) => {
  if (req.user) {
    return res.redirect('/protected');
  }
  
  // Use Keycloak's login method
  if (keycloak) {
    return keycloak.protect()(req, res, () => {
      res.redirect('/protected');
    });
  }
  
  // Fallback to manual redirect
  const realm = process.env.KEYCLOAK_REALM || 'demo';
  const authServerUrl = process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080';
  const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/auth/callback`);
  
  const loginUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/auth?client_id=${process.env.KEYCLOAK_CLIENT_ID}&response_type=code&scope=openid%20profile%20email&redirect_uri=${redirectUri}`;
  
  res.redirect(loginUrl);
});

// GET /auth/callback - OAuth callback
router.get('/auth/callback', (req, res) => {
  // Keycloak middleware handles the callback automatically
  // This route is mainly for logging and potential custom handling
  console.log('Auth callback received');
  
  if (req.user) {
    console.log(`User authenticated: ${req.user.sub}`);
    res.redirect('/protected');
  } else {
    console.log('Authentication failed');
    res.redirect('/login');
  }
});

// GET /logout - Logout
router.get('/logout', (req, res) => {
  if (keycloak) {
    return keycloak.logout(req, res, () => {
      res.redirect('/public');
    });
  }
  
  // Manual logout
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    
    res.clearCookie('connect.sid');
    
    const realm = process.env.KEYCLOAK_REALM || 'demo';
    const authServerUrl = process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080';
    const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/public`);
    
    const logoutUrl = `${authServerUrl}/realms/${realm}/protocol/openid-connect/logout?client_id=${process.env.KEYCLOAK_CLIENT_ID}&post_logout_redirect_uri=${redirectUri}`;
    
    res.redirect(logoutUrl);
  });
});

/**
 * Protected Routes
 */

// GET /protected - Protected page
router.get('/protected', requireAuth, (req, res) => {
  res.render('protected', {
    title: 'Protected Page',
    user: req.user,
    userProfile: req.userProfile
  });
});

// GET /me - User profile API
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.sub);
    
    const userData = {
      sub: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      preferred_username: req.user.preferred_username,
      roles: req.user.roles,
      profile: profile || null
    };
    
    res.json(userData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// PUT /me - Update user profile
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { nickname } = req.body;
    
    if (!nickname || typeof nickname !== 'string') {
      return res.status(400).json({ error: 'Nickname is required and must be a string' });
    }
    
    const updatedProfile = await updateUserProfile(req.user.sub, { nickname });
    
    res.json({
      message: 'Profile updated successfully',
      profile: updatedProfile
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update user profile' });
  }
});

/**
 * Admin Routes
 */

// GET /admin - Admin page (requires admin role)
router.get('/admin', requireAuth, requireRole('admin'), (req, res) => {
  res.render('admin', {
    title: 'Admin Page',
    user: req.user,
    userProfile: req.userProfile
  });
});

/**
 * API Routes
 */

// GET /api/health - Health check
router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GET /api/user - User info API
router.get('/api/user', requireAuth, (req, res) => {
  res.json({
    authenticated: true,
    user: {
      sub: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      roles: req.user.roles
    },
    profile: req.userProfile
  });
});

/**
 * Admin API Routes
 */

// GET /api/admin/stats - Database statistics (admin only)
router.get('/api/admin/stats', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// GET /api/admin/users - All user profiles (admin only)
router.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const profiles = await getAllProfiles();
    res.json({
      total: profiles.length,
      profiles: profiles
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch user profiles' });
  }
});

module.exports = router;
module.exports.initKeycloak = initKeycloak; 