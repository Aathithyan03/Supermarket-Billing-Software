/**
 * Centralized error handler.
 */
function errorHandler(err, req, res, next) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} ::`, err);
  }

  // MySQL constraint violations
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'A record with this value already exists.'
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'Referenced record does not exist.'
    });
  }

  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(400).json({
      error: 'This record is being used elsewhere and cannot be deleted.'
    });
  }

  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({
      error: 'One of the submitted values is invalid.'
    });
  }

  const status = err.status || 500;

  res.status(status).json({
    error: err.message || 'Internal Server Error'
  });
}

/**
 * Wrap async routes
 */
function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  AppError
};
