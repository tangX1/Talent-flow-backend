const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  enrollCourse,
  unenrollCourse,
  getEnrolledStudents
} = require('./course.controller');

const router = express.Router();

// GET  /api/v1/courses — public (filters published only for unauthenticated)
router.get('/', (req, res, next) => {
  // Attach optional user if token present, but don't block
  const authMiddleware = require('../../middleware/auth');
  const jwt = require('jsonwebtoken');
  const User = require('../auth/auth.model');
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      User.findById(decoded.id).select('-password').then(user => {
        if (user) req.user = user;
        next();
      }).catch(() => next());
    } catch {
      next();
    }
  } else {
    next();
  }
}, getCourses);

// GET  /api/v1/courses/:id — public with optional auth
router.get('/:id', (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const User = require('../auth/auth.model');
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      User.findById(decoded.id).select('-password').then(user => {
        if (user) req.user = user;
        next();
      }).catch(() => next());
    } catch {
      next();
    }
  } else {
    next();
  }
}, getCourseById);

// Protected routes
router.use(protect);

// POST /api/v1/courses
router.post('/', authorize('instructor', 'admin'), createCourse);

// PUT  /api/v1/courses/:id
router.put('/:id', authorize('instructor', 'admin'), updateCourse);

// DELETE /api/v1/courses/:id
router.delete('/:id', authorize('instructor', 'admin'), deleteCourse);

// POST /api/v1/courses/:id/enroll
router.post('/:id/enroll', authorize('student', 'instructor', 'admin'), enrollCourse);

// DELETE /api/v1/courses/:id/unenroll
router.delete('/:id/unenroll', authorize('student', 'instructor', 'admin'), unenrollCourse);

// GET  /api/v1/courses/:id/students
router.get('/:id/students', authorize('instructor', 'admin'), getEnrolledStudents);

module.exports = router;
