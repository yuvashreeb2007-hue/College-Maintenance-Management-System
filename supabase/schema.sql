-- ==============================================================================
-- Supabase PostgreSQL Schema for College Maintenance Management System (CampusFix)
-- ==============================================================================

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Complaints Table
CREATE TABLE IF NOT EXISTS public.complaints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Plumbing', 'Electrical', 'Network', 'Furniture', 'Cleaning')),
  location TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Ongoing', 'Resolved')) DEFAULT 'Pending',
  assigned_to TEXT NOT NULL DEFAULT '-',
  created TEXT NOT NULL DEFAULT 'Today',
  details TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  created_by TEXT DEFAULT 'Student',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Allow public access for anon / authenticated roles to support web client operations
DROP POLICY IF EXISTS "Allow public read users" ON public.users;
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert users" ON public.users;
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read complaints" ON public.complaints;
CREATE POLICY "Allow public read complaints" ON public.complaints FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert complaints" ON public.complaints;
CREATE POLICY "Allow public insert complaints" ON public.complaints FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update complaints" ON public.complaints;
CREATE POLICY "Allow public update complaints" ON public.complaints FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete complaints" ON public.complaints;
CREATE POLICY "Allow public delete complaints" ON public.complaints FOR DELETE USING (true);

-- 4. Seed Initial Users
INSERT INTO public.users (username, password, role)
VALUES
  ('Student', 'password', 'student'),
  ('Staff', 'password', 'staff')
ON CONFLICT (username) DO NOTHING;

-- 5. Seed Existing Complaint Records
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
