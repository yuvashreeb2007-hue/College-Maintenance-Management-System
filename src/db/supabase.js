import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import crypto from 'crypto';

// Automatically load local .env if available
if (fs.existsSync('.env') && !process.env.SUPABASE_URL) {
  try {
    process.loadEnvFile('.env');
  } catch (e) {}
}

function sanitizeSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  const match = rawUrl.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
  if (match) return match[0];
  return rawUrl.replace(/\/rest\/v1\/?.*$/i, '').replace(/\/+$/, '');
}

// -----------------------------------------------------------------------------
// Cryptographic Password Hashing (Salt + Scrypt)
// -----------------------------------------------------------------------------
export function hashPassword(password) {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  // Backwards compatibility for plain text seed passwords if any
  if (!storedHash.includes(':')) {
    return password === storedHash;
  }
  try {
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch (err) {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Seed Data & Baseline Models (SRS + RBAC)
// -----------------------------------------------------------------------------
const INITIAL_CATEGORIES = [
  { name: 'Plumbing', description: 'Leaks, taps, washrooms and water supply issues.', icon: 'fa-faucet-drip', accent_color: 'blue' },
  { name: 'Electrical', description: 'Lights, fans, switches and power-related problems.', icon: 'fa-bolt', accent_color: 'yellow' },
  { name: 'Network', description: 'Wi-Fi, connectivity and network access issues.', icon: 'fa-wifi', accent_color: 'cyan' },
  { name: 'Furniture', description: 'Desks, chairs, classroom fixtures and furniture.', icon: 'fa-chair', accent_color: 'violet' },
  { name: 'Cleaning', description: 'Classroom, corridor, washroom and campus cleanliness.', icon: 'fa-broom', accent_color: 'green' }
];

const INITIAL_USERS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Campus Administrator',
    email: 'admin@campus.edu',
    username: 'admin',
    student_id: null,
    department: 'Administration',
    password_hash: hashPassword('admin123'),
    role: 'admin',
    created_at: new Date().toISOString()
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Robert Miller',
    email: 'worker.electrical@campus.edu',
    username: 'worker',
    student_id: null,
    department: 'Electrical',
    password_hash: hashPassword('worker123'),
    role: 'worker',
    created_at: new Date().toISOString()
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'David Vance',
    email: 'worker.plumbing@campus.edu',
    username: 'worker2',
    student_id: null,
    department: 'Plumbing',
    password_hash: hashPassword('worker123'),
    role: 'worker',
    created_at: new Date().toISOString()
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Alex Johnson',
    email: 'student@campus.edu',
    username: 'student',
    student_id: 'STU-2024-001',
    department: 'Computer Science',
    password_hash: hashPassword('student123'),
    role: 'student',
    created_at: new Date().toISOString()
  },
  // Legacy aliases for backwards-compatibility with tests & previous sessions
  {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Staff Member',
    email: 'staff@campus.edu',
    username: 'staff',
    student_id: null,
    department: 'Facilities',
    password_hash: hashPassword('staff123'),
    role: 'worker',
    created_at: new Date().toISOString()
  }
];

const INITIAL_COMPLAINTS = [
  { id: 'CMP-001', title: 'Flickering lights in Room 101', category: 'Electrical', location: 'Block A, Room 101', priority: 'High', status: 'Pending', assignedTo: '-', assignedWorkerId: null, created: 'Today', details: 'Lights continuously flicker and buzz during class.', evidence: '', createdBy: 'Alex Johnson', workNotes: '', resolutionNotes: '', assignedAt: null, startedAt: null, resolvedAt: null, feedback: '', feedbackRating: null, feedbackAt: null },
  { id: 'CMP-002', title: 'Leaking tap in washroom', category: 'Plumbing', location: 'Block B, First Floor', priority: 'Medium', status: 'In Progress', assignedTo: 'Robert Miller', assignedWorkerId: '22222222-2222-4222-8222-222222222222', created: 'Yesterday', details: 'Tap in restroom 2B does not shut off completely.', evidence: '', createdBy: 'Alex Johnson', workNotes: 'Replacement cartridge ordered from warehouse.', resolutionNotes: '', assignedAt: new Date(Date.now() - 86400000).toISOString(), startedAt: new Date(Date.now() - 43200000).toISOString(), resolvedAt: null, feedback: '', feedbackRating: null, feedbackAt: null },
  { id: 'CMP-003', title: 'Classroom fan not working', category: 'Electrical', location: 'Block A, Room 204', priority: 'High', status: 'Assigned', assignedTo: 'Robert Miller', assignedWorkerId: '22222222-2222-4222-8222-222222222222', created: '2 days ago', details: 'Ceiling fan in row 3 stopped spinning.', evidence: '', createdBy: 'Alex Johnson', workNotes: '', resolutionNotes: '', assignedAt: new Date(Date.now() - 172800000).toISOString(), startedAt: null, resolvedAt: null, feedback: '', feedbackRating: null, feedbackAt: null },
  { id: 'CMP-004', title: 'Corridor needs cleaning', category: 'Cleaning', location: 'Block C, Ground Floor', priority: 'Low', status: 'Resolved', assignedTo: 'David Vance', assignedWorkerId: '33333333-3333-4333-8333-333333333333', created: '3 days ago', details: 'Spilled liquid near laboratory entrance.', evidence: '', createdBy: 'Alex Johnson', workNotes: 'Mopped and sanitized floor area.', resolutionNotes: 'Mopped and sanitized floor area thoroughly.', assignedAt: new Date(Date.now() - 259200000).toISOString(), startedAt: new Date(Date.now() - 216000000).toISOString(), resolvedAt: new Date(Date.now() - 172800000).toISOString(), feedback: 'Prompt and clean response, thank you!', feedbackRating: 5, feedbackAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'CMP-005', title: 'Dripping pipe in laboratory', category: 'Plumbing', location: 'Science Block, Lab 2', priority: 'Medium', status: 'Pending', assignedTo: '-', assignedWorkerId: null, created: '4 days ago', details: 'Under-sink pipe has a steady drip.', evidence: '', createdBy: 'Alex Johnson', workNotes: '', resolutionNotes: '', assignedAt: null, startedAt: null, resolvedAt: null, feedback: '', feedbackRating: null, feedbackAt: null },
  { id: 'CMP-006', title: 'Campus Wi-Fi unavailable', category: 'Network', location: 'Library, Second Floor', priority: 'High', status: 'Resolved', assignedTo: 'Robert Miller', assignedWorkerId: '22222222-2222-4222-8222-222222222222', created: '5 days ago', details: 'Router in reading room was offline.', evidence: '', createdBy: 'Alex Johnson', workNotes: 'Access point power cycled and firmware updated.', resolutionNotes: 'Access point power cycled and firmware updated.', assignedAt: new Date(Date.now() - 432000000).toISOString(), startedAt: new Date(Date.now() - 345600000).toISOString(), resolvedAt: new Date(Date.now() - 259200000).toISOString(), feedback: 'Internet is working fast again.', feedbackRating: 5, feedbackAt: new Date(Date.now() - 172800000).toISOString() },
  { id: 'CMP-007', title: 'Broken chair in classroom', category: 'Furniture', location: 'Block B, Room 108', priority: 'Low', status: 'Pending', assignedTo: '-', assignedWorkerId: null, created: '6 days ago', details: 'Armrest and back bracket loose.', evidence: '', createdBy: 'Alex Johnson', workNotes: '', resolutionNotes: '', assignedAt: null, startedAt: null, resolvedAt: null, feedback: '', feedbackRating: null, feedbackAt: null },
  { id: 'CMP-008', title: 'Washroom cleaning required', category: 'Cleaning', location: 'Block A, Ground Floor', priority: 'Medium', status: 'Resolved', assignedTo: 'David Vance', assignedWorkerId: '33333333-3333-4333-8333-333333333333', created: '1 week ago', details: 'General cleaning and hygiene refresh needed.', evidence: '', createdBy: 'Alex Johnson', workNotes: 'Completed standard hygiene sanitation protocol.', resolutionNotes: 'Completed standard hygiene sanitation protocol.', assignedAt: new Date(Date.now() - 604800000).toISOString(), startedAt: new Date(Date.now() - 518400000).toISOString(), resolvedAt: new Date(Date.now() - 432000000).toISOString(), feedback: '', feedbackRating: null, feedbackAt: null }
];

const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-seed-1',
    user_id: null,
    target_role: 'worker',
    target_user_id: '22222222-2222-4222-8222-222222222222',
    title: 'Ticket Assigned: CMP-002',
    message: 'Robert Miller was assigned to repair "Leaking tap in washroom".',
    type: 'assignment',
    complaint_id: 'CMP-002',
    is_read: false,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString()
  },
  {
    id: 'notif-seed-2',
    user_id: null,
    target_role: 'student',
    target_user_id: 'student@campus.edu',
    title: 'Complaint CMP-006 Resolved',
    message: 'Campus Wi-Fi in Library Second Floor has been resolved. You can provide feedback.',
    type: 'resolution',
    complaint_id: 'CMP-006',
    is_read: false,
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 'notif-seed-3',
    user_id: null,
    target_role: 'admin',
    target_user_id: null,
    title: 'New Complaint Registered',
    message: 'Alex Johnson submitted CMP-001: Flickering lights in Room 101.',
    type: 'info',
    complaint_id: 'CMP-001',
    is_read: true,
    created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  }
];

