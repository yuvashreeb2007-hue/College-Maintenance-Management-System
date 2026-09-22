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

describe('College Maintenance System - 10 RBAC Test Scenarios', () => {

  let studentToken = null;
  let workerToken = null;
  let adminToken = null;

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Student Registration (role is strictly enforced as 'student')
  // ---------------------------------------------------------------------------
  test('Scenario 1: Student Registration automatically assigns student role and allows login', async () => {
    // 1A: Attempting to sneakily request admin role in public registration must be rejected
    const badRegRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Attacker',
        studentId: 'STU-HACK',
        email: 'attacker@campus.edu',
        password: 'password123',
        role: 'admin'
      })
    });
    assert.equal(badRegRes.status, 400, 'Attempting to self-assign admin role must be rejected');

    // 1B: Valid student registration succeeds
    const regPayload = {
      name: 'Emma Watson',
      studentId: 'STU-2024-999',
      department: 'Electrical Engineering',
      email: 'emma.watson@campus.edu',
      password: 'password123',
      confirmPassword: 'password123',
      role: 'student'
    };

    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regPayload)
    });

    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.ok(regData.token);
    assert.equal(regData.user.role, 'student', 'Registration must assign student role');
    assert.equal(regData.user.email, 'emma.watson@campus.edu');

    // Login with newly created student account
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'emma.watson@campus.edu',
        password: 'password123',
        role: 'student'
      })
    });

    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    studentToken = loginData.token;
    assert.ok(studentToken);
    assert.equal(loginData.user.role, 'student');

    // Student dashboard access succeeds
    const dashRes = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(dashRes.status, 200);
    const dashData = await dashRes.json();
    assert.ok(dashData.stats);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Student Attempting to Access Admin Dashboard (Forbidden)
  // ---------------------------------------------------------------------------
  test('Scenario 2: Student is forbidden from accessing Admin Dashboard (403)', async () => {
    assert.ok(studentToken, 'Student token must be established');

    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });

    assert.equal(res.status, 403, 'Student must receive 403 Forbidden when accessing /api/admin/dashboard');
    const data = await res.json();
    assert.ok(data.error.includes('Administrator') || data.error.includes('Forbidden') || data.error.includes('Access denied'));
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Student Attempting to Access Worker Dashboard (Forbidden)
  // ---------------------------------------------------------------------------
  test('Scenario 3: Student is forbidden from accessing Worker Dashboard (403)', async () => {
    assert.ok(studentToken, 'Student token must be established');

    const res = await fetch(`${baseUrl}/api/worker/dashboard`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });

    assert.equal(res.status, 403, 'Student must receive 403 Forbidden when accessing /api/worker/dashboard');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Maintenance Worker Access
  // ---------------------------------------------------------------------------
  test('Scenario 4: Worker logs in, accesses Worker Dashboard (200), denied from Admin Dashboard (403)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'worker.electrical@campus.edu',
        password: 'worker123',
        role: 'staff'
      })
    });

    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    workerToken = loginData.token;
    assert.equal(loginData.user.role, 'worker');

    // Worker can access Worker Dashboard
    const workerDash = await fetch(`${baseUrl}/api/worker/dashboard`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(workerDash.status, 200);
    const dashData = await workerDash.json();
    assert.ok(dashData.stats);
    assert.ok(Array.isArray(dashData.complaints));

    // Worker CANNOT access Admin Dashboard
    const adminDash = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(adminDash.status, 403);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Administrator Full Access
  // ---------------------------------------------------------------------------
  test('Scenario 5: Administrator has full access to Admin Dashboard, Users, and Workers', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@campus.edu',
        password: 'admin123',
        role: 'staff'
      })
    });

    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    adminToken = loginData.token;
    assert.equal(loginData.user.role, 'admin');

    // Admin dashboard
    const adminDash = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(adminDash.status, 200);
    const data = await adminDash.json();
    assert.ok(data.stats.totalComplaints >= 8);

    // Admin view all users
    const usersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(usersRes.status, 200);
    const users = await usersRes.json();
    assert.ok(Array.isArray(users));
    assert.ok(users.some(u => u.role === 'admin'));
    assert.ok(users.some(u => u.role === 'worker'));
    assert.ok(users.some(u => u.role === 'student'));

    // Admin view all workers
    const workersRes = await fetch(`${baseUrl}/api/admin/workers`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(workersRes.status, 200);
    const workers = await workersRes.json();
    assert.ok(Array.isArray(workers));
    assert.ok(workers.length >= 2);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Maintenance Worker Updating Status and Work Notes
  // ---------------------------------------------------------------------------
  test('Scenario 6: Worker updates complaint status and work notes (succeeds)', async () => {
    assert.ok(workerToken);

    const updateRes = await fetch(`${baseUrl}/api/worker/complaints/CMP-002`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        status: 'Ongoing',
        workNotes: 'Replaced cartridge valve and tightened packing nut.'
      })
    });

    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.status, 'Ongoing');
    assert.equal(updated.workNotes, 'Replaced cartridge valve and tightened packing nut.');

    // Verify student is forbidden from calling worker update endpoint
    const forbiddenRes = await fetch(`${baseUrl}/api/worker/complaints/CMP-002`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ status: 'Resolved' })
    });
    assert.equal(forbiddenRes.status, 403);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Administrator Assigning Complaint to Worker
  // ---------------------------------------------------------------------------
  test('Scenario 7: Administrator assigns unassigned complaint to a maintenance worker', async () => {
    assert.ok(adminToken);

    const assignRes = await fetch(`${baseUrl}/api/admin/complaints/CMP-001/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        workerId: '22222222-2222-4222-8222-222222222222',
        workerName: 'Robert Miller',
        status: 'Ongoing'
      })
    });

    assert.equal(assignRes.status, 200);
    const assigned = await assignRes.json();
    assert.equal(assigned.assignedTo, 'Robert Miller');
    assert.equal(assigned.assignedWorkerId, '22222222-2222-4222-8222-222222222222');
    assert.equal(assigned.status, 'Ongoing');

    // Verify non-admin cannot assign
    const nonAdminAssign = await fetch(`${baseUrl}/api/admin/complaints/CMP-001/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerToken}`
      },
      body: JSON.stringify({ workerName: 'Someone Else' })
    });
    assert.equal(nonAdminAssign.status, 403);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Student Rating / Feedback on Resolved Complaint
  // ---------------------------------------------------------------------------
  test('Scenario 8: Student leaves feedback on resolved complaint', async () => {
    assert.ok(studentToken);

    // First ensure CMP-004 is Resolved (it is resolved in seed)
    const feedbackRes = await fetch(`${baseUrl}/api/student/complaints/CMP-004/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        feedback: 'Excellent response time and clean job.'
      })
    });

    assert.equal(feedbackRes.status, 200);
    const result = await feedbackRes.json();
    assert.equal(result.feedback, 'Excellent response time and clean job.');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Unauthenticated Access to Protected Endpoints (401 Unauthorized)
  // ---------------------------------------------------------------------------
  test('Scenario 9: Unauthenticated requests without token fail with 401 Unauthorized', async () => {
    const endpoints = [
      '/api/student/dashboard',
      '/api/worker/dashboard',
      '/api/admin/dashboard',
      '/api/admin/users',
      '/api/admin/workers'
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 401, `Endpoint ${ep} must require authentication`);
      const data = await res.json();
      assert.ok(data.error.includes('Unauthorized') || data.error.includes('token') || data.error.includes('Authentication'));
    }
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Session Invalidation on Logout
  // ---------------------------------------------------------------------------
  test('Scenario 10: Session destroyed on logout, invalidating subsequent requests (401)', async () => {
    // Create an active session
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'student@campus.edu',
        password: 'student123',
        role: 'student'
      })
    });

    assert.equal(loginRes.status, 200);
    const { token } = await loginRes.json();
    assert.ok(token);

    // Verify token works before logout
    const checkBefore = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(checkBefore.status, 200);

    // Perform Logout
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(logoutRes.status, 200);

    // Verify token is now invalid (401 Unauthorized)
    const checkAfter = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.equal(checkAfter.status, 401, 'Token must be invalidated after logout');
  });

});
