const express = require('express');
const { protect } = require('../../middleware/auth');
const {
  getNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  getUnreadCount
} = require('./notification.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET  /api/v1/notifications/unread-count
router.get('/unread-count', getUnreadCount);

// GET  /api/v1/notifications
router.get('/', getNotifications);

// PUT  /api/v1/notifications/read-all
router.put('/read-all', markAllRead);

// PUT  /api/v1/notifications/:id/read
router.put('/:id/read', markAsRead);

// DELETE /api/v1/notifications/:id
router.delete('/:id', deleteNotification);

module.exports = router;