// In-Memory Storage
let inMemoryCategories = JSON.parse(JSON.stringify(INITIAL_CATEGORIES));
let inMemoryUsers = JSON.parse(JSON.stringify(INITIAL_USERS));
let inMemoryComplaints = JSON.parse(JSON.stringify(INITIAL_COMPLAINTS));
let inMemoryNotifications = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));

let supabaseClient = null;
let migrationCompleted = false;
let tableNoticeLogged = false;

export function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false }
      });
      console.log(`[CampusFix] Supabase client initialized for PostgreSQL at ${url}`);
    } catch (err) {
      console.warn('[CampusFix] Failed to initialize Supabase client:', err.message);
      supabaseClient = null;
    }
  }
  return supabaseClient;
}

export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export function getDatabaseStatus() {
  const configured = isSupabaseConfigured();
  const url = sanitizeSupabaseUrl(process.env.SUPABASE_URL);
  return {
    configured,
    url: configured ? url : null,
    mode: configured ? 'Supabase PostgreSQL' : 'In-Memory Resilient Fallback'
  };
}

function mapComplaintFromDb(row) {
  if (!row) return null;
  const notes = row.resolution_notes || row.resolutionNotes || row.work_notes || row.workNotes || '';
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to || row.assignedTo || '-',
    assignedWorkerId: row.assigned_worker_id || row.assignedWorkerId || null,
    created: row.created || 'Today',
    details: row.details || '',
    evidence: row.evidence || '',
    workNotes: notes,
    resolutionNotes: notes,
    assignedAt: row.assigned_at || row.assignedAt || null,
    startedAt: row.started_at || row.startedAt || null,
    resolvedAt: row.resolved_at || row.resolvedAt || null,
    feedback: row.feedback || '',
    feedbackRating: row.feedback_rating !== undefined ? row.feedback_rating : (row.feedbackRating || null),
    feedbackAt: row.feedback_at || row.feedbackAt || null,
    createdBy: row.created_by || row.createdBy || 'Student',
    userId: row.user_id || row.userId || null,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };
}

