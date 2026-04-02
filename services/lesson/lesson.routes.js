const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  createLesson,
  getLessonsByCourse,
  getLessonById,
  updateLesson,
  deleteLesson,
  markComplete,
  getProgress,
  getCourseProgress
} = require('./lesson.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/v1/lessons/progress/:courseId
router.get('/progress/:courseId', getCourseProgress);

// Routes scoped to a course
// GET  /api/v1/lessons/courses/:courseId/lessons
router.get('/courses/:courseId/lessons', getLessonsByCourse);

// POST /api/v1/lessons/courses/:courseId/lessons
router.post('/courses/:courseId/lessons', authorize('instructor', 'admin'), createLesson);

// GET  /api/v1/lessons/courses/:courseId/lessons/:id
router.get('/courses/:courseId/lessons/:id', getLessonById);

// PUT  /api/v1/lessons/courses/:courseId/lessons/:id
router.put('/courses/:courseId/lessons/:id', authorize('instructor', 'admin'), updateLesson);

// DELETE /api/v1/lessons/courses/:courseId/lessons/:id
router.delete('/courses/:courseId/lessons/:id', authorize('instructor', 'admin'), deleteLesson);

// POST /api/v1/lessons/courses/:courseId/lessons/:id/complete
router.post('/courses/:courseId/lessons/:id/complete', markComplete);

// GET  /api/v1/lessons/courses/:courseId/lessons/:id/progress
router.get('/courses/:courseId/lessons/:id/progress', getProgress);

module.exports = router;
