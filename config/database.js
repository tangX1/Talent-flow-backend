const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const connectDB = () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Supabase credentials not set. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file.');
    return;
  }
  console.log('Supabase client initialized.');
};

module.exports = { supabase, connectDB };
