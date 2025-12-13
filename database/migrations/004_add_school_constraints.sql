-- ============================================
-- Migration: Add NOT NULL constraints to school_id
-- This ensures no data can be inserted without proper school context
-- ============================================

-- First, remove any orphaned records (records without school_id)
DELETE FROM students WHERE school_id IS NULL;
DELETE FROM teachers WHERE school_id IS NULL;
DELETE FROM classes WHERE school_id IS NULL;
DELETE FROM announcements WHERE school_id IS NULL;
DELETE FROM parents WHERE school_id IS NULL;

-- Add NOT NULL constraint to students.school_id
ALTER TABLE students
  ALTER COLUMN school_id SET NOT NULL;

-- Add NOT NULL constraint to teachers.school_id
ALTER TABLE teachers
  ALTER COLUMN school_id SET NOT NULL;

-- Add NOT NULL constraint to classes.school_id
ALTER TABLE classes
  ALTER COLUMN school_id SET NOT NULL;

-- Add NOT NULL constraint to announcements.school_id
ALTER TABLE announcements
  ALTER COLUMN school_id SET NOT NULL;

-- Add NOT NULL constraint to parents.school_id
ALTER TABLE parents
  ALTER COLUMN school_id SET NOT NULL;

-- ============================================
-- Add check constraints for status fields
-- ============================================

-- Add check constraint for students status
ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_status_check,
  ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'graduated', 'transferred'));

-- Add check constraint for teachers status
ALTER TABLE teachers
  DROP CONSTRAINT IF EXISTS teachers_status_check,
  ADD CONSTRAINT teachers_status_check
  CHECK (status IN ('active', 'inactive', 'on_leave'));

-- Add check constraint for classes status
ALTER TABLE classes
  DROP CONSTRAINT IF EXISTS classes_status_check,
  ADD CONSTRAINT classes_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));

-- ============================================
-- Add indexes for common queries
-- ============================================

-- Composite index for school + status queries
CREATE INDEX IF NOT EXISTS idx_students_school_status
  ON students(school_id, status);

CREATE INDEX IF NOT EXISTS idx_teachers_school_status
  ON teachers(school_id, status);

CREATE INDEX IF NOT EXISTS idx_classes_school_status
  ON classes(school_id, status);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_teachers_email
  ON teachers(email);

CREATE INDEX IF NOT EXISTS idx_students_email
  ON students(email) WHERE email IS NOT NULL;

-- Index for roll number lookups within school
CREATE INDEX IF NOT EXISTS idx_students_school_roll
  ON students(school_id, roll_number) WHERE roll_number IS NOT NULL;

-- ============================================
-- Update RLS policies for proper school isolation
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view students from their school" ON students;
DROP POLICY IF EXISTS "Users can view teachers from their school" ON teachers;
DROP POLICY IF EXISTS "Users can view classes from their school" ON classes;

-- Create proper RLS policies for students
CREATE POLICY "School isolation for students" ON students
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM admins WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM teachers WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM students WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM parents WHERE user_id = auth.uid()
    )
  );

-- Create proper RLS policies for teachers
CREATE POLICY "School isolation for teachers" ON teachers
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM admins WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM teachers WHERE user_id = auth.uid()
    )
  );

-- Create proper RLS policies for classes
CREATE POLICY "School isolation for classes" ON classes
  FOR ALL
  USING (
    school_id IN (
      SELECT school_id FROM admins WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM teachers WHERE user_id = auth.uid()
      UNION
      SELECT school_id FROM students WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- Add status column to schools table if not exists
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'schools' AND column_name = 'status'
  ) THEN
    ALTER TABLE schools ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;
END $$;

-- Add check constraint for school status
ALTER TABLE schools
  DROP CONSTRAINT IF EXISTS schools_status_check,
  ADD CONSTRAINT schools_status_check
  CHECK (status IN ('active', 'inactive', 'suspended'));

-- ============================================
-- Grant service role full access (for backend)
-- ============================================

-- Note: These policies allow the service role to bypass RLS
-- The backend uses supabaseAdmin which uses the service role key
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
