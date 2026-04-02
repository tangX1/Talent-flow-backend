const { supabase } = require('../../config/database');

const TABLE = 'courses';

const findById = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

const findAll = async (filters = {}, { skip = 0, limit = 12, orderBy = 'created_at', ascending = false } = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact' });

  if (filters.is_published !== undefined) query = query.eq('is_published', filters.is_published);
  if (filters.category) query = query.ilike('category', `%${filters.category}%`);
  if (filters.level) query = query.eq('level', filters.level);
  if (filters.instructor_id) query = query.eq('instructor_id', filters.instructor_id);
  if (filters.min_price !== undefined) query = query.gte('price', filters.min_price);
  if (filters.max_price !== undefined) query = query.lte('price', filters.max_price);
  if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);

  query = query.order(orderBy, { ascending }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
};

const create = async (courseData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...courseData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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

const countDocuments = async (filters = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact', head: true });
  if (filters.is_published !== undefined) query = query.eq('is_published', filters.is_published);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
};

module.exports = { supabase, TABLE, findById, findAll, create, update, remove, countDocuments };
