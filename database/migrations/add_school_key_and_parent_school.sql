-- Add school_key to schools table
ALTER TABLE schools ADD COLUMN IF NOT EXISTS school_key VARCHAR(50) UNIQUE;

-- Add school_id to parents table
ALTER TABLE parents ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE;

-- Create index for school_key
CREATE INDEX IF NOT EXISTS idx_schools_key ON schools(school_key);

-- Create index for parents school_id
CREATE INDEX IF NOT EXISTS idx_parents_school ON parents(school_id);
