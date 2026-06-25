const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { get, all } = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const router = express.Router();

function dateRangeFor(period, from, to) {
  if (from && to) return { from, to };
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  let start;
  if (period === 'daily') {
    start = end;
  } else if (period === 'weekly') {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    start = d.toISOString().slice(0, 10);
  } else { // monthly
    const d = new Date(today); d.setDate(d.getDate() - 29);
    start = d.toISOString().slice(0, 10);
  }
  return { from: start, to: end };
}

function buildSalesReport(from, to) {
  const summary = get(
    `SELECT COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(tax_amount),0) as tax,
            COALESCE(SUM(discount_amount),0) as discount, COUNT(*) as bill_count
     FROM bills WHERE date(created_at) BETWEEN date(?) AND date(?)`,
    [from, to]
  );

  const profitRow = get(
    `SELECT COALESCE(SUM((bi.unit_price - bi.cost_price) * bi.quantity), 0) as gross_profit,
            COALESCE(SUM(bi.cost_price * bi.quantity), 0) as total_cost
     FROM bill_items bi
     JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) BETWEEN date(?) AND date(?)`,
    [from, to]
  );

  const dailyBreakdown = all(
    `SELECT date(created_at) as day, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as bill_count
     FROM bills WHERE date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY date(created_at) ORDER BY day ASC`,
    [from, to]
  );

  const bestSellers = all(
    `SELECT bi.product_name, SUM(bi.quantity) as units_sold,
            SUM(bi.line_total) as revenue,
            SUM((bi.unit_price - bi.cost_price) * bi.quantity) as profit
     FROM bill_items bi
     JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) BETWEEN date(?) AND date(?)
     GROUP BY bi.product_name
     ORDER BY units_sold DESC
     LIMIT 10`,
    [from, to]
  );

  const paymentBreakdown = all(
    `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total
     FROM bills WHERE date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY payment_method`,
    [from, to]
  );

  return {
    period: { from, to },
    revenue: summary.revenue,
    tax_collected: summary.tax,
    discount_given: summary.discount,
    bill_count: summary.bill_count,
    gross_profit: profitRow.gross_profit,
    total_cost: profitRow.total_cost,
    profit_margin_percent: summary.revenue > 0 ? Number(((profitRow.gross_profit / summary.revenue) * 100).toFixed(2)) : 0,
    daily_breakdown: dailyBreakdown,
    best_sellers: bestSellers,
    payment_breakdown: paymentBreakdown,
  };
}

// GET /api/reports/sales?period=daily|weekly|monthly  OR  ?from=&to=
router.get('/sales', authenticate, (req, res) => {
  const { period = 'daily', from, to } = req.query;
  const range = dateRangeFor(period, from, to);
  res.json(buildSalesReport(range.from, range.to));
});

// GET /api/reports/best-sellers?from=&to=&limit=
router.get('/best-sellers', authenticate, (req, res) => {
  const { from, to, limit = 10 } = req.query;
  const range = dateRangeFor('monthly', from, to);
  const rows = all(
    `SELECT bi.product_name, SUM(bi.quantity) as units_sold, SUM(bi.line_total) as revenue
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE date(b.created_at) BETWEEN date(?) AND date(?)
     GROUP BY bi.product_name ORDER BY units_sold DESC LIMIT ?`,
    [range.from, range.to, Number(limit)]
  );
  res.json({ period: range, best_sellers: rows });
});

// GET /api/reports/profit?from=&to=
router.get('/profit', authenticate, requireRole('admin'), (req, res) => {
  const { from, to, period = 'monthly' } = req.query;
  const range = dateRangeFor(period, from, to);
  const report = buildSalesReport(range.from, range.to);
  res.json({
    period: range,
    revenue: report.revenue,
    total_cost: report.total_cost,
    gross_profit: report.gross_profit,
    profit_margin_percent: report.profit_margin_percent,
    by_product: report.best_sellers,
  });
});

// GET /api/reports/export/excel?period=&from=&to=
router.get('/export/excel', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { period = 'monthly', from, to } = req.query;
  const range = dateRangeFor(period, from, to);
  const report = buildSalesReport(range.from, range.to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Supermarket Billing Software';

  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [{ header: 'Metric', key: 'metric', width: 30 }, { header: 'Value', key: 'value', width: 20 }];
  summarySheet.addRows([
    { metric: 'Report Period', value: `${range.from} to ${range.to}` },
    { metric: 'Total Revenue', value: report.revenue },
    { metric: 'Tax Collected', value: report.tax_collected },
    { metric: 'Discount Given', value: report.discount_given },
    { metric: 'Number of Bills', value: report.bill_count },
    { metric: 'Gross Profit', value: report.gross_profit },
    { metric: 'Profit Margin %', value: report.profit_margin_percent },
  ]);
  summarySheet.getRow(1).font = { bold: true };

  const dailySheet = workbook.addWorksheet('Daily Breakdown');
  dailySheet.columns = [
    { header: 'Date', key: 'day', width: 15 },
    { header: 'Revenue', key: 'revenue', width: 15 },
    { header: 'Bills', key: 'bill_count', width: 12 },
  ];
  dailySheet.addRows(report.daily_breakdown);
  dailySheet.getRow(1).font = { bold: true };

  const bestSheet = workbook.addWorksheet('Best Sellers');
  bestSheet.columns = [
    { header: 'Product', key: 'product_name', width: 30 },
    { header: 'Units Sold', key: 'units_sold', width: 15 },
    { header: 'Revenue', key: 'revenue', width: 15 },
    { header: 'Profit', key: 'profit', width: 15 },
  ];
  bestSheet.addRows(report.best_sellers);
  bestSheet.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${range.from}-to-${range.to}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}));

// GET /api/reports/export/pdf?period=&from=&to=
router.get('/export/pdf', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { period = 'monthly', from, to } = req.query;
  const range = dateRangeFor(period, from, to);
  const report = buildSalesReport(range.from, range.to);

  const storeRow = get("SELECT value FROM settings WHERE key = 'store_name'");
  const currencyRow = get("SELECT value FROM settings WHERE key = 'currency_symbol'");
  const currency = currencyRow ? currencyRow.value : 'Rs.';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${range.from}-to-${range.to}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text(storeRow ? storeRow.value : 'Supermarket', { align: 'center' });
  doc.fontSize(12).text('Sales Report', { align: 'center' });
  doc.fontSize(10).text(`Period: ${range.from} to ${range.to}`, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(12).text('Summary', { underline: true });
  doc.fontSize(10);
  doc.text(`Total Revenue: ${currency} ${report.revenue.toFixed(2)}`);
  doc.text(`Tax Collected: ${currency} ${report.tax_collected.toFixed(2)}`);
  doc.text(`Discount Given: ${currency} ${report.discount_given.toFixed(2)}`);
  doc.text(`Number of Bills: ${report.bill_count}`);
  doc.text(`Gross Profit: ${currency} ${report.gross_profit.toFixed(2)}`);
  doc.text(`Profit Margin: ${report.profit_margin_percent}%`);
  doc.moveDown(1);

  doc.fontSize(12).text('Best-Selling Products', { underline: true });
  doc.fontSize(10);
  report.best_sellers.forEach((p, i) => {
    doc.text(`${i + 1}. ${p.product_name} - ${p.units_sold} units - ${currency} ${Number(p.revenue).toFixed(2)}`);
  });

  doc.end();
}));

module.exports = router;
