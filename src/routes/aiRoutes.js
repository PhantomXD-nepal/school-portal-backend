import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import * as aiController from '../controllers/aiController.js';

const router = express.Router();

const generateValidation = [
    body('topic').trim().notEmpty().withMessage('Topic is required'),
    body('audience').optional().isString(),
    body('tone').optional().isString()
];

router.post('/generate', authenticate, generateValidation, aiController.generateContent);

export default router;
