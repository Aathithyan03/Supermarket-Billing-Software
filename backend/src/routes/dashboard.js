const express = require('express');
const { get, all } = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard/summary
router.get('/summary', authenticate, (req, res) => {
  const todaySales = get(
    `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as bill_count
     FROM bills WHERE date(created_at) = date('now')`
  );

  const yesterdaySales = get(
    `SELECT COALESCE(SUM(total_amount), 0) as total
     FROM bills WHERE date(created_at) = date('now', '-1 day')`
  );

  const totalProducts = get(`SELECT COUNT(*) as c FROM products WHERE is_active = 1`);

  const lowStockProducts = all(
    `SELECT id, name, quantity, low_stock_threshold, unit FROM products
     WHERE is_active = 1 AND quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 10`
  );
  const lowStockCount = get(
    `SELECT COUNT(*) as c FROM products WHERE is_active = 1 AND quantity <= low_stock_threshold`
  );

  const recentBills = all(
    `SELECT b.id, b.bill_number, b.total_amount, b.payment_method, b.created_at, c.name as customer_name
     FROM bills b LEFT JOIN customers c ON c.id = b.customer_id
     ORDER BY b.created_at DESC LIMIT 8`
  );

  const totalCustomers = get(`SELECT COUNT(*) as c FROM customers`);

  const percentChange = yesterdaySales.total > 0
    ? Number((((todaySales.total - yesterdaySales.total) / yesterdaySales.total) * 100).toFixed(1))
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
});

// GET /api/dashboard/sales-trend  — last 7 days, for a small chart
router.get('/sales-trend', authenticate, (req, res) => {
  const rows = all(
    `SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as total
     FROM bills
     WHERE date(created_at) >= date('now', '-6 days')
     GROUP BY date(created_at)
     ORDER BY day ASC`
  );

  // Fill in missing days with 0 so the chart has a consistent 7-point range
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const found = rows.find(r => r.day === dayStr);
    result.push({ day: dayStr, total: found ? found.total : 0 });
  }

  res.json({ trend: result });
});

module.exports = router;
