import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` | ${JSON.stringify(meta)}`;
    }

    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'warn';
};

// Create logs directory path
const logsDir = path.join(__dirname, '../../logs');

// Create logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format: logFormat,
  transports: [
    // Console transport with colors
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        logFormat
      ),
    }),
    // File transport for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // HTTP request logs
    new winston.transports.File({
      filename: path.join(logsDir, 'requests.log'),
      level: 'http',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
  // Handle exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
    }),
  ],
});

// Create a stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// Helper functions for structured logging
export const logRequest = (req, additionalInfo = {}) => {
  logger.http(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    ...additionalInfo,
  });
};

export const logError = (error, req = null, additionalInfo = {}) => {
  const logData = {
    message: error.message,
    stack: error.stack,
    code: error.code,
    ...additionalInfo,
  };

  if (req) {
    logData.method = req.method;
    logData.path = req.originalUrl;
    logData.userId = req.user?.id;
    logData.ip = req.ip;
  }

  logger.error('Application Error', logData);
};

export const logDatabase = (operation, table, additionalInfo = {}) => {
  logger.debug(`Database ${operation}`, {
    table,
    ...additionalInfo,
  });
};

export const logAuth = (action, userId, additionalInfo = {}) => {
  logger.info(`Auth: ${action}`, {
    userId,
    ...additionalInfo,
  });
};

export default logger;
