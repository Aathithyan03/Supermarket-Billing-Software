const fs = require('fs');
const request = require('supertest');

// Remove any leftover test DB from a previous run before the app boots
const dbPath = process.env.DB_PATH;
[dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach((f) => {
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

const { migrate } = require('../src/database/migrate');
migrate();
const app = require('../src/app');

let adminToken;
let staffToken;
let productId;
let lowStockProductId;
let customerId;

describe('Auth', () => {
  test('rejects login with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('logs in default admin successfully', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Admin@123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.token;
  });

  test('rejects unauthenticated requests to protected routes', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  test('admin can create a staff account', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'cashier1', password: 'cashier123', full_name: 'Cashier One', role: 'staff' });
    expect(res.status).toBe(201);
  });

  test('staff account can log in', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'cashier1', password: 'cashier123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('staff');
    staffToken = res.body.token;
  });

  test('staff cannot delete products (role-based access)', async () => {
    const res = await request(app)
      .delete('/api/products/9999')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Product Management', () => {
  test('creates a product with stock', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Amul Milk 500ml', price: 30, cost_price: 24, tax_percent: 5, quantity: 50, barcode: 'TESTBC001', low_stock_threshold: 10 });
    expect(res.status).toBe(201);
    productId = res.body.id;
  });

  test('rejects product with negative price', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Product', price: -5 });
    expect(res.status).toBe(422);
  });

  test('rejects duplicate barcode', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicate Barcode Product', price: 10, barcode: 'TESTBC001' });
    expect(res.status).toBe(409);
  });

  test('creates a low-stock product', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Maggi Noodles', price: 14, cost_price: 10, tax_percent: 12, quantity: 3, barcode: 'TESTBC002', low_stock_threshold: 10 });
    expect(res.status).toBe(201);
    lowStockProductId = res.body.id;
  });

  test('low stock product appears in low-stock endpoint', async () => {
    const res = await request(app)
      .get('/api/products/low-stock')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.products.some((p) => p.id === lowStockProductId)).toBe(true);
  });

  test('searches products by name', async () => {
    const res = await request(app)
      .get('/api/products')
      .query({ search: 'Milk' })
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  test('looks up product by barcode', async () => {
    const res = await request(app)
      .get('/api/products')
      .query({ barcode: 'TESTBC001' })
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.products[0].barcode).toBe('TESTBC001');
  });

  test('explicit stock-in increases quantity', async () => {
    const res = await request(app)
      .patch(`/api/products/${productId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'in', quantity: 20, reason: 'New shipment' });
    expect(res.status).toBe(200);
    expect(res.body.new_quantity).toBe(70);
  });

  test('stock-out cannot go below zero', async () => {
    const res = await request(app)
      .patch(`/api/products/${lowStockProductId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'out', quantity: 999 });
    expect(res.status).toBe(400);
  });
});

describe('Customer Management', () => {
  test('creates a customer', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Rahul Sharma', phone: '9999999999' });
    expect(res.status).toBe(201);
    customerId = res.body.id;
  });

  test('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Bad Email Customer', email: 'not-an-email' });
    expect(res.status).toBe(422);
  });
});

describe('Billing / POS', () => {
  test('rejects an empty cart', async () => {
    const res = await request(app)
      .post('/api/bills')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ items: [] });
    expect(res.status).toBe(422);
  });

  test('rejects insufficient stock', async () => {
    const res = await request(app)
      .post('/api/bills')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ items: [{ product_id: lowStockProductId, quantity: 9999 }] });
    expect(res.status).toBe(400);
  });

  test('creates a bill with correct tax/discount/total math and deducts stock', async () => {
    // Milk: price 30, tax 5%, qty 2 -> subtotal 60, tax 3.00
    // Maggi: price 14, tax 12%, qty 1 -> subtotal 14, tax 1.68
    // combined subtotal 74, tax 4.68, pre-discount 78.68, discount 10% = 7.868 -> rounds to 7.87
    // total = 78.68 - 7.87 = 70.81
    const res = await request(app)
      .post('/api/bills')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customer_id: customerId,
        items: [
          { product_id: productId, quantity: 2 },
          { product_id: lowStockProductId, quantity: 1 },
        ],
        discount_percent: 10,
        payment_method: 'cash',
      });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBeCloseTo(74, 2);
    expect(res.body.tax_amount).toBeCloseTo(4.68, 2);
    expect(res.body.total_amount).toBeCloseTo(70.81, 1);

    // Verify auto stock deduction: milk was 70 -> 68, maggi was 3 -> 2
    const milkCheck = await request(app).get(`/api/products/${productId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(milkCheck.body.product.quantity).toBe(68);

    const maggiCheck = await request(app).get(`/api/products/${lowStockProductId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(maggiCheck.body.product.quantity).toBe(2);
  });

  test('bill appears in billing history and recent bills', async () => {
    const historyRes = await request(app).get('/api/bills').set('Authorization', `Bearer ${adminToken}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.bills.length).toBeGreaterThan(0);

    const recentRes = await request(app).get('/api/bills/recent').set('Authorization', `Bearer ${adminToken}`);
    expect(recentRes.status).toBe(200);
    expect(recentRes.body.bills.length).toBeGreaterThan(0);
  });

  test('customer purchase history reflects the new bill', async () => {
    const res = await request(app).get(`/api/customers/${customerId}/history`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.bills.length).toBe(1);
  });
});

describe('Dashboard & Reports', () => {
  test('dashboard summary reflects sales and low stock', async () => {
    const res = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.today_bill_count).toBeGreaterThan(0);
    expect(res.body.low_stock_count).toBeGreaterThan(0);
  });

  test('sales report computes profit correctly', async () => {
    const res = await request(app).get('/api/reports/sales?period=monthly').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBeGreaterThan(0);
    expect(res.body.best_sellers.length).toBeGreaterThan(0);
  });

  test('staff cannot access profit report (admin only)', async () => {
    const res = await request(app).get('/api/reports/profit').set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  test('excel export returns a valid spreadsheet content type', async () => {
    const res = await request(app).get('/api/reports/export/excel?period=monthly').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheet');
  });

  test('pdf export returns a valid pdf content type', async () => {
    const res = await request(app).get('/api/reports/export/pdf?period=monthly').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});

describe('Settings', () => {
  test('staff cannot update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ store_name: 'Hacked Store' });
    expect(res.status).toBe(403);
  });

  test('admin can update settings', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ store_name: 'Test Supermarket' });
    expect(res.status).toBe(200);

    const getRes = await request(app).get('/api/settings').set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.settings.store_name).toBe('Test Supermarket');
  });
});
