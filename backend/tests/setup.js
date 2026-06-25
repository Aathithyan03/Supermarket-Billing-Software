process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-jest-only';
process.env.DB_PATH = require('path').join(__dirname, 'test.db');
process.env.DEFAULT_ADMIN_PASSWORD = 'Admin@123';
