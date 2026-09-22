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

describe('AI Feature: Campus Maintenance Intelligence & Executive Reports', () => {

  let adminToken;
  let studentToken;

  test('Step 0: Authenticate Admin and Student roles', async () => {
    // Admin login
    const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@campus.edu', password: 'admin123' })
    });
    assert.equal(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.ok(adminData.token);
    assert.equal(adminData.user.role, 'admin');
    adminToken = adminData.token;

    // Student login
    const studentRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@campus.edu', password: 'student123' })
    });
    assert.equal(studentRes.status, 200);
    const studentData = await studentRes.json();
    assert.ok(studentData.token);
    assert.equal(studentData.user.role, 'student');
    studentToken = studentData.token;
  });

  test('Security & RBAC: Unauthenticated requests are rejected (401)', async () => {
    const res = await fetch(`${baseUrl}/api/reports/ai-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryFilter: 'All', reportType: 'executive' })
    });
    assert.equal(res.status, 401);
  });

  test('Security & RBAC: Student role is forbidden from generating executive reports (403)', async () => {
    const res = await fetch(`${baseUrl}/api/reports/ai-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentToken}`
      },
      body: JSON.stringify({ categoryFilter: 'All', reportType: 'executive' })
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.ok(data.error.includes('Forbidden'));
  });

  test('Core AI Feature: Administrator generates executive AI report with campus-wide scope', async () => {
    const res = await fetch(`${baseUrl}/api/reports/ai-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        categoryFilter: 'All',
        reportType: 'executive',
        customPrompt: 'Assess overall campus maintenance turnaround'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    // Verify structured response schema
    assert.ok(typeof data.executiveSummary === 'string' && data.executiveSummary.length > 10, 'Must have executive summary narrative');
    assert.ok(typeof data.operationalHealthIndex === 'string', 'Must provide health index');
    assert.ok(Array.isArray(data.keyFindings) && data.keyFindings.length > 0, 'Must have key findings');
    assert.ok(Array.isArray(data.criticalBottlenecks), 'Must have critical bottlenecks array');
    assert.ok(typeof data.technicianPerformance === 'string', 'Must evaluate technician performance');
    assert.ok(Array.isArray(data.actionableRecommendations) && data.actionableRecommendations.length > 0, 'Must have actionable recommendations');
    
    // Verify metrics payload
    assert.ok(data.metrics, 'Must include calculated metrics');
    assert.ok(typeof data.metrics.total === 'number');
    assert.ok(typeof data.metrics.pendingCount === 'number');
    assert.ok(typeof data.metrics.resolvedCount === 'number');
    assert.ok(data.metrics.locationBreakdown);

    // Verify metadata
    assert.equal(data.categoryFilter, 'All');
    assert.equal(data.reportType, 'executive');
    assert.equal(data.model, 'gemini-3.8-flash');
    assert.ok(data.generatedAt);
  });

  test('Category-Specific AI Report: Generates focused analysis for Plumbing', async () => {
    const res = await fetch(`${baseUrl}/api/reports/ai-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        categoryFilter: 'Plumbing',
        reportType: 'bottlenecks'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.categoryFilter, 'Plumbing');
    assert.ok(data.executiveSummary.length > 0);
    assert.ok(data.metrics.total >= 0);
  });

  test('Empty Results Handling: Gracefully handles category with 0 complaints without failing', async () => {
    const res = await fetch(`${baseUrl}/api/reports/ai-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        categoryFilter: 'NonExistentCategoryXYZ',
        reportType: 'preventative'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.metrics.total, 0);
    assert.ok(data.executiveSummary.includes('NonExistentCategoryXYZ') || data.executiveSummary.includes('No active'));
    assert.equal(data.operationalHealthIndex, 'Optimal');
    assert.ok(Array.isArray(data.actionableRecommendations));
  });

});
