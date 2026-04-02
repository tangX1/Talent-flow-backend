const { supabase } = require('../../config/database');

const TABLE = 'teams';
const MEMBERS_TABLE = 'team_members';

const findById = async (id) => {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  return data;
};

const findByIdWithMembers = async (id) => {
  const { data: team, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  if (!team) return null;

  const { data: members } = await supabase
    .from(MEMBERS_TABLE)
    .select('*, users(id, name, email)')
    .eq('team_id', id);

  return { ...team, members: members || [] };
};

const findAll = async (filters = {}, { skip = 0, limit = 10 } = {}) => {
  let query = supabase.from(TABLE).select('*', { count: 'exact' });

  if (filters.course_id) query = query.eq('course_id', filters.course_id);
  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
  if (filters.search) query = query.ilike('name', `%${filters.search}%`);

  query = query.order('created_at', { ascending: false }).range(skip, skip + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: data || [], count: count || 0 };
};

const create = async (teamData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...teamData, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
  // Remove all members first
  await supabase.from(MEMBERS_TABLE).delete().eq('team_id', id);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
};

// Members helpers
const getMembers = async (teamId) => {
  const { data, error } = await supabase
    .from(MEMBERS_TABLE)
    .select('*, users(id, name, email)')
    .eq('team_id', teamId);
  if (error) throw error;
  return data || [];
};

const getMember = async (teamId, userId) => {
  const { data, error } = await supabase
    .from(MEMBERS_TABLE)
    .select('*')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const addMember = async (teamId, userId, role = 'member') => {
  const { data, error } = await supabase
    .from(MEMBERS_TABLE)
    .insert({ team_id: teamId, user_id: userId, role, joined_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const removeMember = async (teamId, userId) => {
  const { error } = await supabase
    .from(MEMBERS_TABLE)
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
};

const countMembers = async (teamId) => {
  const { count, error } = await supabase
    .from(MEMBERS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (error) throw error;
  return count || 0;
};

const getLeaderCount = async (teamId) => {
  const { count, error } = await supabase
    .from(MEMBERS_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('role', 'leader');
  if (error) throw error;
  return count || 0;
};

// Get team IDs where user is a member or creator
const getUserTeamIds = async (userId) => {
  const { data, error } = await supabase
    .from(MEMBERS_TABLE)
    .select('team_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(m => m.team_id);
};

module.exports = {
  supabase,
  TABLE,
  MEMBERS_TABLE,
  findById,
  findByIdWithMembers,
  findAll,
  create,
  update,
  remove,
  getMembers,
  getMember,
  addMember,
  removeMember,
  countMembers,
  getLeaderCount,
  getUserTeamIds
};
