module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000,
  // Run test files serially: they share one on-disk SQLite file via DB_PATH
  maxWorkers: 1,
};
