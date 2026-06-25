const express = require('express');
const { all } = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/inventory/movements  ?product_id=&type=&page=&limit=
router.get('/movements', authenticate, (req, res) => {
  const { product_id, type, page = 1, limit = 50 } = req.query;
  const clauses = [];
  const params = [];

  if (product_id) { clauses.push('sm.product_id = ?'); params.push(product_id); }
  if (type) { clauses.push('sm.type = ?'); params.push(type); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(limit);

  const movements = all(
    `SELECT sm.*, p.name as product_name, p.unit, u.full_name as user_name
     FROM stock_movements sm
     LEFT JOIN products p ON p.id = sm.product_id
     LEFT JOIN users u ON u.id = sm.user_id
     ${where}
     ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  res.json({ movements });
});

// GET /api/inventory/alerts  — low stock notifications
router.get('/alerts', authenticate, (req, res) => {
  const products = all(
    `SELECT id, name, quantity, low_stock_threshold, unit
     FROM products
     WHERE is_active = 1 AND quantity <= low_stock_threshold
     ORDER BY quantity ASC`
  );
  res.json({ alerts: products, count: products.length });
});

module.exports = router;
