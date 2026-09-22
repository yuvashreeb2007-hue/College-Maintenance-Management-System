import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

// Load .env credentials if present
if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (e) {}
}

let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

import {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaint,
  authenticateUser,
  registerStudent,
  getAllUsers,
  getWorkers,
  createWorker,
  getCategories,
  getReports,
  getComplaintsForStudent,
  getComplaintsForWorker,
  createNotification,
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadNotificationCount,
  isSupabaseConfigured,
  getDatabaseStatus
} from "./src/db/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ---------------------------------------------------------------------------
// In-Memory Session Management (Token -> User Session, 24h Expiry)
// ---------------------------------------------------------------------------
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function createSession(user) {
  const token = crypto.randomUUID();
  const sessionData = {
    token,
    user,
    userId: user.id,
    role: user.role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  sessions.set(token, sessionData);
  return token;
}

export function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function destroySession(token) {
  if (!token) return false;
  return sessions.delete(token);
}

export function clearAllSessions() {
  sessions.clear();
}

// ---------------------------------------------------------------------------
// Reusable Authentication & Role-Based Authorization Middleware
// ---------------------------------------------------------------------------

export function requireLogin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : req.headers["x-session-token"] || req.query.token;

  if (!token) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }

  req.token = token;
  req.user = session.user;
  next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access restricted to [${allowedRoles.join(", ")}]. Current role: ${req.user.role}`
      });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Health & Categories API
// ---------------------------------------------------------------------------

app.get("/api/health", (req, res) => {
  const dbStatus = getDatabaseStatus();
  res.json({
    status: "healthy",
    database: dbStatus.configured ? "Supabase PostgreSQL (Connected)" : "In-Memory Fallback",
    supabaseConfigured: dbStatus.configured,
    supabaseUrl: dbStatus.url,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ---------------------------------------------------------------------------
// Authentication Endpoints (FR-01 Unified Role-Based Auth)
// ---------------------------------------------------------------------------

// Common Login endpoint: Backend verifies credentials and determines user role
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, email, identifier, password, role } = req.body;
    const loginIdentifier = identifier || email || username;

    if (!loginIdentifier || !loginIdentifier.trim()) {
      return res.status(400).json({ error: "Username or Email is required." });
    }
    if (!password) {
      return res.status(400).json({ error: "Password is required." });
    }

    const user = await authenticateUser(loginIdentifier.trim(), password, role);
    const token = createSession(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        studentId: user.student_id,
        department: user.department
      },
      username: username || user.username || user.name,
      role: (role === "staff" && user.role === "worker") ? "staff" : user.role,
      authenticated: true
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Authentication failed" });
  }
});

// Student Registration: Automatically sets role = 'student'.
// Rejects any attempt to self-assign worker or admin.
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, studentId, email, password, confirmPassword, department, role } = req.body;

    // Security Rule: Reject any request attempting to elevate role
    if (role && role !== "student") {
      return res.status(400).json({
        error: "Security violation: You cannot register as an administrator or worker. Contact campus administration."
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    const user = await registerStudent({ name, studentId, email, password, department });
    const token = createSession(user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        studentId: user.student_id,
        department: user.department
      },
      message: "Student account registered successfully."
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Registration failed" });
  }
});

// Validate current active session
app.get("/api/auth/me", requireLogin, (req, res) => {
  res.json({ user: req.user, authenticated: true });
});

// Logout endpoint: Destroys session
app.post("/api/auth/logout", requireLogin, (req, res) => {
  destroySession(req.token);
  res.json({ success: true, message: "Logged out successfully." });
});

// ---------------------------------------------------------------------------
// Student Protected Routes
// ---------------------------------------------------------------------------

// Student Dashboard Data
app.get("/api/student/dashboard", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const myComplaints = await getComplaintsForStudent(req.user.name, req.user.email, req.user.id);
    const total = myComplaints.length;
    const pending = myComplaints.filter(c => c.status === "Pending").length;
    const ongoing = myComplaints.filter(c => c.status === "Ongoing" || c.status === "In Progress" || c.status === "Assigned").length;
    const resolved = myComplaints.filter(c => c.status === "Resolved").length;

    res.json({
      role: "student",
      student: req.user,
      stats: { total, pending, ongoing, resolved },
      complaints: myComplaints
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load student dashboard" });
  }
});

// Get Student's Own Complaints
app.get("/api/student/complaints", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const myComplaints = await getComplaintsForStudent(req.user.name, req.user.email, req.user.id);
    res.json(myComplaints);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch student complaints" });
  }
});

// Student Submit Complaint
app.post("/api/complaints", async (req, res) => {
  try {
    const { title, category, location, priority, details, evidence, createdBy } = req.body;
    if (!title || !category || !location) {
      return res.status(400).json({ error: "Title, category, and location are required." });
    }

    // Resolve authenticated user from Bearer token or session if present
    let user = req.user;
    if (!user) {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : req.headers["x-session-token"] || req.query.token;
      if (token) {
        const session = getSession(token);
        if (session) user = session.user;
      }
    }

    const currentComplaints = await getComplaints();
    const nextNum = currentComplaints.length + 1;
    const id = req.body.id || `CMP-${String(nextNum).padStart(3, "0")}`;

    // Security: Authenticated user takes precedence over any frontend-supplied createdBy
    const author = user ? user.name : (createdBy || "Student");
    const userId = user ? user.id : null;

    const newComplaint = await createComplaint({
      id,
      title: title.trim(),
      category: category.trim(),
      location: location.trim(),
      priority: priority || "Medium",
      status: "Pending",
      assignedTo: "-",
      assignedWorkerId: null,
      created: "Just now",
      details: details ? details.trim() : "",
      evidence: evidence || "",
      workNotes: "",
      resolutionNotes: "",
      feedback: "",
      feedbackRating: null,
      feedbackAt: null,
      assignedAt: null,
      startedAt: null,
      resolvedAt: null,
      createdBy: author,
      userId
    });

    // Notify Campus Administrators
    await createNotification({
      targetRole: "admin",
      title: `New Complaint: ${newComplaint.id}`,
      message: `${author} reported "${newComplaint.title}" at ${newComplaint.location}.`,
      type: "info",
      complaintId: newComplaint.id
    });

    res.status(201).json(newComplaint);
  } catch (err) {
    console.error("Error creating complaint:", err);
    res.status(500).json({ error: "Failed to create complaint" });
  }
});

// Student Feedback after resolution
app.post("/api/student/complaints/:id/feedback", requireLogin, requireRole("student"), async (req, res) => {
  try {
    const { feedback, rating } = req.body;
    if (!feedback || !feedback.trim()) {
      return res.status(400).json({ error: "Feedback content is required." });
    }

    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    // Ensure complaint is Resolved before feedback is permitted
    if (complaint.status !== "Resolved") {
      return res.status(400).json({ error: "Feedback can only be submitted for Resolved complaints." });
    }

    // Verify student ownership
    const isOwner = (
      !complaint.userId || // Initial seed complaints or public tickets without user ID can be rated by authenticated students
      (complaint.userId && req.user.id && complaint.userId === req.user.id) ||
      (complaint.createdBy && complaint.createdBy.toLowerCase() === req.user.name.toLowerCase()) ||
      (req.user.email && complaint.createdBy && complaint.createdBy.toLowerCase() === req.user.email.toLowerCase()) ||
      complaint.createdBy.toLowerCase() === "student"
    );

    if (!isOwner) {
      return res.status(403).json({ error: "Access denied: You can only provide feedback on your own complaints." });
    }

    const numRating = Number(rating) || 5;
    const validRating = Math.max(1, Math.min(5, numRating));
    const now = new Date().toISOString();

    const updated = await updateComplaint(req.params.id, {
      feedback: feedback.trim(),
      feedbackRating: validRating,
      feedbackAt: now
    });
    if (!updated) return res.status(404).json({ error: "Complaint not found" });

    // Notify Worker if assigned
    if (complaint.assignedWorkerId) {
      await createNotification({
        targetRole: "worker",
        targetUserId: complaint.assignedWorkerId,
        title: `Feedback Received: ${complaint.id}`,
        message: `${req.user.name} rated service ${validRating}★: "${feedback.trim()}"`,
        type: "feedback_received",
        complaintId: complaint.id
      });
    }

    // Notify Admin
    await createNotification({
      targetRole: "admin",
      title: `Student Feedback: ${complaint.id}`,
      message: `${req.user.name} rated ${complaint.id} (${validRating}★): "${feedback.trim()}"`,
      type: "feedback_received",
      complaintId: complaint.id
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// ---------------------------------------------------------------------------
// Maintenance Worker Protected Routes
// ---------------------------------------------------------------------------

// Worker Dashboard Data
app.get("/api/worker/dashboard", requireLogin, requireRole("worker"), async (req, res) => {
  try {
    const workerComplaints = await getComplaintsForWorker(req.user.name, req.user.id);
    const assigned = workerComplaints.filter(c => c.status === "Assigned").length;
    const ongoing = workerComplaints.filter(c => c.status === "Ongoing" || c.status === "In Progress").length;
    const completed = workerComplaints.filter(c => c.status === "Resolved").length;
    const highPriority = workerComplaints.filter(c => c.priority === "High" && c.status !== "Resolved").length;

    res.json({
      role: "worker",
      worker: req.user,
      stats: {
        total: workerComplaints.length,
        assigned,
        ongoing,
        completed,
        highPriority
      },
      complaints: workerComplaints
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load worker dashboard" });
  }
});

// Worker Complaints
app.get("/api/worker/complaints", requireLogin, requireRole("worker"), async (req, res) => {
  try {
    const complaints = await getComplaintsForWorker(req.user.name, req.user.id);
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch worker complaints" });
  }
});

// Worker Updates Complaint Status / Adds Work Notes / Resolves
app.patch("/api/worker/complaints/:id", requireLogin, requireRole("worker"), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, workNotes, resolutionNotes } = req.body;

    const complaint = await getComplaintById(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    // Validate ownership: Worker can only update complaints assigned to them
    const isAssignedToThisWorker = (
      (complaint.assignedWorkerId && complaint.assignedWorkerId === req.user.id) ||
      (complaint.assignedTo && complaint.assignedTo.toLowerCase() === req.user.name.toLowerCase())
    );

    if (!isAssignedToThisWorker) {
      return res.status(403).json({ error: "Access denied: You can only update complaints assigned to you." });
    }

    const updates = {};
    const now = new Date().toISOString();
    const notes = resolutionNotes || workNotes;

    // Strict Status Workflow Handling
    if (status === "In Progress" || status === "Ongoing") {
      updates.status = status;
      if (!complaint.startedAt) updates.startedAt = now;
      if (notes) updates.workNotes = notes;

      // Notify Student that technician has started work
      await createNotification({
        targetRole: "student",
        targetUserId: complaint.userId || complaint.createdBy,
        title: `Work Started: ${complaint.id}`,
        message: `Technician ${req.user.name} has started work on "${complaint.title}".`,
        type: "work_started",
        complaintId: complaint.id
      });
    } else if (status === "Resolved") {
      const finalNotes = notes || complaint.resolutionNotes || complaint.workNotes;
      if (!finalNotes || !finalNotes.trim()) {
        return res.status(400).json({ error: "Resolution notes are required when marking a complaint as resolved." });
      }
      updates.status = "Resolved";
      updates.resolvedAt = now;
      updates.workNotes = finalNotes.trim();
      updates.resolutionNotes = finalNotes.trim();

      // Notify Student
      await createNotification({
        targetRole: "student",
        targetUserId: complaint.userId || complaint.createdBy,
        title: `Complaint Resolved: ${complaint.id}`,
        message: `Your complaint ${complaint.id} ("${complaint.title}") has been marked as Resolved by ${req.user.name}. Please rate the service!`,
        type: "complaint_resolved",
        complaintId: complaint.id
      });

      // Notify Admin
      await createNotification({
        targetRole: "admin",
        title: `Complaint Resolved: ${complaint.id}`,
        message: `Technician ${req.user.name} resolved "${complaint.title}".`,
        type: "complaint_resolved",
        complaintId: complaint.id
      });
    } else if (status) {
      updates.status = status;
      if (notes) updates.workNotes = notes;
    } else if (notes) {
      updates.workNotes = notes;
    }

    const updated = await updateComplaint(id, updates);
    if (!updated) return res.status(404).json({ error: "Complaint not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update complaint" });
  }
});

// Worker Starts Work on Complaint (Convenience Action)
app.post("/api/worker/complaints/:id/start", requireLogin, requireRole("worker"), async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await getComplaintById(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const isAssigned = (
      (complaint.assignedWorkerId && complaint.assignedWorkerId === req.user.id) ||
      (complaint.assignedTo && complaint.assignedTo.toLowerCase() === req.user.name.toLowerCase())
    );
    if (!isAssigned) {
      return res.status(403).json({ error: "Access denied: Complaint is not assigned to you." });
    }

    const now = new Date().toISOString();
    const updated = await updateComplaint(id, {
      status: "In Progress",
      startedAt: now
    });

    await createNotification({
      targetRole: "student",
      targetUserId: complaint.userId || complaint.createdBy,
      title: `Work Started: ${complaint.id}`,
      message: `Technician ${req.user.name} has started work on "${complaint.title}".`,
      type: "work_started",
      complaintId: complaint.id
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to start work on complaint" });
  }
});

// Worker Resolves Complaint (Convenience Action)
app.post("/api/worker/complaints/:id/resolve", requireLogin, requireRole("worker"), async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    if (!resolutionNotes || !resolutionNotes.trim()) {
      return res.status(400).json({ error: "Resolution notes are required to resolve this complaint." });
    }

    const complaint = await getComplaintById(id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const isAssigned = (
      (complaint.assignedWorkerId && complaint.assignedWorkerId === req.user.id) ||
      (complaint.assignedTo && complaint.assignedTo.toLowerCase() === req.user.name.toLowerCase())
    );
    if (!isAssigned) {
      return res.status(403).json({ error: "Access denied: Complaint is not assigned to you." });
    }

    const now = new Date().toISOString();
    const updated = await updateComplaint(id, {
      status: "Resolved",
      resolutionNotes: resolutionNotes.trim(),
      workNotes: resolutionNotes.trim(),
      resolvedAt: now
    });

    await createNotification({
      targetRole: "student",
      targetUserId: complaint.userId || complaint.createdBy,
      title: `Complaint Resolved: ${complaint.id}`,
      message: `Your complaint ${complaint.id} ("${complaint.title}") has been resolved by ${req.user.name}.`,
      type: "complaint_resolved",
      complaintId: complaint.id
    });

    await createNotification({
      targetRole: "admin",
      title: `Complaint Resolved: ${complaint.id}`,
      message: `Technician ${req.user.name} completed "${complaint.title}".`,
      type: "complaint_resolved",
      complaintId: complaint.id
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve complaint" });
  }
});

// ---------------------------------------------------------------------------
// Administrator Protected Routes
// ---------------------------------------------------------------------------

// Admin Dashboard Data
app.get("/api/admin/dashboard", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const complaints = await getComplaints();
    const workers = await getWorkers();
    const reports = await getReports();

    res.json({
      role: "admin",
      admin: req.user,
      stats: {
        totalComplaints: reports.total,
        pendingComplaints: reports.pendingCount,
        assignedComplaints: reports.assignedCount || complaints.filter(c => c.status === "Assigned").length,
        ongoingComplaints: reports.ongoingCount,
        resolvedComplaints: reports.resolvedCount,
        highPriorityComplaints: reports.highPriorityCount,
        totalWorkers: workers.length
      },
      reports,
      workers,
      complaints
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load admin dashboard" });
  }
});

// Admin All Complaints
app.get("/api/admin/complaints", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const complaints = await getComplaints();
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

// Admin Assigns Complaint to Worker
app.patch("/api/admin/complaints/:id/assign", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { workerId, workerName, status } = req.body;
    if (!workerName) {
      return res.status(400).json({ error: "Worker name is required for assignment." });
    }

    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    const newStatus = status || "Assigned";
    const now = new Date().toISOString();

    const updated = await updateComplaint(req.params.id, {
      assignedTo: workerName,
      assignedWorkerId: workerId || null,
      assignedAt: now,
      status: newStatus
    });

    if (!updated) return res.status(404).json({ error: "Complaint not found" });

    // Notify Worker
    if (workerId) {
      await createNotification({
        targetRole: "worker",
        targetUserId: workerId,
        title: `Ticket Assigned: ${complaint.id}`,
        message: `You were assigned to "${complaint.title}" (${complaint.category}) at ${complaint.location}.`,
        type: "complaint_assigned",
        complaintId: complaint.id
      });
    }

    // Notify Student
    await createNotification({
      targetRole: "student",
      targetUserId: complaint.userId || complaint.createdBy,
      title: `Complaint Assigned: ${complaint.id}`,
      message: `Your complaint "${complaint.title}" has been assigned to technician ${workerName}.`,
      type: "complaint_assigned",
      complaintId: complaint.id
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to assign complaint" });
  }
});

// ---------------------------------------------------------------------------
// In-App Notifications Routes
// ---------------------------------------------------------------------------

app.get("/api/notifications", requireLogin, async (req, res) => {
  try {
    const notifs = await getNotificationsForUser(req.user);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.get("/api/notifications/unread-count", requireLogin, async (req, res) => {
  try {
    const count = await getUnreadNotificationCount(req.user);
    res.json({ count, unreadCount: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notification count" });
  }
});

app.patch("/api/notifications/:id/read", requireLogin, async (req, res) => {
  try {
    await markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

app.post("/api/notifications/read-all", requireLogin, async (req, res) => {
  try {
    await markAllNotificationsRead(req.user);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark all notifications as read" });
  }
});

// Single Complaint Details Endpoint (Role-Authorized)
app.get("/api/complaints/:id", requireLogin, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: "Complaint not found" });

    // Role-based visibility check
    if (req.user.role === "student") {
      const isOwner = (
        (complaint.userId && req.user.id && complaint.userId === req.user.id) ||
        (complaint.createdBy && complaint.createdBy.toLowerCase() === req.user.name.toLowerCase()) ||
        (req.user.email && complaint.createdBy && complaint.createdBy.toLowerCase() === req.user.email.toLowerCase()) ||
        complaint.createdBy.toLowerCase() === "student"
      );
      if (!isOwner) {
        return res.status(403).json({ error: "Access denied to this complaint." });
      }
    } else if (req.user.role === "worker") {
      const isAssigned = (
        (complaint.assignedWorkerId && complaint.assignedWorkerId === req.user.id) ||
        (complaint.assignedTo && complaint.assignedTo.toLowerCase() === req.user.name.toLowerCase())
      );
      if (!isAssigned) {
        return res.status(403).json({ error: "Access denied to this complaint." });
      }
    }

    res.json(complaint);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch complaint details" });
  }
});

// Admin Workers List
app.get("/api/admin/workers", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const workers = await getWorkers();
    res.json(workers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

// Admin Creates New Worker Account
app.post("/api/admin/workers", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { name, email, department, password } = req.body;
    const worker = await createWorker({ name, email, department, password });
    res.status(201).json(worker);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to create worker account" });
  }
});

// Admin All Users List
app.get("/api/admin/users", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ---------------------------------------------------------------------------
// General Complaints & Reports (Backwards Compatibility)
// ---------------------------------------------------------------------------

app.get("/api/complaints", async (req, res) => {
  try {
    const complaints = await getComplaints();
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

app.patch("/api/complaints/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = await updateComplaint(id, updates);
    if (!updated) {
      return res.status(404).json({ error: "Complaint not found" });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update complaint" });
  }
});

app.get("/api/reports", async (req, res) => {
  try {
    const reports = await getReports();
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to generate reports" });
  }
});

// AI-Generated Campus Reports & Executive Summaries (Gemini AI Powered)
app.post("/api/reports/ai-summary", requireLogin, requireRole("admin"), async (req, res) => {
  try {
    const { categoryFilter = "All", reportType = "executive", customPrompt = "" } = req.body || {};

    const allComplaints = await getComplaints();
    const filteredComplaints = categoryFilter && categoryFilter !== "All"
      ? allComplaints.filter(c => c.category && c.category.toLowerCase() === categoryFilter.toLowerCase())
      : allComplaints;

    const total = filteredComplaints.length;
    const pending = filteredComplaints.filter(c => c.status === "Pending");
    const assigned = filteredComplaints.filter(c => c.status === "Assigned");
    const ongoing = filteredComplaints.filter(c => c.status === "Ongoing" || c.status === "In Progress");
    const resolved = filteredComplaints.filter(c => c.status === "Resolved");
    const highPriority = filteredComplaints.filter(c => c.priority === "High" && c.status !== "Resolved");

    // Location distribution
    const locationCounts = {};
    filteredComplaints.forEach(c => {
      const loc = c.location || "Campus General";
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    });

    // Feedback ratings
    const ratings = filteredComplaints
      .filter(c => c.feedbackRating)
      .map(c => Number(c.feedbackRating));
    const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "N/A";

    const metricsData = {
      total,
      pendingCount: pending.length,
      assignedCount: assigned.length,
      ongoingCount: ongoing.length,
      resolvedCount: resolved.length,
      highPriorityCount: highPriority.length,
      averageSatisfactionRating: avgRating,
      locationBreakdown: locationCounts
    };

    // If zero complaints in this category
    if (total === 0) {
      return res.json({
        executiveSummary: `No active or historical complaints recorded for category "${categoryFilter}". Campus facilities in this sector are operating normally with zero reported downtime.`,
        operationalHealthIndex: "Optimal",
        keyFindings: [
          `Zero incident tickets logged under ${categoryFilter}.`,
          "No current maintenance backlog or outstanding work orders."
        ],
        criticalBottlenecks: [
          "None detected. Scheduled inspections recommended to preserve infrastructure integrity."
        ],
        technicianPerformance: "No active assignments pending for this sector.",
        actionableRecommendations: [
          "Maintain weekly preventative walkthrough audits.",
          "Verify inventory levels for routine replacement components."
        ],
        metrics: metricsData,
        categoryFilter,
        reportType,
        customPrompt: customPrompt || null,
        generatedAt: new Date().toISOString(),
        model: "gemini-3.8-flash"
      });
    }

    // Prepare a concise summary dataset for Gemini to analyze
    const ticketSamples = filteredComplaints.slice(0, 30).map(c => ({
      id: c.id,
      title: c.title,
      category: c.category,
      priority: c.priority,
      status: c.status,
      location: c.location,
      assignedTo: c.assignedTo || "Unassigned",
      notes: c.resolutionNotes || c.workNotes || "",
      feedback: c.feedback || "",
      rating: c.feedbackRating || null
    }));

    let aiResult = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getGeminiClient();
        const prompt = `You are a Facilities Operations Analyst for CampusFix, a university campus maintenance management platform.
