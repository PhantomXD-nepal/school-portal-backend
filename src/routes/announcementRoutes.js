import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import * as announcementController from '../controllers/announcementController.js';
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
        title: 'School Holiday Notice',
        content: 'School will be closed on Friday for maintenance.',
        type: 'general',
        target_role: 'all',
        target_class_id: 'uuid-here', // optional
        scheduled_for: '2024-12-10T09:00:00Z', // optional
        status: 'published'
      }
    });
  }

  next();
};

// Validation for creating announcement
const createAnnouncementValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 255 })
    .withMessage('Title must not exceed 255 characters'),

  body('content')
    .trim()
    .notEmpty()
    .withMessage('Content is required'),

  body('type')
    .optional()
    .isIn(['general', 'urgent', 'event', 'holiday', 'exam', 'meeting'])
    .withMessage('Type must be one of: general, urgent, event, holiday, exam, meeting'),

  body('target_role')
    .optional()
    .isIn(['all', 'student', 'teacher', 'parent', 'admin', 'finance'])
    .withMessage('target_role must be one of: all, student, teacher, parent, admin, finance'),

  body('target_class_id')
    .optional()
    .isUUID()
    .withMessage('target_class_id must be a valid UUID'),

  body('scheduled_for')
    .optional()
    .isISO8601()
    .withMessage('scheduled_for must be a valid ISO 8601 date'),

  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be one of: draft, published, archived'),

  body('attachment_url')
    .optional()
    .trim()
    .isURL()
    .withMessage('attachment_url must be a valid URL'),

  validate
];

// Validation for updating announcement
const updateAnnouncementValidation = [
  param('id')
    .isUUID()
    .withMessage('Announcement ID must be a valid UUID'),

  ...createAnnouncementValidation.slice(0, -1),
  validate
];

// Query validation
const queryValidation = [
  query('type')
    .optional()
    .isIn(['general', 'urgent', 'event', 'holiday', 'exam', 'meeting'])
    .withMessage('type must be one of: general, urgent, event, holiday, exam, meeting'),

  query('target_role')
    .optional()
    .isIn(['all', 'student', 'teacher', 'parent', 'admin', 'finance'])
    .withMessage('target_role must be one of: all, student, teacher, parent, admin, finance'),

  validate
];

// ID param validation
const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Announcement ID must be a valid UUID'),

  validate
];

// All routes require authentication
router.use(authenticate);

// Routes
router.get('/', queryValidation, announcementController.getAnnouncements);
router.get('/:id', idValidation, announcementController.getAnnouncementById);
router.post('/', authorize('admin', 'teacher'), createAnnouncementValidation, announcementController.createAnnouncement);
router.put('/:id', authorize('admin', 'teacher'), updateAnnouncementValidation, announcementController.updateAnnouncement);
router.delete('/:id', authorize('admin', 'teacher'), idValidation, announcementController.deleteAnnouncement);
router.post('/:id/read', idValidation, announcementController.markAsRead);

export default router;