function mapComplaintToDb(data) {
  const notes = data.resolutionNotes || data.resolution_notes || data.workNotes || data.work_notes || '';
  return {
    id: data.id,
    title: data.title,
    category: data.category,
    location: data.location,
    priority: data.priority,
    status: data.status || 'Pending',
    assigned_to: data.assignedTo || data.assigned_to || '-',
    assigned_worker_id: data.assignedWorkerId || data.assigned_worker_id || null,
    created: data.created || 'Today',
    details: data.details || '',
    evidence: data.evidence || '',
    work_notes: notes,
    resolution_notes: notes,
    assigned_at: data.assignedAt || data.assigned_at || null,
    started_at: data.startedAt || data.started_at || null,
    resolved_at: data.resolvedAt || data.resolved_at || null,
    feedback: data.feedback || '',
    feedback_rating: data.feedbackRating !== undefined ? data.feedbackRating : (data.feedback_rating || null),
    feedback_at: data.feedbackAt || data.feedback_at || null,
    created_by: data.createdBy || data.created_by || 'Student',
    user_id: data.userId || data.user_id || null
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, password, ...clean } = user;
  return clean;
}

/**
 * Migration helper to ensure Supabase tables are populated without data loss.
 */
export async function migrateDataToSupabase(client) {
  if (!client || migrationCompleted) return;

  try {
    const { count: catCount, error: catErr } = await client
      .from('categories')
      .select('*', { count: 'exact', head: true });

    if (catErr) {
      if (catErr.code === 'PGRST205' && !tableNoticeLogged) {
        tableNoticeLogged = true;
        console.log('[CampusFix Notice] Supabase tables not detected yet. Run supabase/schema.sql in Supabase SQL Editor.');
      }
      return;
    }

    if (catCount === null || catCount === 0) {
      console.log('[CampusFix] Seeding categories...');
      await client.from('categories').upsert(INITIAL_CATEGORIES, { onConflict: 'name' });
    }

    const { count: userCount, error: userErr } = await client
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (!userErr && (userCount === null || userCount === 0)) {
      console.log('[CampusFix] Seeding initial users...');
      await client.from('users').upsert(INITIAL_USERS, { onConflict: 'email' });
    }

    const { count: compCount, error: compErr } = await client
      .from('complaints')
      .select('*', { count: 'exact', head: true });

    if (!compErr && (compCount === null || compCount === 0)) {
      console.log('[CampusFix] Seeding initial complaints...');
      const seedRows = INITIAL_COMPLAINTS.map(mapComplaintToDb);
      await client.from('complaints').upsert(seedRows, { onConflict: 'id' });
    }

    migrationCompleted = true;
  } catch (err) {
    console.warn('[CampusFix] Supabase sync notice:', err.message);
  }
}

