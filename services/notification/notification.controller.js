const NotificationModel = require('./notification.model');

// Helper: Create a notification (exported for use by other services)
const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    const notification = await NotificationModel.create({
      user_id: userId,
      type,
      title,
      message,
      is_read: false,
      data
    });
    return notification;
  } catch (error) {
    console.error('createNotification error:', error.message);
    return null;
  }
};

// GET /api/v1/notifications
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, isRead } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (isRead !== undefined) filters.is_read = isRead === 'true';

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [{ data: notifications, count }, unreadCount] = await Promise.all([
      NotificationModel.findByUser(req.user.id, filters, { skip, limit: limitNum }),
      NotificationModel.countUnread(req.user.id)
    ]);

    const total = count || 0;

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/notifications/:id/read
const markAsRead = async (req, res, next) => {
  try {
    const notification = await NotificationModel.findByIdAndUser(req.params.id, req.user.id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    let updated = notification;
    if (!notification.is_read) {
      updated = await NotificationModel.update(notification.id, {
        is_read: true,
        read_at: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: { notification: updated }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/notifications/read-all
const markAllRead = async (req, res, next) => {
  try {
    const modifiedCount = await NotificationModel.markAllReadForUser(req.user.id);

    res.status(200).json({
      success: true,
      message: `Marked ${modifiedCount} notification(s) as read.`,
      data: { modifiedCount }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await NotificationModel.findByIdAndUser(req.params.id, req.user.id);

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    await NotificationModel.remove(req.params.id, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted.'
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/notifications/unread-count
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await NotificationModel.countUnread(req.user.id);

    res.status(200).json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  getUnreadCount,
  createNotification
};
