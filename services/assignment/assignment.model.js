const { supabase } = require('../../config/database');

const TABLE = 'assignments';
const SUBMISSIONS_TABLE = 'submissions';

// --- Assignment helpers ---

const findById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const findAll = async (filters = {}, { skip = 0, limit = 10 } = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact' });

  if (filters.course_id) query = query.eq('course_id', filters.course_id);
  if (filters.is_published !== undefined) query = query.eq('is_published', filters.is_published);

  query = query.order('due_date', { ascending: true }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

const create = async (assignmentData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...assignmentData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const update = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const remove = async (id) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};

const countByCourse = async (courseId) => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId);
  if (error) throw error;
  return count || 0;
};

const findByCourseIds = async (courseIds) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, due_date')
    .in('course_id', courseIds);
  if (error) throw error;
  return data || [];
};

const countAll = async () => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

// --- Submission helpers ---

const findSubmissionById = async (id) => {
  const { data, error } = await supabase.from(SUBMISSIONS_TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const findSubmission = async (assignmentId, userId) => {
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findSubmissions = async (filters = {}, { skip = 0, limit = 20 } = {}) => {
  let query = supabase.from(SUBMISSIONS_TABLE).select('*', { count: 'exact' });

  if (filters.assignment_id) query = query.eq('assignment_id', filters.assignment_id);
  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.status) query = query.eq('status', filters.status);

  query = query.order('submitted_at', { ascending: false }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

const createSubmission = async (submissionData) => {
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .insert({ ...submissionData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const updateSubmission = async (id, updates) => {
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const deleteSubmissionsByAssignment = async (assignmentId) => {
  const { error } = await supabase.from(SUBMISSIONS_TABLE).delete().eq('assignment_id', assignmentId);
  if (error) throw error;
};

const findUserSubmissions = async (userId, assignmentIds) => {
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  return data || [];
};

const countSubmissions = async (filters = {}) => {
  let query = supabase.from(SUBMISSIONS_TABLE).select('*', { count: 'exact', head: true });
  if (filters.status) query = query.eq('status', filters.status);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

const countAllSubmissions = async () => {
  const { count, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
};

module.exports = {
  supabase,
  TABLE,
  SUBMISSIONS_TABLE,
  findById,
  findAll,
  create,
  update,
  remove,
  countByCourse,
  findByCourseIds,
  countAll,
  findSubmissionById,
  findSubmission,
  findSubmissions,
  createSubmission,
  updateSubmission,
  deleteSubmissionsByAssignment,
  findUserSubmissions,
  countSubmissions,
  countAllSubmissions
};
