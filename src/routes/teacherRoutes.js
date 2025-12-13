import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as teacherController from '../controllers/teacherController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool, injectSchoolId } from '../middleware/schoolValidator.js';
import { ApiError, formatValidationErrors } from '../utils/apiError.js';

const router = express.Router();

/**
 * Validation middleware - converts express-validator errors to ApiError
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors.array());
    throw new ApiError(400, 'Validation failed. Please check your input', formattedErrors, 'VALIDATION_ERROR');
  }

  next();
};

// Validation for creating teacher
const createTeacherValidation = [
  body('first_name')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 100 })
    .withMessage('First name must not exceed 100 characters'),

  body('last_name')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 100 })
    .withMessage('Last name must not exceed 100 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Phone must be a valid international format (e.g., +1234567890)'),

  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Department must not exceed 100 characters'),

  body('designation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Designation must not exceed 100 characters'),

  body('qualification')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Qualification must not exceed 255 characters'),

  body('hire_date')
    .optional()
    .isISO8601()
    .withMessage('Hire date must be a valid date (YYYY-MM-DD)'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave'])
    .withMessage('Status must be one of: active, inactive, on_leave'),

  validate,
];

// Validation for updating teacher (all fields optional)
const updateTeacherValidation = [
  param('id')
    .isUUID()
    .withMessage('Teacher ID must be a valid UUID'),

  body('first_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('First name must not exceed 100 characters'),

  body('last_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Last name must not exceed 100 characters'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Phone must be a valid international format'),

  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Department must not exceed 100 characters'),

  body('designation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Designation must not exceed 100 characters'),

  body('qualification')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Qualification must not exceed 255 characters'),

  body('hire_date')
    .optional()
    .isISO8601()
    .withMessage('Hire date must be a valid date (YYYY-MM-DD)'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave'])
    .withMessage('Status must be one of: active, inactive, on_leave'),

  validate,
];

// Query validation
const queryValidation = [
  query('department').optional().trim(),
  query('search').optional().trim(),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave'])
    .withMessage('Status filter must be one of: active, inactive, on_leave'),
  validate,
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Teacher ID must be a valid UUID'),
  validate,
];

/**
 * @route   GET /api/teachers
 * @desc    Get all teachers for the current school
 * @access  Authenticated + School Required
 */
router.get('/',
  authenticate,
  requireSchool,
  queryValidation,
  teacherController.getTeachers
);

/**
 * @route   GET /api/teachers/:id
 * @desc    Get a specific teacher by ID
 * @access  Authenticated + School Required
 */
router.get('/:id',
  authenticate,
  requireSchool,
  idValidation,
  teacherController.getTeacherById
);

/**
 * @route   POST /api/teachers
 * @desc    Create a new teacher
 * @access  Admin only + School Required
 */
router.post('/',
  authenticate,
  authorize('admin'),
  requireSchool,
  injectSchoolId,
  createTeacherValidation,
  teacherController.createTeacher
);

/**
 * @route   PUT /api/teachers/:id
 * @desc    Update a teacher
 * @access  Admin only + School Required
 */
router.put('/:id',
  authenticate,
  authorize('admin'),
  requireSchool,
  updateTeacherValidation,
  teacherController.updateTeacher
);

/**
 * @route   DELETE /api/teachers/:id
 * @desc    Delete a teacher
 * @access  Admin only + School Required
 */
router.delete('/:id',
  authenticate,
  authorize('admin'),
  requireSchool,
  idValidation,
  teacherController.deleteTeacher
);

export default router;
