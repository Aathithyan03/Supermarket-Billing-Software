const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { run, get, all } = require('../database/db');
const { signToken } = require('../utils/jwt');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg, 422);
  }
}

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  asyncHandler(async (req, res) => {
    validate(req);
    const { username, password } = req.body;

    const user = get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !user.is_active) {
      throw new AppError('Invalid username or password.', 401);
    }

    const matches = bcrypt.compareSync(password, user.password_hash);
    if (!matches) {
      throw new AppError('Invalid username or password.', 401);
    }

    run('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?', [user.id]);

    const token = signToken({ id: user.id, role: user.role });
    res.json({
      token,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
    });
  })
);

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters.'),
  ],
  asyncHandler(async (req, res) => {
    validate(req);
    const { currentPassword, newPassword } = req.body;
    const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      throw new AppError('Current password is incorrect.', 401);
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully.' });
  })
);

// ---- Admin-only staff management ----

// GET /api/auth/users  (admin: list all staff/admin accounts)
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const users = all('SELECT id, username, full_name, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC');
  res.json({ users });
});

// POST /api/auth/users  (admin: create staff account)
router.post(
  '/users',
  authenticate,
  requireRole('admin'),
  [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('role').isIn(['admin', 'staff']).withMessage('Role must be admin or staff.'),
  ],
  asyncHandler(async (req, res) => {
    validate(req);
    const { username, password, full_name, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    const result = run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, full_name, role]
    );
    res.status(201).json({ id: result.lastInsertRowid, message: 'User account created.' });
  })
);

// PATCH /api/auth/users/:id  (admin: activate/deactivate or change role)
router.patch(
  '/users/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { is_active, role, full_name } = req.body;

    if (Number(id) === req.user.id && is_active === 0) {
      throw new AppError('You cannot deactivate your own account.', 400);
    }

    const existing = get('SELECT id FROM users WHERE id = ?', [id]);
    if (!existing) throw new AppError('User not found.', 404);

    const fields = [];
    const params = [];
    if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (role !== undefined) { fields.push('role = ?'); params.push(role); }
    if (full_name !== undefined) { fields.push('full_name = ?'); params.push(full_name); }

    if (fields.length === 0) throw new AppError('No fields to update.', 400);

    params.push(id);
    run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'User updated.' });
  })
);

module.exports = router;
