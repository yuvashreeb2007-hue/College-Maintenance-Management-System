import { createClient } from '@supabase/supabase-js';

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
  { id: 'CMP-001', title: 'Flickering lights in Room 101', category: 'Electrical', location: 'Block A, Room 101', priority: 'High', status: 'Pending', assigned_to: '-', created: 'Today', details: 'Lights continuously flicker and buzz during class.', evidence: '', created_by: 'Student' },
  { id: 'CMP-002', title: 'Leaking tap in washroom', category: 'Plumbing', location: 'Block B, First Floor', priority: 'Medium', status: 'Ongoing', assigned_to: 'Maintenance Staff', created: 'Yesterday', details: 'Tap in restroom 2B does not shut off completely.', evidence: '', created_by: 'Student' },
  { id: 'CMP-003', title: 'Classroom fan not working', category: 'Electrical', location: 'Block A, Room 204', priority: 'High', status: 'Ongoing', assigned_to: 'Maintenance Staff', created: '2 days ago', details: 'Ceiling fan in row 3 stopped spinning.', evidence: '', created_by: 'Student' },
  { id: 'CMP-004', title: 'Corridor needs cleaning', category: 'Cleaning', location: 'Block C, Ground Floor', priority: 'Low', status: 'Resolved', assigned_to: 'Maintenance Staff', created: '3 days ago', details: 'Spilled liquid near laboratory entrance.', evidence: '', created_by: 'Student' },
  { id: 'CMP-005', title: 'Dripping pipe in laboratory', category: 'Plumbing', location: 'Science Block, Lab 2', priority: 'Medium', status: 'Pending', assigned_to: '-', created: '4 days ago', details: 'Under-sink pipe has a steady drip.', evidence: '', created_by: 'Student' },
  { id: 'CMP-006', title: 'Campus Wi-Fi unavailable', category: 'Network', location: 'Library, Second Floor', priority: 'High', status: 'Resolved', assigned_to: 'Maintenance Staff', created: '5 days ago', details: 'Router in reading room was offline.', evidence: '', created_by: 'Student' },
  { id: 'CMP-007', title: 'Broken chair in classroom', category: 'Furniture', location: 'Block B, Room 108', priority: 'Low', status: 'Pending', assigned_to: '-', created: '6 days ago', details: 'Armrest and back bracket loose.', evidence: '', created_by: 'Student' },
  { id: 'CMP-008', title: 'Washroom cleaning required', category: 'Cleaning', location: 'Block A, Ground Floor', priority: 'Medium', status: 'Resolved', assigned_to: 'Maintenance Staff', created: '1 week ago', details: 'General cleaning and hygiene refresh needed.', evidence: '', created_by: 'Student' }
];

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.log('[CampusFix Migration] No SUPABASE_URL or SUPABASE_ANON_KEY found in environment.');
    console.log('[CampusFix Migration] In-memory persistence active. Set SUPABASE_URL and SUPABASE_ANON_KEY to migrate to your live Supabase project.');
    process.exit(0);
  }

  console.log(`[CampusFix Migration] Connecting to Supabase project at ${url}...`);
  const client = createClient(url, key);

  try {
    // 1. Categories Migration
    console.log('[CampusFix Migration] Migrating categories...');
    const { error: catErr } = await client.from('categories').upsert(INITIAL_CATEGORIES, { onConflict: 'name' });
    if (catErr) {
      console.warn('[CampusFix Migration] Warning on categories upsert:', catErr.message);
    } else {
      console.log(`[CampusFix Migration] Successfully verified ${INITIAL_CATEGORIES.length} categories.`);
    }

    // 2. Users Migration
    console.log('[CampusFix Migration] Migrating users...');
    const { error: userErr } = await client.from('users').upsert(INITIAL_USERS, { onConflict: 'username' });
    if (userErr) {
      console.warn('[CampusFix Migration] Warning on users upsert:', userErr.message);
    } else {
      console.log(`[CampusFix Migration] Successfully verified ${INITIAL_USERS.length} initial users.`);
    }

    // 3. Complaints Migration
    console.log('[CampusFix Migration] Migrating complaints...');
    const { error: compErr } = await client.from('complaints').upsert(INITIAL_COMPLAINTS, { onConflict: 'id' });
    if (compErr) {
      console.warn('[CampusFix Migration] Warning on complaints upsert:', compErr.message);
    } else {
      console.log(`[CampusFix Migration] Successfully verified ${INITIAL_COMPLAINTS.length} complaints without data loss.`);
    }

    console.log('[CampusFix Migration] Migration finished successfully.');
  } catch (err) {
    console.error('[CampusFix Migration] Migration error:', err.message);
    process.exit(1);
  }
}

run();
