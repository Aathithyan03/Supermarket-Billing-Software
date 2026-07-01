const express = require("express");
const { body, validationResult } = require("express-validator");
const db = require("../database/db");
const { authenticate, requireRole } = require("../middleware/auth");
const { asyncHandler, AppError } = require("../middleware/errorHandler");

const router = express.Router();

function validate(req) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new AppError(errors.array()[0].msg, 422);
    }
}

// ---------------- SETTINGS ----------------

async function getSetting(key, fallback) {

    const [rows] = await db.query(
        "SELECT value FROM settings WHERE `key`=?",
        [key]
    );

    if (rows.length === 0) {
        return fallback;
    }

    return rows[0].value;
}

async function generateBillNumber() {

    const prefix = await getSetting("invoice_prefix", "INV");

    const today = new Date();

    const datePart = today
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");

    const [rows] = await db.query(
        `SELECT COUNT(*) AS c
         FROM bills
         WHERE DATE(created_at)=CURDATE()`
    );

    const seq = String(rows[0].c + 1).padStart(4, "0");

    return `${prefix}-${datePart}-${seq}`;
}

// ------------------------------------------------------
// POST /api/bills
// ------------------------------------------------------

router.post(
    "/",
    authenticate,
    [
        body("items")
            .isArray({ min: 1 })
            .withMessage("Cart must contain at least one item."),

        body("items.*.product_id")
            .isInt()
            .withMessage("Each item must reference a product."),

        body("items.*.quantity")
            .isInt({ min: 1 })
            .withMessage("Each item quantity must be a positive integer."),

        body("discount_percent")
            .optional()
            .isFloat({ min: 0, max: 100 }),

        body("payment_method")
            .optional()
            .isIn(["cash", "card", "upi", "other"]),
    ],

    asyncHandler(async (req, res) => {

        validate(req);

        const {
            items,
            customer_id,
            discount_percent = 0,
            payment_method = "cash",
        } = req.body;

        const connection = await db.getConnection();

        try {

            await connection.beginTransaction();

            let subtotal = 0;
            let taxAmount = 0;

            const lineItems = [];

            // -------------------------
            // Validate Products
            // -------------------------

            for (const item of items) {

                const [rows] = await connection.query(
                    `SELECT *
                     FROM products
                     WHERE id=? AND is_active=1`,
                    [item.product_id]
                );

                if (rows.length === 0) {
                    throw new AppError(
                        `Product with id ${item.product_id} was not found.`,
                        404
                    );
                }

                const product = rows[0];

                if (product.quantity < item.quantity) {
                    throw new AppError(
                        `Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}.`,
                        400
                    );
                }

                const lineSubtotal =
                    Math.round(product.price * item.quantity * 100) / 100;

                const lineTax =
                    Math.round(lineSubtotal * (product.tax_percent / 100) * 100) / 100;

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

            const discountAmount = round2(
                (subtotal + taxAmount) *
                (Number(discount_percent) / 100)
            );

            const totalAmount = round2(
                subtotal +
                taxAmount -
                discountAmount
            );

            const billNumber = await generateBillNumber();

            // -------------------------
            // Insert Bill
            // -------------------------

            const [billResult] = await connection.query(
                `INSERT INTO bills
                (
                    bill_number,
                    customer_id,
                    cashier_id,
                    subtotal,
                    discount_percent,
                    discount_amount,
                    tax_amount,
                    total_amount,
                    payment_method
                )
                VALUES(?,?,?,?,?,?,?,?,?)`,
                [
                    billNumber,
                    customer_id || null,
                    req.user.id,
                    subtotal,
                    discount_percent,
                    discountAmount,
                    taxAmount,
                    totalAmount,
                    payment_method,
                ]
            );

            const billId = billResult.insertId;

            // -------------------------
            // Insert Bill Items
            // -------------------------

            for (const li of lineItems) {

                await connection.query(
                    `INSERT INTO bill_items
                    (
                        bill_id,
                        product_id,
                        product_name,
                        unit_price,
                        cost_price,
                        quantity,
                        tax_percent,
                        line_total
                    )
                    VALUES(?,?,?,?,?,?,?,?)`,
                    [
                        billId,
                        li.product_id,
                        li.product_name,
                        li.unit_price,
                        li.cost_price,
                        li.quantity,
                        li.tax_percent,
                        li.line_total,
                    ]
                );

                await connection.query(
                    `UPDATE products
                     SET quantity = quantity - ?
                     WHERE id=?`,
                    [
                        li.quantity,
                        li.product_id,
                    ]
                );

                await connection.query(
                    `INSERT INTO stock_movements
                    (
                        product_id,
                        type,
                        quantity,
                        reason,
                        reference_bill_id,
                        user_id
                    )
                    VALUES(?,?,?,?,?,?)`,
                    [
                        li.product_id,
                        "sale",
                        li.quantity,
                        `Sold via bill ${billNumber}`,
                        billId,
                        req.user.id,
                    ]
                );

            }

            // -------------------------
            // Loyalty Points
            // -------------------------

            if (customer_id) {

                const points = Math.floor(totalAmount / 100);

                if (points > 0) {

                    await connection.query(
                        `UPDATE customers
                         SET loyalty_points = loyalty_points + ?
                         WHERE id=?`,
                        [
                            points,
                            customer_id,
                        ]
                    );

                }

            }

            await connection.commit();

            res.status(201).json({
                message: "Bill generated successfully.",
                bill_id: billId,
                bill_number: billNumber,
                subtotal,
                tax_amount: taxAmount,
                discount_amount: discountAmount,
                total_amount: totalAmount,
            });

        }
        catch (err) {

            await connection.rollback();
            throw err;

        }
        finally {

            connection.release();

        }

    })
);

// ------------------------------------------------------
// GET /api/bills
// ------------------------------------------------------

router.get(
    "/",
    authenticate,
    asyncHandler(async (req, res) => {

        const {
            from,
            to,
            customer_id,
            page = 1,
            limit = 20,
        } = req.query;

        const clauses = [];
        const params = [];

        if (from) {
            clauses.push("DATE(b.created_at) >= ?");
            params.push(from);
        }

        if (to) {
            clauses.push("DATE(b.created_at) <= ?");
            params.push(to);
        }

        if (customer_id) {
            clauses.push("b.customer_id = ?");
            params.push(customer_id);
        }

        const where = clauses.length
            ? `WHERE ${clauses.join(" AND ")}`
            : "";

        const offset = (Number(page) - 1) * Number(limit);

        // Total Count
        const [countRows] = await db.query(
            `SELECT COUNT(*) AS c
             FROM bills b
             ${where}`,
            params
        );

        const total = countRows[0].c;

        // Bills
        const [bills] = await db.query(
            `SELECT
                b.*,
                c.name AS customer_name,
                u.full_name AS cashier_name
            FROM bills b
            LEFT JOIN customers c
                ON c.id = b.customer_id
            LEFT JOIN users u
                ON u.id = b.cashier_id
            ${where}
            ORDER BY b.created_at DESC
            LIMIT ?
            OFFSET ?`,
            [
                ...params,
                Number(limit),
                offset,
            ]
        );

        res.json({
            bills,
            total,
            page: Number(page),
            limit: Number(limit),
        });

    })
);

// ------------------------------------------------------
// GET /api/bills/recent
// ------------------------------------------------------

router.get(
    "/recent",
    authenticate,
    asyncHandler(async (req, res) => {

        const [bills] = await db.query(
            `SELECT
                b.id,
                b.bill_number,
                b.total_amount,
                b.payment_method,
                b.created_at,
                c.name AS customer_name
            FROM bills b
            LEFT JOIN customers c
                ON c.id = b.customer_id
            ORDER BY b.created_at DESC
            LIMIT 10`
        );

        res.json({
            bills,
        });

    })
);

// ------------------------------------------------------
// GET /api/bills/:id
// Invoice Details
// ------------------------------------------------------

router.get(
    "/:id",
    authenticate,
    asyncHandler(async (req, res) => {

        const { id } = req.params;

        // Bill
        const [billRows] = await db.query(
            `
            SELECT
                b.*,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.email AS customer_email,
                c.address AS customer_address,
                u.full_name AS cashier_name
            FROM bills b
            LEFT JOIN customers c
                ON c.id = b.customer_id
            LEFT JOIN users u
                ON u.id = b.cashier_id
            WHERE b.id = ?
            `,
            [id]
        );

        if (billRows.length === 0) {
            throw new AppError("Invoice not found.", 404);
        }

        const bill = billRows[0];

        // Bill Items
        const [items] = await db.query(
            `
            SELECT
    id,
    product_name,
    quantity,
    unit_price,
    tax_percent,
    line_total
FROM bill_items
WHERE bill_id = ?
            `,
            [id]
        );

        res.json({
            bill,
            items,
        });

    })
);
module.exports = router;