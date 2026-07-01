const express = require('express');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/settings
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {

    const [rows] = await db.query(
      'SELECT `key`, `value` FROM settings'
    );

    const settings = {};

    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json({
      settings,
    });

  })
);

// PUT /api/settings
router.put(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {

    const updates = req.body;

    for (const [key, value] of Object.entries(updates)) {

      await db.query(
        `INSERT INTO settings (\`key\`, \`value\`)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
         value = VALUES(value)`,
        [
          key,
          String(value),
        ]
      );

    }

    res.json({
      message: 'Settings updated successfully.',
    });

  })
);

module.exports = router;
