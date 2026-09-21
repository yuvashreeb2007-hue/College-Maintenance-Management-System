-- ==============================================================================
-- Supabase PostgreSQL Schema for College Maintenance Management System (CampusFix)
-- Source of Truth: SRS.md (FR-01 through FR-06)
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Create Categories Table (FR-05: Maintenance Categories)
CREATE TABLE IF NOT EXISTS public.categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  accent_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Users Table (FR-01: Authentication for Student and Maintenance Staff)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Complaints Table (FR-02, FR-03, FR-04, FR-05)
CREATE TABLE IF NOT EXISTS public.complaints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES public.categories(name) ON UPDATE CASCADE,
  location TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Ongoing', 'Resolved')) DEFAULT 'Pending',
  assigned_to TEXT NOT NULL DEFAULT '-',
  created TEXT NOT NULL DEFAULT 'Today',
  details TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'Student',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Indexes for Query Optimization & Reports (FR-06)
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON public.complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON public.complaints(priority);
CREATE INDEX IF NOT EXISTS idx_complaints_created_by ON public.complaints(created_by);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Categories RLS Policies
DROP POLICY IF EXISTS "Allow public read categories" ON public.categories;
CREATE POLICY "Allow public read categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert categories" ON public.categories;
CREATE POLICY "Allow public insert categories" ON public.categories FOR INSERT WITH CHECK (true);

-- Users RLS Policies
DROP POLICY IF EXISTS "Allow public read users" ON public.users;
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);

-- Complaints RLS Policies (Allow Read, Insert, Update, Delete)
DROP POLICY IF EXISTS "Allow public read complaints" ON public.complaints;
CREATE POLICY "Allow public read complaints" ON public.complaints FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert complaints" ON public.complaints;
CREATE POLICY "Allow public insert complaints" ON public.complaints FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update complaints" ON public.complaints;
CREATE POLICY "Allow public update complaints" ON public.complaints FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete complaints" ON public.complaints;
CREATE POLICY "Allow public delete complaints" ON public.complaints FOR DELETE USING (true);

-- ==============================================================================
-- Data Migration & Seeding (Preserves All Existing Records)
-- ==============================================================================

-- Seed Categories (FR-05)
INSERT INTO public.categories (name, description, icon, accent_color)
VALUES
  ('Plumbing', 'Leaks, taps, washrooms and water supply issues.', 'fa-faucet-drip', 'blue'),
  ('Electrical', 'Lights, fans, switches and power-related problems.', 'fa-bolt', 'yellow'),
  ('Network', 'Wi-Fi, connectivity and network access issues.', 'fa-wifi', 'cyan'),
  ('Furniture', 'Desks, chairs, classroom fixtures and furniture.', 'fa-chair', 'violet'),
  ('Cleaning', 'Classroom, corridor, washroom and campus cleanliness.', 'fa-broom', 'green')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color;

-- Seed Users (FR-01)
INSERT INTO public.users (username, password, role)
VALUES
  ('Student', 'student123', 'student'),
  ('Staff', 'staff123', 'staff')
ON CONFLICT (username) DO NOTHING;

-- Seed Complaints (Preserves existing CMP-001 through CMP-008 without data loss)
INSERT INTO public.complaints (id, title, category, location, priority, status, assigned_to, created, details, evidence, created_by)
VALUES
  ('CMP-001', 'Flickering lights in Room 101', 'Electrical', 'Block A, Room 101', 'High', 'Pending', '-', 'Today', 'Lights continuously flicker and buzz during class.', '', 'Student'),
  ('CMP-002', 'Leaking tap in washroom', 'Plumbing', 'Block B, First Floor', 'Medium', 'Ongoing', 'Maintenance Staff', 'Yesterday', 'Tap in restroom 2B does not shut off completely.', '', 'Student'),
  ('CMP-003', 'Classroom fan not working', 'Electrical', 'Block A, Room 204', 'High', 'Ongoing', 'Maintenance Staff', '2 days ago', 'Ceiling fan in row 3 stopped spinning.', '', 'Student'),
  ('CMP-004', 'Corridor needs cleaning', 'Cleaning', 'Block C, Ground Floor', 'Low', 'Resolved', 'Maintenance Staff', '3 days ago', 'Spilled liquid near laboratory entrance.', '', 'Student'),
  ('CMP-005', 'Dripping pipe in laboratory', 'Plumbing', 'Science Block, Lab 2', 'Medium', 'Pending', '-', '4 days ago', 'Under-sink pipe has a steady drip.', '', 'Student'),
  ('CMP-006', 'Campus Wi-Fi unavailable', 'Network', 'Library, Second Floor', 'High', 'Resolved', 'Maintenance Staff', '5 days ago', 'Router in reading room was offline.', '', 'Student'),
  ('CMP-007', 'Broken chair in classroom', 'Furniture', 'Block B, Room 108', 'Low', 'Pending', '-', '6 days ago', 'Armrest and back bracket loose.', '', 'Student'),
  ('CMP-008', 'Washroom cleaning required', 'Cleaning', 'Block A, Ground Floor', 'Medium', 'Resolved', 'Maintenance Staff', '1 week ago', 'General cleaning and hygiene refresh needed.', '', 'Student')
ON CONFLICT (id) DO NOTHING;
