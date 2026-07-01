const express = require('express');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../database/db');
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

async function buildSalesReport(from, to) {

    const [summaryRows] = await db.query(
        `SELECT
            COALESCE(SUM(total_amount),0) AS revenue,
            COALESCE(SUM(tax_amount),0) AS tax,
            COALESCE(SUM(discount_amount),0) AS discount,
            COUNT(*) AS bill_count
        FROM bills
        WHERE DATE(created_at) BETWEEN ? AND ?`,
        [from, to]
    );

    const summary = summaryRows[0];

    const [profitRows] = await db.query(
        `SELECT
            COALESCE(SUM((bi.unit_price-bi.cost_price)*bi.quantity),0) AS gross_profit,
            COALESCE(SUM(bi.cost_price*bi.quantity),0) AS total_cost
        FROM bill_items bi
        JOIN bills b
        ON b.id=bi.bill_id
        WHERE DATE(b.created_at) BETWEEN ? AND ?`,
        [from, to]
    );

    const profit = profitRows[0];

    const [dailyBreakdown] = await db.query(
        `SELECT
            DATE(created_at) AS day,
            COALESCE(SUM(total_amount),0) AS revenue,
            COUNT(*) AS bill_count
        FROM bills
        WHERE DATE(created_at) BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY day`,
        [from, to]
    );

    const [bestSellers] = await db.query(
        `SELECT
            bi.product_name,
            SUM(bi.quantity) AS units_sold,
            SUM(bi.line_total) AS revenue,
            SUM((bi.unit_price-bi.cost_price)*bi.quantity) AS profit
        FROM bill_items bi
        JOIN bills b
        ON b.id=bi.bill_id
        WHERE DATE(b.created_at) BETWEEN ? AND ?
        GROUP BY bi.product_name
        ORDER BY units_sold DESC
        LIMIT 10`,
        [from, to]
    );

    const [paymentBreakdown] = await db.query(
        `SELECT
            payment_method,
            COUNT(*) AS count,
            COALESCE(SUM(total_amount),0) AS total
        FROM bills
        WHERE DATE(created_at) BETWEEN ? AND ?
        GROUP BY payment_method`,
        [from, to]
    );

    return {
        period: { from, to },
        revenue: summary.revenue,
        tax_collected: summary.tax,
        discount_given: summary.discount,
        bill_count: summary.bill_count,
        gross_profit: profit.gross_profit,
        total_cost: profit.total_cost,
        profit_margin_percent:
            summary.revenue > 0
                ? Number(
                      ((profit.gross_profit / summary.revenue) * 100).toFixed(2)
                  )
                : 0,
        daily_breakdown: dailyBreakdown,
        best_sellers: bestSellers,
        payment_breakdown: paymentBreakdown,
    };
}

router.get(
    '/sales',
    authenticate,
    asyncHandler(async (req, res) => {

        const {
            period = 'daily',
            from,
            to
        } = req.query;

        const range = dateRangeFor(period, from, to);

        const report = await buildSalesReport(
            range.from,
            range.to
        );

        res.json(report);

    })
);

router.get(
    '/best-sellers',
    authenticate,
    asyncHandler(async (req, res) => {

        const {
            from,
            to,
            limit = 10
        } = req.query;

        const range = dateRangeFor(
            'monthly',
            from,
            to
        );

        const [rows] = await db.query(

            `SELECT
                bi.product_name,
                SUM(bi.quantity) AS units_sold,
                SUM(bi.line_total) AS revenue
            FROM bill_items bi
            JOIN bills b
                ON b.id = bi.bill_id
            WHERE DATE(b.created_at) BETWEEN ? AND ?
            GROUP BY bi.product_name
            ORDER BY units_sold DESC
            LIMIT ?`,

            [
                range.from,
                range.to,
                Number(limit)
            ]

        );

        res.json({
            period: range,
            best_sellers: rows
        });

    })
);

router.get(
    '/profit',
    authenticate,
    requireRole('admin'),
    asyncHandler(async (req, res) => {

        const {
            from,
            to,
            period = 'monthly'
        } = req.query;

        const range = dateRangeFor(
            period,
            from,
            to
        );

        const report = await buildSalesReport(
            range.from,
            range.to
        );

        res.json({
            period: range,
            revenue: report.revenue,
            total_cost: report.total_cost,
            gross_profit: report.gross_profit,
            profit_margin_percent: report.profit_margin_percent,
            by_product: report.best_sellers
        });

    })
);router.get(
    '/profit',
    authenticate,
    requireRole('admin'),
    asyncHandler(async (req, res) => {

        const {
            from,
            to,
            period = 'monthly'
        } = req.query;

        const range = dateRangeFor(
            period,
            from,
            to
        );

        const report = await buildSalesReport(
            range.from,
            range.to
        );

        res.json({
            period: range,
            revenue: report.revenue,
            total_cost: report.total_cost,
            gross_profit: report.gross_profit,
            profit_margin_percent: report.profit_margin_percent,
            by_product: report.best_sellers
        });

    })
);

// GET /api/reports/export/excel?period=&from=&to=
router.get('/export/excel', authenticate, requireRole('admin', 'staff'), asyncHandler(async (req, res) => {
  const { period = 'monthly', from, to } = req.query;
  const range = dateRangeFor(period, from, to);
  const report = await buildSalesReport(range.from, range.to);

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
  const report = await buildSalesReport(range.from, range.to);

const [storeRows] = await db.query(
    "SELECT value FROM settings WHERE `key`='store_name'"
);

const [currencyRows] = await db.query(
    "SELECT value FROM settings WHERE `key`='currency_symbol'"
);

const storeName =
    storeRows.length > 0
        ? storeRows[0].value
        : "Supermarket";

const currency =
    currencyRows.length > 0
        ? currencyRows[0].value
        : "Rs.";

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sales-report-${range.from}-to-${range.to}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text(storeName, { align: 'center' });
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