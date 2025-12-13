import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Client for general operations (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for operations that bypass RLS (use with caution)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default supabase;