Analyze the following maintenance register dataset and generate an executive report.

REPORT PARAMETERS:
- Focus Category: ${categoryFilter}
- Report Type: ${reportType} (executive = broad health & status, bottlenecks = turnaround risks & root causes, preventative = risk mitigation & resource allocation)
- Optional User Focus: ${customPrompt ? `"${customPrompt}"` : "None provided"}

DATASET METRICS:
Total Tickets: ${total}
Pending: ${pending.length}
Assigned: ${assigned.length}
Ongoing / In Progress: ${ongoing.length}
Resolved: ${resolved.length}
Unresolved High Priority: ${highPriority.length}
Average Student Feedback Rating: ${avgRating} / 5
Location Distribution: ${JSON.stringify(locationCounts)}

COMPLAINTS LOG (Most recent sample):
${JSON.stringify(ticketSamples, null, 2)}

OUTPUT REQUIREMENT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "executiveSummary": "A concise, 2-3 sentence executive briefing of current facilities status, workload distribution, and overall narrative.",
  "operationalHealthIndex": "One of: 'Optimal' | 'Good' | 'Needs Attention' | 'Critical Backlog'",
  "keyFindings": ["Finding 1 with concrete data/locations", "Finding 2 with concrete data/locations", "Finding 3"],
  "criticalBottlenecks": ["Bottleneck or turnaround delay pattern 1", "Bottleneck 2"],
  "technicianPerformance": "Assessment of technician dispatch speed, completion rate, and student feedback sentiment.",
  "actionableRecommendations": ["Action 1: immediate operational step", "Action 2: preventative infrastructure measure", "Action 3"]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json"
          }
        });

        const responseText = response.text || "";
        aiResult = JSON.parse(responseText);
      } catch (genError) {
        console.warn("Gemini API call failed, using deterministic analysis fallback:", genError.message);
      }
    }

    // Fallback if AI call was skipped or failed
    if (!aiResult) {
      const resolutionRate = total > 0 ? Math.round((resolved.length / total) * 100) : 100;
      const healthIndex = highPriority.length > 2 ? "Needs Attention" : resolutionRate > 60 ? "Good" : "Fair";
      
      aiResult = {
        executiveSummary: `Campus facilities log reflects ${total} total maintenance tickets across ${categoryFilter} category. Currently ${resolved.length} tickets (${resolutionRate}%) are successfully resolved, with ${pending.length} pending initial dispatch and ${ongoing.length + assigned.length} actively underway.`,
        operationalHealthIndex: healthIndex,
        keyFindings: [
          `Resolution completion stands at ${resolutionRate}% across registered campus complaints.`,
          `${highPriority.length} high-priority issues require immediate administrative or technician intervention.`,
          `Primary facility load concentrated in: ${Object.entries(locationCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} (${v} tickets)`).join(", ") || "General campus"}.`
        ],
        criticalBottlenecks: [
          pending.length > 0 ? `${pending.length} tickets remain in pending status awaiting technician assignment.` : "No dispatch backlog detected.",
          highPriority.length > 0 ? `Unresolved critical items require prompt resolution to minimize downtime.` : "High priority items are currently under active management."
        ],
        technicianPerformance: `Assigned technicians have closed ${resolved.length} tickets. Student satisfaction rating averages ${avgRating} / 5 stars across evaluated repairs.`,
        actionableRecommendations: [
          "Dispatch available technicians to unassigned pending tickets promptly.",
          "Prioritize high-urgency electrical and plumbing repairs to prevent secondary structural disruption.",
          "Conduct routine preventative maintenance in high-frequency locations."
        ]
      };
    }

    res.json({
      ...aiResult,
      metrics: metricsData,
      categoryFilter,
      reportType,
      customPrompt: customPrompt || null,
      generatedAt: new Date().toISOString(),
      model: "gemini-3.8-flash"
    });
  } catch (err) {
    console.error("AI Report generation error:", err);
    res.status(500).json({ error: "Failed to generate AI report: " + err.message });
  }
});

// ---------------------------------------------------------------------------
// AI-Powered Conversational Complaint Booking Concierge (Gemini AI)
// ---------------------------------------------------------------------------
app.post("/api/chat/assistant", requireLogin, async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    const trimmedMsg = message.trim();
    const user = req.user;
    const userName = user.name || user.username || "Student";
    const userDept = user.department || "General";

    // System instruction defining CampusFix booking rules
    const systemPrompt = `You are "CampusFix AI Assistant", a smart facilities maintenance booking concierge for a college campus.
Your goal is to converse with students, faculty, and staff, understand their facility complaint, extract the maintenance ticket details, and help them book a ticket.

CAMPUS CATEGORIES (Select the most accurate one):
1. Plumbing (leaking pipes, faucets, clogged toilets, drainage, sinks, water supply)
2. Electrical (lights, fans, power sockets, AC units, wiring, sparks, power cuts)
3. Network (Wi-Fi disconnections, router issues, slow LAN, portal access)
4. Furniture (broken desks, broken chairs, damaged doors, windows, whiteboards)
5. Cleaning (spills, trash accumulation, washroom sanitation, dirty classrooms)

PRIORITY CRITERIA:
- High: Severe disruption or hazards (e.g. sparks, major water flooding, total blackout, broken glass, safety risk)
- Medium: Functional disruption affecting daily studies/routine (e.g. AC not cooling, fan dead in lecture hall, Wi-Fi down, door latch stuck)
- Low: Minor cosmetic or non-urgent wear (e.g. squeaky hinge, minor stain, scuffed desk)

CONVERSATION INSTRUCTIONS:
- If the user provides an issue and location (e.g. "The fan in room 204 Block B is making loud sparks"), extract all details, set "readyToBook": true, and fill "ticketProposal". In your "reply", explain that you have drafted the ticket and they can review it and click "Confirm & Book Ticket".
- If the user gives only the problem without a specific location (e.g. "The Wi-Fi isn't working" or "My desk is broken"), set "readyToBook": false, "ticketProposal": null, and ask them nicely which room, block, or floor it is in.
- If the user gives a location without the problem, ask them what is wrong.
- If the user asks a question about campus maintenance policies, operating hours (facilities team operates 8 AM - 6 PM on weekdays, emergency repairs 24/7), or status, answer politely.
- If the user confirms or says "yes please book it" / "confirm" referring to a previously discussed issue in conversation history, extract the details from the history and output "readyToBook": true with the complete "ticketProposal".

REQUIRED OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object matching this schema:
{
  "reply": "Your friendly, concise conversational response to the user.",
  "readyToBook": true or false,
  "ticketProposal": null or {
    "title": "Clear concise title (max 60 chars, e.g., 'Sparking ceiling fan in Block B')",
    "category": "Plumbing" | "Electrical" | "Network" | "Furniture" | "Cleaning",
    "location": "Specific campus room/building (e.g., 'Block B, Room 204')",
    "priority": "High" | "Medium" | "Low",
    "details": "Detailed observation describing the problem, hazard level, and specifics."
  }
}`;

    // Prepare conversation contents for Gemini
    const contents = [];
    contents.push({ role: "user", parts: [{ text: systemPrompt }] });
    contents.push({
      role: "model",
      parts: [{
        text: JSON.stringify({
          reply: "Understood! I am CampusFix AI Assistant. I will help students and staff report issues and book tickets in structured format.",
          readyToBook: false,
          ticketProposal: null
        })
      }]
    });

    // Append prior history (capped to last 8 turns)
    const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
    for (const h of recentHistory) {
      if (h && (h.role === "user" || h.role === "assistant" || h.role === "model")) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: typeof h.content === "string" ? h.content : JSON.stringify(h.content) }]
        });
      }
    }

    // Append current user message with context
    contents.push({
      role: "user",
      parts: [{ text: `User (${userName}, ${userDept}): ${trimmedMsg}` }]
    });

    let aiResult = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents,
          config: {
            responseMimeType: "application/json"
          }
        });
        const responseText = response.text || "";
        aiResult = JSON.parse(responseText);
      } catch (genError) {
        console.warn("Gemini chat API call failed, using deterministic assistant fallback:", genError.message);
      }
    }

    // Deterministic Rule-Based Fallback
    if (!aiResult) {
      const lower = trimmedMsg.toLowerCase();
      
      // Category detection
      let category = "General Maintenance";
      if (/leak|water|tap|pipe|flush|washroom|toilet|sink|drain/i.test(lower)) category = "Plumbing";
      else if (/light|fan|bulb|power|socket|wire|spark|switch|ac|cooler|electricity/i.test(lower)) category = "Electrical";
      else if (/wifi|wi-fi|internet|network|router|lan|connection/i.test(lower)) category = "Network";
      else if (/chair|bench|desk|table|door|window|furniture|hinge/i.test(lower)) category = "Furniture";
      else if (/clean|trash|garbage|spill|dust|dirty|sanitat/i.test(lower)) category = "Cleaning";

      // Priority detection
      let priority = "Medium";
      if (/spark|hazard|danger|shock|flood|emergency|urgent|burning/i.test(lower)) priority = "High";
      else if (/minor|slight|squeak|small/i.test(lower)) priority = "Low";

      // Location detection heuristics (e.g. "room 204", "block b", "hostel 3", "lab 1")
      const locMatch = trimmedMsg.match(/(?:in|at|room|block|hostel|lab|floor|hall|building)\s+([A-Za-z0-9\-–\s,]+?)(?:\.|$|and|,)/i);
      const hasSpecificLocation = locMatch && locMatch[0].trim().length > 3;
      const detectedLocation = hasSpecificLocation ? locMatch[0].trim().replace(/^(in|at)\s+/i, '') : "";

      if (category !== "General Maintenance" && detectedLocation) {
        aiResult = {
          reply: `I've prepared a ${category} maintenance ticket for "${detectedLocation}". Please review the ticket details below and click "Confirm & Book Ticket" to register it immediately with our campus team.`,
          readyToBook: true,
          ticketProposal: {
            title: `${category} issue: ${trimmedMsg.slice(0, 45)}...`,
            category,
            location: detectedLocation,
            priority,
            details: trimmedMsg
          }
        };
      } else if (category !== "General Maintenance") {
        aiResult = {
          reply: `I understand you have a ${category} issue ("${trimmedMsg}"). Could you please tell me which room, building, or block this is located in so I can prepare your ticket?`,
          readyToBook: false,
          ticketProposal: null
        };
      } else {
        aiResult = {
          reply: `Hello ${userName}! I can help you book a maintenance ticket for plumbing, electrical, Wi-Fi/network, furniture, or cleaning issues. Could you describe what is broken and which room or building it is located in?`,
          readyToBook: false,
          ticketProposal: null
        };
      }
    }

    res.json({
      reply: aiResult.reply || "I am ready to help with your maintenance ticket. Please provide the issue and location.",
      readyToBook: Boolean(aiResult.readyToBook && aiResult.ticketProposal),
      ticketProposal: aiResult.ticketProposal || null,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("AI Assistant Chat error:", err);
    res.status(500).json({ error: "Failed to process chat: " + err.message });
  }
});

// ---------------------------------------------------------------------------
// Static Asset Serving & SPA Routing
// ---------------------------------------------------------------------------
const staticDir = fs.existsSync(path.join(__dirname, "dist", "index.html"))
  ? path.join(__dirname, "dist")
  : path.join(__dirname, "Frontend");

// Dedicated PWA Service Worker Route with Service-Worker-Allowed header and no-cache
app.get("/sw.js", (req, res) => {
  const swPath = path.join(staticDir, "sw.js");
  if (fs.existsSync(swPath)) {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(swPath);
  } else {
    res.status(404).send("Service Worker not found");
  }
});

// Dedicated Web App Manifest Route
app.get(["/manifest.json", "/manifest.webmanifest"], (req, res) => {
  const manifestPath = path.join(staticDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(manifestPath);
  } else {
    res.status(404).send("Manifest not found");
  }
});

app.use(express.static(staticDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

export { app };

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CampusFix server running on http://0.0.0.0:${PORT}`);
    console.log(`Database target: ${isSupabaseConfigured() ? "Supabase PostgreSQL" : "In-Memory Fallback"}`);
  });
}
