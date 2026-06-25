const express = require('express');
const { run, all } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/settings  — returns all settings as a flat object
router.get('/', authenticate, (req, res) => {
  const rows = all('SELECT key, value FROM settings');
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ settings });
});

// PUT /api/settings  — admin only, upserts any provided keys
router.put('/', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const updates = req.body; // { store_name: '...', default_tax_percent: '5', ... }
  for (const [key, value] of Object.entries(updates)) {
    run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, String(value)]
    );
  }
  res.json({ message: 'Settings updated successfully.' });
}));

module.exports = router;
