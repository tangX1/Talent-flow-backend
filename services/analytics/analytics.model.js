const { supabase } = require('../../config/database');

const AUDIT_TABLE = 'audit_logs';
const STATS_TABLE = 'daily_stats';

// --- Audit log helpers ---

const createLog = async (logData) => {
  const { data, error } = await supabase
    .from(AUDIT_TABLE)
    .insert({ ...logData, created_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const findLogs = async (filters = {}, { skip = 0, limit = 50 } = {}) => {
  let query = supabase.from(AUDIT_TABLE).select('*', { count: 'exact' });

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.resource) query = query.eq('resource', filters.resource);
  if (filters.action) query = query.ilike('action', `%${filters.action}%`);
  if (filters.start_date) query = query.gte('created_at', filters.start_date);
  if (filters.end_date) query = query.lte('created_at', filters.end_date);

  query = query.order('created_at', { ascending: false }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

const findRecentLogs = async (since, limitNum = 100) => {
  const { data, error } = await supabase
    .from(AUDIT_TABLE)
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limitNum);
  if (error) throw error;
  return data || [];
};

const findUserLogs = async (userId, filters = {}) => {
  let query = supabase
    .from(AUDIT_TABLE)
    .select('*')
    .eq('user_id', userId);

  if (filters.start_date) query = query.gte('created_at', filters.start_date);
  if (filters.end_date) query = query.lte('created_at', filters.end_date);

  query = query.order('created_at', { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const findAllLogsForExport = async (filters = {}) => {
  let query = supabase.from(AUDIT_TABLE).select('*').order('created_at', { ascending: false }).limit(5000);
  if (filters.start_date) query = query.gte('created_at', filters.start_date);
  if (filters.end_date) query = query.lte('created_at', filters.end_date);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

module.exports = {
  supabase,
  AUDIT_TABLE,
  STATS_TABLE,
  createLog,
  findLogs,
  findRecentLogs,
  findUserLogs,
  findAllLogsForExport
};
