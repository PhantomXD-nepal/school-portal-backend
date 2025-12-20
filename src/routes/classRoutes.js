import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as classController from '../controllers/classController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireSchool, injectSchoolId } from '../middleware/schoolValidator.js';

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

// =====================
// VALIDATION RULES
// =====================

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

  body('teacher_id')
    .optional()
    .isUUID()
    .withMessage('Teacher ID must be a valid UUID'),

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

// Validation for bulk enrolling students
const bulkEnrollValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  body('student_ids')
    .isArray({ min: 1 })
    .withMessage('student_ids must be a non-empty array'),

  body('student_ids.*')
    .isUUID()
    .withMessage('Each student ID must be a valid UUID'),

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

// Validation for assigning teacher
const assignTeacherValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  body('teacher_id')
    .notEmpty()
    .withMessage('teacher_id is required')
    .isUUID()
    .withMessage('teacher_id must be a valid UUID'),

  body('is_primary')
    .optional()
    .isBoolean()
    .withMessage('is_primary must be a boolean'),

  validate
];

// Syllabus validation
const createSyllabusValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  body('title')
    .trim()
    .notEmpty()
    .withMessage('Chapter title is required')
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),

  body('description')
    .optional()
    .trim(),

  body('chapter_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Chapter order must be a non-negative integer'),

  validate
];

const updateSyllabusValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  param('chapterId')
    .isUUID()
    .withMessage('Chapter ID must be a valid UUID'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must not exceed 200 characters'),

  body('description')
    .optional()
    .trim(),

  body('chapter_order')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Chapter order must be a non-negative integer'),

  validate
];

// Attendance validation
const attendanceQueryValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  query('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid date (YYYY-MM-DD)'),

  validate
];

const markAttendanceValidation = [
  param('id')
    .isUUID()
    .withMessage('Class ID must be a valid UUID'),

  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid date (YYYY-MM-DD)'),

  body('records')
    .isArray({ min: 1 })
    .withMessage('records must be a non-empty array'),

  body('records.*.student_id')
    .isUUID()
    .withMessage('Each student_id must be a valid UUID'),

  body('records.*.status')
    .isIn(['present', 'absent', 'late', 'excused'])
    .withMessage('Status must be one of: present, absent, late, excused'),

  body('records.*.notes')
    .optional()
    .trim(),

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

// =====================
// MIDDLEWARE CHAIN
// =====================

// All routes require authentication and school context
router.use(authenticate);
router.use(requireSchool);

// =====================
// CLASS ROUTES
// =====================

// Get all classes (filtered by role)
router.get('/', queryValidation, classController.getClasses);

// Get class by ID
router.get('/:id', idValidation, classController.getClassById);

// Create new class (admin only)
router.post('/', authorize('admin'), injectSchoolId, createClassValidation, classController.createClass);

// Update class (admin only)
router.put('/:id', authorize('admin'), updateClassValidation, classController.updateClass);

// Assign teacher to class (admin only)
router.post('/:id/assign-teacher', authorize('admin'), assignTeacherValidation, classController.assignTeacher);

// =====================
// STUDENT ENROLLMENT ROUTES
// =====================

// Enroll single student (admin or teacher)
router.post('/:id/enroll', authorize('admin', 'teacher'), enrollStudentValidation, classController.enrollStudent);

// Bulk enroll students (admin only)
router.post('/:id/enroll-bulk', authorize('admin'), bulkEnrollValidation, classController.bulkEnrollStudents);

// Remove student from class (admin or teacher)
router.delete('/:id/students/:studentId', authorize('admin', 'teacher'), removeStudentValidation, classController.removeStudent);

// =====================
// SYLLABUS ROUTES
// =====================

// Get syllabus for a class (admin or teacher)
router.get('/:id/syllabus', authorize('admin', 'teacher'), idValidation, classController.getSyllabus);

// Create syllabus item (teacher only - must be assigned to class)
router.post('/:id/syllabus', authorize('teacher'), createSyllabusValidation, classController.createSyllabusItem);

// Update syllabus item (teacher only)
router.put('/:id/syllabus/:chapterId', authorize('teacher'), updateSyllabusValidation, classController.updateSyllabusItem);

// Mark chapter as complete (teacher only)
router.post('/:id/syllabus/:chapterId/complete', authorize('teacher'), [
  param('id').isUUID().withMessage('Class ID must be a valid UUID'),
  param('chapterId').isUUID().withMessage('Chapter ID must be a valid UUID'),
  body('is_completed').optional().isBoolean(),
  validate
], classController.markChapterComplete);

// Delete syllabus item (teacher only)
router.delete('/:id/syllabus/:chapterId', authorize('teacher'), [
  param('id').isUUID().withMessage('Class ID must be a valid UUID'),
  param('chapterId').isUUID().withMessage('Chapter ID must be a valid UUID'),
  validate
], classController.deleteSyllabusItem);

// =====================
// ATTENDANCE ROUTES
// =====================

// Get attendance for a class (admin or teacher)
router.get('/:id/attendance', authorize('admin', 'teacher'), attendanceQueryValidation, classController.getAttendance);

// Mark attendance (teacher only - must be assigned to class)
router.post('/:id/attendance', authorize('teacher'), markAttendanceValidation, classController.markAttendance);

export default router;
