const { supabase } = require('../../config/database');

const TABLE = 'profiles';
const USERS_TABLE = 'users';

const findProfileByUserId = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const createProfile = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      avatar: null,
      bio: '',
      skills: [],
      social_links: { website: '', linkedin: '', twitter: '', github: '' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const upsertProfile = async (userId, updates) => {
  const existing = await findProfileByUserId(userId);
  if (existing) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: userId,
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }
};

const findUserById = async (id) => {
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

const updateUser = async (id, updates) => {
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
};

module.exports = {
  supabase,
  TABLE,
  USERS_TABLE,
  findProfileByUserId,
  createProfile,
  upsertProfile,
  findUserById,
  updateUser
};
