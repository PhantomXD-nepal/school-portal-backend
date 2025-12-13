import { ApiError, mapDatabaseError } from '../utils/apiError.js';
import logger, { logError } from '../utils/logger.js';

/**
 * Global error handler middleware
 * Provides consistent, structured error responses
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req);

  // If it's already an ApiError, use it directly
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Supabase/PostgreSQL database errors
  if (err.code && (err.code.startsWith('23') || err.code.startsWith('42') || err.code.startsWith('PGRST'))) {
    const apiError = mapDatabaseError(err);
    return res.status(apiError.statusCode).json(apiError.toJSON());
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid authentication token',
        code: 'TOKEN_INVALID',
      },
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Your session has expired. Please log in again',
        code: 'TOKEN_EXPIRED',
      },
    });
  }

  // Handle syntax errors in JSON
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid JSON in request body',
        code: 'INVALID_JSON',
      },
    });
  }

  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    const errors = err.array();
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.map(e => ({
          field: e.path || e.param,
          message: e.msg,
        })),
      },
    });
  }

  // Default to internal server error
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred. Please try again later'
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        original: err.message,
      }),
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.originalUrl} not found`,
      code: 'ROUTE_NOT_FOUND',
    },
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default { errorHandler, notFoundHandler, asyncHandler };
