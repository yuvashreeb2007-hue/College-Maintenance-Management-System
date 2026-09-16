import { createClient } from '@supabase/supabase-js';

// Initial seed data preserving the exact structure from the existing system
const INITIAL_COMPLAINTS = [
  {id:"CMP-001",title:"Flickering lights in Room 101",category:"Electrical",location:"Block A, Room 101",priority:"High",status:"Pending",assignedTo:"-",created:"Today",details:"Lights continuously flicker and buzz during class.",evidence:"",createdBy:"Student"},
  {id:"CMP-002",title:"Leaking tap in washroom",category:"Plumbing",location:"Block B, First Floor",priority:"Medium",status:"Ongoing",assignedTo:"Maintenance Staff",created:"Yesterday",details:"Tap in restroom 2B does not shut off completely.",evidence:"",createdBy:"Student"},
  {id:"CMP-003",title:"Classroom fan not working",category:"Electrical",location:"Block A, Room 204",priority:"High",status:"Ongoing",assignedTo:"Maintenance Staff",created:"2 days ago",details:"Ceiling fan in row 3 stopped spinning.",evidence:"",createdBy:"Student"},
  {id:"CMP-004",title:"Corridor needs cleaning",category:"Cleaning",location:"Block C, Ground Floor",priority:"Low",status:"Resolved",assignedTo:"Maintenance Staff",created:"3 days ago",details:"Spilled liquid near laboratory entrance.",evidence:"",createdBy:"Student"},
  {id:"CMP-005",title:"Dripping pipe in laboratory",category:"Plumbing",location:"Science Block, Lab 2",priority:"Medium",status:"Pending",assignedTo:"-",created:"4 days ago",details:"Under-sink pipe has a steady drip.",evidence:"",createdBy:"Student"},
  {id:"CMP-006",title:"Campus Wi-Fi unavailable",category:"Network",location:"Library, Second Floor",priority:"High",status:"Resolved",assignedTo:"Maintenance Staff",created:"5 days ago",details:"Router in reading room was offline.",evidence:"",createdBy:"Student"},
  {id:"CMP-007",title:"Broken chair in classroom",category:"Furniture",location:"Block B, Room 108",priority:"Low",status:"Pending",assignedTo:"-",created:"6 days ago",details:"Armrest and back bracket loose.",evidence:"",createdBy:"Student"},
  {id:"CMP-008",title:"Washroom cleaning required",category:"Cleaning",location:"Block A, Ground Floor",priority:"Medium",status:"Resolved",assignedTo:"Maintenance Staff",created:"1 week ago",details:"General cleaning and hygiene refresh needed.",evidence:"",createdBy:"Student"}
];

const INITIAL_USERS = [
  { username: 'Student', password: 'password', role: 'student' },
  { username: 'Staff', password: 'password', role: 'staff' }
];

// In-memory store used when Supabase credentials are not provided or as resilient cache
let inMemoryComplaints = [...INITIAL_COMPLAINTS];
let inMemoryUsers = [...INITIAL_USERS];

let supabaseClient = null;

export function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false }
      });
      console.log('[CampusFix] Supabase client initialized for PostgreSQL connection.');
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
 * Ensures initial complaints are present in Supabase if the table is empty.
 */
async function autoSeedSupabaseIfEmpty(client) {
  try {
    const { count, error } = await client.from('complaints').select('*', { count: 'exact', head: true });
    if (!error && count === 0) {
      console.log('[CampusFix] complaints table is empty in Supabase. Seeding initial records...');
      const seedRows = INITIAL_COMPLAINTS.map(mapComplaintToDb);
      await client.from('complaints').insert(seedRows);
    }
  } catch (err) {
    console.warn('[CampusFix] Note during autoSeed check:', err.message);
  }
}

/**
 * Fetch all complaints.
 */
export async function getComplaints() {
  const client = getSupabase();
  if (client) {
    try {
      await autoSeedSupabaseIfEmpty(client);
      const { data, error } = await client
        .from('complaints')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        console.warn('[CampusFix] Supabase select error, using memory fallback:', error.message);
        return inMemoryComplaints;
      }
      if (data && data.length > 0) {
        return data.map(mapComplaintFromDb);
      }
      return inMemoryComplaints;
    } catch (err) {
      console.warn('[CampusFix] Database query failed, using in-memory store:', err.message);
      return inMemoryComplaints;
    }
  }

  return inMemoryComplaints;
}

/**
 * Create a new complaint.
 */
export async function createComplaint(complaintData) {
  const client = getSupabase();
  const dbPayload = mapComplaintToDb(complaintData);

  if (client) {
    try {
      const { data, error } = await client
        .from('complaints')
        .insert([dbPayload])
        .select()
        .single();

      if (error) {
        console.warn('[CampusFix] Supabase insert error, saving to memory fallback:', error.message);
      } else if (data) {
        const mapped = mapComplaintFromDb(data);
        // Keep in-memory cache in sync
        inMemoryComplaints.unshift(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[CampusFix] Database insert exception, saving to memory:', err.message);
    }
  }

  // In-memory fallback
  const mapped = mapComplaintFromDb(dbPayload);
  inMemoryComplaints.unshift(mapped);
  return mapped;
}

/**
 * Update a complaint status or assignment.
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

      if (error) {
        console.warn('[CampusFix] Supabase update error, falling back to memory:', error.message);
      } else if (data) {
        const mapped = mapComplaintFromDb(data);
        const idx = inMemoryComplaints.findIndex(c => c.id === id);
        if (idx !== -1) inMemoryComplaints[idx] = mapped;
        return mapped;
      }
    } catch (err) {
      console.warn('[CampusFix] Database update exception:', err.message);
    }
  }

  // In-memory update
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
 * Authenticate or register a user.
 */
export async function authenticateUser(username, password, role) {
  const client = getSupabase();

  if (client) {
    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code === 'PGRST116') {
        // User not found in Supabase: auto-register for seamless campus onboarding
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
      console.warn('[CampusFix] User authentication DB query failed, falling back to memory:', err.message);
    }
  }

  // In-memory fallback
  let user = inMemoryUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    user = { username, password, role: role || 'student' };
    inMemoryUsers.push(user);
  }
  return { username: user.username, role: role || user.role, authenticated: true };
}
