const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CourseModel = require('./course.model');
const { supabase } = require('../../config/database');
const { createNotification } = require('../notification/notification.controller');
const { logAction } = require('../analytics/analytics.controller');
const { sendCourseEnrollmentEmail } = require('../../utils/emailService');

// Multer config for course thumbnails
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/thumbnails');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `thumb_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed for thumbnails.'), false);
    }
  }
});

// POST /api/v1/courses
const createCourse = [
  upload.single('thumbnail'),
  async (req, res, next) => {
    try {
      const { title, description, category, level, price, tags, requirements, objectives, language } = req.body;

      if (!title || !description || !category) {
        return res.status(400).json({ success: false, message: 'Title, description, and category are required.' });
      }

      const courseData = {
        title,
        description,
        instructor_id: req.user.id,
        category,
        level: level || 'beginner',
        price: parseFloat(price) || 0,
        tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [],
        is_published: false
      };

      if (req.file) {
        courseData.thumbnail = `/uploads/thumbnails/${req.file.filename}`;
      }

      const course = await CourseModel.create(courseData);

      await logAction(req.user.id, 'CREATE_COURSE', 'Course', course.id, { title });

      res.status(201).json({
        success: true,
        message: 'Course created successfully.',
        data: { course }
      });
    } catch (error) {
      next(error);
    }
  }
];

