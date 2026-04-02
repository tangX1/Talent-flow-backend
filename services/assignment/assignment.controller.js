const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AssignmentModel = require('./assignment.model');
const CourseModel = require('../course/course.model');
const { supabase } = require('../../config/database');
const { createNotification } = require('../notification/notification.controller');
const { logAction } = require('../analytics/analytics.controller');
const { sendAssignmentGradedEmail } = require('../../utils/emailService');

// Multer config for assignment attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/assignments');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
});

// POST /api/v1/assignments
const createAssignment = [
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      const { courseId, title, description, dueDate, maxScore, isPublished } = req.body;

      if (!courseId || !title || !description || !dueDate) {
        return res.status(400).json({ success: false, message: 'courseId, title, description, and dueDate are required.' });
      }

      const course = await CourseModel.findById(courseId);
      if (!course) {
        return res.status(404).json({ success: false, message: 'Course not found.' });
      }

      if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Only the course instructor can create assignments.' });
      }

      const attachments = (req.files || []).map(file => ({
        filename: file.originalname,
        url: `/uploads/assignments/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size
      }));

      const assignment = await AssignmentModel.create({
        course_id: courseId,
        title,
        description,
        due_date: new Date(dueDate).toISOString(),
        max_score: parseInt(maxScore) || 100,
        attachments,
        created_by: req.user.id,
        is_published: isPublished === 'true' || isPublished === true
      });

      await logAction(req.user.id, 'CREATE_ASSIGNMENT', 'Assignment', assignment.id, { courseId, title });

      res.status(201).json({
        success: true,
        message: 'Assignment created successfully.',
        data: { assignment }
      });
    } catch (error) {
      next(error);
    }
  }
];

// GET /api/v1/assignments?courseId=...
const getAssignments = async (req, res, next) => {
  try {
    const { courseId, page = 1, limit = 10, isPublished } = req.query;

    const filters = {};
    if (courseId) filters.course_id = courseId;

    if (req.user.role === 'student') {
      filters.is_published = true;
    } else if (isPublished !== undefined) {
      filters.is_published = isPublished === 'true';
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { data: assignments, count } = await AssignmentModel.findAll(filters, { skip, limit: limitNum });

    // Enrich with creator and course info
    const creatorIds = [...new Set((assignments || []).map(a => a.created_by))];
    const courseIds = [...new Set((assignments || []).map(a => a.course_id))];

    const [{ data: creators }, { data: courses }] = await Promise.all([
      creatorIds.length > 0
        ? supabase.from('users').select('id, name').in('id', creatorIds)
        : { data: [] },
      courseIds.length > 0
        ? supabase.from('courses').select('id, title').in('id', courseIds)
        : { data: [] }
    ]);

    const creatorMap = {};
    (creators || []).forEach(u => { creatorMap[u.id] = u; });
    const courseMap = {};
    (courses || []).forEach(c => { courseMap[c.id] = c; });

    let assignmentsEnriched = (assignments || []).map(a => ({
      ...a,
      created_by_user: creatorMap[a.created_by] || null,
      course: courseMap[a.course_id] || null
    }));

    // For students, attach their submission status
    if (req.user.role === 'student' && assignmentsEnriched.length > 0) {
      const assignmentIds = assignmentsEnriched.map(a => a.id);
      const submissions = await AssignmentModel.findUserSubmissions(req.user.id, assignmentIds);
      const submissionMap = {};
      submissions.forEach(s => { submissionMap[s.assignment_id] = s; });

      assignmentsEnriched = assignmentsEnriched.map(a => ({
        ...a,
        mySubmission: submissionMap[a.id] || null,
        isLate: new Date() > new Date(a.due_date)
      }));
    }

    res.status(200).json({
      success: true,
      data: {
        assignments: assignmentsEnriched,
        pagination: {
          total: count || 0,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil((count || 0) / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/assignments/:id
const getAssignmentById = async (req, res, next) => {
  try {
    const assignment = await AssignmentModel.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (!assignment.is_published && req.user.role === 'student') {
      return res.status(403).json({ success: false, message: 'Assignment is not yet published.' });
    }

    let mySubmission = null;
    if (req.user.role === 'student') {
      mySubmission = await AssignmentModel.findSubmission(assignment.id, req.user.id);
    }

    const { data: creator } = await supabase.from('users').select('id, name').eq('id', assignment.created_by).single();
    const { data: course } = await supabase.from('courses').select('id, title, instructor_id').eq('id', assignment.course_id).single();

    res.status(200).json({
      success: true,
      data: {
        assignment: { ...assignment, created_by_user: creator, course },
        mySubmission,
        isLate: new Date() > new Date(assignment.due_date)
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/v1/assignments/:id
const updateAssignment = [
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      const assignment = await AssignmentModel.findById(req.params.id);

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }

      const course = await CourseModel.findById(assignment.course_id);
      if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized.' });
      }

      const allowed = ['title', 'description', 'due_date', 'max_score', 'is_published'];
      const updates = {};
      allowed.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      if (updates.due_date) updates.due_date = new Date(updates.due_date).toISOString();
      if (updates.max_score) updates.max_score = parseInt(updates.max_score);
      if (updates.is_published !== undefined) updates.is_published = updates.is_published === 'true' || updates.is_published === true;

      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
          filename: file.originalname,
          url: `/uploads/assignments/${file.filename}`,
          mimetype: file.mimetype,
          size: file.size
        }));
        // Merge with existing attachments
        updates.attachments = [...(assignment.attachments || []), ...newAttachments];
      }

      const updatedAssignment = await AssignmentModel.update(req.params.id, updates);

      res.status(200).json({
        success: true,
        message: 'Assignment updated successfully.',
        data: { assignment: updatedAssignment }
      });
    } catch (error) {
      next(error);
    }
  }
];

// DELETE /api/v1/assignments/:id
const deleteAssignment = async (req, res, next) => {
  try {
    const assignment = await AssignmentModel.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const course = await CourseModel.findById(assignment.course_id);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    await AssignmentModel.deleteSubmissionsByAssignment(assignment.id);
    await AssignmentModel.remove(assignment.id);

    res.status(200).json({
      success: true,
      message: 'Assignment and all submissions deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/v1/assignments/:id/submit
const submitAssignment = [
  upload.array('attachments', 5),
  async (req, res, next) => {
    try {
      const assignment = await AssignmentModel.findById(req.params.id);

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found.' });
      }

      if (!assignment.is_published) {
        return res.status(400).json({ success: false, message: 'Assignment is not published yet.' });
      }

      const existing = await AssignmentModel.findSubmission(assignment.id, req.user.id);
      if (existing && existing.status !== 'pending') {
        return res.status(409).json({ success: false, message: 'You have already submitted this assignment.' });
      }

      const isLate = new Date() > new Date(assignment.due_date);
      const { content } = req.body;

      const attachments = (req.files || []).map(file => ({
        filename: file.originalname,
        url: `/uploads/assignments/${file.filename}`,
        mimetype: file.mimetype,
        size: file.size
      }));

      const submissionData = {
        assignment_id: assignment.id,
        user_id: req.user.id,
        content: content || '',
        attachments,
        submitted_at: new Date().toISOString(),
        status: isLate ? 'late' : 'submitted'
      };

      let submission;
      if (existing) {
        submission = await AssignmentModel.updateSubmission(existing.id, submissionData);
      } else {
        submission = await AssignmentModel.createSubmission(submissionData);
      }

      await logAction(req.user.id, 'SUBMIT_ASSIGNMENT', 'Assignment', assignment.id, { isLate });

      res.status(201).json({
        success: true,
        message: isLate ? 'Assignment submitted (late).' : 'Assignment submitted successfully.',
        data: { submission, isLate }
      });
    } catch (error) {
      next(error);
    }
  }
];

// PUT /api/v1/assignments/:id/submissions/:submissionId/grade
const gradeSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { grade, feedback } = req.body;

    if (grade === undefined || grade === null) {
      return res.status(400).json({ success: false, message: 'Grade is required.' });
    }

    const submission = await AssignmentModel.findSubmissionById(submissionId);

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found.' });
    }

    const assignment = await AssignmentModel.findById(submission.assignment_id);

    if (parseFloat(grade) < 0 || parseFloat(grade) > assignment.max_score) {
      return res.status(400).json({
        success: false,
        message: `Grade must be between 0 and ${assignment.max_score}.`
      });
    }

    const course = await CourseModel.findById(assignment.course_id);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the course instructor can grade submissions.' });
    }

    const updatedSubmission = await AssignmentModel.updateSubmission(submissionId, {
      grade: parseFloat(grade),
      feedback: feedback || null,
      graded_by: req.user.id,
      graded_at: new Date().toISOString(),
      status: 'graded'
    });

    const { data: student } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', submission.user_id)
      .single();

    createNotification(
      submission.user_id,
      'assignment_graded',
      'Assignment Graded',
      `Your submission for "${assignment.title}" has been graded. Score: ${grade}/${assignment.max_score}`,
      { assignmentId: assignment.id, submissionId: submission.id, grade }
    ).catch(err => console.error('Notification error:', err.message));

    if (student) {
      sendAssignmentGradedEmail(student, assignment, updatedSubmission).catch(err =>
        console.error('Grade email error:', err.message)
      );
    }

    await logAction(req.user.id, 'GRADE_SUBMISSION', 'Submission', submission.id, {
      grade,
      assignmentId: assignment.id
    });

    res.status(200).json({
      success: true,
      message: 'Submission graded successfully.',
      data: { submission: updatedSubmission }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/assignments/:id/submissions
const getSubmissions = async (req, res, next) => {
  try {
    const assignment = await AssignmentModel.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    const course = await CourseModel.findById(assignment.course_id);
    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const filters = { assignment_id: assignment.id };
    if (status) filters.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { data: submissions, count } = await AssignmentModel.findSubmissions(filters, { skip, limit: limitNum });

    // Enrich with student and grader info
    const userIds = [...new Set([
      ...(submissions || []).map(s => s.user_id),
      ...(submissions || []).filter(s => s.graded_by).map(s => s.graded_by)
    ])];

    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u; });
    }

    const enriched = (submissions || []).map(s => ({
      ...s,
      user: userMap[s.user_id] || null,
      graded_by_user: s.graded_by ? userMap[s.graded_by] || null : null
    }));

    // Compute stats per status
    const { data: allSubs } = await supabase
      .from('submissions')
      .select('status, grade')
      .eq('assignment_id', assignment.id);

    const statusGroups = {};
    (allSubs || []).forEach(s => {
      if (!statusGroups[s.status]) statusGroups[s.status] = { count: 0, grades: [] };
      statusGroups[s.status].count++;
      if (s.grade !== null) statusGroups[s.status].grades.push(s.grade);
    });

    const stats = Object.entries(statusGroups).map(([status, info]) => ({
      status,
      count: info.count,
      avgGrade: info.grades.length > 0
        ? Math.round(info.grades.reduce((a, b) => a + b, 0) / info.grades.length * 10) / 10
        : null
    }));

    res.status(200).json({
      success: true,
      data: {
        submissions: enriched,
        stats,
        pagination: {
          total: count || 0,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil((count || 0) / limitNum)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/assignments/:id/my-submission
const getMySubmission = async (req, res, next) => {
  try {
    const submission = await AssignmentModel.findSubmission(req.params.id, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, message: 'No submission found for this assignment.' });
    }

    let gradedByUser = null;
    if (submission.graded_by) {
      const { data: grader } = await supabase.from('users').select('id, name').eq('id', submission.graded_by).single();
      gradedByUser = grader;
    }

    res.status(200).json({
      success: true,
      data: { submission: { ...submission, graded_by_user: gradedByUser } }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAssignment,
  getAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  submitAssignment,
  gradeSubmission,
  getSubmissions,
  getMySubmission
};
