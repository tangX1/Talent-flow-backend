const LessonModel = require('./lesson.model');
const CourseModel = require('../course/course.model');
const { supabase } = require('../../config/database');
const { createNotification } = require('../notification/notification.controller');
const { logAction } = require('../analytics/analytics.controller');

// POST /api/v1/lessons/courses/:courseId/lessons
const createLesson = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const { title, content, video_url, duration, order, resources, is_published, type } = req.body;

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You are not authorized to add lessons to this course.' });
    }

    if (!title) {
      return res.status(400).json({ success: false, message: 'Lesson title is required.' });
    }

    let lessonOrder = order ? parseInt(order) : null;
    if (!lessonOrder) {
      const lastOrder = await LessonModel.findLastOrder(courseId);
      lessonOrder = lastOrder + 1;
    }

    const lesson = await LessonModel.create({
      course_id: courseId,
      title,
      content: content || '',
      video_url: video_url || null,
      duration: parseFloat(duration) || 0,
      order_index: lessonOrder,
      resources: resources || [],
      is_published: is_published === true || is_published === 'true',
      type: type || 'video'
    });

    res.status(201).json({
      success: true,
      message: 'Lesson created successfully.',
      data: { lesson }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/lessons/courses/:courseId/lessons
const getLessonsByCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (req.user.role === 'student') {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (!enrollment && course.instructor_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'You must be enrolled in this course to view lessons.' });
      }
    }

    const onlyPublished = req.user.role === 'student';
    const lessons = await LessonModel.findByCourse(courseId, onlyPublished);

    const progressList = await LessonModel.findProgressByCourse(req.user.id, courseId);
    const progressMap = {};
    progressList.forEach(p => { progressMap[p.lesson_id] = p; });

    const lessonsWithProgress = lessons.map(l => ({
      ...l,
      progress: progressMap[l.id] || null
    }));

    res.status(200).json({
      success: true,
      data: { lessons: lessonsWithProgress, total: lessons.length }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/lessons/courses/:courseId/lessons/:id
const getLessonById = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;

    const lesson = await LessonModel.findOne({ id, course_id: courseId });
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (req.user.role === 'student') {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'You must be enrolled to access this lesson.' });
      }
    }

    // Update last accessed
    await LessonModel.upsertProgress(req.user.id, id, courseId, {
      last_accessed_at: new Date().toISOString()
    });

    const progress = await LessonModel.findProgress(req.user.id, id, courseId);

    res.status(200).json({
      success: true,
      data: { lesson, progress }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/lessons/courses/:courseId/lessons/:id
const updateLesson = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const allowed = ['title', 'content', 'video_url', 'duration', 'order_index', 'resources', 'is_published', 'type'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const lesson = await LessonModel.update(id, courseId, updates);

    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Lesson updated successfully.',
      data: { lesson }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/lessons/courses/:courseId/lessons/:id
const deleteLesson = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const lesson = await LessonModel.findOne({ id, course_id: courseId });
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    await LessonModel.remove(id, courseId);
    await LessonModel.deleteProgressByLesson(id);

    res.status(200).json({
      success: true,
      message: 'Lesson deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/lessons/courses/:courseId/lessons/:id/complete
const markComplete = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    const { watchTime } = req.body;

    const lesson = await LessonModel.findOne({ id, course_id: courseId });
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Lesson not found.' });
    }

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (req.user.role === 'student') {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (!enrollment) {
        return res.status(403).json({ success: false, message: 'You must be enrolled to mark lessons complete.' });
      }
    }

    const progressUpdates = {
      completed: true,
      completed_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString()
    };
    if (watchTime !== undefined) progressUpdates.watch_time = parseInt(watchTime);

    const progress = await LessonModel.upsertProgress(req.user.id, id, courseId, progressUpdates);

    const publishedCount = await LessonModel.countPublished(courseId);
    const completedCount = await LessonModel.countCompleted(req.user.id, courseId);

    const courseCompleted = publishedCount > 0 && completedCount >= publishedCount;

    if (courseCompleted) {
      try {
        const certificateController = require('../certificate/certificate.controller');
        await certificateController.generateCertificateInternal(req.user.id, courseId);
      } catch (certErr) {
        console.error('Certificate generation error:', certErr.message);
      }

      createNotification(
        req.user.id,
        'course_completed',
        'Course Completed!',
        `Congratulations! You have completed "${course.title}". Your certificate is ready.`,
        { courseId }
      ).catch(err => console.error('Notification error:', err.message));
    }

    await logAction(req.user.id, 'LESSON_COMPLETE', 'Lesson', id, { courseId, courseCompleted });

    res.status(200).json({
      success: true,
      message: 'Lesson marked as complete.',
      data: {
        progress,
        courseCompleted,
        completionPercentage: publishedCount > 0
          ? Math.round((completedCount / publishedCount) * 100)
          : 0
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/lessons/progress/:courseId
const getCourseProgress = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const publishedLessons = await LessonModel.findByCourse(courseId, true);
    const progressList = await LessonModel.findProgressByCourse(req.user.id, courseId);

    const progressMap = {};
    progressList.forEach(p => { progressMap[p.lesson_id] = p; });

    const lessonsProgress = publishedLessons.map(lesson => ({
      lessonId: lesson.id,
      title: lesson.title,
      order: lesson.order_index,
      duration: lesson.duration,
      completed: progressMap[lesson.id]?.completed || false,
      completedAt: progressMap[lesson.id]?.completed_at || null,
      watchTime: progressMap[lesson.id]?.watch_time || 0
    }));

    const completedCount = lessonsProgress.filter(l => l.completed).length;
    const totalLessons = publishedLessons.length;
    const completionPercentage = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
    const totalWatchTime = progressList.reduce((sum, p) => sum + (p.watch_time || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        courseId,
        courseTitle: course.title,
        totalLessons,
        completedLessons: completedCount,
        completionPercentage,
        totalWatchTime,
        lessons: lessonsProgress
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/lessons/courses/:courseId/lessons/:id/progress
const getProgress = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;

    const progress = await LessonModel.findProgress(req.user.id, id, courseId);

    res.status(200).json({
      success: true,
      data: {
        progress: progress || {
          completed: false,
          completed_at: null,
          watch_time: 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLesson,
  getLessonsByCourse,
  getLessonById,
  updateLesson,
  deleteLesson,
  markComplete,
  getProgress,
  getCourseProgress
};
