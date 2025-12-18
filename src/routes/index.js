import express from 'express';
import authRoutes from './authRoutes.js';
import studentRoutes from './studentRoutes.js';
import teacherRoutes from './teacherRoutes.js';
import classRoutes from './classRoutes.js';
import gradeRoutes from './gradeRoutes.js';
import announcementRoutes from './announcementRoutes.js';
import aiRoutes from './aiRoutes.js';
import eventRoutes from './eventRoutes.js';

import schoolRoutes from './schoolRoutes.js';

import parentRoutes from './parentRoutes.js';

import adminRoutes from './adminRoutes.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/schools', schoolRoutes);
router.use('/parents', parentRoutes);
router.use('/students', studentRoutes);
router.use('/teachers', teacherRoutes);
router.use('/classes', classRoutes);
router.use('/grades', gradeRoutes);
router.use('/announcements', announcementRoutes);
router.use('/ai', aiRoutes);
router.use('/events', eventRoutes);

export default router;
