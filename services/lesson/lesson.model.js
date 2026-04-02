const { supabase } = require('../../config/database');

const TABLE = 'lessons';
const PROGRESS_TABLE = 'lesson_progress';

// --- Lesson helpers ---

const findById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const findOne = async (filters) => {
  let query = supabase.from(TABLE).select('*');
  Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v); });
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
};

const findByCourse = async (courseId, onlyPublished = false) => {
  let query = supabase.from(TABLE).select('*').eq('course_id', courseId).order('order_index', { ascending: true });
  if (onlyPublished) query = query.eq('is_published', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const findLastOrder = async (courseId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('order_index')
    .eq('course_id', courseId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? data.order_index : 0;
};

const create = async (lessonData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...lessonData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const update = async (id, courseId, updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('course_id', courseId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const remove = async (id, courseId) => {
  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('course_id', courseId);
  if (error) throw error;
};

const countPublished = async (courseId) => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('is_published', true);
  if (error) throw error;
  return count || 0;
};

// --- Progress helpers ---

const findProgress = async (userId, lessonId, courseId) => {
  const { data, error } = await supabase
    .from(PROGRESS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findProgressByCourse = async (userId, courseId) => {
  const { data, error } = await supabase
    .from(PROGRESS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId);
  if (error) throw error;
  return data || [];
};

const upsertProgress = async (userId, lessonId, courseId, updates) => {
  const existing = await findProgress(userId, lessonId, courseId);
  if (existing) {
    const { data, error } = await supabase
      .from(PROGRESS_TABLE)
      .update(updates)
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .eq('course_id', courseId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from(PROGRESS_TABLE)
      .insert({ user_id: userId, lesson_id: lessonId, course_id: courseId, ...updates, created_at: new Date().toISOString() })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
};

const countCompleted = async (userId, courseId) => {
  const { count, error } = await supabase
    .from(PROGRESS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('completed', true);
  if (error) throw error;
  return count || 0;
};

const deleteProgressByLesson = async (lessonId) => {
  const { error } = await supabase.from(PROGRESS_TABLE).delete().eq('lesson_id', lessonId);
  if (error) throw error;
};

module.exports = {
  supabase,
  TABLE,
  PROGRESS_TABLE,
  findById,
  findOne,
  findByCourse,
  findLastOrder,
  create,
  update,
  remove,
  countPublished,
  findProgress,
  findProgressByCourse,
  upsertProgress,
  countCompleted,
  deleteProgressByLesson
};
