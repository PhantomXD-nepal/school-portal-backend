-- Migration: Create syllabus table for class chapter management
-- Created: 2025-12-19

CREATE TABLE IF NOT EXISTS public.syllabus (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id uuid NOT NULL,
  title character varying NOT NULL,
  description text,
  chapter_order integer DEFAULT 0,
  is_completed boolean DEFAULT false,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT syllabus_pkey PRIMARY KEY (id),
  CONSTRAINT syllabus_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT syllabus_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.teachers(id)
);

-- Create index for faster lookups by class
CREATE INDEX IF NOT EXISTS idx_syllabus_class_id ON public.syllabus(class_id);

-- Add comment for documentation
COMMENT ON TABLE public.syllabus IS 'Stores syllabus chapters for each class, managed by teachers';