// -----------------------------------------------------------------------------
// USER & AUTHENTICATION OPERATIONS
// -----------------------------------------------------------------------------

/**
 * Register a new student account.
 * AUTOMATICALLY assigns role = 'student'.
 * Strictly forbids self-assigning 'admin' or 'worker'.
 */
export async function registerStudent({ name, studentId, email, password, department }) {
  if (!name || !name.trim()) throw new Error('Full Name is required.');
  if (!studentId || !studentId.trim()) throw new Error('Student ID / Register Number is required.');
  if (!email || !email.trim()) throw new Error('Email is required.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  const cleanEmail = email.trim().toLowerCase();
  const cleanStudentId = studentId.trim();
  const cleanName = name.trim();
  const cleanDept = (department || 'General').trim();

  // Check duplicate email / student ID
  const existingUser = inMemoryUsers.find(
    u => (u.email && u.email.toLowerCase() === cleanEmail) ||
         (u.student_id && u.student_id.toLowerCase() === cleanStudentId.toLowerCase())
  );
  if (existingUser) {
    if (existingUser.email && existingUser.email.toLowerCase() === cleanEmail) {
      throw new Error('An account with this email already exists.');
    }
    throw new Error('An account with this Student ID already exists.');
  }

  const newUser = {
    id: crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    username: cleanEmail.split('@')[0],
    student_id: cleanStudentId,
    department: cleanDept,
    password_hash: hashPassword(password),
    role: 'student', // ALWAYS assigned 'student'
    created_at: new Date().toISOString()
  };

  const client = getSupabase();
  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client.from('users').insert([newUser]).select().single();
      if (!error && data) {
        inMemoryUsers.push(newUser);
        return sanitizeUser(data);
      }
    } catch (e) {}
  }

  inMemoryUsers.push(newUser);
  return sanitizeUser(newUser);
}

/**
 * Authenticate user by email or username, checking password against password_hash.
 * Backend determines the user's actual role ('student', 'worker', 'admin').
 */
