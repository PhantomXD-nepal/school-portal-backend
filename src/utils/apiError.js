/**
 * Custom API Error class for structured error handling
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Predefined error types for common scenarios
 */
export const ErrorTypes = {
  // Authentication & Authorization
  UNAUTHORIZED: (message = 'Authentication required') =>
    new ApiError(401, message, null, 'UNAUTHORIZED'),

  FORBIDDEN: (message = 'You do not have permission to perform this action') =>
    new ApiError(403, message, null, 'FORBIDDEN'),

  INVALID_CREDENTIALS: () =>
    new ApiError(401, 'Invalid email or password', null, 'INVALID_CREDENTIALS'),

  TOKEN_EXPIRED: () =>
    new ApiError(401, 'Your session has expired. Please log in again', null, 'TOKEN_EXPIRED'),

  TOKEN_INVALID: () =>
    new ApiError(401, 'Invalid authentication token', null, 'TOKEN_INVALID'),

  // Validation Errors
  VALIDATION_ERROR: (details) =>
    new ApiError(400, 'Validation failed', details, 'VALIDATION_ERROR'),

  MISSING_REQUIRED_FIELD: (fieldName) =>
    new ApiError(400, `${fieldName} is required`, { field: fieldName }, 'MISSING_FIELD'),

  INVALID_FORMAT: (fieldName, expectedFormat) =>
    new ApiError(400, `${fieldName} has invalid format. Expected: ${expectedFormat}`,
      { field: fieldName, expected: expectedFormat }, 'INVALID_FORMAT'),

  // Resource Errors
  NOT_FOUND: (resourceName = 'Resource') =>
    new ApiError(404, `${resourceName} not found`, null, 'NOT_FOUND'),

  ALREADY_EXISTS: (resourceName = 'Resource') =>
    new ApiError(409, `${resourceName} already exists`, null, 'ALREADY_EXISTS'),

  CONFLICT: (message) =>
    new ApiError(409, message, null, 'CONFLICT'),

  // School-specific Errors
  SCHOOL_REQUIRED: () =>
    new ApiError(400, 'School ID is required. Please select or create a school first',
      null, 'SCHOOL_REQUIRED'),

  SCHOOL_NOT_FOUND: () =>
    new ApiError(404, 'School not found. Please verify the school ID', null, 'SCHOOL_NOT_FOUND'),

  SCHOOL_ACCESS_DENIED: () =>
    new ApiError(403, 'You do not have access to this school', null, 'SCHOOL_ACCESS_DENIED'),

  // Database Errors
  DATABASE_ERROR: (message = 'A database error occurred') =>
    new ApiError(500, message, null, 'DATABASE_ERROR'),

  FOREIGN_KEY_VIOLATION: (message = 'Referenced resource does not exist') =>
    new ApiError(400, message, null, 'FOREIGN_KEY_VIOLATION'),

  UNIQUE_VIOLATION: (fieldName) =>
    new ApiError(409, `A record with this ${fieldName} already exists`,
      { field: fieldName }, 'UNIQUE_VIOLATION'),

  // Server Errors
  INTERNAL_ERROR: (message = 'An unexpected error occurred. Please try again later') =>
    new ApiError(500, message, null, 'INTERNAL_ERROR'),

  SERVICE_UNAVAILABLE: () =>
    new ApiError(503, 'Service temporarily unavailable. Please try again later',
      null, 'SERVICE_UNAVAILABLE'),

  // Rate Limiting
  RATE_LIMITED: () =>
    new ApiError(429, 'Too many requests. Please slow down and try again later',
      null, 'RATE_LIMITED'),
};

/**
 * Map Supabase/PostgreSQL error codes to user-friendly errors
 */
export const mapDatabaseError = (error) => {
  const errorCode = error.code;

  switch (errorCode) {
    case '23505': // Unique violation
      // Try to extract the field name from the error message
      const uniqueMatch = error.message?.match(/Key \((\w+)\)/);
      const uniqueField = uniqueMatch ? uniqueMatch[1] : 'field';
      return ErrorTypes.UNIQUE_VIOLATION(uniqueField);

    case '23503': // Foreign key violation
      const fkMatch = error.message?.match(/table "(\w+)"/);
      const relatedTable = fkMatch ? fkMatch[1] : 'related resource';
      return ErrorTypes.FOREIGN_KEY_VIOLATION(`The referenced ${relatedTable} does not exist`);

    case '23502': // Not null violation
      const nullMatch = error.message?.match(/column "(\w+)"/);
      const nullField = nullMatch ? nullMatch[1] : 'field';
      return ErrorTypes.MISSING_REQUIRED_FIELD(nullField);

    case '42P01': // Undefined table
      return ErrorTypes.DATABASE_ERROR('Database table not found');

    case '42703': // Undefined column
      return ErrorTypes.DATABASE_ERROR('Invalid database column referenced');

    case 'PGRST116': // Row not found (Supabase specific)
      return ErrorTypes.NOT_FOUND();

    case 'PGRST301': // JWT expired
      return ErrorTypes.TOKEN_EXPIRED();

    case 'PGRST302': // JWT invalid
      return ErrorTypes.TOKEN_INVALID();

    default:
      // Log the original error for debugging
      console.error('Unmapped database error:', error);
      return ErrorTypes.DATABASE_ERROR();
  }
};

/**
 * Format validation errors from express-validator
 */
export const formatValidationErrors = (errors) => {
  return errors.map(err => ({
    field: err.path || err.param,
    message: err.msg,
    value: err.value,
  }));
};

export default { ApiError, ErrorTypes, mapDatabaseError, formatValidationErrors };
