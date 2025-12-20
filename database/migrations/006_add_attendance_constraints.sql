-- Migration: Add unique constraint on attendance for upsert support
-- Created: 2025-12-19

-- Add unique constraint for class_id + student_id + date combination
-- This allows upsert to work when marking attendance
ALTER TABLE public.attendance
ADD CONSTRAINT attendance_unique_class_student_date
UNIQUE (class_id, student_id, date);

-- Add unique constraint for class_enrollments to prevent duplicate enrollments
ALTER TABLE public.class_enrollments
ADD CONSTRAINT class_enrollments_unique_class_student
UNIQUE (class_id, student_id);
