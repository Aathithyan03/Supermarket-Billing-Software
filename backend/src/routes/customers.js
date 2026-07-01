const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg, 422);
  }
}

// GET /api/customers
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { search } = req.query;

    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM bills b WHERE b.customer_id = c.id) AS total_orders,
        (SELECT COALESCE(SUM(total_amount),0) FROM bills b WHERE b.customer_id = c.id) AS total_spent
      FROM customers c
    `;

    const params = [];

    if (search) {
      sql += ` WHERE c.name LIKE ? OR c.phone LIKE ?`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY c.created_at DESC`;

    const [customers] = await db.query(sql, params);

    res.json({ customers });
  })
);

// GET /api/customers/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      'SELECT * FROM customers WHERE id=?',
      [req.params.id]
    );

    if (rows.length === 0) {
      throw new AppError('Customer not found.', 404);
    }

    res.json({
      customer: rows[0],
    });
  })
);

// GET /api/customers/:id/history
router.get(
  '/:id/history',
  authenticate,
  asyncHandler(async (req, res) => {

    const [customers] = await db.query(
      'SELECT * FROM customers WHERE id=?',
      [req.params.id]
    );

    if (customers.length === 0) {
      throw new AppError('Customer not found.', 404);
    }

    const customer = customers[0];

    const [bills] = await db.query(
      `SELECT
        id,
        bill_number,
        total_amount,
        payment_method,
        created_at
      FROM bills
      WHERE customer_id=?
      ORDER BY created_at DESC`,
      [req.params.id]
    );

    res.json({
      customer,
      bills,
    });

  })
);

// POST /api/customers
router.post(
  '/',
  authenticate,
  [
    body('name').trim().notEmpty().withMessage('Customer name is required.'),
    body('phone').optional({ checkFalsy: true }).trim(),
    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .withMessage('Invalid email address.'),
  ],
  asyncHandler(async (req, res) => {

    validate(req);

    const {
      name,
      phone,
      email,
      address,
    } = req.body;

    const [result] = await db.query(
      `INSERT INTO customers
      (name,phone,email,address)
      VALUES(?,?,?,?)`,
      [
        name,
        phone || null,
        email || null,
        address || null,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Customer added successfully.',
    });

  })
);

// PUT /api/customers/:id
router.put(
  '/:id',
  authenticate,
  [
    body('name').trim().notEmpty().withMessage('Customer name is required.'),
  ],
  asyncHandler(async (req, res) => {

    validate(req);

    const [rows] = await db.query(
      'SELECT id FROM customers WHERE id=?',
      [req.params.id]
    );

    if (rows.length === 0) {
      throw new AppError('Customer not found.', 404);
    }

    const {
      name,
      phone,
      email,
      address,
    } = req.body;

    await db.query(
      `UPDATE customers
      SET
      name=?,
      phone=?,
      email=?,
      address=?
      WHERE id=?`,
      [
        name,
        phone || null,
        email || null,
        address || null,
        req.params.id,
      ]
    );

    res.json({
      message: 'Customer updated successfully.',
    });

  })
);

// DELETE /api/customers/:id
router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {

    const [rows] = await db.query(
      'SELECT id FROM customers WHERE id=?',
      [req.params.id]
    );

    if (rows.length === 0) {
      throw new AppError('Customer not found.', 404);
    }

    await db.query(
      'DELETE FROM customers WHERE id=?',
      [req.params.id]
    );

    res.json({
      message: 'Customer removed.',
    });

  })
);

module.exports = router;
