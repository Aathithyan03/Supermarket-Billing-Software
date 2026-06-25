/**
 * Run this once (or on every boot — it's idempotent) to ensure the schema
 * exists and a default admin account + base settings are present.
 *
 * Usage: node src/database/migrate.js
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, run, get } = require('./db');

function applySchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  // node-sqlite3-wasm's db.run() executes one statement; exec() runs a full script.
  db.exec(schema);
}

function seedDefaultAdmin() {
  const existingAdmin = get('SELECT id FROM users WHERE role = ?', ['admin']);
  if (existingAdmin) return;

  const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
  const hash = bcrypt.hashSync(defaultPassword, 10);

  run(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
    ['admin', hash, 'Store Administrator', 'admin']
  );

  console.log('============================================');
  console.log(' Default admin account created');
  console.log(' Username: admin');
  console.log(` Password: ${defaultPassword}`);
  console.log(' --> Please log in and change this password immediately.');
  console.log('============================================');
}

function seedDefaultSettings() {
  const defaults = {
    store_name: 'My Supermarket',
    store_address: '',
    store_phone: '',
    currency_symbol: 'Rs.',
    default_tax_percent: '5',
    invoice_prefix: 'INV',
    low_stock_default_threshold: '10',
  };

  for (const [key, value] of Object.entries(defaults)) {
    const existing = get('SELECT key FROM settings WHERE key = ?', [key]);
    if (!existing) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }
}

function seedDefaultCategories() {
  const count = get('SELECT COUNT(*) as c FROM categories');
  if (count && count.c > 0) return;
  const defaults = ['Groceries', 'Beverages', 'Dairy', 'Bakery', 'Snacks', 'Household', 'Personal Care', 'Other'];
  for (const name of defaults) {
    run('INSERT INTO categories (name) VALUES (?)', [name]);
  }
}

function migrate() {
  applySchema();
  seedDefaultAdmin();
  seedDefaultSettings();
  seedDefaultCategories();
  console.log('Database migration complete.');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
