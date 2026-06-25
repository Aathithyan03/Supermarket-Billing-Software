/**
 * Centralized error handler. Any route that calls next(err), or any thrown
 * error in an async route wrapped by asyncHandler, lands here.
 */
function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} ::`, err.message);
  }

  // SQLite constraint violations -> friendly 400s instead of opaque 500s
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'A record with this value already exists (duplicate barcode, phone, or username).' });
  }
  if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'This action references a record that does not exist or is in use.' });
  }
  if (err.message && err.message.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'One of the submitted values is invalid (check quantities, prices, or roles).' });
  }

  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'An unexpected error occurred.' });
}

/** Wraps an async route handler so thrown errors/rejections reach errorHandler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

module.exports = { errorHandler, asyncHandler, AppError };
