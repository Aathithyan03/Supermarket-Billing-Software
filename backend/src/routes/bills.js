const express = require('express');
const { body, validationResult } = require('express-validator');
const { run, get, all, transaction } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array()[0].msg, 422);
}

function getSetting(key, fallback) {
  const row = get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

function generateBillNumber() {
  const prefix = getSetting('invoice_prefix', 'INV');
  const today = new Date();
  const datePart = today.toISOString().slice(0, 10).replace(/-/g, '');
  const countRow = get(
    `SELECT COUNT(*) as c FROM bills WHERE date(created_at) = date('now')`
  );
  const seq = String((countRow?.c || 0) + 1).padStart(4, '0');
  return `${prefix}-${datePart}-${seq}`;
}

// POST /api/bills  — create a new bill (the core POS checkout action)
router.post(
  '/',
  authenticate,
  [
    body('items').isArray({ min: 1 }).withMessage('Cart must contain at least one item.'),
    body('items.*.product_id').isInt().withMessage('Each item must reference a product.'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Each item quantity must be a positive integer.'),
    body('discount_percent').optional().isFloat({ min: 0, max: 100 }),
    body('payment_method').optional().isIn(['cash', 'card', 'upi', 'other']),
  ],
  asyncHandler(async (req, res) => {
    validate(req);
    const { items, customer_id, discount_percent = 0, payment_method = 'cash' } = req.body;

    const result = transaction(() => {
      let subtotal = 0;
      let taxAmount = 0;
      const lineItems = [];

      // Lock-step validate stock & compute totals using live product data (never trust client prices)
      for (const item of items) {
        const product = get('SELECT * FROM products WHERE id = ? AND is_active = 1', [item.product_id]);
        if (!product) {
          throw new AppError(`Product with id ${item.product_id} was not found.`, 404);
        }
        if (product.quantity < item.quantity) {
          throw new AppError(`Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}.`, 400);
        }

        const lineSubtotal = Math.round(product.price * item.quantity * 100) / 100;
        const lineTax = Math.round(lineSubtotal * (product.tax_percent / 100) * 100) / 100;

        subtotal += lineSubtotal;
        taxAmount += lineTax;

        lineItems.push({
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          cost_price: product.cost_price,
          quantity: item.quantity,
          tax_percent: product.tax_percent,
          line_total: lineSubtotal + lineTax,
        });
      }

      const round2 = (n) => Math.round(n * 100) / 100;

      subtotal = round2(subtotal);
      taxAmount = round2(taxAmount);
      const discountAmount = round2((subtotal + taxAmount) * (Number(discount_percent) / 100));
      const totalAmount = round2(subtotal + taxAmount - discountAmount);
      const billNumber = generateBillNumber();

      const billResult = run(
        `INSERT INTO bills (bill_number, customer_id, cashier_id, subtotal, discount_percent, discount_amount, tax_amount, total_amount, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [billNumber, customer_id || null, req.user.id, subtotal, discount_percent, discountAmount, taxAmount, totalAmount, payment_method]
      );
      const billId = billResult.lastInsertRowid;

      for (const li of lineItems) {
        run(
          `INSERT INTO bill_items (bill_id, product_id, product_name, unit_price, cost_price, quantity, tax_percent, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [billId, li.product_id, li.product_name, li.unit_price, li.cost_price, li.quantity, li.tax_percent, li.line_total]
        );

        // Auto stock deduction
        run(`UPDATE products SET quantity = quantity - ? WHERE id = ?`, [li.quantity, li.product_id]);
        run(
          `INSERT INTO stock_movements (product_id, type, quantity, reason, reference_bill_id, user_id)
           VALUES (?, 'sale', ?, 'Sold via bill ' || ?, ?, ?)`,
          [li.product_id, li.quantity, billNumber, billId, req.user.id]
        );
      }

      // Loyalty: 1 point per 100 currency spent
      if (customer_id) {
        const points = Math.floor(totalAmount / 100);
        if (points > 0) {
          run('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?', [points, customer_id]);
        }
      }

      return { billId, billNumber, subtotal, taxAmount, discountAmount, totalAmount, lineItems };
    });

    res.status(201).json({
      message: 'Bill generated successfully.',
      bill_id: result.billId,
      bill_number: result.billNumber,
      subtotal: result.subtotal,
      tax_amount: result.taxAmount,
      discount_amount: result.discountAmount,
      total_amount: result.totalAmount,
    });
  })
);

// GET /api/bills  ?from=&to=&customer_id=&page=&limit=
router.get('/', authenticate, (req, res) => {
  const { from, to, customer_id, page = 1, limit = 20 } = req.query;
  const clauses = [];
  const params = [];

  if (from) { clauses.push("date(b.created_at) >= date(?)"); params.push(from); }
  if (to) { clauses.push("date(b.created_at) <= date(?)"); params.push(to); }
  if (customer_id) { clauses.push('b.customer_id = ?'); params.push(customer_id); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (Number(page) - 1) * Number(limit);

  const totalRow = get(`SELECT COUNT(*) as c FROM bills b ${where}`, params);
  const bills = all(
    `SELECT b.*, c.name as customer_name, u.full_name as cashier_name
     FROM bills b
     LEFT JOIN customers c ON c.id = b.customer_id
     LEFT JOIN users u ON u.id = b.cashier_id
     ${where}
     ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  res.json({ bills, total: totalRow.c, page: Number(page), limit: Number(limit) });
});

// GET /api/bills/recent  (for dashboard)
router.get('/recent', authenticate, (req, res) => {
  const bills = all(
    `SELECT b.id, b.bill_number, b.total_amount, b.payment_method, b.created_at, c.name as customer_name
     FROM bills b LEFT JOIN customers c ON c.id = b.customer_id
     ORDER BY b.created_at DESC LIMIT 10`
  );
  res.json({ bills });
});

// GET /api/bills/:id  (full invoice detail for viewing/printing)
router.get('/:id', authenticate, (req, res) => {
  const bill = get(
    `SELECT b.*, c.name as customer_name, c.phone as customer_phone, u.full_name as cashier_name
     FROM bills b
     LEFT JOIN customers c ON c.id = b.customer_id
     LEFT JOIN users u ON u.id = b.cashier_id
     WHERE b.id = ?`,
    [req.params.id]
  );
  if (!bill) throw new AppError('Bill not found.', 404);

  const items = all('SELECT * FROM bill_items WHERE bill_id = ?', [req.params.id]);
  res.json({ bill, items });
});

module.exports = router;
