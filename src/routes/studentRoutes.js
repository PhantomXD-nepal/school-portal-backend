import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as studentController from '../controllers/studentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool, injectSchoolId } from '../middleware/schoolValidator.js';
import { ApiError, formatValidationErrors } from '../utils/apiError.js';

const router = express.Router();

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors.array());
    throw new ApiError(400, 'Validation failed. Please check your input', formattedErrors, 'VALIDATION_ERROR');
  }
  next();
};

// Validation for creating student
const createStudentValidation = [
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
    .optional()
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),

  body('grade')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Grade must not exceed 20 characters'),

  body('section')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Section must not exceed 10 characters'),

  body('roll_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Roll number must not exceed 50 characters'),

  body('date_of_birth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date (YYYY-MM-DD)'),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be one of: male, female, other'),

  body('admission_date')
    .optional()
    .isISO8601()
    .withMessage('Admission date must be a valid date (YYYY-MM-DD)'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'graduated', 'transferred'])
    .withMessage('Status must be one of: active, inactive, graduated, transferred'),

  body('emergency_contact')
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Emergency contact must be a valid international phone format'),

  validate,
];

// Validation for updating student
const updateStudentValidation = [
  param('id')
    .isUUID()
    .withMessage('Student ID must be a valid UUID'),

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

  body('grade')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Grade must not exceed 20 characters'),

  body('section')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Section must not exceed 10 characters'),

  body('roll_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Roll number must not exceed 50 characters'),

  body('date_of_birth')
    .optional()
    .isISO8601()
    .withMessage('Date of birth must be a valid date (YYYY-MM-DD)'),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be one of: male, female, other'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'graduated', 'transferred'])
    .withMessage('Status must be one of: active, inactive, graduated, transferred'),

  validate,
];

// Validation for bulk import
const bulkImportValidation = [
  body('students')
    .isArray({ min: 1, max: 100 })
    .withMessage('Students must be an array with 1-100 students'),

  body('students.*.first_name')
    .trim()
    .notEmpty()
    .withMessage('Each student must have a first_name'),

  body('students.*.last_name')
    .trim()
    .notEmpty()
    .withMessage('Each student must have a last_name'),

  validate,
];

// Query validation
const queryValidation = [
  query('grade').optional().trim(),
  query('section').optional().trim(),
  query('class_id')
    .optional()
    .isUUID()
    .withMessage('class_id must be a valid UUID'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'graduated', 'transferred'])
    .withMessage('status must be one of: active, inactive, graduated, transferred'),
  query('search').optional().trim(),
  validate,
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Student ID must be a valid UUID'),
  validate,
];

/**
 * @route   GET /api/students
 * @desc    Get all students for the current school
 * @access  Authenticated + School Required
 */
router.get('/',
  authenticate,
  requireSchool,
  queryValidation,
  studentController.getStudents
);

/**
 * @route   GET /api/students/:id
 * @desc    Get a specific student by ID
 * @access  Authenticated + School Required
 */
router.get('/:id',
  authenticate,
  requireSchool,
  idValidation,
  studentController.getStudentById
);

/**
 * @route   POST /api/students
 * @desc    Create a new student
 * @access  Admin/Teacher + School Required
 */
router.post('/',
  authenticate,
  authorize('admin', 'teacher', 'parent'),
  requireSchool,
  injectSchoolId,
  createStudentValidation,
  studentController.createStudent
);

/**
 * @route   PUT /api/students/:id
 * @desc    Update a student
 * @access  Admin/Teacher + School Required
 */
router.put('/:id',
  authenticate,
  authorize('admin', 'teacher'),
  requireSchool,
  updateStudentValidation,
  studentController.updateStudent
);

/**
 * @route   DELETE /api/students/:id
 * @desc    Delete/Deactivate a student
 * @access  Admin only + School Required
 */
router.delete('/:id',
  authenticate,
  authorize('admin'),
  requireSchool,
  idValidation,
  studentController.deleteStudent
);

/**
 * @route   POST /api/students/bulk
 * @desc    Bulk import students
 * @access  Admin only + School Required
 */
router.post('/bulk',
  authenticate,
  authorize('admin'),
  requireSchool,
  injectSchoolId,
  bulkImportValidation,
  studentController.bulkImportStudents
);

export default router;