export async function authenticateUser(identifier, password, requestedRole) {
  if (!identifier || !identifier.trim()) throw new Error('Username or email is required.');
  if (!password) throw new Error('Password is required.');

  const term = identifier.trim().toLowerCase();
  const client = getSupabase();

  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client
        .from('users')
        .select('*')
        .or(`email.ilike.${term},username.ilike.${term}`)
        .limit(1);

      if (!error && data && data.length > 0) {
        const dbUser = data[0];
        const valid = verifyPassword(password, dbUser.password_hash || dbUser.password);
        if (valid) {
          return sanitizeUser(dbUser);
        }
      }
    } catch (e) {}
  }

  // Check In-Memory Store
  const user = inMemoryUsers.find(
    u => (u.email && u.email.toLowerCase() === term) ||
         (u.username && u.username.toLowerCase() === term) ||
         (u.name && u.name.toLowerCase() === term)
  );

  if (user) {
    const valid = verifyPassword(password, user.password_hash || user.password);
    if (valid) {
      return sanitizeUser(user);
    }
  }

  // Backwards compatibility for demo credentials if user not yet created
  if (term === 'student' && password === 'student123') {
    const defaultStudent = inMemoryUsers.find(u => u.role === 'student');
    return sanitizeUser(defaultStudent);
  }
  if (term === 'admin' && password === 'admin123') {
    const defaultAdmin = inMemoryUsers.find(u => u.role === 'admin');
    return sanitizeUser(defaultAdmin);
  }
  if ((term === 'worker' || term === 'staff') && (password === 'worker123' || password === 'staff123')) {
    const defaultWorker = inMemoryUsers.find(u => u.role === 'worker');
    return sanitizeUser(defaultWorker);
  }

  throw new Error('Invalid credentials. Please check your username/email and password.');
}

/**
 * Get all users (Admin only).
 */
export async function getAllUsers() {
  const client = getSupabase();
  let dbUsers = [];
  if (client) {
    try {
      const { data, error } = await client.from('users').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        dbUsers = data.map(sanitizeUser);
      }
    } catch (e) {}
  }

  // Merge so default system accounts (admin, technicians) are always accessible
  const combined = new Map();
  for (const u of inMemoryUsers) {
    combined.set(u.email ? u.email.toLowerCase() : u.id, sanitizeUser(u));
  }
  for (const u of dbUsers) {
    combined.set(u.email ? u.email.toLowerCase() : u.id, u);
  }
  return Array.from(combined.values());
}

/**
 * Get maintenance workers (Admin & Worker coordination).
 */
export async function getWorkers() {
  const all = await getAllUsers();
  return all.filter(u => u.role === 'worker');
}

/**
 * Create a new maintenance worker account (Admin only).
 */
export async function createWorker({ name, email, department, password }) {
  if (!name || !name.trim()) throw new Error('Worker Name is required.');
  if (!email || !email.trim()) throw new Error('Worker Email is required.');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');

  const cleanEmail = email.trim().toLowerCase();
  const existing = inMemoryUsers.find(u => u.email && u.email.toLowerCase() === cleanEmail);
  if (existing) throw new Error('An account with this email already exists.');

  const newWorker = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: cleanEmail,
    username: cleanEmail.split('@')[0],
    student_id: null,
    department: (department || 'General Maintenance').trim(),
    password_hash: hashPassword(password),
    role: 'worker',
    created_at: new Date().toISOString()
  };

  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client.from('users').insert([newWorker]).select().single();
      if (!error && data) {
        inMemoryUsers.push(newWorker);
        return sanitizeUser(data);
      }
    } catch (e) {}
  }

  inMemoryUsers.push(newWorker);
  return sanitizeUser(newWorker);
}

// -----------------------------------------------------------------------------
// COMPLAINT OPERATIONS
// -----------------------------------------------------------------------------

export async function getCategories() {
  const client = getSupabase();
  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client.from('categories').select('*').order('id', { ascending: true });
      if (!error && data && data.length > 0) return data;
    } catch (e) {}
  }
  return inMemoryCategories;
}

