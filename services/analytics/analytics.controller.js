const AnalyticsModel = require('./analytics.model');
const { supabase } = require('../../config/database');

// Helper: Log an action (exported for use by other services)
const logAction = async (userId, action, resource, resourceId, metadata = {}) => {
  try {
    await AnalyticsModel.createLog({ user_id: userId, action, resource, resource_id: resourceId, metadata });
  } catch (error) {
    console.error('logAction error:', error.message);
  }
};

// GET /api/v1/analytics/audit-logs — Admin only
const getAuditLogs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      resource,
      startDate,
      endDate
    } = req.query;

    const filters = {};
    if (userId) filters.user_id = userId;
    if (action) filters.action = action;
    if (resource) filters.resource = resource;
    if (startDate) filters.start_date = new Date(startDate).toISOString();
    if (endDate) filters.end_date = new Date(endDate).toISOString();

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const { data: logs, count } = await AnalyticsModel.findLogs(filters, { skip, limit: limitNum });

    // Enrich logs with user info
    const userIds = [...new Set((logs || []).filter(l => l.user_id).map(l => l.user_id))];
    let userMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email, role')
        .in('id', userIds);
      (users || []).forEach(u => { userMap[u.id] = u; });
    }

    const enrichedLogs = (logs || []).map(l => ({
      ...l,
      user: l.user_id ? userMap[l.user_id] || null : null
    }));

    res.status(200).json({
      success: true,
      data: {
        logs: enrichedLogs,
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

// GET /api/v1/analytics/stats — Admin only
const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalUsers },
      { count: totalCourses },
      { count: publishedCourses },
      { count: totalCertificates },
      { count: totalEnrollments },
      { count: newUsersLast30Days },
      { count: newUsersLast7Days },
      { count: totalAssignments },
      { count: totalSubmissions },
      { count: gradedSubmissions }
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('courses').select('*', { count: 'exact', head: true }),
      supabase.from('courses').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('certificates').select('*', { count: 'exact', head: true }).eq('is_valid', true),
      supabase.from('enrollments').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
      supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('assignments').select('*', { count: 'exact', head: true }),
      supabase.from('submissions').select('*', { count: 'exact', head: true }),
      supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'graded')
    ]);

    // User roles breakdown
    const { data: allUsers } = await supabase.from('users').select('role');
    const roleMap = {};
    (allUsers || []).forEach(u => {
      roleMap[u.role] = (roleMap[u.role] || 0) + 1;
    });
    const roleBreakdown = Object.entries(roleMap).map(([role, count]) => ({ role, count }));

    // Top courses by enrollment count
    const { data: topEnrollments } = await supabase
      .from('enrollments')
      .select('course_id');

    const courseEnrollCount = {};
    (topEnrollments || []).forEach(e => {
      courseEnrollCount[e.course_id] = (courseEnrollCount[e.course_id] || 0) + 1;
    });

    const topCourseIds = Object.entries(courseEnrollCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    let topCourses = [];
    if (topCourseIds.length > 0) {
      const { data: courses } = await supabase
        .from('courses')
        .select('id, title, category, instructor_id')
        .in('id', topCourseIds)
        .eq('is_published', true);

      const instructorIds = [...new Set((courses || []).map(c => c.instructor_id))];
      let instructorMap = {};
      if (instructorIds.length > 0) {
        const { data: instructors } = await supabase.from('users').select('id, name').in('id', instructorIds);
        (instructors || []).forEach(u => { instructorMap[u.id] = u; });
      }

      topCourses = (courses || []).map(c => ({
        ...c,
        instructor: instructorMap[c.instructor_id] || null,
        enrollmentCount: courseEnrollCount[c.id] || 0
      }));
    }

    // Recent audit log activity grouped by date and action (last 7 days)
    const recentLogs = await AnalyticsModel.findRecentLogs(sevenDaysAgo);
    const activityByDay = {};
    recentLogs.forEach(log => {
      const date = log.created_at ? log.created_at.substring(0, 10) : 'unknown';
      const key = `${date}__${log.action}`;
      if (!activityByDay[key]) activityByDay[key] = { date, action: log.action, count: 0 };
      activityByDay[key].count++;
    });
    const recentActivity = Object.values(activityByDay).sort((a, b) => b.date.localeCompare(a.date));

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalUsers: totalUsers || 0,
          totalCourses: totalCourses || 0,
          publishedCourses: publishedCourses || 0,
          totalCertificates: totalCertificates || 0,
          totalEnrollments: totalEnrollments || 0,
          totalAssignments: totalAssignments || 0,
          totalSubmissions: totalSubmissions || 0,
          gradedSubmissions: gradedSubmissions || 0
        },
        growth: {
          newUsersLast30Days: newUsersLast30Days || 0,
          newUsersLast7Days: newUsersLast7Days || 0
        },
        userRoles: roleBreakdown,
        topCourses,
        recentActivity
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/analytics/users/:userId/activity
const getUserActivityReport = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('id', userId)
      .single();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const logFilters = {};
    if (startDate) logFilters.start_date = new Date(startDate).toISOString();
    if (endDate) logFilters.end_date = new Date(endDate).toISOString();

    const [auditLogs, { data: progressRecords }, { data: submissions }, { data: certificates }] = await Promise.all([
      AnalyticsModel.findUserLogs(userId, logFilters),
      supabase.from('lesson_progress').select('*, lessons(title), courses(title)').eq('user_id', userId),
      supabase.from('submissions').select('*, assignments(title, max_score, due_date)').eq('user_id', userId),
      supabase.from('certificates').select('*, courses(title)').eq('user_id', userId)
    ]);

    const completedLessons = (progressRecords || []).filter(p => p.completed).length;
    const totalWatchTime = (progressRecords || []).reduce((sum, p) => sum + (p.watch_time || 0), 0);

    const submissionList = submissions || [];
    const gradedSubs = submissionList.filter(s => s.status === 'graded');
    const gradesWithValue = gradedSubs.filter(s => s.grade !== null);

    const submissionStats = {
      total: submissionList.length,
      graded: gradedSubs.length,
      pending: submissionList.filter(s => s.status === 'submitted').length,
      late: submissionList.filter(s => s.status === 'late').length,
      averageGrade: gradesWithValue.length > 0
        ? Math.round(gradesWithValue.reduce((sum, s) => sum + s.grade, 0) / gradesWithValue.length)
        : 0
    };

    res.status(200).json({
      success: true,
      data: {
        user,
        learningStats: {
          completedLessons,
          totalWatchTime,
          certificates: (certificates || []).length
        },
        submissionStats,
        recentActivity: auditLogs,
        certificates: certificates || []
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/analytics/courses/:courseId
const getCourseAnalytics = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    const { data: course } = await supabase
      .from('courses')
      .select('id, title, instructor_id, is_published')
      .eq('id', courseId)
      .single();

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    if (course.instructor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { data: instructor } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('id', course.instructor_id)
      .single();

    const [
      { data: lessons },
      { data: enrollments },
      { count: enrollmentCount },
      { data: allProgress },
      { data: assignments }
    ] = await Promise.all([
      supabase.from('lessons').select('id, title, duration, order_index').eq('course_id', courseId).order('order_index'),
      supabase.from('enrollments').select('user_id').eq('course_id', courseId),
      supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('course_id', courseId),
      supabase.from('lesson_progress').select('*').eq('course_id', courseId),
      supabase.from('assignments').select('id, title, due_date, max_score').eq('course_id', courseId)
    ]);

    // Per-lesson stats
    const lessonIds = (lessons || []).map(l => l.id);
    const progressByLesson = {};
    (allProgress || []).forEach(p => {
      if (!progressByLesson[p.lesson_id]) progressByLesson[p.lesson_id] = [];
      progressByLesson[p.lesson_id].push(p);
    });

    const lessonsWithStats = (lessons || []).map(lesson => {
      const progList = progressByLesson[lesson.id] || [];
      const completedCount = progList.filter(p => p.completed).length;
      const totalAccesses = progList.length;
      const avgWatchTime = totalAccesses > 0
        ? Math.round(progList.reduce((s, p) => s + (p.watch_time || 0), 0) / totalAccesses)
        : 0;
      return {
        id: lesson.id,
        title: lesson.title,
        order: lesson.order_index,
        duration: lesson.duration,
        stats: { completedCount, totalAccesses, avgWatchTime }
      };
    });

    // Count students who completed the full course
    const totalPublishedLessons = (lessons || []).length;
    const completionsByUser = {};
    (allProgress || []).forEach(p => {
      if (p.completed) {
        completionsByUser[p.user_id] = (completionsByUser[p.user_id] || 0) + 1;
      }
    });
    const fullCompletions = Object.values(completionsByUser).filter(c => c >= totalPublishedLessons).length;

    // Assignment stats
    const assignmentIds = (assignments || []).map(a => a.id);
    let assignmentStats = [];
    if (assignmentIds.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('assignment_id, status, grade')
        .in('assignment_id', assignmentIds);

      const subsByAssignment = {};
      (subs || []).forEach(s => {
        if (!subsByAssignment[s.assignment_id]) subsByAssignment[s.assignment_id] = [];
        subsByAssignment[s.assignment_id].push(s);
      });

      assignmentStats = (assignments || []).map(a => {
        const assignSubs = subsByAssignment[a.id] || [];
        const graded = assignSubs.filter(s => s.status === 'graded');
        const gradesWithVal = graded.filter(s => s.grade !== null);
        return {
          id: a.id,
          title: a.title,
          due_date: a.due_date,
          max_score: a.max_score,
          submissionCount: assignSubs.length,
          gradedCount: graded.length,
          avgGrade: gradesWithVal.length > 0
            ? Math.round(gradesWithVal.reduce((s, sub) => s + sub.grade, 0) / gradesWithVal.length * 10) / 10
            : null
        };
      });
    }

    res.status(200).json({
      success: true,
      data: {
        course: { ...course, instructor },
        completionStats: {
          totalEnrolled: enrollmentCount || 0,
          fullCompletions,
          completionRate: (enrollmentCount || 0) > 0
            ? Math.round((fullCompletions / enrollmentCount) * 100)
            : 0
        },
        lessonsWithStats,
        assignmentStats
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/analytics/export
const exportReport = async (req, res, next) => {
  try {
    const { type = 'overview', format = 'json' } = req.query;

    let reportData = {};

    if (type === 'overview') {
      const [
        { data: users },
        { data: courses },
        { data: certificates },
        { data: submissions }
      ] = await Promise.all([
        supabase.from('users').select('id, name, email, role, created_at, last_login'),
        supabase.from('courses').select('id, title, category, level, is_published, created_at'),
        supabase.from('certificates').select('*, users(name, email), courses(title)'),
        supabase.from('submissions').select('*, users(name, email), assignments(title, max_score)')
      ]);

      reportData = {
        generatedAt: new Date().toISOString(),
        type: 'overview',
        totals: {
          users: (users || []).length,
          courses: (courses || []).length,
          certificates: (certificates || []).length,
          submissions: (submissions || []).length
        },
        users: users || [],
        courses: courses || [],
        certificates: certificates || [],
        submissions: submissions || []
      };
    } else if (type === 'audit') {
      const { startDate, endDate } = req.query;
      const filters = {};
      if (startDate) filters.start_date = new Date(startDate).toISOString();
      if (endDate) filters.end_date = new Date(endDate).toISOString();

      const logs = await AnalyticsModel.findAllLogsForExport(filters);

      // Enrich with user info
      const userIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id))];
      let userMap = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
        (users || []).forEach(u => { userMap[u.id] = u; });
      }

      reportData = {
        generatedAt: new Date().toISOString(),
        type: 'audit',
        totalRecords: logs.length,
        logs: logs.map(l => ({ ...l, user: l.user_id ? userMap[l.user_id] || null : null }))
      };
    }

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="talentflow_${type}_report_${Date.now()}.json"`);
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(JSON.stringify(reportData, null, 2));
    }

    if (format === 'csv' && type === 'overview') {
      const csvLines = ['Name,Email,Role,Created At'];
      (reportData.users || []).forEach(u => {
        csvLines.push(`"${u.name}","${u.email}","${u.role}","${u.created_at}"`);
      });
      res.setHeader('Content-Disposition', `attachment; filename="talentflow_users_${Date.now()}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.status(200).send(csvLines.join('\n'));
    }

    res.status(200).json({ success: true, data: reportData });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAuditLogs,
  getDashboardStats,
  getUserActivityReport,
  getCourseAnalytics,
  exportReport,
  logAction
};
