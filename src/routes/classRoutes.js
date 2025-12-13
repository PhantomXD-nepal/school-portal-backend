import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as classController from '../controllers/classController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

/**
 * Validation middleware
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
      example: {
        name: 'Grade 10-A',
        grade: '10',
        section: 'A',
        capacity: 40,
        room_number: '101',
        academic_year: '2024-2025',
        status: 'active'
      }
    });
  }

  next();
};

// Validation for creating class
const createClassValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Class name is required')
    .isLength({ max: 100 })
    .withMessage('Class name must not exceed 100 characters'),

  body('grade')
    .trim()
    .notEmpty()
    .withMessage('Grade is required')
    .isLength({ max: 20 })
    .withMessage('Grade must not exceed 20 characters'),

  body('section')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Section must not exceed 10 characters'),

  body('capacity')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Capacity must be a number between 1 and 1000'),

  body('room_number')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Room number must not exceed 50 characters'),

  body('academic_year')
    .optional()
    .trim()
    .matches(/^\d{4}-\d{4}$/)
    .withMessage('Academic year must be in format YYYY-YYYY (e.g., 2024-2025)'),

  body('status')
    .optional()
    .isIn(['active', 'inactive', 'archived'])
    .withMessage('Status must be one of: active, inactive, archived'),

  validate
];

// Validation for updating class
const updateClassValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  ...createClassValidation.slice(0, -1),
  validate
];

// Validation for enrolling student
const enrollStudentValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  body('student_id')
    .notEmpty()
    .withMessage('student_id is required')
    .isUUID()
    .withMessage('student_id must be a valid UUID'),

  validate
];

// Validation for removing student
const removeStudentValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  param('studentId')
    .isUUID()
    .withMessage('Student ID must be a valid UUID'),

  validate
];

// Query validation
const queryValidation = [
  query('grade')
    .optional()
    .trim(),

  query('section')
    .optional()
    .trim(),

  validate
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  validate
];

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/', queryValidation, classController.getClasses);
router.get('/:id', idValidation, classController.getClassById);
router.post('/', authorize('admin'), createClassValidation, classController.createClass);
router.put('/:id', authorize('admin'), updateClassValidation, classController.updateClass);
router.post('/:id/enroll', authorize('admin', 'teacher'), enrollStudentValidation, classController.enrollStudent);
router.delete('/:id/students/:studentId', authorize('admin', 'teacher'), removeStudentValidation, classController.removeStudent);

export default router;
