import express from 'express';
import { body } from 'express-validator';
import * as adminController from '../controllers/adminController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js'; // Assuming this exists

const router = express.Router();

// Validation
const createUserValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'teacher', 'student', 'parent', 'finance']).withMessage('Invalid role'),
  body('first_name').notEmpty().withMessage('First name is required'),
  body('last_name').notEmpty().withMessage('Last name is required'),
  // Add other validations...
  (req, res, next) => {
      next();
  }
];

router.use(authenticate);

// Only admins can create users directly
router.post('/users', authorize('admin'), createUserValidation, adminController.createUser);

export default router;
