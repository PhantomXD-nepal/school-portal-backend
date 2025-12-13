import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as gradeController from '../controllers/gradeController.js';
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
        student_id: 'uuid-here',
        class_id: 'uuid-here',
        subject: 'Mathematics',
        assessment_type: 'midterm',
        score: 85,
        max_score: 100,
        grade: 'A',
        comments: 'Excellent work',
        assessment_date: '2024-12-01'
      }
    });
  }

  next();
};

// Validation for posting grade
const postGradeValidation = [
  body('student_id')
    .notEmpty()
    .withMessage('student_id is required')
    .isUUID()
    .withMessage('student_id must be a valid UUID'),

  body('class_id')
    .notEmpty()
    .withMessage('class_id is required')
    .isUUID()
    .withMessage('class_id must be a valid UUID'),

  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ max: 100 })
    .withMessage('Subject must not exceed 100 characters'),

  body('assessment_type')
    .optional()
    .isIn(['assignment', 'quiz', 'midterm', 'final', 'project', 'practical'])
    .withMessage('assessment_type must be one of: assignment, quiz, midterm, final, project, practical'),

  body('score')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Score must be a positive number'),

  body('max_score')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Max score must be a positive number'),

  body('percentage')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Percentage must be between 0 and 100'),

  body('grade')
    .optional()
    .trim()
    .isLength({ max: 5 })
    .withMessage('Grade must not exceed 5 characters'),

  body('comments')
    .optional()
    .trim(),

  body('assessment_date')
    .optional()
    .isISO8601()
    .withMessage('Assessment date must be a valid date (YYYY-MM-DD)'),

  validate
];

// Validation for updating grade
const updateGradeValidation = [
  param('id')
    .isUUID()
    .withMessage('Grade ID must be a valid UUID'),

  ...postGradeValidation.slice(0, -1),
  validate
];

// Validation for bulk upload
const bulkUploadValidation = [
  body('grades')
    .isArray({ min: 1 })
    .withMessage('grades must be an array with at least one grade'),

  body('grades.*.student_id')
    .notEmpty()
    .withMessage('Each grade must have a student_id')
    .isUUID()
    .withMessage('student_id must be a valid UUID'),

  body('grades.*.class_id')
    .notEmpty()
    .withMessage('Each grade must have a class_id')
    .isUUID()
    .withMessage('class_id must be a valid UUID'),

  body('grades.*.subject')
    .trim()
    .notEmpty()
    .withMessage('Each grade must have a subject'),

  validate
];

// Query validation
const queryValidation = [
  query('student_id')
    .optional()
    .isUUID()
    .withMessage('student_id must be a valid UUID'),

  query('class_id')
    .optional()
    .isUUID()
    .withMessage('class_id must be a valid UUID'),

  query('subject')
    .optional()
    .trim(),

  validate
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Grade ID must be a valid UUID'),

  validate
];

// Student ID param validation
const studentIdValidation = [
  param('studentId')
    .isUUID()
    .withMessage('Student ID must be a valid UUID'),

  validate
];

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/', queryValidation, gradeController.getGrades);
router.get('/student/:studentId', studentIdValidation, gradeController.getStudentGrades);
router.post('/', authorize('admin', 'teacher'), postGradeValidation, gradeController.postGrade);
router.put('/:id', authorize('admin', 'teacher'), updateGradeValidation, gradeController.updateGrade);
router.delete('/:id', authorize('admin', 'teacher'), idValidation, gradeController.deleteGrade);
router.post('/bulk-upload', authorize('admin', 'teacher'), bulkUploadValidation, gradeController.bulkUploadGrades);

export default router;
