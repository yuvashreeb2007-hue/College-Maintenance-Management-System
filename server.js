import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Load .env credentials if present
if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (e) {}
}

import {
  getComplaints,
  createComplaint,
  updateComplaint,
  authenticateUser,
  getCategories,
  getReports,
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
// Backend API Routes (Supabase PostgreSQL Proxy)
// ---------------------------------------------------------------------------

// Database and Service Health Check
app.get("/api/health", (req, res) => {
  const dbStatus = getDatabaseStatus();
  res.json({
    status: "healthy",
    database: dbStatus.configured ? "Supabase PostgreSQL (Connected)" : "In-Memory Fallback (Pending Supabase credentials)",
    supabaseConfigured: dbStatus.configured,
    supabaseUrl: dbStatus.url,
    timestamp: new Date().toISOString()
  });
});

// FR-05: Maintenance categories
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// FR-01: Authentication (Student and Staff Login)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: "Username is required" });
    }
    const user = await authenticateUser(username.trim(), password, role);
    res.json(user);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// FR-03 & FR-04: Get all complaints
app.get("/api/complaints", async (req, res) => {
  try {
    const complaints = await getComplaints();
    res.json(complaints);
  } catch (err) {
    console.error("Error fetching complaints:", err);
    res.status(500).json({ error: "Failed to fetch complaints" });
  }
});

// FR-02: Create a new maintenance complaint
app.post("/api/complaints", async (req, res) => {
  try {
    const { title, category, location, priority, details, evidence, createdBy } = req.body;
    if (!title || !category || !location) {
      return res.status(400).json({ error: "Title, category, and location are required." });
    }

    const currentComplaints = await getComplaints();
    const nextNum = currentComplaints.length + 1;
    const id = req.body.id || `CMP-${String(nextNum).padStart(3, "0")}`;

    const newComplaint = await createComplaint({
      id,
      title: title.trim(),
      category: category.trim(),
      location: location.trim(),
      priority: priority || "Medium",
      status: "Pending",
      assignedTo: "-",
      created: "Just now",
      details: details ? details.trim() : "",
      evidence: evidence || "",
      createdBy: createdBy || "Student"
    });

    res.status(201).json(newComplaint);
  } catch (err) {
    console.error("Error creating complaint:", err);
    res.status(500).json({ error: "Failed to create complaint" });
  }
});

// FR-04: Update complaint status / assignment
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
    console.error(`Error updating complaint ${req.params.id}:`, err);
    res.status(500).json({ error: "Failed to update complaint" });
  }
});

// FR-06: Maintenance reports
app.get("/api/reports", async (req, res) => {
  try {
    const reports = await getReports();
    res.json(reports);
  } catch (err) {
    console.error("Error generating reports:", err);
    res.status(500).json({ error: "Failed to generate reports" });
  }
});

// ---------------------------------------------------------------------------
// Static Asset Serving
// ---------------------------------------------------------------------------
const staticDir = fs.existsSync(path.join(__dirname, "dist", "index.html"))
  ? path.join(__dirname, "dist")
  : path.join(__dirname, "Frontend");

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
