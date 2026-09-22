-- ==============================================================================
-- Supabase PostgreSQL Schema for College Maintenance Management System (CampusFix)
-- Source of Truth: SRS.md + Role-Based Access Control (Student, Worker, Admin)
-- ==============================================================================

-- Enable UUID extension
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

-- 2. Create Users Table with Role-Based Access Control (student, worker, admin)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  student_id TEXT,
  department TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'worker', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Complaints Table
CREATE TABLE IF NOT EXISTS public.complaints (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES public.categories(name) ON UPDATE CASCADE,
  location TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Assigned', 'In Progress', 'Ongoing', 'Resolved')) DEFAULT 'Pending',
  assigned_to TEXT NOT NULL DEFAULT '-',
  assigned_worker_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created TEXT NOT NULL DEFAULT 'Today',
  details TEXT DEFAULT '',
  evidence TEXT DEFAULT '',
  work_notes TEXT DEFAULT '',
  resolution_notes TEXT DEFAULT '',
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  feedback TEXT DEFAULT '',
  feedback_rating INT CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'Student',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Notifications Table (In-App Workflow Notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  target_role TEXT CHECK (target_role IN ('student', 'worker', 'admin', 'all')),
  target_user_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'assignment', 'progress', 'resolution', 'feedback')),
  complaint_id TEXT REFERENCES public.complaints(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Indexes for Query Optimization & Reports
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON public.complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON public.complaints(priority);
CREATE INDEX IF NOT EXISTS idx_complaints_created_by ON public.complaints(created_by);
CREATE INDEX IF NOT EXISTS idx_complaints_worker ON public.complaints(assigned_worker_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON public.notifications(target_role);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Allow public update users" ON public.users;
CREATE POLICY "Allow public update users" ON public.users FOR UPDATE USING (true);

-- Complaints RLS Policies
DROP POLICY IF EXISTS "Allow public read complaints" ON public.complaints;
CREATE POLICY "Allow public read complaints" ON public.complaints FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert complaints" ON public.complaints;
CREATE POLICY "Allow public insert complaints" ON public.complaints FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update complaints" ON public.complaints;
CREATE POLICY "Allow public update complaints" ON public.complaints FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete complaints" ON public.complaints;
CREATE POLICY "Allow public delete complaints" ON public.complaints FOR DELETE USING (true);

-- Notifications RLS Policies
DROP POLICY IF EXISTS "Allow public read notifications" ON public.notifications;
CREATE POLICY "Allow public read notifications" ON public.notifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert notifications" ON public.notifications;
CREATE POLICY "Allow public insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update notifications" ON public.notifications;
CREATE POLICY "Allow public update notifications" ON public.notifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete notifications" ON public.notifications;
CREATE POLICY "Allow public delete notifications" ON public.notifications FOR DELETE USING (true);

-- ==============================================================================
-- Data Migration & Seeding (Preserves All Existing Records + Role Accounts)
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

-- Seed Accounts with Roles (Student, Worker, Admin)
-- Password for all seed users is:
-- student -> student123
-- worker  -> worker123
-- admin   -> admin123
INSERT INTO public.users (name, email, username, student_id, department, password_hash, role)
VALUES
  (
    'Campus Administrator',
    'admin@campus.edu',
    'admin',
    NULL,
    'Administration',
    '33919b4cf0ea4c1941656c07be28f1b4:c754d92ebc905391d8ef3f2bc8f152d2740fcb6ca3b782921a97d95fae4465dfae51e44f8f74a00c606ecb691b01625f385c94d1b827e8d6411f1ae599723ec5',
    'admin'
  ),
  (
    'Robert Miller',
    'worker.electrical@campus.edu',
    'worker',
    NULL,
    'Electrical',
    '87e387f5511dc47d216503c73491bc92:288ce833c8da745585098ffbeec94e4881ae9b4334ae1fcb3c10816a7eb84518428236df655452d3a776e0129a65ee14f9d14ea17df12659e98e4d2f09ba19df',
    'worker'
  ),
  (
    'David Vance',
    'worker.plumbing@campus.edu',
    'worker2',
    NULL,
    'Plumbing',
    '87e387f5511dc47d216503c73491bc92:288ce833c8da745585098ffbeec94e4881ae9b4334ae1fcb3c10816a7eb84518428236df655452d3a776e0129a65ee14f9d14ea17df12659e98e4d2f09ba19df',
    'worker'
  ),
  (
    'Alex Johnson',
    'student@campus.edu',
    'student',
    'STU-2024-001',
    'Computer Science',
    'f3c64c781fe57876a4a6e3d2ff9341aa:84df36338b55d911b3334d4c55df6874e0d49b2f6fbf073c683b516ffcc48c409b307ec377484dfc29f2709199d259c7f66e012e87c2c19e5d4814d4ea0a1c6a',
    'student'
  )
ON CONFLICT (email) DO NOTHING;

-- Seed Complaints (Preserves existing CMP-001 through CMP-008 without data loss)
INSERT INTO public.complaints (id, title, category, location, priority, status, assigned_to, created, details, evidence, created_by)
VALUES
  ('CMP-001', 'Flickering lights in Room 101', 'Electrical', 'Block A, Room 101', 'High', 'Pending', '-', 'Today', 'Lights continuously flicker and buzz during class.', '', 'Student'),
  ('CMP-002', 'Leaking tap in washroom', 'Plumbing', 'Block B, First Floor', 'Medium', 'Ongoing', 'Robert Miller', 'Yesterday', 'Tap in restroom 2B does not shut off completely.', '', 'Student'),
  ('CMP-003', 'Classroom fan not working', 'Electrical', 'Block A, Room 204', 'High', 'Ongoing', 'Robert Miller', '2 days ago', 'Ceiling fan in row 3 stopped spinning.', '', 'Student'),
  ('CMP-004', 'Corridor needs cleaning', 'Cleaning', 'Block C, Ground Floor', 'Low', 'Resolved', 'David Vance', '3 days ago', 'Spilled liquid near laboratory entrance.', '', 'Student'),
  ('CMP-005', 'Dripping pipe in laboratory', 'Plumbing', 'Science Block, Lab 2', 'Medium', 'Pending', '-', '4 days ago', 'Under-sink pipe has a steady drip.', '', 'Student'),
  ('CMP-006', 'Campus Wi-Fi unavailable', 'Network', 'Library, Second Floor', 'High', 'Resolved', 'Robert Miller', '5 days ago', 'Router in reading room was offline.', '', 'Student'),
  ('CMP-007', 'Broken chair in classroom', 'Furniture', 'Block B, Room 108', 'Low', 'Pending', '-', '6 days ago', 'Armrest and back bracket loose.', '', 'Student'),
  ('CMP-008', 'Washroom cleaning required', 'Cleaning', 'Block A, Ground Floor', 'Medium', 'Resolved', 'David Vance', '1 week ago', 'General cleaning and hygiene refresh needed.', '', 'Student')
ON CONFLICT (id) DO NOTHING;
