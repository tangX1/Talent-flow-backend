const { supabase } = require('../../config/database');

const TABLE = 'certificates';

const findByCertificateId = async (certificateId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('certificate_id', certificateId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByUserAndCourse = async (userId, courseId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const findByUser = async (userId) => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

const create = async (certData) => {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(certData)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

const countValid = async () => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('is_valid', true);
  if (error) throw error;
  return count || 0;
};

const findAll = async () => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('issued_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

module.exports = {
  supabase,
  TABLE,
  findByCertificateId,
  findByUserAndCourse,
  findByUser,
  create,
  countValid,
  findAll
};
