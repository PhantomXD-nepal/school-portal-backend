-- Add email column to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index for email
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
