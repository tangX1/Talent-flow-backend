const express = require('express');
const { protect, authorize } = require('../../middleware/auth');
const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeSubmission,
  getSubmissions,
  getMySubmission
} = require('./assignment.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/v1/assignments
router.get('/', getAssignments);

// POST /api/v1/assignments
router.post('/', authorize('instructor', 'admin'), createAssignment);

// GET  /api/v1/assignments/:id
router.get('/:id', getAssignmentById);

// PUT  /api/v1/assignments/:id
router.put('/:id', authorize('instructor', 'admin'), updateAssignment);

// DELETE /api/v1/assignments/:id
router.delete('/:id', authorize('instructor', 'admin'), deleteAssignment);

// POST /api/v1/assignments/:id/submit
router.post('/:id/submit', authorize('student'), submitAssignment);

// GET  /api/v1/assignments/:id/submissions
router.get('/:id/submissions', authorize('instructor', 'admin'), getSubmissions);

// GET  /api/v1/assignments/:id/my-submission
router.get('/:id/my-submission', authorize('student'), getMySubmission);

// PUT  /api/v1/assignments/:id/submissions/:submissionId/grade
router.put('/:id/submissions/:submissionId/grade', authorize('instructor', 'admin'), gradeSubmission);

module.exports = router;
