const { v4: uuidv4 } = require('uuid');
const CertModel = require('./certificate.model');
const CourseModel = require('../course/course.model');
const LessonModel = require('../lesson/lesson.model');
const { supabase } = require('../../config/database');
const { createNotification } = require('../notification/notification.controller');
const { logAction } = require('../analytics/analytics.controller');
const { sendCertificateEmail } = require('../../utils/emailService');

// Internal function called by lesson completion
const generateCertificateInternal = async (userId, courseId) => {
  const existing = await CertModel.findByUserAndCourse(userId, courseId);
  if (existing) return existing;

  const course = await CourseModel.findById(courseId);
  if (!course) throw new Error('Course not found');

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', userId)
    .single();
  if (!user) throw new Error('User not found');

  // Fetch instructor name
  const { data: instructor } = await supabase
    .from('users')
    .select('name')
    .eq('id', course.instructor_id)
    .single();

  const publishedCount = await LessonModel.countPublished(courseId);
  if (publishedCount === 0) {
    throw new Error('Course has no published lessons');
  }

  const completedCount = await LessonModel.countCompleted(userId, courseId);
  if (completedCount < publishedCount) {
    throw new Error('Course not yet fully completed');
  }

  const certId = uuidv4();
  const certificate = await CertModel.create({
    user_id: userId,
    course_id: courseId,
    certificate_id: certId,
    issued_at: new Date().toISOString(),
    template_data: {
      recipientName: user.name,
      courseName: course.title,
      instructorName: instructor?.name || 'TalentFlow Instructor',
      completionDate: new Date().toISOString(),
      courseCategory: course.category,
      courseDuration: course.total_duration || 0,
      grade: 'Completed'
    },
    is_valid: true
  });

  await createNotification(
    userId,
    'certificate_issued',
    'Certificate Issued',
    `Your certificate for "${course.title}" has been issued. Certificate ID: ${certId}`,
    { courseId, certificateId: certId }
  );

  sendCertificateEmail(user, course, certificate).catch(err =>
    console.error('Certificate email error:', err.message)
  );

  await logAction(userId, 'CERTIFICATE_ISSUED', 'Certificate', certificate.id, {
    courseId,
    certificateId: certId
  });

  return certificate;
};

// POST /api/v1/certificates/generate
const generateCertificate = async (req, res, next) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'courseId is required.' });
    }

    const course = await CourseModel.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    const publishedCount = await LessonModel.countPublished(courseId);
    if (publishedCount === 0) {
      return res.status(400).json({ success: false, message: 'Course has no published lessons.' });
    }

    const completedCount = await LessonModel.countCompleted(req.user.id, courseId);

    if (completedCount < publishedCount) {
      return res.status(400).json({
        success: false,
        message: `Course not complete. You have completed ${completedCount} of ${publishedCount} lessons.`,
        data: {
          completedLessons: completedCount,
          totalLessons: publishedCount,
          percentage: Math.round((completedCount / publishedCount) * 100)
        }
      });
    }

    // Check if already exists
    const existing = await CertModel.findByUserAndCourse(req.user.id, courseId);
    if (existing) {
      return res.status(200).json({
        success: true,
        message: 'Certificate already issued.',
        data: { certificate: existing }
      });
    }

    const certificate = await generateCertificateInternal(req.user.id, courseId);

    res.status(201).json({
      success: true,
      message: 'Certificate generated successfully.',
      data: { certificate }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/certificates/:certificateId
const getCertificate = async (req, res, next) => {
  try {
    const certificate = await CertModel.findByCertificateId(req.params.certificateId);

    if (!certificate) {
      return res.status(404).json({ success: false, message: 'Certificate not found.' });
    }

    if (certificate.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Fetch related user and course data
    const [{ data: user }, { data: course }] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('id', certificate.user_id).single(),
      supabase.from('courses').select('id, title, category, level, instructor_id').eq('id', certificate.course_id).single()
    ]);

    res.status(200).json({
      success: true,
      data: { certificate: { ...certificate, user, course } }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/certificates/user/:userId
const getUserCertificates = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const certificates = await CertModel.findByUser(userId);

    // Fetch course data for each certificate
    const courseIds = [...new Set(certificates.map(c => c.course_id))];
    let courseMap = {};
    if (courseIds.length > 0) {
      const { data: courses } = await supabase
        .from('courses')
        .select('id, title, category, level, thumbnail, instructor_id')
        .in('id', courseIds);
      (courses || []).forEach(c => { courseMap[c.id] = c; });
    }

    const certificatesWithCourse = certificates.map(c => ({
      ...c,
      course: courseMap[c.course_id] || null
    }));

    res.status(200).json({
      success: true,
      data: {
        certificates: certificatesWithCourse,
        total: certificates.length
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/certificates/verify/:certificateId — Public
const verifyCertificate = async (req, res, next) => {
  try {
    const certificate = await CertModel.findByCertificateId(req.params.certificateId);

    if (!certificate) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Certificate not found. It may be invalid or revoked.'
      });
    }

    if (!certificate.is_valid) {
      return res.status(200).json({
        success: true,
        valid: false,
        message: 'This certificate has been revoked.',
        data: {
          certificateId: certificate.certificate_id,
          revokedAt: certificate.revoked_at,
          revokeReason: certificate.revoke_reason
        }
      });
    }

    const td = certificate.template_data || {};

    res.status(200).json({
      success: true,
      valid: true,
      message: 'Certificate is valid.',
      data: {
        certificateId: certificate.certificate_id,
        recipientName: td.recipientName,
        courseName: td.courseName,
        issuedAt: certificate.issued_at,
        completionDate: td.completionDate,
        courseCategory: td.courseCategory
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateCertificate,
  getCertificate,
  getUserCertificates,
  verifyCertificate,
  generateCertificateInternal
};
