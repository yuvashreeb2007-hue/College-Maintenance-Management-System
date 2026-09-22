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

describe('AI Feature: Conversational Complaint Booking Chat Assistant', () => {

  let studentToken;

  test('Step 0: Authenticate as Student', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@campus.edu', password: 'student123' })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.equal(data.user.role, 'student');
    studentToken = data.token;
  });

  test('Security: Unauthenticated chat requests fail with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/chat/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'The tap is broken' })
    });
    assert.equal(res.status, 401);
  });

  test('Validation: Empty message rejects with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/chat/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ message: '   ' })
    });
    assert.equal(res.status, 400);
  });

  test('Incomplete Complaint Prompt: AI prompts user for missing location details', async () => {
    const res = await fetch(`${baseUrl}/api/chat/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        message: 'The water pipe is leaking heavily and flooding the floor'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply, 'Should provide conversational reply');
    assert.equal(typeof data.reply, 'string');
    assert.equal(data.readyToBook, false, 'Should not be ready to book without a location');
  });

  test('Complete Complaint Prompt: AI generates structured ticket proposal ready to book', async () => {
    const res = await fetch(`${baseUrl}/api/chat/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        message: 'The ceiling fan in room 204 of Block B is making loud screeching sparks',
        history: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hello! What issue can I help you book today?' }
        ]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.reply);
    assert.equal(data.readyToBook, true, 'Should be ready to book with complete details');
    assert.ok(data.ticketProposal, 'Should include ticket proposal');
    assert.equal(data.ticketProposal.category, 'Electrical');
    assert.ok(data.ticketProposal.location.toLowerCase().includes('204') || data.ticketProposal.location.toLowerCase().includes('block'));
    assert.ok(['High', 'Medium', 'Low'].includes(data.ticketProposal.priority));
  });

  test('End-to-End Booking: User confirms and books ticket from AI proposal', async () => {
    // 1. Get AI proposal
    const chatRes = await fetch(`${baseUrl}/api/chat/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        message: 'Broken tap leaking water in Hostel Block B washroom'
      })
    });

    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.equal(chatData.readyToBook, true);
    const proposal = chatData.ticketProposal;

    // 2. Book the proposed ticket via /api/complaints
    const bookRes = await fetch(`${baseUrl}/api/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({
        title: proposal.title,
        category: proposal.category,
        location: proposal.location,
        priority: proposal.priority,
        details: proposal.details
      })
    });

    assert.equal(bookRes.status, 201);
    const bookedTicket = await bookRes.json();
    assert.ok(bookedTicket.id, 'Should assign a ticket ID');
    assert.equal(bookedTicket.status, 'Pending');
    assert.equal(bookedTicket.category, 'Plumbing');
    assert.ok(bookedTicket.location);

    // 3. Verify ticket appears in student list
    const listRes = await fetch(`${baseUrl}/api/complaints`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    const allComplaints = await listRes.json();
    const found = allComplaints.find(c => c.id === bookedTicket.id);
    assert.ok(found, 'Booked ticket should exist in system registry');
    assert.equal(found.title, bookedTicket.title);
  });

});
