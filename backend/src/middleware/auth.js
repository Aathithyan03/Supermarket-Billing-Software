const { verifyToken } = require('../utils/jwt');
const { get } = require('../database/db');

/**
 * Verifies the Bearer token, loads the (still-active) user, and attaches it
 * to req.user. Rejects with 401 if missing/invalid/expired/deactivated.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  try {
    const decoded = verifyToken(token);
    const user = get('SELECT id, username, full_name, role, is_active FROM users WHERE id = ?', [decoded.id]);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Account is no longer active. Contact your administrator.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

/**
 * Restricts a route to one or more roles. Use after `authenticate`.
 * Example: router.delete('/products/:id', authenticate, requireRole('admin'), handler)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
