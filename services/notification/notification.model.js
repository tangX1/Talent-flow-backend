const { supabase } = require('../../config/database');

const TABLE = 'notifications';

const findById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const findByIdAndUser = async (id, userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByUser = async (userId, filters = {}, { skip = 0, limit = 20 } = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact' }).eq('user_id', userId);

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.is_read !== undefined) query = query.eq('is_read', filters.is_read);

  query = query.order('created_at', { ascending: false }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

const countUnread = async (userId) => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw error;
  return count || 0;
};

const create = async (notificationData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...notificationData, created_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const update = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const markAllReadForUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)
    .select('id');
  if (error) throw error;
  return (data || []).length;
};

const remove = async (id, userId) => {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
};

module.exports = {
  supabase,
  TABLE,
  findById,
  findByIdAndUser,
  findByUser,
  countUnread,
  create,
  update,
  markAllReadForUser,
  remove
};