export async function getComplaints() {
  const client = getSupabase();
  let dbComplaints = [];
  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client.from('complaints').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        dbComplaints = data.map(mapComplaintFromDb);
      }
    } catch (e) {}
  }

  // Unified merge: db complaints + in-memory complaints
  const map = new Map();
  for (const c of dbComplaints) {
    map.set(c.id, c);
  }
  for (const c of inMemoryComplaints) {
    const existing = map.get(c.id) || {};
    map.set(c.id, { ...existing, ...c });
  }

  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });
}

export async function getComplaintById(id) {
  const mem = inMemoryComplaints.find(c => c.id === id);
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client.from('complaints').select('*').eq('id', id).single();
      if (!error && data) {
        const fromDb = mapComplaintFromDb(data);
        return mem ? { ...fromDb, ...mem } : fromDb;
      }
    } catch (e) {}
  }
  return mem ? JSON.parse(JSON.stringify(mem)) : null;
}

export async function getComplaintsForStudent(studentName, studentEmail, studentUserId) {
  const all = await getComplaints();
  return all.filter(c => {
    if (studentUserId && c.userId && c.userId === studentUserId) return true;
    if (!c.createdBy) return false;
    const author = c.createdBy.toLowerCase();
    return (
      (studentName && author === studentName.toLowerCase()) ||
      (studentEmail && author === studentEmail.toLowerCase()) ||
      author === 'student'
    );
  });
}

export async function getComplaintsForWorker(workerName, workerId) {
  const all = await getComplaints();
  return all.filter(c => {
    if (workerId && c.assignedWorkerId === workerId) return true;
    if (workerName && c.assignedTo && c.assignedTo.toLowerCase() === workerName.toLowerCase()) return true;
    return false;
  });
}

export async function createComplaint(complaintData) {
  const client = getSupabase();
  const dbPayload = mapComplaintToDb(complaintData);

  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client.from('complaints').insert([dbPayload]).select().single();
      if (!error && data) {
        const mapped = mapComplaintFromDb(data);
        inMemoryComplaints.unshift(mapped);
        return mapped;
      }
    } catch (e) {}
  }

  const mapped = mapComplaintFromDb(dbPayload);
  inMemoryComplaints.unshift(mapped);
  return mapped;
}

