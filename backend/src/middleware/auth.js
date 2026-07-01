const { verifyToken } = require('../utils/jwt');
const db = require('../database/db');

/**
 * Verifies the Bearer token, loads the user,
 * and attaches it to req.user.
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.'
    });
  }

  try {
    const decoded = verifyToken(token);

    const [rows] = await db.query(
      `SELECT
          id,
          username,
          full_name,
          role,
          is_active
       FROM users
       WHERE id = ?`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        error: 'Account is no longer active. Contact your administrator.'
      });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(401).json({
        error: 'Account is no longer active. Contact your administrator.'
      });
    }

    req.user = user;

    next();

  } catch (err) {
    return res.status(401).json({
      error: 'Session expired or invalid. Please log in again.'
    });
  }
}

/**
 * Restricts a route to one or more roles.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.'
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};