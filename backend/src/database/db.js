const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'supermarket.db');

const db = new Database(DB_PATH);

// Reasonable pragmas for a single-file embedded DB under concurrent web requests
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA busy_timeout = 5000');

/**
 * Run a write statement (INSERT/UPDATE/DELETE). Returns { lastInsertRowid, changes }.
 */
function run(sql, params = []) {
  return db.run(sql, params);
}

/**
 * Get a single row.
 */
function get(sql, params = []) {
  const rows = db.all(sql, params);
  return rows[0] || null;
}

/**
 * Get all rows.
 */
function all(sql, params = []) {
  return db.all(sql, params);
}

/**
 * Run multiple statements as a transaction. `fn` receives nothing; just call
 * run()/get()/all() inside it. Rolls back on throw.
 */
function transaction(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

module.exports = { db, run, get, all, transaction };