// GET /api/v1/courses
const getCourses = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      level,
      search,
      instructor,
      minPrice,
      maxPrice,
      isPublished,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};

    if (!req.user || req.user.role === 'student') {
      filters.is_published = true;
    } else if (isPublished !== undefined) {
      filters.is_published = isPublished === 'true';
    }

    if (category) filters.category = category;
    if (level) filters.level = level;
    if (instructor) filters.instructor_id = instructor;
    if (minPrice !== undefined) filters.min_price = parseFloat(minPrice);
    if (maxPrice !== undefined) filters.max_price = parseFloat(maxPrice);
    if (search) filters.search = search;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Instructors see their own courses + published
    // Handled via two queries merged if needed; for simplicity use published filter for others
    if (req.user && req.user.role === 'instructor') {
      // Fetch instructor's own courses + published courses separately
      const [ownResult, publishedResult] = await Promise.all([
        supabase.from('courses').select('*', { count: 'exact' }).eq('instructor_id', req.user.id),
        supabase.from('courses').select('*', { count: 'exact' }).eq('is_published', true)
      ]);

      const ownIds = new Set((ownResult.data || []).map(c => c.id));
      const merged = [...(ownResult.data || [])];
      for (const c of (publishedResult.data || [])) {
        if (!ownIds.has(c.id)) merged.push(c);
      }

      // Apply remaining filters in JS
      let filtered = merged;
      if (filters.category) filtered = filtered.filter(c => c.category.toLowerCase().includes(filters.category.toLowerCase()));
      if (filters.level) filtered = filtered.filter(c => c.level === filters.level);
      if (filters.search) {
        const s = filters.search.toLowerCase();
        filtered = filtered.filter(c => c.title.toLowerCase().includes(s) || c.description.toLowerCase().includes(s));
      }

      filtered.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
      });

      const total = filtered.length;
      const courses = filtered.slice(skip, skip + limitNum);

      // Fetch instructor names
      const instructorIds = [...new Set(courses.map(c => c.instructor_id))];
      const { data: instructors } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', instructorIds);
      const instructorMap = {};
      (instructors || []).forEach(u => { instructorMap[u.id] = u; });
      const coursesWithInstructor = courses.map(c => ({ ...c, instructor: instructorMap[c.instructor_id] || null }));

      return res.status(200).json({
        success: true,
        data: {
          courses: coursesWithInstructor,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum < Math.ceil(total / limitNum),
            hasPrev: pageNum > 1
          }
        }
      });
    }

    const { data: courses, count } = await CourseModel.findAll(filters, {
      skip,
      limit: limitNum,
      orderBy: sortBy,
      ascending: sortOrder === 'asc'
    });

    const total = count || 0;

    // Fetch instructor names
    const instructorIds = [...new Set((courses || []).map(c => c.instructor_id))];
    let instructorMap = {};
    if (instructorIds.length > 0) {
      const { data: instructors } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', instructorIds);
      (instructors || []).forEach(u => { instructorMap[u.id] = u; });
    }
    const coursesWithInstructor = (courses || []).map(c => ({ ...c, instructor: instructorMap[c.instructor_id] || null }));

    res.status(200).json({
      success: true,
      data: {
        courses: coursesWithInstructor,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasNext: pageNum < Math.ceil(total / limitNum),
          hasPrev: pageNum > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/courses/:id
const getCourseById = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (!course.is_published) {
      if (!req.user || req.user.role === 'student' ||
        (req.user.role === 'instructor' && course.instructor_id !== req.user.id)) {
        return res.status(403).json({ success: false, message: 'This course is not yet published.' });
      }
    }

    // Fetch instructor
    const { data: instructor } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', course.instructor_id)
      .single();

    // Fetch lessons
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, title, order_index, duration, is_published')
      .eq('course_id', course.id)
      .order('order_index', { ascending: true });

    // Check enrollment
    let isEnrolled = false;
    if (req.user) {
      const { data: enrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('course_id', course.id)
        .maybeSingle();
      isEnrolled = !!enrollment;
    }

    // Enrollment count
    const { count: enrollmentCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id);

    res.status(200).json({
      success: true,
      data: {
        course: { ...course, instructor, lessons, enrollmentCount: enrollmentCount || 0 },
        isEnrolled
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/courses/:id
const updateCourse = [
  upload.single('thumbnail'),
  async (req, res, next) => {
    try {
      const course = await CourseModel.findById(req.params.id);

      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found.' });
      }

      if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'You are not authorized to update this course.' });
      }

      const allowed = ['title', 'description', 'category', 'level', 'price', 'tags', 'is_published'];
      const updates = {};
      allowed.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      if (updates.tags && !Array.isArray(updates.tags)) {
        updates.tags = updates.tags.split(',').map(t => t.trim());
      }
      if (updates.price !== undefined) updates.price = parseFloat(updates.price);
      if (updates.is_published !== undefined) updates.is_published = updates.is_published === 'true' || updates.is_published === true;

      if (req.file) {
        updates.thumbnail = `/uploads/thumbnails/${req.file.filename}`;
        if (course.thumbnail) {
          const oldPath = path.join(__dirname, '../..', course.thumbnail);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      const updatedCourse = await CourseModel.update(req.params.id, updates);

      // Fetch instructor for response
      const { data: instructor } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', updatedCourse.instructor_id)
        .single();

      await logAction(req.user.id, 'UPDATE_COURSE', 'Course', course.id, { updates: Object.keys(updates) });

      res.status(200).json({
        success: true,
        message: 'Course updated successfully.',
        data: { course: { ...updatedCourse, instructor } }
      });
    } catch (error) {
      next(error);
    }
  }
];

// DELETE /api/v1/courses/:id
const deleteCourse = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this course.' });
    }

    await CourseModel.remove(req.params.id);

    await logAction(req.user.id, 'DELETE_COURSE', 'Course', course.id, { title: course.title });

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/courses/:id/enroll
const enrollCourse = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (!course.is_published) {
      return res.status(400).json({ success: false, message: 'Cannot enroll in an unpublished course.' });
    }

    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('course_id', course.id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, message: 'You are already enrolled in this course.' });
    }

    await supabase.from('enrollments').insert({
      user_id: req.user.id,
      course_id: course.id,
      enrolled_at: new Date().toISOString()
    });

    createNotification(
      req.user.id,
      'course_enrolled',
      'Course Enrollment',
      `You have enrolled in "${course.title}"`,
      { courseId: course.id }
    ).catch(err => console.error('Notification error:', err.message));

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', req.user.id)
      .single();

    sendCourseEnrollmentEmail(user, course).catch(err => console.error('Email error:', err.message));

    await logAction(req.user.id, 'ENROLL_COURSE', 'Course', course.id, { courseTitle: course.title });

    res.status(200).json({
      success: true,
      message: `Successfully enrolled in "${course.title}".`,
      data: { course }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/v1/courses/:id/unenroll
const unenrollCourse = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('course_id', course.id)
      .maybeSingle();

    if (!existing) {
      return res.status(409).json({ success: false, message: 'You are not enrolled in this course.' });
    }

    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('user_id', req.user.id)
      .eq('course_id', course.id);

    if (error) return next(error);

    await logAction(req.user.id, 'UNENROLL_COURSE', 'Course', course.id, { courseTitle: course.title });

    res.status(200).json({
      success: true,
      message: `Successfully unenrolled from "${course.title}".`
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/courses/:id/students
const getEnrolledStudents = async (req, res, next) => {
  try {
    const course = await CourseModel.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { data: enrollments, error } = await supabase
      .from('enrollments')
      .select('user_id, enrolled_at, users(id, name, email, created_at)')
      .eq('course_id', course.id);

    if (error) return next(error);

    const students = (enrollments || []).map(e => ({ ...e.users, enrolled_at: e.enrolled_at }));

    res.status(200).json({
      success: true,
      data: {
        students,
        total: students.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCourse,
  getCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  enrollCourse,
  unenrollCourse,
  getEnrolledStudents
};
