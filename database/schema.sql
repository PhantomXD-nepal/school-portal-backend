-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  school_id uuid,
  first_name character varying,
  last_name character varying,
  phone character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admins_pkey PRIMARY KEY (id),
  CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT admins_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.announcement_recipients (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  announcement_id uuid,
  user_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT announcement_recipients_pkey PRIMARY KEY (id),
  CONSTRAINT announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id),
  CONSTRAINT announcement_recipients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  school_id uuid,
  created_by uuid,
  title character varying NOT NULL,
  content text NOT NULL,
  type character varying,
  target_role character varying,
  target_class_id uuid,
  scheduled_for timestamp with time zone,
  status character varying DEFAULT 'published'::character varying,
  attachment_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT announcements_pkey PRIMARY KEY (id),
  CONSTRAINT announcements_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id),
  CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT announcements_target_class_id_fkey FOREIGN KEY (target_class_id) REFERENCES public.classes(id)
);
CREATE TABLE public.attendance (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  student_id uuid,
  class_id uuid,
  date date NOT NULL,
  status character varying NOT NULL,
  marked_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT attendance_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT attendance_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.teachers(id)
);
CREATE TABLE public.class_enrollments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id uuid,
  student_id uuid,
  enrollment_date date DEFAULT CURRENT_DATE,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT class_enrollments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT class_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.class_teachers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  class_id uuid,
  teacher_id uuid,
  subject character varying,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_teachers_pkey PRIMARY KEY (id),
  CONSTRAINT class_teachers_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT class_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)
);
CREATE TABLE public.classes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  school_id uuid,
  name character varying NOT NULL,
  grade character varying NOT NULL,
  section character varying,
  capacity integer,
  room_number character varying,
  academic_year character varying,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT classes_pkey PRIMARY KEY (id),
  CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.grades (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  student_id uuid,
  class_id uuid,
  teacher_id uuid,
  subject character varying NOT NULL,
  assessment_type character varying,
  score numeric,
  max_score numeric,
  percentage numeric,
  grade character varying,
  comments text,
  assessment_date date,
  is_locked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT grades_pkey PRIMARY KEY (id),
  CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT grades_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id),
  CONSTRAINT grades_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  student_id uuid,
  invoice_number character varying NOT NULL UNIQUE,
  amount numeric NOT NULL,
  due_date date,
  status character varying DEFAULT 'unpaid'::character varying,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.parents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  phone character varying,
  address text,
  occupation character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  school_id uuid,
  CONSTRAINT parents_pkey PRIMARY KEY (id),
  CONSTRAINT parents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT parents_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  invoice_id uuid,
  amount numeric NOT NULL,
  payment_date date DEFAULT CURRENT_DATE,
  payment_method character varying,
  transaction_id character varying,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL UNIQUE,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.schools (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name character varying NOT NULL,
  logo_url text,
  address text,
  phone character varying,
  email character varying,
  website character varying,
  timezone character varying DEFAULT 'UTC'::character varying,
  academic_year_start date,
  academic_year_end date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  school_key character varying UNIQUE,
  CONSTRAINT schools_pkey PRIMARY KEY (id)
);
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  school_id uuid,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  date_of_birth date,
  gender character varying,
  roll_number character varying,
  grade character varying,
  section character varying,
  admission_date date,
  status character varying DEFAULT 'active'::character varying,
  address text,
  emergency_contact character varying,
  medical_info text,
  photo_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email character varying,
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.teachers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  school_id uuid,
  first_name character varying NOT NULL,
  last_name character varying NOT NULL,
  email character varying NOT NULL UNIQUE,
  phone character varying,
  department character varying,
  designation character varying,
  qualification character varying,
  hire_date date,
  photo_url text,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teachers_pkey PRIMARY KEY (id),
  CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT teachers_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  role_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  first_name character varying,
  last_name character varying,
  phone character varying,
  avatar_url text,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