export async function updateComplaint(id, updates) {
  const notes = updates.resolutionNotes || updates.resolution_notes || updates.workNotes || updates.work_notes;

  // Always update in-memory record
  let complaint = inMemoryComplaints.find(c => c.id === id);
  if (!complaint) {
    const client = getSupabase();
    if (client) {
      try {
        const { data } = await client.from('complaints').select('*').eq('id', id).single();
        if (data) {
          complaint = mapComplaintFromDb(data);
          inMemoryComplaints.unshift(complaint);
        }
      } catch (e) {}
    }
  }

  if (complaint) {
    if (updates.status !== undefined) complaint.status = updates.status;
    if (updates.assignedTo !== undefined) complaint.assignedTo = updates.assignedTo;
    if (updates.assigned_to !== undefined) complaint.assignedTo = updates.assigned_to;
    if (updates.assignedWorkerId !== undefined) complaint.assignedWorkerId = updates.assignedWorkerId;
    if (updates.assigned_worker_id !== undefined) complaint.assignedWorkerId = updates.assigned_worker_id;

    if (notes !== undefined) {
      complaint.workNotes = notes;
      complaint.resolutionNotes = notes;
    }

    if (updates.assignedAt !== undefined) complaint.assignedAt = updates.assignedAt;
    if (updates.assigned_at !== undefined) complaint.assignedAt = updates.assigned_at;
    if (updates.startedAt !== undefined) complaint.startedAt = updates.startedAt;
    if (updates.started_at !== undefined) complaint.startedAt = updates.started_at;
    if (updates.resolvedAt !== undefined) complaint.resolvedAt = updates.resolvedAt;
    if (updates.resolved_at !== undefined) complaint.resolvedAt = updates.resolved_at;

    if (updates.feedback !== undefined) complaint.feedback = updates.feedback;
    if (updates.feedbackRating !== undefined) complaint.feedbackRating = updates.feedbackRating;
    if (updates.feedback_rating !== undefined) complaint.feedbackRating = updates.feedback_rating;
    if (updates.feedbackAt !== undefined) complaint.feedbackAt = updates.feedbackAt;
    if (updates.feedback_at !== undefined) complaint.feedbackAt = updates.feedback_at;

    if (updates.priority !== undefined) complaint.priority = updates.priority;
    if (updates.details !== undefined) complaint.details = updates.details;
    complaint.updatedAt = new Date().toISOString();
  }

  const client = getSupabase();
  if (client) {
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
    if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to;
    if (updates.assignedWorkerId !== undefined) dbUpdates.assigned_worker_id = updates.assignedWorkerId;
    if (updates.assigned_worker_id !== undefined) dbUpdates.assigned_worker_id = updates.assigned_worker_id;

    if (notes !== undefined) {
      dbUpdates.work_notes = notes;
      dbUpdates.resolution_notes = notes;
    }

    if (updates.assignedAt !== undefined) dbUpdates.assigned_at = updates.assignedAt;
    if (updates.assigned_at !== undefined) dbUpdates.assigned_at = updates.assigned_at;
    if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
    if (updates.started_at !== undefined) dbUpdates.started_at = updates.started_at;
    if (updates.resolvedAt !== undefined) dbUpdates.resolved_at = updates.resolvedAt;
    if (updates.resolved_at !== undefined) dbUpdates.resolved_at = updates.resolved_at;

    if (updates.feedback !== undefined) dbUpdates.feedback = updates.feedback;
    if (updates.feedbackRating !== undefined) dbUpdates.feedback_rating = updates.feedbackRating;
    if (updates.feedback_rating !== undefined) dbUpdates.feedback_rating = updates.feedback_rating;
    if (updates.feedbackAt !== undefined) dbUpdates.feedback_at = updates.feedbackAt;
    if (updates.feedback_at !== undefined) dbUpdates.feedback_at = updates.feedback_at;

    if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
    if (updates.details !== undefined) dbUpdates.details = updates.details;
    dbUpdates.updated_at = new Date().toISOString();

    try {
      const { data, error } = await client.from('complaints').update(dbUpdates).eq('id', id).select().single();
      if (!error && data) {
        const mapped = mapComplaintFromDb(data);
        const idx = inMemoryComplaints.findIndex(c => c.id === id);
        if (idx !== -1) inMemoryComplaints[idx] = mapped;
        return mapped;
      }
    } catch (e) {}
  }

  return complaint || null;
}

// -----------------------------------------------------------------------------
// NOTIFICATIONS OPERATIONS
// -----------------------------------------------------------------------------

