import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import * as schoolController from '../controllers/schoolController.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';
import { requireSchool } from '../middleware/schoolValidator.js';
import { ApiError, formatValidationErrors } from '../utils/apiError.js';

const router = express.Router();

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors.array());
    throw new ApiError(400, 'Validation failed', formattedErrors, 'VALIDATION_ERROR');
  }
  next();
};

// Create school validation
const createSchoolValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('School name is required')
    .isLength({ min: 3, max: 255 })
    .withMessage('School name must be between 3 and 255 characters'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Phone must be a valid international format'),

  body('website')
    .optional()
    .isURL()
    .withMessage('Must be a valid URL'),

  body('timezone')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Timezone must not exceed 50 characters'),

  body('academic_year_start')
    .optional()
    .isISO8601()
    .withMessage('Academic year start must be a valid date'),

  body('academic_year_end')
    .optional()
    .isISO8601()
    .withMessage('Academic year end must be a valid date'),

  validate,
];

// Update school validation
const updateSchoolValidation = [
  param('id')
    .isUUID()
    .withMessage('School ID must be a valid UUID'),

  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('School name cannot be empty')
    .isLength({ min: 3, max: 255 })
    .withMessage('School name must be between 3 and 255 characters'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Phone must be a valid international format'),

  body('website')
    .optional()
    .isURL()
    .withMessage('Must be a valid URL'),

  validate,
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('School ID must be a valid UUID'),
  validate,
];

// Key param validation
const keyValidation = [
  param('key')
    .trim()
    .notEmpty()
    .withMessage('School key is required')
    .isLength({ min: 6, max: 10 })
    .withMessage('School key must be between 6 and 10 characters'),
  validate,
];

/**
 * @route   POST /api/schools
 * @desc    Create a new school
 * @access  Admin only (teachers, students, parents cannot create schools)
 */
router.post('/',
  authenticate,
  authorize('admin'),
  createSchoolValidation,
  schoolController.createSchool
);

/**
 * @route   GET /api/schools
 * @desc    Get all schools (filtered by user access)
 * @access  Authenticated
 */
router.get('/',
  authenticate,
  schoolController.getSchools
);

/**
 * @route   GET /api/schools/stats
 * @desc    Get statistics for the current school (uses X-School-Id header)
 * @access  Authenticated + School Access
 */
router.get('/stats',
  authenticate,
  requireSchool,
  schoolController.getSchoolStats
);

/**
 * @route   GET /api/schools/lookup/:key
 * @desc    Look up a school by its key (for joining)
 * @access  Public (limited info)
 */
router.get('/lookup/:key',
  keyValidation,
  schoolController.getSchoolByKey
);

/**
 * @route   GET /api/schools/:id
 * @desc    Get a specific school by ID
 * @access  Authenticated
 */
router.get('/:id',
  authenticate,
  idValidation,
  schoolController.getSchoolById
);

/**
 * @route   GET /api/schools/:id/stats
 * @desc    Get statistics for a school
 * @access  Authenticated + School Access
 */
router.get('/:id/stats',
  authenticate,
  requireSchool,
  schoolController.getSchoolStats
);

/**
 * @route   PUT /api/schools/:id
 * @desc    Update a school
 * @access  Admin only
 */
router.put('/:id',
  authenticate,
  authorize('admin'),
  updateSchoolValidation,
  schoolController.updateSchool
);

/**
 * @route   DELETE /api/schools/:id
 * @desc    Delete a school (only if no dependencies)
 * @access  Super Admin only
 */
router.delete('/:id',
  authenticate,
  authorize('admin'),
  idValidation,
  schoolController.deleteSchool
);

export default router;
