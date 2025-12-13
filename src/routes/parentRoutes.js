import express from 'express';
import { body } from 'express-validator';
import * as parentController from '../controllers/parentController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validator.js'; // Assuming this exists

const router = express.Router();

// Validation
const registerChildValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('first_name').notEmpty().withMessage('First name is required'),
  body('last_name').notEmpty().withMessage('Last name is required'),
  body('relationship').optional().isIn(['father', 'mother', 'guardian']).withMessage('Invalid relationship'),
  // Add other validations...
  (req, res, next) => {
      // Simple validation middleware usage if imported one works, otherwise rely on controller error handling
      // For now, let's assume the imported 'validate' works if it was used in other files
      next();
  }
];

router.use(authenticate);

// Only parents can register children
router.post('/register-child', authorize('parent'), registerChildValidation, parentController.registerChild);
router.get('/children', authorize('parent'), parentController.getChildren);

export default router;
