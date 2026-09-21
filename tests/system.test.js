import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server.js';
import { resetInMemoryStore } from '../src/db/supabase.js';

let server;
let baseUrl;

before(async () => {
  resetInMemoryStore();
  await new Promise((resolve) => {
    // Listen on port 0 for an ephemeral test port
    server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
});

describe('College Maintenance Management System (SRS Verification)', () => {

  test('System Health & Database Connectivity', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'healthy');
    assert.ok(typeof data.database === 'string');
    assert.ok(typeof data.supabaseConfigured === 'boolean');
  });

  test('FR-01: Student and Maintenance Staff Login', async () => {
    // Student Login
    const studentRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Student', password: 'student123', role: 'student' })
    });
    assert.equal(studentRes.status, 200);
    const studentData = await studentRes.json();
    assert.equal(studentData.username, 'Student');
    assert.equal(studentData.role, 'student');
    assert.equal(studentData.authenticated, true);

    // Staff Login
    const staffRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'Staff', password: 'staff123', role: 'staff' })
    });
    assert.equal(staffRes.status, 200);
    const staffData = await staffRes.json();
    assert.equal(staffData.username, 'Staff');
    assert.equal(staffData.role, 'staff');
    assert.equal(staffData.authenticated, true);

    // Rejection on missing username
    const emptyRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '', role: 'student' })
    });
    assert.equal(emptyRes.status, 400);
  });

  test('FR-05: Maintenance Categories Organization', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assert.equal(res.status, 200);
    const categories = await res.json();
    assert.ok(Array.isArray(categories));
    assert.ok(categories.length >= 5);

    const categoryNames = categories.map(c => c.name);
    assert.ok(categoryNames.includes('Plumbing'));
    assert.ok(categoryNames.includes('Electrical'));
    assert.ok(categoryNames.includes('Network'));
    assert.ok(categoryNames.includes('Furniture'));
    assert.ok(categoryNames.includes('Cleaning'));
  });

  test('FR-03: View Submitted Maintenance Complaints (No Data Loss)', async () => {
    const res = await fetch(`${baseUrl}/api/complaints`);
    assert.equal(res.status, 200);
    const complaints = await res.json();
    assert.ok(Array.isArray(complaints));
    // Verify existing pre-seeded records CMP-001 through CMP-008 are preserved
    assert.ok(complaints.length >= 8, 'All 8 initial complaints must be preserved');

    const ids = complaints.map(c => c.id);
    assert.ok(ids.includes('CMP-001'));
    assert.ok(ids.includes('CMP-002'));
    assert.ok(ids.includes('CMP-008'));
  });

  test('FR-02: Submit New Maintenance Complaint', async () => {
    const newComplaint = {
      title: 'Water filter leaking near cafeteria',
      category: 'Plumbing',
      location: 'Block C, Cafeteria Entrance',
      priority: 'High',
      details: 'Puddle forming on walkway, slip hazard.'
    };

    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newComplaint)
    });
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.ok(created.id.startsWith('CMP-'));
    assert.equal(created.title, newComplaint.title);
    assert.equal(created.category, 'Plumbing');
    assert.equal(created.location, newComplaint.location);
    assert.equal(created.status, 'Pending');
    assert.equal(created.assignedTo, '-');

    // Validation check: Missing fields must fail
    const badRes = await fetch(`${baseUrl}/api/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' })
    });
    assert.equal(badRes.status, 400);
  });

  test('FR-04: Staff View, Assign, Update, and Resolve Complaint', async () => {
    // Update complaint CMP-001 to Ongoing with assigned staff
    const updateRes1 = await fetch(`${baseUrl}/api/complaints/CMP-001`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Ongoing', assignedTo: 'Maintenance Staff' })
    });
    assert.equal(updateRes1.status, 200);
    const updated1 = await updateRes1.json();
    assert.equal(updated1.status, 'Ongoing');
    assert.equal(updated1.assignedTo, 'Maintenance Staff');

    // Update complaint CMP-001 to Resolved
    const updateRes2 = await fetch(`${baseUrl}/api/complaints/CMP-001`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved' })
    });
    assert.equal(updateRes2.status, 200);
    const updated2 = await updateRes2.json();
    assert.equal(updated2.status, 'Resolved');
  });

  test('FR-06: Maintenance Reports (Pending, Ongoing, and Resolved)', async () => {
    const res = await fetch(`${baseUrl}/api/reports`);
    assert.equal(res.status, 200);
    const report = await res.json();

    assert.ok(typeof report.total === 'number');
    assert.ok(typeof report.pendingCount === 'number');
    assert.ok(typeof report.ongoingCount === 'number');
    assert.ok(typeof report.resolvedCount === 'number');
    assert.ok(typeof report.highPriorityCount === 'number');
    assert.ok(typeof report.byCategory === 'object');

    assert.equal(report.total, report.pendingCount + report.ongoingCount + report.resolvedCount);
  });

  test('Frontend UI & Static Assets Serving', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('CampusFix'));
    assert.ok(html.includes('loginForm'));
    assert.ok(html.includes('dashboardTable'));
  });
});
