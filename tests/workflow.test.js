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

describe('Phase 2: Complete Complaint Management Workflow (10-Step Scenario)', () => {
  let studentToken = null;
  let workerToken = null;
  let adminToken = null;
  let createdComplaintId = null;
  let assignedWorkerId = null;
  let assignedWorkerName = null;

  // Step 0: Setup authenticated sessions for Student, Worker, and Admin
  test('Step 0: Log in as Student, Worker, and Admin', async () => {
    // 0A: Student login
    const studentRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@campus.edu', password: 'student123' })
    });
    assert.equal(studentRes.status, 200);
    const studentData = await studentRes.json();
    studentToken = studentData.token;
    assert.equal(studentData.user.role, 'student');

    // 0B: Worker login (Robert Miller - Electrician)
    const workerRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'worker.electrical@campus.edu', password: 'worker123' })
    });
    assert.equal(workerRes.status, 200);
    const workerData = await workerRes.json();
    workerToken = workerData.token;
    assignedWorkerId = workerData.user.id;
    assignedWorkerName = workerData.user.name;
    assert.equal(workerData.user.role, 'worker');

    // 0C: Admin login
    const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@campus.edu', password: 'admin123' })
    });
    assert.equal(adminRes.status, 200);
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    assert.equal(adminData.user.role, 'admin');
  });

  // Step 1: Student submits complaint
  test('Step 1: Student submits a new maintenance complaint', async () => {
    const res = await fetch(`${baseUrl}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        title: 'Flickering LED tube light in Lab 304',
        category: 'Electrical',
        location: 'Science Block, Room 304',
        priority: 'High',
        details: 'The fixture hums loudly and shuts off intermittently during practical classes.'
      })
    });

    assert.equal(res.status, 201);
    const complaint = await res.json();
    assert.ok(complaint.id);
    assert.equal(complaint.status, 'Pending');
    assert.equal(complaint.category, 'Electrical');
    assert.equal(complaint.priority, 'High');
    createdComplaintId = complaint.id;
  });

  // Step 2: Admin reviews pending complaints
  test('Step 2: Admin reviews pending complaints in dashboard', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.stats.pendingComplaints >= 1);
    
    const target = data.complaints.find(c => c.id === createdComplaintId);
    assert.ok(target, 'Admin dashboard must include newly submitted complaint');
    assert.equal(target.status, 'Pending');
  });

  // Step 3: Admin assigns worker
  test('Step 3: Admin assigns complaint to technician (Status -> Assigned)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/complaints/${createdComplaintId}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        workerId: assignedWorkerId,
        workerName: assignedWorkerName,
        status: 'Assigned'
      })
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.status, 'Assigned');
    assert.equal(updated.assignedWorkerId, assignedWorkerId);
    assert.equal(updated.assignedTo, assignedWorkerName);
    assert.ok(updated.assignedAt);
  });

  // Step 4: Worker views assigned complaints queue
  test('Step 4: Worker views newly assigned complaint in their queue', async () => {
    const res = await fetch(`${baseUrl}/api/worker/dashboard`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const assignedJob = data.complaints.find(c => c.id === createdComplaintId);
    assert.ok(assignedJob, 'Worker must see ticket in their assigned jobs');
    assert.equal(assignedJob.status, 'Assigned');
  });

  // Step 5: Worker starts work (Status -> In Progress)
  test('Step 5: Worker starts work on assigned complaint', async () => {
    const res = await fetch(`${baseUrl}/api/worker/complaints/${createdComplaintId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerToken}`
      }
    });

    assert.equal(res.status, 200);
    const started = await res.json();
    assert.equal(started.status, 'In Progress');
    assert.ok(started.startedAt);
  });

  // Step 6: Worker adds notes and marks as Resolved
  test('Step 6: Worker records notes and marks ticket as Resolved', async () => {
    const res = await fetch(`${baseUrl}/api/worker/complaints/${createdComplaintId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workerToken}`
      },
      body: JSON.stringify({
        status: 'Resolved',
        workNotes: 'Replaced ballast and installed new Philips T8 LED tube. Inspected wiring.',
        resolutionNotes: 'Replaced ballast and installed new Philips T8 LED tube. Inspected wiring.'
      })
    });

    assert.equal(res.status, 200);
    const resolved = await res.json();
    assert.equal(resolved.status, 'Resolved');
    assert.ok(resolved.resolvedAt);
    assert.ok(resolved.resolutionNotes.includes('Philips T8 LED'));
  });

  // Step 7: Student receives resolution notification
  test('Step 7: Student receives notification that complaint is resolved', async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(res.status, 200);
    const notifs = await res.json();
    const resolutionNotif = notifs.find(n => n.complaintId === createdComplaintId && n.type === 'complaint_resolved');
    assert.ok(resolutionNotif, 'Student must receive a complaint_resolved notification');
    assert.ok(resolutionNotif.message.includes(createdComplaintId));
  });

  // Step 8: Student views resolved complaint with technician notes
  test('Step 8: Student views resolved complaint details', async () => {
    const res = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const resolvedTicket = data.complaints.find(c => c.id === createdComplaintId);
    assert.ok(resolvedTicket);
    assert.equal(resolvedTicket.status, 'Resolved');
    assert.ok(resolvedTicket.workNotes || resolvedTicket.resolutionNotes);
  });

  // Step 9: Student provides 5-star feedback and remarks
  test('Step 9: Student submits 5-star rating and feedback', async () => {
    const res = await fetch(`${baseUrl}/api/student/complaints/${createdComplaintId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        rating: 5,
        feedback: 'Excellent response! Fixed within 2 hours. Lab light is now crystal clear.'
      })
    });

    assert.equal(res.status, 200);
    const withFeedback = await res.json();
    assert.equal(withFeedback.feedbackRating, 5);
    assert.ok(withFeedback.feedback.includes('Excellent response'));
    assert.ok(withFeedback.feedbackAt);
  });

  // Step 10: Admin verifies feedback and resolution
  test('Step 10: Admin verifies resolved status, technician notes, and student feedback', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const completedTicket = data.complaints.find(c => c.id === createdComplaintId);
    assert.ok(completedTicket);
    assert.equal(completedTicket.status, 'Resolved');
    assert.equal(completedTicket.feedbackRating, 5);
    assert.ok(completedTicket.feedback.includes('Excellent response'));
    assert.ok(completedTicket.resolutionNotes.includes('Philips T8 LED'));
  });

  // Step 11: Notification read operations
  test('Step 11: Notification read and unread count operations work as expected', async () => {
    const unreadCountRes = await fetch(`${baseUrl}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(unreadCountRes.status, 200);
    const countData = await unreadCountRes.json();
    assert.ok(typeof countData.unreadCount === 'number');

    const markAllRes = await fetch(`${baseUrl}/api/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert.equal(markAllRes.status, 200);

    const postMarkRes = await fetch(`${baseUrl}/api/notifications/unread-count`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const postCount = await postMarkRes.json();
    assert.equal(postCount.unreadCount, 0);
  });
});
