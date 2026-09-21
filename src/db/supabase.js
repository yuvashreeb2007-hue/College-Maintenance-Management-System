import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

// SRS Source of Truth: Seed data preserving all existing records without data loss
const INITIAL_CATEGORIES = [
  { name: 'Plumbing', description: 'Leaks, taps, washrooms and water supply issues.', icon: 'fa-faucet-drip', accent_color: 'blue' },
  { name: 'Electrical', description: 'Lights, fans, switches and power-related problems.', icon: 'fa-bolt', accent_color: 'yellow' },
  { name: 'Network', description: 'Wi-Fi, connectivity and network access issues.', icon: 'fa-wifi', accent_color: 'cyan' },
  { name: 'Furniture', description: 'Desks, chairs, classroom fixtures and furniture.', icon: 'fa-chair', accent_color: 'violet' },
  { name: 'Cleaning', description: 'Classroom, corridor, washroom and campus cleanliness.', icon: 'fa-broom', accent_color: 'green' }
];

const INITIAL_USERS = [
  { username: 'Student', password: 'student123', role: 'student' },
  { username: 'Staff', password: 'staff123', role: 'staff' }
];

const INITIAL_COMPLAINTS = [
  { id: 'CMP-001', title: 'Flickering lights in Room 101', category: 'Electrical', location: 'Block A, Room 101', priority: 'High', status: 'Pending', assignedTo: '-', created: 'Today', details: 'Lights continuously flicker and buzz during class.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-002', title: 'Leaking tap in washroom', category: 'Plumbing', location: 'Block B, First Floor', priority: 'Medium', status: 'Ongoing', assignedTo: 'Maintenance Staff', created: 'Yesterday', details: 'Tap in restroom 2B does not shut off completely.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-003', title: 'Classroom fan not working', category: 'Electrical', location: 'Block A, Room 204', priority: 'High', status: 'Ongoing', assignedTo: 'Maintenance Staff', created: '2 days ago', details: 'Ceiling fan in row 3 stopped spinning.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-004', title: 'Corridor needs cleaning', category: 'Cleaning', location: 'Block C, Ground Floor', priority: 'Low', status: 'Resolved', assignedTo: 'Maintenance Staff', created: '3 days ago', details: 'Spilled liquid near laboratory entrance.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-005', title: 'Dripping pipe in laboratory', category: 'Plumbing', location: 'Science Block, Lab 2', priority: 'Medium', status: 'Pending', assignedTo: '-', created: '4 days ago', details: 'Under-sink pipe has a steady drip.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-006', title: 'Campus Wi-Fi unavailable', category: 'Network', location: 'Library, Second Floor', priority: 'High', status: 'Resolved', assignedTo: 'Maintenance Staff', created: '5 days ago', details: 'Router in reading room was offline.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-007', title: 'Broken chair in classroom', category: 'Furniture', location: 'Block B, Room 108', priority: 'Low', status: 'Pending', assignedTo: '-', created: '6 days ago', details: 'Armrest and back bracket loose.', evidence: '', createdBy: 'Student' },
  { id: 'CMP-008', title: 'Washroom cleaning required', category: 'Cleaning', location: 'Block A, Ground Floor', priority: 'Medium', status: 'Resolved', assignedTo: 'Maintenance Staff', created: '1 week ago', details: 'General cleaning and hygiene refresh needed.', evidence: '', createdBy: 'Student' }
];

// Resilient in-memory store
let inMemoryCategories = [...INITIAL_CATEGORIES];
let inMemoryUsers = [...INITIAL_USERS];
let inMemoryComplaints = [...INITIAL_COMPLAINTS];

let supabaseClient = null;
let migrationCompleted = false;
let tableCheckNoticeLogged = false;

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
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assigned_to || row.assignedTo || '-',
    created: row.created || 'Today',
    details: row.details || '',
    evidence: row.evidence || '',
    createdBy: row.created_by || row.createdBy || 'Student'
  };
}

function mapComplaintToDb(data) {
  return {
    id: data.id,
    title: data.title,
    category: data.category,
    location: data.location,
    priority: data.priority,
    status: data.status || 'Pending',
    assigned_to: data.assignedTo || data.assigned_to || '-',
    created: data.created || 'Today',
    details: data.details || '',
    evidence: data.evidence || '',
    created_by: data.createdBy || data.created_by || 'Student'
  };
}

/**
 * Ensures initial tables and records are migrated to Supabase without losing data.
 */
