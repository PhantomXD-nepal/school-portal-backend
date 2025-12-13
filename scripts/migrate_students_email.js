import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
  console.log('Starting migration: Add email column to students table...');

  try {
    // We can't execute raw SQL via the JS client easily without a stored procedure or direct SQL access.
    // However, we can try to use the RPC interface if there's a function to run SQL, but usually there isn't by default.
    // A better approach for the user is to run the SQL in their dashboard.

    console.log('----------------------------------------------------------------');
    console.log('⚠️  AUTOMATIC MIGRATION NOT POSSIBLE VIA JS CLIENT ⚠️');
    console.log('----------------------------------------------------------------');
    console.log('Please run the following SQL in your Supabase SQL Editor:');
    console.log('');
    console.log('ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
    console.log('CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);');
    console.log('');
    console.log('----------------------------------------------------------------');

  } catch (error) {
    console.error('Migration failed:', error);
  }
}

migrate();
