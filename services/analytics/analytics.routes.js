const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  getAuditLogs,
  getDashboardStats,
  getUserActivityReport,
  getCourseAnalytics,
  exportReport
} = require('./analytics.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/v1/analytics/audit-logs — Admin only
router.get('/audit-logs', authorize('admin'), getAuditLogs);

// GET /api/v1/analytics/stats — Admin only
router.get('/stats', authorize('admin'), getDashboardStats);

// GET /api/v1/analytics/export — Admin only
router.get('/export', authorize('admin'), exportReport);

// GET /api/v1/analytics/users/:userId/activity — Admin or self
router.get('/users/:userId/activity', getUserActivityReport);

// GET /api/v1/analytics/courses/:courseId — Admin or course instructor
router.get('/courses/:courseId', getCourseAnalytics);

module.exports = router;
