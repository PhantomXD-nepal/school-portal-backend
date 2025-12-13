import express from 'express';
import { body, validationResult } from 'express-validator';
import * as authController from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * Enhanced validation middleware with helpful error messages
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorMessages,
      example: getExampleRequest(req.path)
    });
  }

  next();
};

/**
 * Get example request format based on endpoint
 */
const getExampleRequest = (path) => {
  const examples = {
    '/register': {
      email: 'user@school.com',
      password: 'password123',
      first_name: 'John',
      last_name: 'Doe',
      role: 'admin',
      admin_key: 'YOUR_ADMIN_KEY',
      phone: '+1234567890' // optional
    },
    '/login': {
      email: 'user@school.com',
      password: 'password123'
    },
    '/refresh-token': {
      refresh_token: 'your_refresh_token_here'
    }
  };

  return examples[path] || null;
};

// Validation rules for registration
const registerValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),

  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('First name must be between 1 and 100 characters'),

  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Last name must be between 1 and 100 characters'),

  body('role')
    .optional()
    .isIn(['admin', 'teacher', 'student', 'parent', 'finance'])
    .withMessage('Role must be one of: admin, teacher, student, parent, finance'),

  body('admin_key')
    .if(body('role').equals('admin'))
    .notEmpty()
    .withMessage('admin_key is required when role is admin'),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Phone must be a valid international format (e.g., +1234567890)'),

  validate
];

// Validation rules for login
const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required'),

  validate
];

// Validation rules for refresh token
const refreshTokenValidation = [
  body('refresh_token')
    .notEmpty()
    .withMessage('Refresh token is required'),

  validate
];

// Routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', refreshTokenValidation, authController.refreshToken);
router.get('/profile', authenticate, authController.getProfile);

// Admin key generation (protected by secret in production)
router.post('/generate-admin-key', (req, res, next) => {
  // In production, protect this with a master secret key
  const masterSecret = process.env.MASTER_SECRET_KEY;
  const providedSecret = req.headers['x-master-secret'];

  if (masterSecret && providedSecret !== masterSecret) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized: Invalid master secret',
      hint: 'Include x-master-secret header with your master secret key'
    });
  }

  next();
}, authController.createAdminKey);

// Magic Link Generation (Admin/Teacher only)
router.post('/magic-link', authenticate, (req, res, next) => {
    next();
}, authController.generateMagicLink);

// Get current user's school data (for magic link login completion)
router.get('/user-school', authenticate, authController.getUserSchool);

export default router;