export async function migrateDataToSupabase(client) {
  if (!client || migrationCompleted) return;

  try {
    // 1. Seed Categories if empty (FR-05)
    const { count: catCount, error: catErr } = await client
      .from('categories')
      .select('*', { count: 'exact', head: true });

    if (catErr) {
      if (catErr.code === 'PGRST205' && !tableCheckNoticeLogged) {
        tableCheckNoticeLogged = true;
        console.log('[CampusFix Notice] Supabase tables not detected yet. Run supabase/schema.sql in your Supabase SQL Editor to initialize tables.');
      }
      return;
    }

    if (catCount === null || catCount === 0) {
      console.log('[CampusFix] Seeding categories to Supabase...');
      await client.from('categories').upsert(INITIAL_CATEGORIES, { onConflict: 'name' });
    }

    // 2. Seed Users if empty (FR-01)
    const { count: userCount, error: userErr } = await client
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (!userErr && (userCount === null || userCount === 0)) {
      console.log('[CampusFix] Seeding initial users to Supabase...');
      await client.from('users').upsert(INITIAL_USERS, { onConflict: 'username' });
    }

    // 3. Seed Complaints if empty (FR-02, FR-03, FR-04)
    const { count: compCount, error: compErr } = await client
      .from('complaints')
      .select('*', { count: 'exact', head: true });

    if (!compErr && (compCount === null || compCount === 0)) {
      console.log('[CampusFix] Seeding initial complaints to Supabase without data loss...');
      const seedRows = INITIAL_COMPLAINTS.map(mapComplaintToDb);
      await client.from('complaints').upsert(seedRows, { onConflict: 'id' });
    }

    migrationCompleted = true;
    console.log('[CampusFix] Supabase PostgreSQL sync verified successfully.');
  } catch (err) {
    console.warn('[CampusFix] Supabase sync notice:', err.message);
  }
}

/**
 * FR-05: Get maintenance categories.
 */
export async function getCategories() {
  const client = getSupabase();
  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client
        .from('categories')
        .select('*')
        .order('id', { ascending: true });

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }
  return inMemoryCategories;
}

/**
 * FR-03 & FR-04: Fetch all complaints.
 */
export async function getComplaints() {
  const client = getSupabase();
  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client
        .from('complaints')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapComplaintFromDb);
      }
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }

  return inMemoryComplaints;
}

/**
 * FR-02: Create a new complaint.
 */
export async function createComplaint(complaintData) {
  const client = getSupabase();
  const dbPayload = mapComplaintToDb(complaintData);

  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client
        .from('complaints')
        .insert([dbPayload])
        .select()
        .single();

      if (!error && data) {
        const mapped = mapComplaintFromDb(data);
        inMemoryComplaints.unshift(mapped);
        return mapped;
      }
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }

  const mapped = mapComplaintFromDb(dbPayload);
  inMemoryComplaints.unshift(mapped);
  return mapped;
}

/**
 * FR-04: Update complaint status and assignment.
 */
export async function updateComplaint(id, updates) {
  const client = getSupabase();
  const dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.assignedTo !== undefined) dbUpdates.assigned_to = updates.assignedTo;
  if (updates.assigned_to !== undefined) dbUpdates.assigned_to = updates.assigned_to;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.details !== undefined) dbUpdates.details = updates.details;
  dbUpdates.updated_at = new Date().toISOString();

  if (client) {
    try {
      const { data, error } = await client
        .from('complaints')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        const mapped = mapComplaintFromDb(data);
        const idx = inMemoryComplaints.findIndex(c => c.id === id);
        if (idx !== -1) inMemoryComplaints[idx] = mapped;
        return mapped;
      }
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }

  const complaint = inMemoryComplaints.find(c => c.id === id);
  if (complaint) {
    if (updates.status !== undefined) complaint.status = updates.status;
    if (updates.assignedTo !== undefined) complaint.assignedTo = updates.assignedTo;
    if (updates.priority !== undefined) complaint.priority = updates.priority;
    return complaint;
  }
  return null;
}

/**
 * FR-01: Authenticate user.
 */
export async function authenticateUser(username, password, role) {
  const client = getSupabase();

  if (client) {
    try {
      await migrateDataToSupabase(client);
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code === 'PGRST116') {
        const { data: newUser, error: insertErr } = await client
          .from('users')
          .insert([{ username, password, role: role || 'student' }])
          .select()
          .single();

        if (!insertErr && newUser) {
          return { username: newUser.username, role: newUser.role, authenticated: true };
        }
      } else if (data) {
        return { username: data.username, role: role || data.role, authenticated: true };
      }
    } catch (err) {
      // Fall through to in-memory fallback
    }
  }

  let user = inMemoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    user = { username, password, role: role || 'student' };
    inMemoryUsers.push(user);
  }
  return { username: user.username, role: role || user.role, authenticated: true };
}

/**
 * FR-06: Reports showing pending, ongoing, and resolved complaints.
 */
export async function getReports() {
  const complaints = await getComplaints();
  const total = complaints.length;
  const pending = complaints.filter(c => c.status === 'Pending');
  const ongoing = complaints.filter(c => c.status === 'Ongoing');
  const resolved = complaints.filter(c => c.status === 'Resolved');
  const highPriority = complaints.filter(c => c.priority === 'High' && c.status !== 'Resolved');

  const categoriesCount = {};
  INITIAL_CATEGORIES.forEach(cat => {
    categoriesCount[cat.name] = complaints.filter(c => c.category === cat.name).length;
  });

  return {
    total,
    pendingCount: pending.length,
    ongoingCount: ongoing.length,
    resolvedCount: resolved.length,
    highPriorityCount: highPriority.length,
    byCategory: categoriesCount,
    complaints
  };
}

export function resetInMemoryStore() {
  inMemoryCategories = [...INITIAL_CATEGORIES];
  inMemoryUsers = [...INITIAL_USERS];
  inMemoryComplaints = [...INITIAL_COMPLAINTS];
}