function mapNotificationFromDb(row) {
  if (!row) return null;
  const isRead = row.is_read !== undefined ? Boolean(row.is_read) : Boolean(row.read);
  return {
    id: row.id,
    userId: row.user_id || row.userId || null,
    targetRole: row.target_role || row.targetRole || 'all',
    targetUserId: row.target_user_id || row.targetUserId || null,
    title: row.title || 'Notification',
    message: row.message || '',
    type: row.type || 'info',
    complaintId: row.complaint_id || row.complaintId || null,
    read: isRead,
    is_read: isRead,
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

export async function createNotification(payload) {
  const notif = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    user_id: payload.userId || payload.user_id || null,
    target_role: payload.targetRole || payload.target_role || 'all',
    target_user_id: payload.targetUserId || payload.target_user_id || null,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'info',
    complaint_id: payload.complaintId || payload.complaint_id || null,
    is_read: false,
    read: false,
    created_at: new Date().toISOString()
  };

  const client = getSupabase();
  if (client) {
    try {
      const dbPayload = {
        id: notif.id,
        user_id: notif.user_id,
        target_role: notif.target_role,
        target_user_id: notif.target_user_id,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        complaint_id: notif.complaint_id,
        is_read: false,
        created_at: notif.created_at
      };
      const { data, error } = await client.from('notifications').insert([dbPayload]).select().single();
      if (!error && data) {
        const mapped = mapNotificationFromDb(data);
        inMemoryNotifications.unshift(mapped);
        return mapped;
      }
    } catch (e) {}
  }

  const mapped = mapNotificationFromDb(notif);
  inMemoryNotifications.unshift(mapped);
  return mapped;
}

export async function getNotificationsForUser(user) {
  if (!user) return [];
  const client = getSupabase();
  let dbNotifs = [];

  if (client) {
    try {
      const { data, error } = await client.from('notifications').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        dbNotifs = data.map(mapNotificationFromDb);
      }
    } catch (e) {}
  }

  const map = new Map();
  for (const n of dbNotifs) {
    map.set(n.id, n);
  }
  for (const n of inMemoryNotifications) {
    const mapped = mapNotificationFromDb(n);
    map.set(n.id, { ...(map.get(n.id) || {}), ...mapped });
  }

  const allNotifs = Array.from(map.values()).sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime();
    const db = new Date(b.createdAt || 0).getTime();
    return db - da;
  });

  const role = user.role;
  const userId = user.id;
  const username = user.name || user.username || '';
  const email = user.email || '';

  return allNotifs.filter(n => {
    // Check specific user target
    if (n.userId && userId && n.userId === userId) return true;
    if (n.targetUserId) {
      const target = String(n.targetUserId).toLowerCase();
      if (userId && target === String(userId).toLowerCase()) return true;
      if (email && target === email.toLowerCase()) return true;
      if (username && target === username.toLowerCase()) return true;
      return false;
    }
    // Check role target
    if (n.targetRole === 'all') return true;
    if (role === 'admin') return true; // admin sees system & admin notifications
    if (n.targetRole === role) return true;
    return false;
  });
}

export async function markNotificationRead(notificationId) {
  const client = getSupabase();
  if (client) {
    try {
      await client.from('notifications').update({ is_read: true }).eq('id', notificationId);
    } catch (e) {}
  }
  const item = inMemoryNotifications.find(n => n.id === notificationId);
  if (item) {
    item.is_read = true;
    item.read = true;
  }
  return true;
}

export async function markAllNotificationsRead(user) {
  const userNotifs = await getNotificationsForUser(user);
  const ids = userNotifs.map(n => n.id);

  const client = getSupabase();
  if (client && ids.length > 0) {
    try {
      await client.from('notifications').update({ is_read: true }).in('id', ids);
    } catch (e) {}
  }

  inMemoryNotifications.forEach(n => {
    if (ids.includes(n.id)) {
      n.is_read = true;
      n.read = true;
    }
  });
  return true;
}

export async function getUnreadNotificationCount(user) {
  const notifs = await getNotificationsForUser(user);
  return notifs.filter(n => !n.is_read && !n.read).length;
}

export async function getReports() {
  const complaints = await getComplaints();
  const total = complaints.length;
  const pending = complaints.filter(c => c.status === 'Pending');
  const assigned = complaints.filter(c => c.status === 'Assigned');
  const ongoing = complaints.filter(c => c.status === 'Ongoing' || c.status === 'In Progress' || c.status === 'Assigned');
  const resolved = complaints.filter(c => c.status === 'Resolved');
  const highPriority = complaints.filter(c => c.priority === 'High' && c.status !== 'Resolved');

  const categoriesCount = {};
  INITIAL_CATEGORIES.forEach(cat => {
    categoriesCount[cat.name] = complaints.filter(c => c.category === cat.name).length;
  });

  return {
    total,
    pendingCount: pending.length,
    assignedCount: assigned.length,
    ongoingCount: ongoing.length,
    resolvedCount: resolved.length,
    highPriorityCount: highPriority.length,
    byCategory: categoriesCount,
    complaints
  };
}

export function resetInMemoryStore() {
  inMemoryCategories = JSON.parse(JSON.stringify(INITIAL_CATEGORIES));
  inMemoryUsers = JSON.parse(JSON.stringify(INITIAL_USERS));
  inMemoryComplaints = JSON.parse(JSON.stringify(INITIAL_COMPLAINTS));
  inMemoryNotifications = JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS));
}
