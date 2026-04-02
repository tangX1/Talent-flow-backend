const { supabase } = require('../../config/database');

const TABLE = 'users';

const findById = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

const findByIdWithSensitive = async (id) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, password, refresh_token, password_reset_token, password_reset_expires')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
};

const findByEmail = async (email) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByEmailWithPassword = async (email) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, password, refresh_token')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByRefreshToken = async (token) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, refresh_token')
    .eq('refresh_token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByResetToken = async (hashedToken) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, password_reset_token, password_reset_expires, refresh_token')
    .eq('password_reset_token', hashedToken)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const create = async (userData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(userData)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
};

const update = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, email, role, is_active, last_login, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
};

const updateWithSensitive = async (id, updates) => {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, password, refresh_token, password_reset_token, password_reset_expires')
    .single();
  if (error) throw error;
  return data;
};

const stripSensitive = (user) => {
  if (!user) return null;
  const { password, refresh_token, password_reset_token, password_reset_expires, ...safe } = user;
  return safe;
};

module.exports = {
  supabase,
  TABLE,
  findById,
  findByIdWithSensitive,
  findByEmail,
  findByEmailWithPassword,
  findByRefreshToken,
  findByResetToken,
  create,
  update,
  updateWithSensitive,
  stripSensitive
};
