const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

function validate(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new AppError(errors.array()[0].msg, 422);
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name as category_name,
    CASE WHEN p.quantity <= p.low_stock_threshold THEN 1 ELSE 0 END as is_low_stock
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

// GET /api/products  ?search=&category_id=&low_stock=1&page=&limit=
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      search,
      category_id,
      low_stock,
      barcode,
      page = 1,
      limit = 50,
      active_only,
    } = req.query;

    const clauses = [];
    const params = [];

    if (active_only !== 'false') {
      clauses.push('p.is_active = 1');
    }

    if (search) {
      clauses.push('(p.name LIKE ? OR p.barcode LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (barcode) {
      clauses.push('p.barcode = ?');
      params.push(barcode);
    }

    if (category_id) {
      clauses.push('p.category_id = ?');
      params.push(category_id);
    }

    if (low_stock === 'true') {
      clauses.push('p.quantity <= p.low_stock_threshold');
    }

    const where = clauses.length
      ? `WHERE ${clauses.join(' AND ')}`
      : '';

    const offset = (Number(page) - 1) * Number(limit);

    const [countRows] = await db.query(
      `SELECT COUNT(*) AS c FROM products p ${where}`,
      params
    );

    const [products] = await db.query(
      `${PRODUCT_SELECT}
      ${where}
      ORDER BY p.name ASC
      LIMIT ?
      OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      products,
      total: countRows[0].c,
      page: Number(page),
      limit: Number(limit),
    });
  })
);

// GET /api/products/low-stock
router.get(
  '/low-stock',
  authenticate,
  asyncHandler(async (req, res) => {

    const [products] = await db.query(
      `${PRODUCT_SELECT}
       WHERE p.is_active = 1
       AND p.quantity <= p.low_stock_threshold
       ORDER BY p.quantity ASC`
    );

    res.json({ products });

  })
);

// GET /api/products/:id
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {

    const [rows] = await db.query(
      `${PRODUCT_SELECT} WHERE p.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      throw new AppError('Product not found.', 404);
    }

    res.json({
      product: rows[0],
    });

  })
);

// POST /api/products
router.post(
  '/',
  authenticate,
  requireRole('admin', 'staff'),
  [
    body('name').trim().notEmpty().withMessage('Product name is required.'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
    body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer.'),
    body('barcode').optional({ checkFalsy: true }).trim(),
  ],
  asyncHandler(async (req, res) => {
    validate(req);

    const {
      name,
      category_id,
      barcode,
      price,
      cost_price = 0,
      tax_percent = 0,
      quantity = 0,
      unit = 'pcs',
      low_stock_threshold = 10,
    } = req.body;

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        `INSERT INTO products
        (name, category_id, barcode, price, cost_price,
         tax_percent, quantity, unit, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          category_id || null,
          barcode || null,
          price,
          cost_price,
          tax_percent,
          quantity,
          unit,
          low_stock_threshold,
        ]
      );

      if (Number(quantity) > 0) {
        await connection.query(
          `INSERT INTO stock_movements
          (product_id, type, quantity, reason, user_id)
          VALUES (?, 'in', ?, 'Initial stock', ?)`,
          [
            result.insertId,
            quantity,
            req.user.id,
          ]
        );
      }

      await connection.commit();

      res.status(201).json({
        id: result.insertId,
        message: 'Product added successfully.',
      });

    } catch (err) {

      await connection.rollback();
      throw err;

    } finally {

      connection.release();

    }
  })
);

// PUT /api/products/:id
router.put(
  '/:id',
  authenticate,
  requireRole('admin', 'staff'),
  [
    body('name').trim().notEmpty().withMessage('Product name is required.'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number.'),
  ],
  asyncHandler(async (req, res) => {
    validate(req);

    const { id } = req.params;

    const [rows] = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      throw new AppError('Product not found.', 404);
    }

    const existing = rows[0];

    const {
      name,
      category_id,
      barcode,
      price,
      cost_price,
      tax_percent,
      unit,
      low_stock_threshold,
    } = req.body;

    await db.query(
      `UPDATE products
       SET
       name=?,
       category_id=?,
       barcode=?,
       price=?,
       cost_price=?,
       tax_percent=?,
       unit=?,
       low_stock_threshold=?,
       updated_at=NOW()
       WHERE id=?`,
      [
        name,
        category_id || null,
        barcode || null,
        price,
        cost_price ?? existing.cost_price,
        tax_percent ?? existing.tax_percent,
        unit || existing.unit,
        low_stock_threshold ?? existing.low_stock_threshold,
        id,
      ]
    );

    res.json({
      message: 'Product updated successfully.',
    });
  })
);

// PATCH /api/products/:id/stock  — explicit stock in/out adjustment
router.patch(
  '/:id/stock',
  authenticate,
  requireRole('admin', 'staff'),
  [
    body('type')
      .isIn(['in', 'out', 'adjustment'])
      .withMessage('Type must be in, out, or adjustment.'),
    body('quantity')
      .isInt({ min: 1 })
      .withMessage('Quantity must be a positive integer.'),
  ],
  asyncHandler(async (req, res) => {

    validate(req);

    const { id } = req.params;
    const { type, quantity, reason } = req.body;

    const connection = await db.getConnection();

    try {

      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM products WHERE id=?',
        [id]
      );

      if (rows.length === 0) {
        throw new AppError('Product not found.',404);
      }

      const product = rows[0];

      let newQuantity = product.quantity;

      if(type==='in')
          newQuantity += Number(quantity);
      else if(type==='out')
          newQuantity -= Number(quantity);
      else
          newQuantity = Number(quantity);

      if(newQuantity<0){
          throw new AppError('Stock cannot go below zero.',400);
      }

      await connection.query(
        'UPDATE products SET quantity=?,updated_at=NOW() WHERE id=?',
        [newQuantity,id]
      );

      await connection.query(
        `INSERT INTO stock_movements
        (product_id,type,quantity,reason,user_id)
        VALUES(?,?,?,?,?)`,
        [
            id,
            type,
            quantity,
            reason || null,
            req.user.id
        ]
      );

      await connection.commit();

      res.json({
          message:'Stock updated successfully.',
          new_quantity:newQuantity
      });

    }catch(err){

        await connection.rollback();
        throw err;

    }finally{

        connection.release();

    }

  })
);

// DELETE /api/products/:id  (soft delete to preserve bill history integrity)
router.delete(
  '/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async(req,res)=>{

      const [rows] = await db.query(
          'SELECT id FROM products WHERE id=?',
          [req.params.id]
      );

      if(rows.length===0){
          throw new AppError('Product not found.',404);
      }

      await db.query(
          'UPDATE products SET is_active=0 WHERE id=?',
          [req.params.id]
      );

      res.json({
          message:'Product removed.'
      });

  })
);

// ---- Categories ----
router.get(
'/categories/all',
authenticate,
asyncHandler(async(req,res)=>{

    const [categories] = await db.query(
        'SELECT * FROM categories ORDER BY name ASC'
    );

    res.json({categories});

})
);

router.post(
'/categories',
authenticate,
requireRole('admin','staff'),
[
body('name').trim().notEmpty().withMessage('Category name is required.')
],
asyncHandler(async(req,res)=>{

    validate(req);

    const [result] = await db.query(
        'INSERT INTO categories(name) VALUES(?)',
        [req.body.name]
    );

    res.status(201).json({
        id:result.insertId
    });

})
);

module.exports = router;
