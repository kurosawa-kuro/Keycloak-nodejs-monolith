const { getUserProfile, createUserProfile } = require('./services/database');

/**
 * Current User Middleware
 * セッションからトークンを復元し、req.userに設定
 */
const currentUser = async (req, res, next) => {
  try {
    if (req.session && req.session['keycloak-token']) {
      const token = req.session['keycloak-token'];
      req.user = {
        sub: token.content.sub,
        email: token.content.email,
        name: token.content.name,
        preferred_username: token.content.preferred_username,
        roles: token.content.realm_access?.roles || []
      };
    }
    next();
  } catch (error) {
    console.error('Current user middleware error:', error);
    next();
  }
};

/**
 * Ensure Profile Middleware
 * Json.dbにユーザープロフィールが存在することを保証
 */
const ensureProfile = async (req, res, next) => {
  try {
    if (req.user && req.user.sub) {
      let profile = await getUserProfile(req.user.sub);
      
      if (!profile) {
        // Create new profile if doesn't exist
        profile = await createUserProfile({
          sub: req.user.sub,
          nickname: req.user.preferred_username || req.user.name || 'user',
          email: req.user.email,
          createdAt: new Date().toISOString()
        });
      }
      
      req.userProfile = profile;
    }
    next();
  } catch (error) {
    console.error('Ensure profile middleware error:', error);
    next();
  }
};

/**
 * Error Handler Middleware
 * 例外をJSON/EJS形式で整形
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Log error with PII masking
  const maskedError = {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  };

  // Determine response format
  const acceptsJson = req.accepts('json');
  const acceptsHtml = req.accepts('html');

  if (acceptsJson) {
    return res.status(err.status || 500).json({
      error: {
        message: err.message || 'Internal Server Error',
        status: err.status || 500
      }
    });
  }

  if (acceptsHtml) {
    return res.status(err.status || 500).render('error', {
      error: {
        message: err.message || 'Internal Server Error',
        status: err.status || 500
      },
      user: req.user
    });
  }

  // Default text response
  res.status(err.status || 500).send(err.message || 'Internal Server Error');
};

/**
 * Authentication Guard Middleware
 * 認証が必要なルートを保護
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    if (req.accepts('json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
};

/**
 * Role-based Authorization Middleware
 * 特定のロールが必要なルートを保護
 */
const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      if (req.accepts('json')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }

    if (!req.user.roles.includes(role)) {
      if (req.accepts('json')) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      return res.status(403).render('error', {
        error: { message: 'Insufficient permissions', status: 403 },
        user: req.user
      });
    }

    next();
  };
};

module.exports = {
  currentUser,
  ensureProfile,
  errorHandler,
  requireAuth,
  requireRole
}; 