const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ProfileModel = require('./user.model');
const { supabase } = require('../../config/database');

// Multer config for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const isAllowed = allowedTypes.test(path.extname(file.originalname).toLowerCase()) &&
    allowedTypes.test(file.mimetype.split('/')[1]);
  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter
});

// GET /api/v1/users/profile
const getProfile = async (req, res, next) => {
  try {
    let profile = await ProfileModel.findProfileByUserId(req.user.id);

    if (!profile) {
      profile = await ProfileModel.createProfile(req.user.id);
    }

    // Fetch enrolled and completed courses via enrollments table
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id, courses(id, title, thumbnail, category, level)')
      .eq('user_id', req.user.id);

    const { data: completedLessons } = await supabase
      .from('lesson_progress')
      .select('course_id')
      .eq('user_id', req.user.id)
      .eq('completed', true);

    res.status(200).json({
      success: true,
      data: {
        user: req.user,
        profile,
        enrolledCourses: (enrollments || []).map(e => e.courses).filter(Boolean),
        completedCourseIds: [...new Set((completedLessons || []).map(l => l.course_id))]
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/users/profile
const updateProfile = async (req, res, next) => {
  try {
    const { name, bio, skills, social_links, phone, location, job_title } = req.body;

    // Update user name if provided
    if (name) {
      await ProfileModel.updateUser(req.user.id, { name });
    }

    const profileUpdates = {};
    if (bio !== undefined) profileUpdates.bio = bio;
    if (skills !== undefined) {
      profileUpdates.skills = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim());
    }
    if (social_links !== undefined) profileUpdates.social_links = social_links;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (location !== undefined) profileUpdates.location = location;
    if (job_title !== undefined) profileUpdates.job_title = job_title;

    const profile = await ProfileModel.upsertProfile(req.user.id, profileUpdates);
    const updatedUser = await ProfileModel.findUserById(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user: updatedUser, profile }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/users/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Enrolled courses count
    const { count: enrolledCoursesCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Completed lessons grouped by course
    const { data: completedProgress } = await supabase
      .from('lesson_progress')
      .select('course_id')
      .eq('user_id', userId)
      .eq('completed', true);

    const completedCourseIds = new Set((completedProgress || []).map(p => p.course_id));
    const completedCoursesCount = completedCourseIds.size;

    // Assignments pending for student
    let pendingAssignments = 0;
    if (req.user.role === 'student') {
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('user_id', userId);

      const courseIds = (enrollments || []).map(e => e.course_id);

      if (courseIds.length > 0) {
        const { data: allAssignments } = await supabase
          .from('assignments')
          .select('id, due_date')
          .in('course_id', courseIds)
          .gt('due_date', new Date().toISOString());

        const assignmentIds = (allAssignments || []).map(a => a.id);

        if (assignmentIds.length > 0) {
          const { data: submitted } = await supabase
            .from('submissions')
            .select('assignment_id')
            .eq('user_id', userId)
            .in('assignment_id', assignmentIds);

          const submittedIds = new Set((submitted || []).map(s => s.assignment_id));
          pendingAssignments = assignmentIds.filter(id => !submittedIds.has(id)).length;
        }
      }
    }

    // For instructors: courses created and total enrollments
    let coursesCreated = 0;
    let totalEnrollments = 0;
    if (req.user.role === 'instructor') {
      const { data: instructorCourses } = await supabase
        .from('courses')
        .select('id')
        .eq('instructor_id', userId);

      coursesCreated = (instructorCourses || []).length;

      if (coursesCreated > 0) {
        const instructorCourseIds = instructorCourses.map(c => c.id);
        const { count } = await supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .in('course_id', instructorCourseIds);
        totalEnrollments = count || 0;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        user: req.user,
        stats: {
          enrolledCourses: enrolledCoursesCount || 0,
          completedCourses: completedCoursesCount,
          pendingAssignments,
          ...(req.user.role === 'instructor' && { coursesCreated, totalEnrollments })
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/users/avatar
const uploadAvatar = [
  upload.single('avatar'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;

      // Delete old avatar if exists
      const existingProfile = await ProfileModel.findProfileByUserId(req.user.id);
      if (existingProfile && existingProfile.avatar) {
        const oldPath = path.join(__dirname, '../..', existingProfile.avatar);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const profile = await ProfileModel.upsertProfile(req.user.id, { avatar: avatarUrl });

      res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully.',
        data: { avatar: avatarUrl, profile }
      });
    } catch (error) {
      next(error);
    }
  }
];

module.exports = { getProfile, updateProfile, getDashboard, uploadAvatar };
