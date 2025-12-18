import express from 'express';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.js';
import eventController from '../controllers/eventController.js';

const router = express.Router();

// Validation rules
const eventValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('start_time').isISO8601().withMessage('Start time must be a valid ISO 8601 date'),
  body('end_time').isISO8601().withMessage('End time must be a valid ISO 8601 date'),
  body('type').optional().isIn(['general', 'academic', 'holiday', 'sports', 'exam']).withMessage('Invalid event type')
];

// Routes
// GET /api/events - Get all events (accessible to all authenticated users in the school)
router.get('/', authenticate, eventController.getEvents);

// POST /api/events - Create event (Admin only)
router.post('/', authenticate, authorize('admin'), eventValidation, eventController.createEvent);

// PUT /api/events/:id - Update event (Admin only)
router.put('/:id', authenticate, authorize('admin'), eventController.updateEvent);

// DELETE /api/events/:id - Delete event (Admin only)
router.delete('/:id', authenticate, authorize('admin'), eventController.deleteEvent);

export default router;
