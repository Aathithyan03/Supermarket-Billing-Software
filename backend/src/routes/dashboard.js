const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/dashboard/summary
router.get(
  '/summary',
  authenticate,
  asyncHandler(async (req, res) => {

    const [todayRows] = await db.query(`
      SELECT
        COALESCE(SUM(total_amount),0) AS total,
        COUNT(*) AS bill_count
      FROM bills
      WHERE DATE(created_at)=CURDATE()
    `);

    const todaySales = todayRows[0];

    const [yesterdayRows] = await db.query(`
      SELECT
        COALESCE(SUM(total_amount),0) AS total
      FROM bills
      WHERE DATE(created_at)=DATE_SUB(CURDATE(),INTERVAL 1 DAY)
    `);

    const yesterdaySales = yesterdayRows[0];

    const [productRows] = await db.query(`
      SELECT COUNT(*) AS c
      FROM products
      WHERE is_active=1
    `);

    const totalProducts = productRows[0];

    const [lowStockProducts] = await db.query(`
      SELECT
        id,
        name,
        quantity,
        low_stock_threshold,
        unit
      FROM products
      WHERE
        is_active=1
        AND quantity<=low_stock_threshold
      ORDER BY quantity ASC
      LIMIT 10
    `);

    const [lowStockCountRows] = await db.query(`
      SELECT COUNT(*) AS c
      FROM products
      WHERE
        is_active=1
        AND quantity<=low_stock_threshold
    `);

    const lowStockCount = lowStockCountRows[0];

    const [recentBills] = await db.query(`
      SELECT
        b.id,
        b.bill_number,
        b.total_amount,
        b.payment_method,
        b.created_at,
        c.name AS customer_name
      FROM bills b
      LEFT JOIN customers c
      ON c.id=b.customer_id
      ORDER BY b.created_at DESC
      LIMIT 8
    `);

    const [customerRows] = await db.query(`
      SELECT COUNT(*) AS c
      FROM customers
    `);

    const totalCustomers = customerRows[0];

    const percentChange =
      yesterdaySales.total > 0
        ? Number(
            (
              ((todaySales.total - yesterdaySales.total) /
                yesterdaySales.total) *
              100
            ).toFixed(1)
          )
        : null;

    res.json({
      today_sales: todaySales.total,
      today_bill_count: todaySales.bill_count,
      yesterday_sales: yesterdaySales.total,
      sales_percent_change: percentChange,
      total_products: totalProducts.c,
      low_stock_count: lowStockCount.c,
      low_stock_products: lowStockProducts,
      recent_bills: recentBills,
      total_customers: totalCustomers.c,
    });

  })
);

// GET /api/dashboard/sales-trend
router.get(
  '/sales-trend',
  authenticate,
  asyncHandler(async (req, res) => {

    const [rows] = await db.query(`
      SELECT
        DATE(created_at) AS day,
        COALESCE(SUM(total_amount),0) AS total
      FROM bills
      WHERE DATE(created_at)>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    const trend = [];

    for (let i = 6; i >= 0; i--) {

      const d = new Date();

      d.setDate(d.getDate() - i);

      const day = d.toISOString().slice(0,10);

      const found = rows.find(
  r => new Date(r.day).toISOString().slice(0, 10) === day
);

      trend.push({
        day,
        total: found ? Number(found.total) : 0,
      });

    }

    res.json({
      trend,
    });

  })
);

module.exports = router;
