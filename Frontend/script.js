// =============================================================================
// CampusFix - College Maintenance Management System
// Unified Authentication & Role-Based Access Control (RBAC) Engine
// Roles: 'student' (User) | 'worker' (Maintenance Staff) | 'admin' (Administrator)
// =============================================================================

const $ = id => document.getElementById(id);

// System State
let sessionToken = sessionStorage.getItem("campusfix_token") || localStorage.getItem("campusfix_token") || null;
let currentUser = null;
let currentRole = null;
let complaints = [];
let workers = [];
let allUsers = [];
let soundEnabled = true;
let selectedFile = null;
let activeTicketForWorkerModal = null;
let activeTicketForFeedbackModal = null;

// Audio Feedback Engine (Synthesized Web Audio API)
const audioCtx = window.AudioContext ? new AudioContext() : null;
function playSound(type = "click") {
  if (!soundEnabled || !audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === "success") {
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === "warning") {
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else {
    osc.frequency.setValueAtTime(560, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.start(now);
    osc.stop(now + 0.06);
  }
}

// Toast Notifications
function toast(title, message, icon = "fa-circle-info") {
  const container = $("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<i class="fa-solid ${icon}"></i><div><strong>${title}</strong><span>${message}</span></div>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

// Helper: HTTP Fetch with Auth Token Header
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (sessionToken) {
    headers["Authorization"] = `Bearer ${sessionToken}`;
    headers["x-session-token"] = sessionToken;
  }
  return fetch(url, { ...options, headers });
}

// =============================================================================
// 1. AUTHENTICATION UI & ROLE TAB SWITCHER (FR-01)
// =============================================================================
let activeAuthTab = "student"; // 'student' | 'staff'
let studentSubMode = "signin";  // 'signin' | 'register'

function initAuthUI() {
  // Tab A: Student / User Login
  $("tabStudent").addEventListener("click", () => {
    activeAuthTab = "student";
    $("tabStudent").classList.add("active");
    $("tabStudent").setAttribute("aria-selected", "true");
    $("tabStaff").classList.remove("active");
    $("tabStaff").setAttribute("aria-selected", "false");

    $("studentAuthToggle").classList.remove("hidden");
    $("staffAuthNotice").classList.add("hidden");
    $("staffLoginForm").classList.add("hidden");

    if (studentSubMode === "signin") {
      $("studentLoginForm").classList.remove("hidden");
      $("studentRegisterForm").classList.add("hidden");
    } else {
      $("studentLoginForm").classList.add("hidden");
      $("studentRegisterForm").classList.remove("hidden");
    }
    clearAuthAlert();
    playSound();
  });

  // Tab B: Staff Login (Maintenance Worker & Administrator)
  $("tabStaff").addEventListener("click", () => {
    activeAuthTab = "staff";
    $("tabStaff").classList.add("active");
    $("tabStaff").setAttribute("aria-selected", "true");
    $("tabStudent").classList.remove("active");
    $("tabStudent").setAttribute("aria-selected", "false");

    $("studentAuthToggle").classList.add("hidden");
    $("studentLoginForm").classList.add("hidden");
    $("studentRegisterForm").classList.add("hidden");

    $("staffAuthNotice").classList.remove("hidden");
    $("staffLoginForm").classList.remove("hidden");
    clearAuthAlert();
    playSound();
  });

  // Student Sub-Toggle (Sign In vs Register)
  $("studentModeSignIn").addEventListener("click", () => {
    studentSubMode = "signin";
    $("studentModeSignIn").classList.add("active");
    $("studentModeRegister").classList.remove("active");
    $("studentLoginForm").classList.remove("hidden");
    $("studentRegisterForm").classList.add("hidden");
    clearAuthAlert();
    playSound();
  });

  $("studentModeRegister").addEventListener("click", () => {
    studentSubMode = "register";
    $("studentModeRegister").classList.add("active");
    $("studentModeSignIn").classList.remove("active");
    $("studentLoginForm").classList.add("hidden");
    $("studentRegisterForm").classList.remove("hidden");
    clearAuthAlert();
    playSound();
  });

  // Show/Hide Password toggles
  document.querySelectorAll(".toggle-pw-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetInput = $(btn.dataset.target);
      if (targetInput) {
        const isPassword = targetInput.type === "password";
        targetInput.type = isPassword ? "text" : "password";
        btn.innerHTML = `<i class="fa-regular ${isPassword ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
      }
    });
  });

  // Student Login Form Submit
  $("studentLoginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const identifier = $("studentIdentifier").value.trim();
    const password = $("studentPassword").value;
    const rememberMe = $("studentRememberMe").checked;
    await performLogin(identifier, password, "student", $("studentSubmitBtn"), rememberMe);
  });

  // Staff Login Form Submit (Worker & Admin)
  $("staffLoginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const identifier = $("staffIdentifier").value.trim();
    const password = $("staffPassword").value;
    const rememberMe = $("staffRememberMe").checked;
    await performLogin(identifier, password, "staff", $("staffSubmitBtn"), rememberMe);
  });

  // Student Registration Form Submit (FR-01: Automatically role = 'student')
  $("studentRegisterForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("regName").value.trim();
    const studentId = $("regStudentId").value.trim();
    const department = $("regDepartment").value;
    const email = $("regEmail").value.trim();
    const password = $("regPassword").value;
    const confirmPassword = $("regConfirmPassword").value;

    if (password !== confirmPassword) {
      showAuthAlert("Passwords do not match. Please re-enter.");
      return;
    }

    if (password.length < 6) {
      showAuthAlert("Password must be at least 6 characters long.");
      return;
    }

    const submitBtn = $("regSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...`;

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          studentId,
          department,
          email,
          password,
          confirmPassword,
          role: "student" // Strictly enforced student role
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Registration failed.");
      }

      // Automatically sign in upon registration
      handleAuthSuccess(data, true);
      toast("Registration Successful", `Welcome to CampusFix, ${data.user.name}!`, "fa-circle-check");
    } catch (err) {
      showAuthAlert(err.message);
      playSound("warning");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Create Student Account</span> <i class="fa-solid fa-user-plus"></i>`;
    }
  });

  // Demo Accounts Quick Fill Buttons
  $("demoStudentBtn").addEventListener("click", () => {
    $("tabStudent").click();
    $("studentModeSignIn").click();
    $("studentIdentifier").value = "student@campus.edu";
    $("studentPassword").value = "student123";
    toast("Student Credentials Filled", "Alex Johnson (student@campus.edu / student123)");
  });

  $("demoWorkerBtn").addEventListener("click", () => {
    $("tabStaff").click();
    $("staffIdentifier").value = "worker.electrical@campus.edu";
    $("staffPassword").value = "worker123";
    toast("Worker Credentials Filled", "Robert Miller (worker.electrical@campus.edu / worker123)");
  });

  $("demoAdminBtn").addEventListener("click", () => {
    $("tabStaff").click();
    $("staffIdentifier").value = "admin@campus.edu";
    $("staffPassword").value = "admin123";
    toast("Admin Credentials Filled", "Administrator (admin@campus.edu / admin123)");
  });

  // Forgot password notice
  ["studentForgotPw", "staffForgotPw"].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("click", () => {
        toast("Password Assistance", "Please visit the Campus Facilities & IT Helpdesk in Administration Block A.", "fa-circle-info");
      });
    }
  });
}

function showAuthAlert(msg) {
  const alertEl = $("authAlert");
  $("authAlertText").textContent = msg;
  alertEl.classList.remove("hidden");
}

function clearAuthAlert() {
  $("authAlert").classList.add("hidden");
}

async function performLogin(identifier, password, requestedTab, submitBtn, rememberMe) {
  clearAuthAlert();
  submitBtn.disabled = true;
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password, role: requestedTab })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    handleAuthSuccess(data, rememberMe);
    toast("Welcome back", `Signed in as ${data.user.name} (${data.user.role.toUpperCase()})`, "fa-circle-check");
  } catch (err) {
    showAuthAlert(err.message);
    playSound("warning");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function handleAuthSuccess(data, rememberMe) {
  sessionToken = data.token;
  currentUser = data.user;
  currentRole = data.user.role;

  if (rememberMe) {
    localStorage.setItem("campusfix_token", sessionToken);
  } else {
    sessionStorage.setItem("campusfix_token", sessionToken);
  }
  // Store user info in localStorage for offline caching support
  try {
    localStorage.setItem("campusfix_user", JSON.stringify(currentUser));
  } catch (e) {}

  // Switch to App Workspace
  $("loginPage").classList.add("hidden");
  $("app").classList.remove("hidden");

  // Apply Role-Based Access Control and Nav Restrictions
  configureRoleWorkspace();

  // Load Role Data
  loadRoleDashboardData();
  playSound("success");
}

// =============================================================================
// 2. ROLE-BASED ACCESS CONTROL & WORKSPACE CONFIGURATION
// =============================================================================
function configureRoleWorkspace() {
  if (!currentUser) return;

  const role = currentUser.role;
  const roleLabels = {
    student: "Student",
    worker: "Maintenance Worker",
    admin: "Administrator"
  };
  const roleDisplay = roleLabels[role] || "User";

  // Topbar & Profile updates
  $("sidebarName").textContent = currentUser.name;
  $("sidebarRole").textContent = roleDisplay;
  $("sidebarRole").className = `role-tag ${role}`;
  $("sidebarAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  $("sidebarAvatar").className = `avatar ${role}`;

  $("headerName").textContent = currentUser.name;
  $("headerRole").textContent = roleDisplay;
  $("headerAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  $("headerAvatar").className = `avatar ${role}`;

  // Topbar Role Pill Badge
  const badgeIcon = role === "student" ? "fa-graduation-cap" : role === "worker" ? "fa-screwdriver-wrench" : "fa-user-shield";
  $("topbarRoleBadge").className = `role-pill-badge ${role}`;
  $("topbarRoleBadge").innerHTML = `<i class="fa-solid ${badgeIcon}"></i> <span>${roleDisplay}</span>`;

  // Profile View
  $("profileFullName").textContent = currentUser.name;
  $("profileEmail").textContent = currentUser.email;
  $("profileUsername").textContent = currentUser.username || currentUser.email.split("@")[0];
  $("profileIdField").textContent = currentUser.studentId || (role === "admin" ? "ADMIN-001" : "TECH-" + currentUser.id.slice(0, 6));
  $("profileDepartment").textContent = currentUser.department || "General";
  $("profileBigAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  $("profileBigAvatar").className = `avatar-large ${role}`;
  $("profileRoleBadge").className = `role-pill-badge ${role}`;
  $("profileRoleBadge").innerHTML = `<i class="fa-solid ${badgeIcon}"></i> <span>${roleDisplay}</span>`;

  // Filter Sidebar Navigation Items Strictly by Role
  document.querySelectorAll(".role-nav").forEach(btn => {
    const isStudentNav = btn.classList.contains("student-nav");
    const isWorkerNav = btn.classList.contains("worker-nav");
    const isAdminNav = btn.classList.contains("admin-nav");
    const isCommonNav = btn.classList.contains("common-nav");

    if (isCommonNav) {
      btn.classList.remove("hidden");
    } else if (role === "student") {
      btn.classList.toggle("hidden", !isStudentNav);
    } else if (role === "worker") {
      btn.classList.toggle("hidden", !isWorkerNav);
    } else if (role === "admin") {
      btn.classList.toggle("hidden", !isAdminNav);
    }
  });

  // Set Default Section based on Role
  if (role === "student") {
    $("studentWelcomeName").textContent = currentUser.name.split(" ")[0];
    showSection("studentDashboard");
  } else if (role === "worker") {
    $("workerWelcomeName").textContent = currentUser.name.split(" ")[0];
    showSection("workerDashboard");
  } else if (role === "admin") {
    showSection("adminDashboard");
  }
}

// Section Navigation Guard (Strict Enforcement of Role Boundaries)
function showSection(sectionId) {
  if (!currentUser) return;

  const role = currentUser.role;

  // Enforce Section Permissions
  const studentOnly = ["studentDashboard", "submitComplaint", "studentComplaints"];
  const workerOnly = ["workerDashboard", "workerAssigned", "workerOngoing", "workerCompleted"];
  const adminOnly = ["adminDashboard", "adminComplaints", "adminAssign", "adminWorkers", "adminUsers", "reports"];

  if (studentOnly.includes(sectionId) && role !== "student") {
    showAccessDeniedModal(`Access restricted to Students only. Your current role is: ${role.toUpperCase()}`);
    return;
  }
  if (workerOnly.includes(sectionId) && role !== "worker") {
    showAccessDeniedModal(`Access restricted to Maintenance Technicians. Your current role is: ${role.toUpperCase()}`);
    return;
  }
  if (adminOnly.includes(sectionId) && role !== "admin") {
    showAccessDeniedModal(`Access restricted to Administrators. Your current role is: ${role.toUpperCase()}`);
    return;
  }

  // Update Page Title
  const titles = {
    studentDashboard: "Student Dashboard",
    submitComplaint: "Report Maintenance Issue",
    studentComplaints: "My Complaints",
    workerDashboard: "Technician Dashboard",
    workerAssigned: "Assigned Work Queue",
    workerOngoing: "In Progress Maintenance",
    workerCompleted: "Completed Repairs",
    adminDashboard: "Executive Dashboard",
    adminComplaints: "All Campus Complaints",
    adminAssign: "Dispatch & Assign Complaints",
    adminWorkers: "Maintenance Technicians",
    adminUsers: "Campus User Directory",
    categories: "Maintenance Categories",
    reports: "Complaint Reports & Analytics",
    notifications: "System Notifications",
    profile: "My Campus Profile"
  };

  $("pageTitle").textContent = titles[sectionId] || "Dashboard";

  // Toggle Active Sections
  document.querySelectorAll(".page-section").forEach(sec => sec.classList.remove("active-section"));
  const targetSec = $(sectionId);
  if (targetSec) {
    targetSec.classList.add("active-section");
  }

  if (sectionId === "notifications") {
    loadNotifications();
  }

  // Update Nav Item Active State
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.section === sectionId);
  });

  // Close Mobile Sidebar
  $("sidebar").classList.remove("open");
  playSound();
}

function showAccessDeniedModal(message) {
  $("accessDeniedText").textContent = message;
  $("accessDeniedModal").classList.remove("hidden");
  playSound("warning");
}

$("closeAccessDeniedBtn").addEventListener("click", () => {
  $("accessDeniedModal").classList.add("hidden");
  if (currentUser) {
    if (currentUser.role === "student") showSection("studentDashboard");
    else if (currentUser.role === "worker") showSection("workerDashboard");
    else showSection("adminDashboard");
  }
});

// =============================================================================
// 3. LOGOUT & SESSION TERMINATION
// =============================================================================
async function performLogout() {
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } catch (e) {}

  sessionToken = null;
  currentUser = null;
  currentRole = null;
  sessionStorage.removeItem("campusfix_token");
  localStorage.removeItem("campusfix_token");
  localStorage.removeItem("campusfix_user");

  $("app").classList.add("hidden");
  $("loginPage").classList.remove("hidden");
  $("tabStudent").click();
  $("studentModeSignIn").click();
  toast("Logged Out", "Your session has been terminated securely.", "fa-arrow-right-from-bracket");
  playSound();
}

$("logoutBtn").addEventListener("click", performLogout);
$("profileLogoutBtn").addEventListener("click", performLogout);

// =============================================================================
// 4. DATA LOADING & SYNCHRONIZATION PER ROLE
// =============================================================================
async function loadRoleDashboardData() {
  if (!currentUser) return;
  const role = currentUser.role;

  if (role === "student") {
    await loadStudentData();
  } else if (role === "worker") {
    await loadWorkerData();
  } else if (role === "admin") {
    await loadAdminData();
  }
}

// -----------------------------------------------------------------------------
// 4A. STUDENT WORKFLOW (Submit, Track, Feedback)
// -----------------------------------------------------------------------------
async function loadStudentData() {
  try {
    const res = await authFetch("/api/student/dashboard");
    if (res.ok) {
      const data = await res.json();
      const myTickets = data.complaints || [];
      complaints = myTickets;

      $("studentTotalComplaints").textContent = data.stats.total;
      $("studentPendingComplaints").textContent = data.stats.pending;
      $("studentOngoingComplaints").textContent = data.stats.ongoing;
      $("studentResolvedComplaints").textContent = data.stats.resolved;

      renderStudentDashboardTable(myTickets.slice(0, 5));
      renderStudentTrackCards(myTickets);
    }
  } catch (err) {
    console.warn("Failed to load student data:", err);
  }
}

function renderStudentDashboardTable(list) {
  const tbody = $("studentDashboardTable");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">You have not submitted any complaints yet. Click 'Report a Maintenance Issue' to create one!</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.title}<small style="display:block;color:#94a3b8;font-size:9px">${c.location}</small></td>
      <td>${c.category}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${c.assignedTo || "-"}</td>
      <td>${statusBadge(c.status)}</td>
    </tr>
  `).join("");
}

function renderStudentTrackCards(list) {
  const q = ($("studentTrackSearch").value || "").toLowerCase();
  const status = $("studentTrackStatus").value;

  const filtered = list.filter(c => {
    const matchesQ = !q || [c.id, c.title, c.category, c.location].some(v => v && v.toLowerCase().includes(q));
    const matchesStatus = status === "all" || c.status === status;
    return matchesQ && matchesStatus;
  });

  const container = $("studentTrackCards");
  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;padding:36px;color:#64748b;font-size:11px">No matching complaints found.</div>`;
    return;
  }

  const steps = ["Submitted", "Assigned", "In Progress", "Resolved", "Feedback"];

  container.innerHTML = filtered.map((c, i) => {
    let currentStep = 0;
    if (c.status === "Pending") {
      currentStep = 0;
    } else if (c.status === "Assigned") {
      currentStep = 1;
    } else if (c.status === "In Progress" || c.status === "Ongoing") {
      currentStep = 2;
    } else if (c.status === "Resolved") {
      currentStep = (c.feedback || c.feedbackRating) ? 4 : 3;
    }

    const progressPercent = currentStep === 0 ? 0 : currentStep === 1 ? 25 : currentStep === 2 ? 50 : currentStep === 3 ? 75 : 100;

    const submittedDate = c.created || (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Logged");
    const assignedText = c.assignedTo ? `${c.assignedTo}${c.assignedAt ? ' · ' + new Date(c.assignedAt).toLocaleDateString() : ''}` : 'Pending Dispatch';
    const startedText = c.startedAt ? new Date(c.startedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (currentStep >= 2 ? 'In Progress' : 'Not started');
    const resolvedText = c.resolvedAt ? new Date(c.resolvedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : (c.status === 'Resolved' ? 'Completed' : 'Pending');

    return `
      <article class="ticket-card" style="animation-delay:${i * 40}ms">
        <div class="ticket-head">
          <div>
            <span class="ticket-id">${c.id}</span>
            <h3 class="ticket-title">${c.title}</h3>
            <div class="ticket-meta">
              <span><i class="fa-solid fa-location-dot"></i> ${c.location}</span>
              <span><i class="fa-solid fa-layer-group"></i> ${c.category}</span>
              <span><i class="fa-solid fa-user-gear"></i> Assigned: <strong>${c.assignedTo || "Pending Dispatch"}</strong></span>
            </div>
          </div>
          <div>${priorityBadge(c.priority)} ${statusBadge(c.status)}</div>
        </div>

        <div class="stepper">
          <div class="stepper-progress" style="width:${progressPercent}%"></div>
          ${steps.map((s, idx) => {
            const done = idx <= currentStep;
            return `<div class="step ${done ? 'done' : ''} ${idx === currentStep ? 'current' : ''}">
              <div class="step-dot">${done ? '<i class="fa-solid fa-check"></i>' : idx + 1}</div>${s}
            </div>`;
          }).join("")}
        </div>

        <div class="workflow-meta-timeline">
          <div class="workflow-meta-item">
            <strong>1. Submitted</strong>
            <span>${submittedDate}</span>
          </div>
          <div class="workflow-meta-item">
            <strong>2. Assigned</strong>
            <span>${assignedText}</span>
          </div>
          <div class="workflow-meta-item">
            <strong>3. Work Started</strong>
            <span>${startedText}</span>
          </div>
          <div class="workflow-meta-item">
            <strong>4. Resolution</strong>
            <span>${resolvedText}</span>
          </div>
        </div>

        ${(c.resolutionNotes || c.workNotes) ? `
          <div style="margin-top:12px;background:#f0fdf4;padding:12px 14px;border-radius:10px;font-size:10px;border:1px solid #bbf7d0;color:#166534">
            <div style="font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:6px">
              <i class="fa-solid fa-clipboard-check" style="color:#16a34a"></i> Technician Resolution Notes:
            </div>
            <div style="color:#334155">${c.resolutionNotes || c.workNotes}</div>
          </div>
        ` : ''}

        ${c.status === "Resolved" ? `
          <div class="ticket-feedback-area">
            <div>
              ${(c.feedback || c.feedbackRating) ? `
                <div class="feedback-text-badge">
                  ${renderStars(c.feedbackRating || 5)}
                  <strong>Rating:</strong> "${c.feedback || 'Repairs completed'}"
                  ${c.feedbackAt ? `<small style="color:#64748b">(${new Date(c.feedbackAt).toLocaleDateString()})</small>` : ''}
                </div>
              ` : `
                <span style="font-size:10.5px;color:#475569;font-weight:600">
                  <i class="fa-solid fa-circle-question" style="color:var(--blue)"></i> Repairs marked completed! Please review and submit your rating.
                </span>
              `}
            </div>
            <button class="btn btn-primary open-feedback-btn" data-id="${c.id}" style="padding:6px 14px;font-size:10px">
              <i class="fa-solid fa-star"></i> ${(c.feedback || c.feedbackRating) ? "Update Feedback" : "Leave Feedback & Rating"}
            </button>
          </div>
        ` : ''}
      </article>
    `;
  }).join("");

  document.querySelectorAll(".open-feedback-btn").forEach(btn => {
    btn.addEventListener("click", () => openFeedbackModal(btn.dataset.id));
  });
}

// Student Submit Form
$("complaintForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!$("complaintCategory").value) {
    toast("Select Category", "Please choose the category that fits best.", "fa-circle-exclamation");
    return;
  }

  const title = $("complaintTitle").value.trim();
  const location = $("complaintLocation").value.trim();
  const details = $("complaintDetails").value.trim();
  const priority = $("complaintUrgency").value;
  const category = $("complaintCategory").value;

  const submitBtn = $("submitComplaintBtn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

  try {
    const res = await authFetch("/api/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        category,
        location,
        priority,
        details,
        evidence: selectedFile ? selectedFile.name : "",
        createdBy: currentUser.name
      })
    });

    const newTicket = await res.json();
    if (!res.ok) throw new Error(newTicket.error || "Failed to submit complaint.");

    e.target.reset();
    selectedFile = null;
    $("complaintCategory").value = "";
    $("complaintUrgency").value = "Medium";
    document.querySelectorAll(".category-option").forEach(b => b.classList.remove("selected"));
    document.querySelectorAll(".urgency-option").forEach(b => b.classList.toggle("selected", b.dataset.urgency === "Medium"));
    $("filePreview").classList.add("hidden");

    toast("Complaint Submitted", `Ticket ${newTicket.id} registered and queued for administrator dispatch.`, "fa-circle-check");
    playSound("success");

    // Reload student complaints and navigate to tracking
    await loadStudentData();
    await updateNotificationBadges();
    showSection("studentComplaints");
  } catch (err) {
    toast("Submission Failed", err.message, "fa-circle-exclamation");
    playSound("warning");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Submit Ticket</span> <i class="fa-solid fa-paper-plane"></i>`;
  }
});

// Student Feedback Modal
function openFeedbackModal(ticketId) {
  activeTicketForFeedbackModal = ticketId;
  $("feedbackModalTitle").textContent = `Feedback for ${ticketId}`;
  const complaint = complaints.find(c => c.id === ticketId);

  const rating = (complaint && complaint.feedbackRating) ? complaint.feedbackRating : 5;
  $("feedbackRatingInput").value = rating;

  const descriptions = {
    1: "1 Star — Poor Service / Incomplete",
    2: "2 Stars — Fair / Below Standard",
    3: "3 Stars — Satisfactory / Acceptable",
    4: "4 Stars — Good / Prompt Repair",
    5: "5 Stars — Excellent Resolution"
  };
  const descEl = $("ratingDescription");
  if (descEl) descEl.textContent = descriptions[rating] || `${rating} Stars`;

  const starBtns = document.querySelectorAll("#feedbackStarsSelector .star-btn");
  starBtns.forEach(b => {
    const bRating = parseInt(b.dataset.rating, 10);
    b.classList.toggle("active", bRating <= rating);
  });

  $("feedbackTextInput").value = complaint ? complaint.feedback || "" : "";
  $("feedbackModal").classList.remove("hidden");
}

function initStarRatingSelector() {
  const container = $("feedbackStarsSelector");
  if (!container) return;
  const starBtns = container.querySelectorAll(".star-btn");
  const input = $("feedbackRatingInput");
  const desc = $("ratingDescription");

  const descriptions = {
    1: "1 Star — Poor Service / Incomplete",
    2: "2 Stars — Fair / Below Standard",
    3: "3 Stars — Satisfactory / Acceptable",
    4: "4 Stars — Good / Prompt Repair",
    5: "5 Stars — Excellent Resolution"
  };

  starBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const rating = parseInt(btn.dataset.rating, 10);
      input.value = rating;
      if (desc) desc.textContent = descriptions[rating] || `${rating} Stars`;
      starBtns.forEach(b => {
        const bRating = parseInt(b.dataset.rating, 10);
        b.classList.toggle("active", bRating <= rating);
      });
      playSound();
    });
  });
}

$("feedbackForm").addEventListener("submit", async e => {
  e.preventDefault();
  const feedback = $("feedbackTextInput").value.trim();
  const rating = parseInt($("feedbackRatingInput").value, 10) || 5;
  if (!feedback || !activeTicketForFeedbackModal) return;

  const submitBtn = $("submitFeedbackBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;
  }

  try {
    const res = await authFetch(`/api/student/complaints/${activeTicketForFeedbackModal}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback, rating })
    });
    if (res.ok) {
      toast("Feedback Recorded", "Thank you for rating campus maintenance service!", "fa-circle-check");
      $("feedbackModal").classList.add("hidden");
      await loadStudentData();
      await updateNotificationBadges();
      playSound("success");
    } else {
      const errData = await res.json();
      throw new Error(errData.error || "Could not submit feedback.");
    }
  } catch (err) {
    toast("Error", err.message, "fa-circle-exclamation");
    playSound("warning");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `Submit Feedback`;
    }
  }
});

// -----------------------------------------------------------------------------
// 4B. MAINTENANCE WORKER WORKFLOW (View Assigned, In Progress, Add Notes)
// -----------------------------------------------------------------------------
async function loadWorkerData() {
  try {
    const res = await authFetch("/api/worker/dashboard");
    if (res.ok) {
      const data = await res.json();
      const workerJobs = data.complaints || [];
      complaints = workerJobs;

      $("workerTotalAssigned").textContent = workerJobs.filter(c => c.status === "Assigned").length;
      $("workerOngoingCount").textContent = workerJobs.filter(c => c.status === "In Progress" || c.status === "Ongoing").length;
      $("workerCompletedCount").textContent = workerJobs.filter(c => c.status === "Resolved").length;
      $("workerUrgentCount").textContent = workerJobs.filter(c => c.priority === "High" && c.status !== "Resolved").length;

      renderWorkerDashboardTable(workerJobs.filter(c => c.status !== "Resolved").slice(0, 5));
      renderWorkerTable(workerJobs);
      renderWorkerOngoingTable(workerJobs.filter(c => c.status === "In Progress" || c.status === "Ongoing"));
      renderWorkerCompletedTable(workerJobs.filter(c => c.status === "Resolved"));
    }
  } catch (err) {
    console.warn("Failed to load worker data:", err);
  }
}

function renderWorkerDashboardTable(list) {
  const tbody = $("workerDashboardTable");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">No urgent jobs currently assigned to your queue. Excellent!</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    const isAssigned = c.status === "Assigned";
    const isInProgress = c.status === "In Progress" || c.status === "Ongoing";

    let actionBtn = "";
    if (isAssigned) {
      actionBtn = `<button class="btn btn-primary worker-start-btn" data-id="${c.id}" style="padding:4px 9px;font-size:9.5px"><i class="fa-solid fa-play"></i> Start Work</button>`;
    } else if (isInProgress) {
      actionBtn = `<button class="btn btn-primary worker-resolve-btn" data-id="${c.id}" style="padding:4px 9px;font-size:9.5px"><i class="fa-solid fa-clipboard-check"></i> Resolve</button>`;
    } else {
      actionBtn = `<button class="btn btn-soft worker-edit-btn" data-id="${c.id}" style="padding:4px 9px;font-size:9.5px">Details</button>`;
    }

    return `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${c.title}</td>
        <td>${c.location}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        <td>
          <div style="display:flex;gap:5px;align-items:center">
            ${actionBtn}
            <button class="btn btn-soft worker-edit-btn" data-id="${c.id}" title="Update details/notes" style="padding:4px 8px;font-size:9px"><i class="fa-solid fa-pen"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  attachWorkerTableEvents(tbody);
}

function renderWorkerTable(list) {
  const q = ($("workerSearch").value || "").toLowerCase();
  const filter = $("workerStatusFilter").value;

  const filtered = list.filter(c => {
    const matchesQ = !q || [c.id, c.title, c.location, c.category].some(v => v && v.toLowerCase().includes(q));
    const matchesFilter = filter === "all" || c.status === filter;
    return matchesQ && matchesFilter;
  });

  const tbody = $("workerTableBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">No matching assigned maintenance tickets.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const isAssigned = c.status === "Assigned";
    const isInProgress = c.status === "In Progress" || c.status === "Ongoing";

    let actionBtn = "";
    if (isAssigned) {
      actionBtn = `<button class="btn btn-primary worker-start-btn" data-id="${c.id}" style="padding:5px 10px;font-size:9.5px"><i class="fa-solid fa-play"></i> Start Work</button>`;
    } else if (isInProgress) {
      actionBtn = `<button class="btn btn-primary worker-resolve-btn" data-id="${c.id}" style="padding:5px 10px;font-size:9.5px"><i class="fa-solid fa-clipboard-check"></i> Mark Resolved</button>`;
    }

    return `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${c.title}<small style="display:block;color:#94a3b8;font-size:9px">${c.location}</small></td>
        <td>${c.category}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${c.createdBy || "Student"}</td>
        <td>${statusBadge(c.status)}</td>
        <td style="max-width:200px;font-size:9.5px;color:#475569">${c.resolutionNotes || c.workNotes || '<span style="color:#94a3b8">No notes logged</span>'}</td>
        <td>
          <div style="display:flex;gap:5px;align-items:center">
            ${actionBtn}
            <button class="btn btn-soft worker-edit-btn" data-id="${c.id}" style="padding:5px 9px;font-size:9.5px">
              <i class="fa-solid fa-pen-to-square"></i> Notes
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  attachWorkerTableEvents(tbody);
}

function renderWorkerOngoingTable(list) {
  const tbody = $("workerOngoingTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">No active in-progress jobs. Check your assigned queue.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.title}<small style="display:block;color:#94a3b8;font-size:9px">${c.location}</small></td>
      <td>${c.category}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td style="font-size:9.5px">${c.workNotes || c.resolutionNotes || "-"}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary worker-resolve-btn" data-id="${c.id}" style="padding:5px 10px;font-size:9.5px">
            <i class="fa-solid fa-clipboard-check"></i> Mark Resolved
          </button>
          <button class="btn btn-soft worker-edit-btn" data-id="${c.id}" style="padding:5px 8px;font-size:9.5px">
            Notes
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  attachWorkerTableEvents(tbody);
}

function renderWorkerCompletedTable(list) {
  const tbody = $("workerCompletedTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">No completed jobs yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => {
    let feedbackDisplay = '<span style="color:#94a3b8">Awaiting student rating</span>';
    if (c.feedbackRating) {
      feedbackDisplay = `<div>${renderStars(c.feedbackRating)}<div style="color:#166534;font-size:9px">"${c.feedback || 'Completed'}"</div></div>`;
    } else if (c.feedback) {
      feedbackDisplay = `<span style="color:#166534">"${c.feedback}"</span>`;
    }

    return `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${c.title}<small style="display:block;color:#94a3b8;font-size:9px">${c.location}</small></td>
        <td>${c.category}</td>
        <td>${c.resolvedAt ? new Date(c.resolvedAt).toLocaleDateString() : (c.created || "Recently")}</td>
        <td style="font-size:9.5px;max-width:200px">${c.resolutionNotes || c.workNotes || "-"}</td>
        <td style="font-size:9.5px">${feedbackDisplay}</td>
      </tr>
    `;
  }).join("");
}

function attachWorkerTableEvents(container) {
  container.querySelectorAll(".worker-start-btn").forEach(b => {
    b.addEventListener("click", async () => {
      await handleWorkerStartWork(b.dataset.id);
    });
  });

  container.querySelectorAll(".worker-resolve-btn").forEach(b => {
    b.addEventListener("click", () => {
      openWorkerModal(b.dataset.id, "Resolved");
    });
  });

  container.querySelectorAll(".worker-edit-btn").forEach(b => {
    b.addEventListener("click", () => {
      openWorkerModal(b.dataset.id);
    });
  });
}

async function handleWorkerStartWork(ticketId) {
  try {
    const res = await authFetch(`/api/worker/complaints/${ticketId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (res.ok) {
      toast("Work Started", `Ticket ${ticketId} is now marked as In Progress.`, "fa-circle-check");
      await loadWorkerData();
      await updateNotificationBadges();
      playSound("success");
    } else {
      const data = await res.json();
      throw new Error(data.error || "Failed to start work.");
    }
  } catch (err) {
    toast("Action Error", err.message, "fa-circle-exclamation");
    playSound("warning");
  }
}

// Worker Update Modal
function openWorkerModal(ticketId, preselectedStatus = null) {
  activeTicketForWorkerModal = ticketId;
  const complaint = complaints.find(c => c.id === ticketId);
  $("workerModalTicketId").textContent = ticketId;

  const statusSelect = $("workerModalStatus");
  if (preselectedStatus) {
    statusSelect.value = preselectedStatus;
  } else if (complaint) {
    statusSelect.value = (complaint.status === "Assigned") ? "In Progress" : (complaint.status || "In Progress");
  }

  const notesEl = $("workerModalNotes");
  notesEl.value = complaint ? (complaint.resolutionNotes || complaint.workNotes || "") : "";

  if (preselectedStatus === "Resolved") {
    setTimeout(() => notesEl.focus(), 150);
  }

  $("workerUpdateModal").classList.remove("hidden");
}

$("workerUpdateForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!activeTicketForWorkerModal) return;

  const status = $("workerModalStatus").value;
  const workNotes = $("workerModalNotes").value.trim();

  if (status === "Resolved" && !workNotes) {
    toast("Notes Required", "Please provide resolution notes describing the repair work completed.", "fa-circle-exclamation");
    $("workerModalNotes").focus();
    playSound("warning");
    return;
  }

  const saveBtn = $("workerSaveUpdatesBtn") || e.target.querySelector("button[type='submit']");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
  }

  try {
    const res = await authFetch(`/api/worker/complaints/${activeTicketForWorkerModal}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        status, 
        workNotes, 
        resolutionNotes: status === "Resolved" ? workNotes : undefined 
      })
    });

    if (res.ok) {
      toast("Job Updated", `Ticket ${activeTicketForWorkerModal} is now marked as ${status}.`, "fa-circle-check");
      $("workerUpdateModal").classList.add("hidden");
      await loadWorkerData();
      await updateNotificationBadges();
      playSound("success");
    } else {
      const data = await res.json();
      throw new Error(data.error || "Failed to update ticket.");
    }
  } catch (err) {
    toast("Update Error", err.message, "fa-circle-exclamation");
    playSound("warning");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `Save & Update Ticket`;
    }
  }
});

// -----------------------------------------------------------------------------
// 4C. ADMINISTRATOR WORKFLOW (Executive Dashboard, Assign, Workers, Users)
// -----------------------------------------------------------------------------
async function loadAdminData() {
  try {
    const res = await authFetch("/api/admin/dashboard");
    if (res.ok) {
      const data = await res.json();
      complaints = data.complaints || [];
      workers = data.workers || [];

      $("adminTotalComplaints").textContent = data.stats.totalComplaints;
      $("adminPendingComplaints").textContent = data.stats.pendingComplaints;
      $("adminOngoingComplaints").textContent = data.stats.ongoingComplaints;
      $("adminResolvedComplaints").textContent = data.stats.resolvedComplaints;

      // Update Donut Chart
      const total = data.stats.totalComplaints;
      const resCount = data.stats.resolvedComplaints;
      const ongCount = data.stats.ongoingComplaints;
      const penCount = data.stats.pendingComplaints;

      $("donutTotal").textContent = total;
      $("legendPending").textContent = penCount;
      $("legendOngoing").textContent = ongCount;
      $("legendResolved").textContent = resCount;

      const pRes = total ? (resCount / total) * 100 : 0;
      const pOng = total ? ((resCount + ongCount) / total) * 100 : 0;
      $("donutChart").style.background = `conic-gradient(var(--green) 0 ${pRes}%, var(--blue) ${pRes}% ${pOng}%, var(--orange) ${pOng}% 100%)`;

      renderAdminPendingTable(complaints.filter(c => c.status === "Pending"));
      renderAdminAllComplaintsTable(complaints);
      renderAdminAssignTable(complaints.filter(c => c.status === "Pending" || !c.assignedWorkerId));
      renderAdminWorkersGrid(workers);
      renderReportsTable(complaints);
    }

    // Also load users list
    await loadAdminUsersList();
  } catch (err) {
    console.warn("Failed to load admin data:", err);
  }
}

function renderAdminPendingTable(list) {
  const tbody = $("adminPendingTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#16a34a"><i class="fa-solid fa-circle-check"></i> All reported complaints are currently assigned!</td></tr>`;
    return;
  }

  tbody.innerHTML = list.slice(0, 5).map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.title}</td>
      <td>${c.location}</td>
      <td>${c.category}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>
        <button class="btn btn-primary" data-section="adminAssign" style="padding:4px 9px;font-size:9.5px">
          Assign Worker
        </button>
      </td>
    </tr>
  `).join("");
}

function renderAdminAllComplaintsTable(list) {
  const q = ($("adminSearch").value || "").toLowerCase();
  const statusFilter = $("adminStatusFilter").value;
  const categoryFilter = $("adminCategoryFilter").value;

  const filtered = list.filter(c => {
    const matchesQ = !q || [c.id, c.title, c.location, c.category, c.assignedTo, c.createdBy].some(v => v && v.toLowerCase().includes(q));
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesCat = categoryFilter === "all" || c.category === categoryFilter;
    return matchesQ && matchesStatus && matchesCat;
  });

  const tbody = $("adminComplaintsTableBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:28px;color:#94a3b8">No complaints found matching filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.title}<small style="display:block;color:#94a3b8;font-size:9px">${c.location}</small></td>
      <td>${c.category}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td><strong>${c.assignedTo || "-"}</strong></td>
      <td>${statusBadge(c.status)}</td>
      <td>${c.createdBy || "Student"}</td>
      <td>
        <button class="btn btn-soft reassign-btn" data-id="${c.id}" style="padding:4px 8px;font-size:9px">
          Reassign
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".reassign-btn").forEach(b => {
    b.addEventListener("click", () => {
      showSection("adminAssign");
    });
  });
}

function renderAdminAssignTable(list) {
  const tbody = $("adminAssignTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#16a34a"><i class="fa-solid fa-circle-check"></i> Great job! No complaints require worker dispatch at this time.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const workerOptions = workers.map(w => {
      const matchTrade = w.department && w.department.toLowerCase() === c.category.toLowerCase();
      return `<option value="${w.id}" data-name="${w.name}">${w.name} (${w.department})${matchTrade ? ' ★ Recommended' : ''}</option>`;
    }).join("");

    return `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${c.title}</td>
        <td>${c.location}</td>
        <td><span class="chip chip-student">${c.category}</span></td>
        <td>${priorityBadge(c.priority)}</td>
        <td>
          <select class="worker-select-picker" id="assignWorkerSelect_${c.id}" style="border:1px solid #cbd5e1;padding:6px 9px;border-radius:8px;font-size:10px;background:#fff;width:220px">
            <option value="">-- Choose Technician --</option>
            ${workerOptions}
          </select>
        </td>
        <td>
          <button class="btn btn-primary assign-dispatch-btn" data-id="${c.id}" style="padding:6px 12px;font-size:10px">
            <i class="fa-solid fa-paper-plane"></i> Dispatch
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".assign-dispatch-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ticketId = btn.dataset.id;
      const select = $(`assignWorkerSelect_${ticketId}`);
      const workerId = select.value;
      const selectedOption = select.options[select.selectedIndex];
      const workerName = selectedOption ? selectedOption.dataset.name : null;

      if (!workerId || !workerName) {
        toast("Technician Required", "Please select a maintenance technician from the dropdown.", "fa-circle-exclamation");
        return;
      }

      btn.disabled = true;
      try {
        const res = await authFetch(`/api/admin/complaints/${ticketId}/assign`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId, workerName, status: "Assigned" })
        });

        if (res.ok) {
          toast("Complaint Dispatched", `${ticketId} assigned to technician ${workerName}. Status updated to Assigned.`, "fa-circle-check");
          await loadAdminData();
          await updateNotificationBadges();
          playSound("success");
        } else {
          const errData = await res.json();
          throw new Error(errData.error || "Assignment failed.");
        }
      } catch (err) {
        toast("Assignment Error", err.message, "fa-circle-exclamation");
        btn.disabled = false;
        playSound("warning");
      }
    });
  });
}

function renderAdminWorkersGrid(list) {
  const container = $("adminWorkersGrid");
  if (!list.length) {
    container.innerHTML = `<div style="padding:30px;color:#64748b">No maintenance workers registered yet. Click "Add Maintenance Worker" to create one.</div>`;
    return;
  }

  container.innerHTML = list.map(w => {
    const assignedTickets = complaints.filter(c => c.assignedWorkerId === w.id || (c.assignedTo && c.assignedTo.toLowerCase() === w.name.toLowerCase()));
    const ongoingTickets = assignedTickets.filter(c => c.status === "Ongoing").length;
    const completedTickets = assignedTickets.filter(c => c.status === "Resolved").length;

    return `
      <div class="worker-card">
        <div class="worker-card-header">
          <div class="avatar worker">${w.name.charAt(0).toUpperCase()}</div>
          <div>
            <h3>${w.name}</h3>
            <span><i class="fa-solid fa-wrench"></i> ${w.department || 'Maintenance'}</span>
          </div>
        </div>
        <div style="font-size:10px;color:#475569;margin-bottom:8px">
          <i class="fa-regular fa-envelope"></i> ${w.email}
        </div>
        <div class="worker-metrics-row">
          <div>
            <strong>${ongoingTickets}</strong>
            <small>Active Tasks</small>
          </div>
          <div>
            <strong style="color:var(--green)">${completedTickets}</strong>
            <small>Completed</small>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// Admin Add Worker Modal
$("openAddWorkerModalBtn").addEventListener("click", () => {
  $("addWorkerModal").classList.remove("hidden");
});

$("addWorkerForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("workerNameInput").value.trim();
  const email = $("workerEmailInput").value.trim();
  const department = $("workerDeptInput").value;
  const password = $("workerPasswordInput").value;

  try {
    const res = await authFetch("/api/admin/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, department, password })
    });

    const data = await res.json();
    if (res.ok) {
      toast("Worker Created", `Account for ${name} (${department}) created successfully!`, "fa-circle-check");
      $("addWorkerModal").classList.add("hidden");
      e.target.reset();
      await loadAdminData();
      playSound("success");
    } else {
      throw new Error(data.error || "Failed to create worker.");
    }
  } catch (err) {
    toast("Creation Error", err.message, "fa-circle-exclamation");
    playSound("warning");
  }
});

// Admin Campus Users List
async function loadAdminUsersList() {
  try {
    const res = await authFetch("/api/admin/users");
    if (res.ok) {
      allUsers = await res.json();
      renderAdminUsersTable(allUsers);
    }
  } catch (err) {
    console.warn("Failed to load campus users:", err);
  }
}

function renderAdminUsersTable(list) {
  const q = ($("adminUsersSearch").value || "").toLowerCase();
  const roleFilter = $("adminUsersRoleFilter").value;

  const filtered = list.filter(u => {
    const matchesQ = !q || [u.name, u.email, u.student_id, u.studentId, u.department].some(v => v && v.toLowerCase().includes(q));
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesQ && matchesRole;
  });

  const tbody = $("adminUsersTableBody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#94a3b8">No matching campus users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const roleBadge = u.role === "admin"
      ? `<span class="chip chip-admin"><i class="fa-solid fa-user-shield"></i> Administrator</span>`
      : u.role === "worker"
      ? `<span class="chip chip-worker"><i class="fa-solid fa-screwdriver-wrench"></i> Maintenance Worker</span>`
      : `<span class="chip chip-student"><i class="fa-solid fa-graduation-cap"></i> Student</span>`;

    return `
      <tr>
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td>${roleBadge}</td>
        <td>${u.student_id || u.studentId || u.department || "-"}</td>
        <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}</td>
      </tr>
    `;
  }).join("");
}

function renderReportsTable(list) {
  $("reportPending").textContent = list.filter(c => c.status === "Pending").length;
  $("reportOngoing").textContent = list.filter(c => c.status === "Ongoing").length;
  $("reportResolved").textContent = list.filter(c => c.status === "Resolved").length;

  $("reportTable").innerHTML = list.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.title}</td>
      <td>${c.category}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${c.assignedTo || "-"}</td>
      <td>${statusBadge(c.status)}</td>
    </tr>
  `).join("");
}

// -----------------------------------------------------------------------------
// AI-POWERED EXECUTIVE MAINTENANCE REPORT GENERATOR (Gemini AI)
// -----------------------------------------------------------------------------
async function generateAiReport() {
  const generateBtn = $("generateAiReportBtn");
  const loadingEl = $("aiReportLoading");
  const emptyEl = $("aiReportEmpty");
  const errorEl = $("aiReportError");
  const errorMsg = $("aiReportErrorMessage");
  const resultEl = $("aiReportResult");

  const categoryFilter = $("aiReportCategoryFilter") ? $("aiReportCategoryFilter").value : "All";
  const reportType = $("aiReportTypeSelect") ? $("aiReportTypeSelect").value : "executive";
  const customPrompt = $("aiReportCustomPrompt") ? $("aiReportCustomPrompt").value.trim() : "";

  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Analyzing...`;
  }
  if (loadingEl) loadingEl.classList.remove("hidden");
  if (emptyEl) emptyEl.classList.add("hidden");
  if (errorEl) errorEl.classList.add("hidden");
  if (resultEl) resultEl.classList.add("hidden");

  try {
    const res = await authFetch("/api/reports/ai-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryFilter, reportType, customPrompt })
    });

    if (res.ok) {
      const data = await res.json();
      renderAiReport(data);
      if (resultEl) resultEl.classList.remove("hidden");
      toast("AI Report Ready", "Campus facilities maintenance briefing generated successfully.", "fa-wand-magic-sparkles");
      playSound("success");
    } else {
      const errData = await res.json();
      throw new Error(errData.error || "Failed to generate AI report.");
    }
  } catch (err) {
    if (errorEl) {
      errorEl.classList.remove("hidden");
      if (errorMsg) errorMsg.textContent = err.message || "Failed to generate AI report.";
    }
    playSound("warning");
  } finally {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (generateBtn) {
      generateBtn.disabled = false;
      generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate AI Report`;
    }
  }
}

function renderAiReport(data) {
  const container = $("aiReportResult");
  if (!container) return;

  const healthColor = (data.operationalHealthIndex || "").toLowerCase().includes("optimal") || (data.operationalHealthIndex || "").toLowerCase().includes("good")
    ? { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", icon: "fa-shield-check" }
    : (data.operationalHealthIndex || "").toLowerCase().includes("attention") || (data.operationalHealthIndex || "").toLowerCase().includes("critical")
    ? { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", icon: "fa-triangle-exclamation" }
    : { bg: "#fffbeb", border: "#fde68a", text: "#b45309", icon: "fa-circle-exclamation" };

  const findingsHtml = (data.keyFindings || []).map((f, i) => `
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
      <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;color:var(--blue);display:grid;place-items:center;font-size:11px;font-weight:800;flex-shrink:0">
        ${i + 1}
      </div>
      <div style="font-size:11.5px;color:#334155;line-height:1.5">
        ${f}
      </div>
    </div>
  `).join("");

  const bottlenecksHtml = (data.criticalBottlenecks || []).map(b => `
    <li style="display:flex;align-items:flex-start;gap:8px;font-size:11px;color:#475569;margin-bottom:6px">
      <i class="fa-solid fa-triangle-exclamation" style="color:var(--orange);margin-top:2px;font-size:11px;flex-shrink:0"></i>
      <span>${b}</span>
    </li>
  `).join("");

  const recommendationsHtml = (data.actionableRecommendations || []).map((r, i) => `
    <div style="display:flex;align-items:flex-start;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px">
      <span style="font-size:10px;font-weight:800;color:var(--blue);background:#eff6ff;border:1px solid #bfdbfe;border-radius:50%;width:20px;height:20px;display:grid;place-items:center;flex-shrink:0">
        ${i + 1}
      </span>
      <span style="font-size:11px;color:#1e293b;line-height:1.4">${r}</span>
    </div>
  `).join("");

  const timestamp = data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Just now";

  container.innerHTML = `
    <!-- Top Bar with Health Badge and Copy Action -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding-bottom:12px;border-bottom:1px solid #e2e8f0">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:10.5px;font-weight:700;padding:6px 12px;border-radius:20px;background:${healthColor.bg};border:1px solid ${healthColor.border};color:${healthColor.text};display:inline-flex;align-items:center;gap:6px">
          <i class="fa-solid ${healthColor.icon}"></i> Operational Health: <strong>${data.operationalHealthIndex || 'Normal'}</strong>
        </span>
        <span class="chip chip-student" style="font-size:9.5px">
          <i class="fa-solid fa-filter"></i> ${data.categoryFilter || 'All Categories'}
        </span>
        <span style="font-size:10px;color:#64748b">
          Generated at ${timestamp} • ${data.model || 'Gemini AI'}
        </span>
      </div>
      <button id="copyAiReportBtn" class="btn btn-soft" style="padding:6px 12px;font-size:10px">
        <i class="fa-regular fa-copy"></i> Copy Briefing
      </button>
    </div>

    <!-- Executive Briefing Narrative -->
    <div style="background:#f8fafc;border-left:4px solid var(--blue);border-radius:0 12px 12px 0;padding:14px 18px">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:1px;color:var(--blue);margin-bottom:4px;text-transform:uppercase">
        Executive Synthesis
      </div>
      <p style="font-size:12px;color:#1e293b;line-height:1.6;margin:0">
        ${data.executiveSummary}
      </p>
    </div>

    <!-- Key Findings Grid -->
    <div>
      <h4 style="font-size:11.5px;font-weight:800;color:#1e293b;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-chart-simple" style="color:var(--blue)"></i> Key Diagnostic Findings
      </h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:10px">
        ${findingsHtml}
      </div>
    </div>

    <!-- Two Column Analysis: Bottlenecks & Technician Performance -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px">
      <div style="background:#ffffff;border:1px solid #fed7aa;border-radius:12px;padding:14px">
        <h4 style="font-size:11px;font-weight:800;color:#9a3412;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i class="fa-solid fa-triangle-exclamation"></i> Bottlenecks & Turnaround Risks
        </h4>
        <ul style="list-style:none;padding:0;margin:0">
          ${bottlenecksHtml}
        </ul>
      </div>

      <div style="background:#ffffff;border:1px solid #bfdbfe;border-radius:12px;padding:14px">
        <h4 style="font-size:11px;font-weight:800;color:#1e40af;margin-bottom:8px;display:flex;align-items:center;gap:6px">
          <i class="fa-solid fa-user-gear"></i> Technician Efficiency & Feedback
        </h4>
        <p style="font-size:11px;color:#334155;line-height:1.5;margin:0 0 8px 0">
          ${data.technicianPerformance || 'Standard technician turnaround recorded across active assignments.'}
        </p>
        <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#64748b">
          <span>Avg Rating: <strong>${data.metrics?.averageSatisfactionRating || 'N/A'}</strong> / 5.0</span>
          <span>•</span>
          <span>Resolved: <strong>${data.metrics?.resolvedCount || 0}</strong> tickets</span>
        </div>
      </div>
    </div>

    <!-- Actionable Recommendations -->
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:16px">
      <h4 style="font-size:11.5px;font-weight:800;color:#1e293b;margin-bottom:10px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-clipboard-check" style="color:var(--green)"></i> Proactive Maintenance Action Plan
      </h4>
      <div style="display:grid;gap:8px">
        ${recommendationsHtml}
      </div>
    </div>
  `;

  // Bind copy button
  const copyBtn = $("copyAiReportBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const textToCopy = `CampusFix AI Maintenance Report (${data.categoryFilter || 'All'}):
Health Index: ${data.operationalHealthIndex || 'Normal'}

Executive Summary:
${data.executiveSummary}

Key Findings:
${(data.keyFindings || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

Action Plan:
${(data.actionableRecommendations || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}
      `.trim();

      navigator.clipboard.writeText(textToCopy).then(() => {
        toast("Report Copied", "AI executive briefing copied to clipboard.", "fa-circle-check");
        playSound("success");
      }).catch(() => {
        toast("Copy Notice", "Could not write to clipboard automatically.", "fa-circle-info");
      });
    });
  }
}

// Bind AI Report Buttons
if ($("generateAiReportBtn")) {
  $("generateAiReportBtn").addEventListener("click", generateAiReport);
}
if ($("aiReportRetryBtn")) {
  $("aiReportRetryBtn").addEventListener("click", generateAiReport);
}
if ($("aiReportCustomPrompt")) {
  $("aiReportCustomPrompt").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      generateAiReport();
    }
  });
}

// Badges
function statusBadge(status) {
  const s = (status || "Pending").toLowerCase().replace(/\s+/g, '-');
  return `<span class="status ${s}">${status || "Pending"}</span>`;
}

function priorityBadge(priority) {
  const p = (priority || "Medium").toLowerCase();
  return `<span class="priority ${p}">${priority || "Medium"}</span>`;
}

function renderStars(rating) {
  const count = Math.max(1, Math.min(5, Number(rating) || 5));
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    stars += `<i class="fa-solid fa-star" style="color:${i <= count ? '#eab308' : '#cbd5e1'};margin-right:2px"></i>`;
  }
  return `<span class="inline-stars" title="${count} of 5 stars">${stars}</span>`;
}

// Category Picker in Submit Form
function selectCategory(category) {
  document.querySelectorAll(".category-option").forEach(b => {
    b.classList.toggle("selected", b.dataset.category === category);
  });
  $("complaintCategory").value = category;
}

document.querySelectorAll(".category-option").forEach(btn => {
  btn.addEventListener("click", () => {
    selectCategory(btn.dataset.category);
    playSound();
  });
});

document.querySelectorAll(".urgency-option").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".urgency-option").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    $("complaintUrgency").value = btn.dataset.urgency;
    playSound();
  });
});

// Category quick-links
document.querySelectorAll("[data-category-link]").forEach(btn => {
  btn.addEventListener("click", () => {
    if (currentUser && currentUser.role === "student") {
      showSection("submitComplaint");
      selectCategory(btn.dataset.categoryLink);
    } else {
      toast("Notice", "Only students can submit complaint tickets.", "fa-circle-info");
    }
  });
});

// Modal close buttons
document.querySelectorAll(".close-modal-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hidden"));
  });
});

// Sidebar Mobile Drawer Toggle & Backdrop
function openMobileSidebar() {
  const sb = $("sidebar");
  const bd = $("sidebarBackdrop");
  if (sb) sb.classList.add("open");
  if (bd) bd.classList.remove("hidden");
  document.body.classList.add("sidebar-open-lock");
}

function closeMobileSidebar() {
  const sb = $("sidebar");
  const bd = $("sidebarBackdrop");
  if (sb) sb.classList.remove("open");
  if (bd) bd.classList.add("hidden");
  document.body.classList.remove("sidebar-open-lock");
}

// Navigation Click Handlers
document.querySelectorAll(".nav-item, [data-section]").forEach(el => {
  el.addEventListener("click", e => {
    const sec = el.dataset.section;
    if (sec) {
      showSection(sec);
      // Auto close sidebar on mobile if clicked
      if (window.innerWidth <= 850) {
        closeMobileSidebar();
      }
    }
  });
});

// Sidebar Mobile Toggle
if ($("mobileMenu")) $("mobileMenu").addEventListener("click", openMobileSidebar);
if ($("closeSidebar")) $("closeSidebar").addEventListener("click", closeMobileSidebar);
if ($("sidebarBackdrop")) $("sidebarBackdrop").addEventListener("click", closeMobileSidebar);

// Sound Toggle
$("soundToggle").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  $("soundToggle").innerHTML = `<i class="fa-solid ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}"></i>`;
  toast(soundEnabled ? "Audio Enabled" : "Audio Muted", soundEnabled ? "Interface sounds turned on." : "Interface sounds muted.");
});

// File Upload
$("browseBtn").addEventListener("click", () => $("evidenceInput").click());
$("evidenceInput").addEventListener("change", e => handleFile(e.target.files[0]));
["dragenter", "dragover"].forEach(ev => $("dropZone").addEventListener(ev, e => { e.preventDefault(); $("dropZone").classList.add("dragover"); }));
["dragleave", "drop"].forEach(ev => $("dropZone").addEventListener(ev, e => { e.preventDefault(); $("dropZone").classList.remove("dragover"); }));
$("dropZone").addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));

function handleFile(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    toast("Unsupported File", "Please choose a JPG or PNG image.", "fa-file-circle-exclamation");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    toast("File Too Large", "Please choose an image under 5 MB.", "fa-file-circle-exclamation");
    return;
  }
  selectedFile = file;
  $("filePreview").classList.remove("hidden");
  $("filePreview").innerHTML = `<i class="fa-solid fa-image"></i> ${file.name} — ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  playSound();
}

// Search Inputs Binding
["studentTrackSearch", "studentTrackStatus"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener(id.includes("Search") ? "input" : "change", () => renderStudentTrackCards(complaints));
});

["workerSearch", "workerStatusFilter"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener(id.includes("Search") ? "input" : "change", () => renderWorkerTable(complaints));
});

["adminSearch", "adminStatusFilter", "adminCategoryFilter"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener(id.includes("Search") ? "input" : "change", () => renderAdminAllComplaintsTable(complaints));
});

["adminUsersSearch", "adminUsersRoleFilter"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener(id.includes("Search") ? "input" : "change", () => renderAdminUsersTable(allUsers));
});

// Topbar Global Search
$("globalSearch").addEventListener("input", e => {
  const q = e.target.value;
  if (!q || !currentUser) return;
  if (currentUser.role === "student") {
    showSection("studentComplaints");
    $("studentTrackSearch").value = q;
    renderStudentTrackCards(complaints);
  } else if (currentUser.role === "worker") {
    showSection("workerAssigned");
    $("workerSearch").value = q;
    renderWorkerTable(complaints);
  } else if (currentUser.role === "admin") {
    showSection("adminComplaints");
    $("adminSearch").value = q;
    renderAdminAllComplaintsTable(complaints);
  }
});

// =============================================================================
// 5. NOTIFICATIONS SYSTEM
// =============================================================================
let notificationsList = [];

async function updateNotificationBadges() {
  if (!currentUser || !sessionToken) return;
  try {
    const res = await authFetch("/api/notifications/unread-count");
    if (res.ok) {
      const data = await res.json();
      const count = data.unreadCount || 0;
      
      const navBadge = $("navNotifBadge");
      const topbarBadge = $("topbarNotifBadge");
      
      if (navBadge) {
        navBadge.textContent = count;
        navBadge.style.display = count > 0 ? "inline-flex" : "none";
      }
      if (topbarBadge) {
        topbarBadge.textContent = count;
        topbarBadge.style.display = count > 0 ? "inline-flex" : "none";
      }
    }
  } catch (err) {
    // Polling silent fail
  }
}

async function loadNotifications() {
  const container = $("notifList");
  if (!container) return;

  container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8"><i class="fa-solid fa-spinner fa-spin"></i> Loading notifications...</div>`;

  try {
    const res = await authFetch("/api/notifications");
    if (res.ok) {
      notificationsList = await res.json();
      renderNotifications(notificationsList);
      await updateNotificationBadges();
    } else {
      container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8">Failed to load notifications.</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:#94a3b8">Error loading notifications.</div>`;
  }
}

function renderNotifications(list) {
  const container = $("notifList");
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:#94a3b8">
        <i class="fa-regular fa-bell-slash" style="font-size:32px;margin-bottom:12px;opacity:0.6;display:block"></i>
        <strong style="font-size:13px;color:#475569;display:block;margin-bottom:4px">No Notifications Yet</strong>
        <span>You are completely up to date with campus maintenance activities.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(n => {
    const isUnread = !n.read;
    const timeStr = n.createdAt ? new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recently';
    
    let icon = "fa-bell";
    let iconBg = "#eff6ff";
    let iconColor = "var(--blue)";
    
    if (n.type === "complaint_assigned") {
      icon = "fa-user-gear";
      iconBg = "#f0fdf4";
      iconColor = "var(--green)";
    } else if (n.type === "work_started") {
      icon = "fa-person-digging";
      iconBg = "#eff6ff";
      iconColor = "var(--blue)";
    } else if (n.type === "complaint_resolved") {
      icon = "fa-circle-check";
      iconBg = "#ecfdf5";
      iconColor = "#059669";
    } else if (n.type === "feedback_received") {
      icon = "fa-star";
      iconBg = "#fefce8";
      iconColor = "#ca8a04";
    }

    return `
      <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${n.id}">
        <div style="width:36px;height:36px;border-radius:10px;background:${iconBg};color:${iconColor};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">
          <i class="fa-solid ${icon}"></i>
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
            <strong style="font-size:12px;color:#1e293b">${n.title || 'System Notification'}</strong>
            <small style="font-size:10px;color:#94a3b8">${timeStr}</small>
          </div>
          <p style="font-size:11px;color:#475569;margin:0 0 6px 0;line-height:1.4">${n.message}</p>
          <div style="display:flex;gap:8px;align-items:center">
            ${n.complaintId ? `
              <button class="btn btn-soft notif-view-ticket-btn" data-ticket-id="${n.complaintId}" style="padding:3px 8px;font-size:9px">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> View Ticket ${n.complaintId}
              </button>
            ` : ''}
            ${isUnread ? `
              <button class="notif-mark-single-read-btn" data-id="${n.id}" style="background:none;border:none;color:#64748b;font-size:9.5px;cursor:pointer;text-decoration:underline">
                Mark as read
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Bind single mark as read
  container.querySelectorAll(".notif-mark-single-read-btn").forEach(b => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      await markSingleNotificationRead(b.dataset.id);
    });
  });

  // Bind view ticket button
  container.querySelectorAll(".notif-view-ticket-btn").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ticketId = b.dataset.ticketId;
      navigateToTicket(ticketId);
    });
  });
}

async function markSingleNotificationRead(notifId) {
  try {
    await authFetch(`/api/notifications/${notifId}/read`, { method: "PATCH" });
    const item = document.querySelector(`.notification-item[data-id="${notifId}"]`);
    if (item) {
      item.classList.remove("unread");
      const markBtn = item.querySelector(".notif-mark-single-read-btn");
      if (markBtn) markBtn.remove();
    }
    await updateNotificationBadges();
  } catch (err) {
    console.warn("Failed to mark notification read:", err);
  }
}

async function markAllNotificationsRead() {
  const btn = $("markAllNotifsReadBtn");
  if (btn) btn.disabled = true;

  try {
    const res = await authFetch("/api/notifications/read-all", { method: "POST" });
    if (res.ok) {
      toast("Notifications Cleared", "All notifications marked as read.", "fa-circle-check");
      await loadNotifications();
      await updateNotificationBadges();
      playSound();
    }
  } catch (err) {
    toast("Error", "Could not mark notifications as read.", "fa-circle-exclamation");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function navigateToTicket(ticketId) {
  if (!currentUser) return;
  if (currentUser.role === "student") {
    showSection("studentComplaints");
    $("studentTrackSearch").value = ticketId;
    renderStudentTrackCards(complaints);
  } else if (currentUser.role === "worker") {
    showSection("workerAssigned");
    $("workerSearch").value = ticketId;
    renderWorkerTable(complaints);
  } else if (currentUser.role === "admin") {
    showSection("adminComplaints");
    $("adminSearch").value = ticketId;
    renderAdminAllComplaintsTable(complaints);
  }
}

// -----------------------------------------------------------------------------
// AI-POWERED COMPLAINT BOOKING CONCIERGE CHATBOT (Gemini AI)
// -----------------------------------------------------------------------------
let aiChatHistory = [];
let aiChatInitialized = false;
let openAiChat = null;
let closeAiChat = null;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatChatMarkdown(text) {
  if (!text) return "";
  let formatted = escapeHtml(text);
  // Bold **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Newlines to <br>
  formatted = formatted.replace(/\n/g, '<br/>');
  return formatted;
}

function initAiChat() {
  const trigger = $("aiChatWidgetTrigger");
  const panel = $("aiChatPanel");
  const closeBtn = $("aiChatCloseBtn");
  const clearBtn = $("aiChatClearBtn");
  const form = $("aiChatForm");
  const input = $("aiChatInput");
  const body = $("aiChatBody");
  const promoBtn = $("openAiChatFromSubmitBtn");
  const sidebarNavBtn = $("sidebarAiChatNavBtn");

  if (!panel || !body) return;

  function openChat() {
    panel.classList.remove("closing");
    panel.classList.remove("hidden");
    if (!aiChatInitialized) {
      resetAiChat();
      aiChatInitialized = true;
    }
    if (input) {
      setTimeout(() => input.focus(), 150);
    }
  }

  function closeChat(onDone) {
    if (panel.classList.contains("hidden") || panel.classList.contains("closing")) return;
    panel.classList.add("closing");
    setTimeout(() => {
      panel.classList.add("hidden");
      panel.classList.remove("closing");
      if (typeof onDone === "function") onDone();
    }, 220);
  }

  openAiChat = openChat;
  closeAiChat = closeChat;

  if (trigger) trigger.addEventListener("click", () => {
    if (panel.classList.contains("hidden") || panel.classList.contains("closing")) {
      openChat();
    } else {
      closeChat();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", () => closeChat());

  // Close when pressing Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.classList.contains("hidden") && !panel.classList.contains("closing")) {
      closeChat();
    }
  });

  if (promoBtn) promoBtn.addEventListener("click", () => {
    openChat();
  });

  if (sidebarNavBtn) sidebarNavBtn.addEventListener("click", () => {
    openChat();
  });

  if (clearBtn) clearBtn.addEventListener("click", () => {
    resetAiChat();
    toast("Chat Reset", "AI Assistant conversation restarted.", "fa-rotate-right");
  });

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input ? input.value.trim() : "";
      if (!text) return;
      input.value = "";
      await sendAiChatMessage(text);
    });
  }

  // Bind suggestion chips
  const chipsContainer = $("aiChatChips");
  if (chipsContainer) {
    chipsContainer.querySelectorAll(".ai-chip").forEach(chip => {
      chip.addEventListener("click", async () => {
        const prompt = chip.dataset.prompt;
        if (prompt) {
          await sendAiChatMessage(prompt);
        }
      });
    });
  }
}

function resetAiChat() {
  aiChatHistory = [];
  const body = $("aiChatBody");
  if (!body) return;

  const greetingName = currentUser ? (currentUser.name.split(" ")[0]) : "there";
  body.innerHTML = `
    <div class="chat-msg assistant">
      <div class="chat-avatar-mini"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
      <div class="chat-bubble">
        Hello <strong>${escapeHtml(greetingName)}</strong>! 👋 I'm <strong>CampusFix AI</strong>.
        <br/><br/>
        Tell me what maintenance issue you're facing (e.g. <em>"Water pipe leaking in Hostel B washroom"</em> or <em>"Fan sparking in Room 204"</em>). I will analyze it, set priority, and help book your maintenance ticket instantly!
      </div>
    </div>
  `;
}

function appendChatMessage(role, htmlContent) {
  const body = $("aiChatBody");
  if (!body) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `chat-msg ${role}`;

  const avatarMini = role === "assistant"
    ? `<div class="chat-avatar-mini"><i class="fa-solid fa-wand-magic-sparkles"></i></div>`
    : `<div class="chat-avatar-mini"><i class="fa-solid fa-user"></i></div>`;

  msgDiv.innerHTML = `
    ${avatarMini}
    <div class="chat-bubble">
      ${htmlContent}
    </div>
  `;

  body.appendChild(msgDiv);
  body.scrollTop = body.scrollHeight;
  return msgDiv;
}

function showChatTypingIndicator() {
  const body = $("aiChatBody");
  if (!body) return null;

  const typingDiv = document.createElement("div");
  typingDiv.id = "aiChatTyping";
  typingDiv.className = "chat-msg assistant";
  typingDiv.innerHTML = `
    <div class="chat-avatar-mini"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
    <div class="chat-bubble" style="display:flex;align-items:center;gap:6px;padding:8px 14px;color:#64748b">
      <i class="fa-solid fa-circle-notch fa-spin"></i>
      <span style="font-size:11px">Analyzing your complaint...</span>
    </div>
  `;
  body.appendChild(typingDiv);
  body.scrollTop = body.scrollHeight;
  return typingDiv;
}

async function sendAiChatMessage(userText) {
  if (!userText || !userText.trim()) return;

  const sendBtn = $("aiChatSendBtn");
  const input = $("aiChatInput");
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.disabled = true;

  // Append user message to UI & history
  appendChatMessage("user", formatChatMarkdown(userText));
  aiChatHistory.push({ role: "user", content: userText });
  playSound();

  const typingEl = showChatTypingIndicator();

  try {
    const res = await authFetch("/api/chat/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userText,
        history: aiChatHistory
      })
    });

    if (typingEl) typingEl.remove();

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to contact AI assistant.");
    }

    const data = await res.json();
    aiChatHistory.push({ role: "assistant", content: data.reply });

    // Build assistant bubble
    let bubbleHtml = `<div>${formatChatMarkdown(data.reply)}</div>`;

    // If ticket proposal is ready to book, inject the interactive proposal card!
    if (data.readyToBook && data.ticketProposal) {
      const p = data.ticketProposal;
      const catIcon = p.category === "Plumbing" ? "fa-faucet-drip"
        : p.category === "Electrical" ? "fa-bolt"
        : p.category === "Network" ? "fa-wifi"
        : p.category === "Furniture" ? "fa-chair"
        : p.category === "Cleaning" ? "fa-broom"
        : "fa-screwdriver-wrench";

      const priorityClass = (p.priority || "Medium").toLowerCase();

      bubbleHtml += `
        <div class="ai-proposal-card">
          <div class="ai-proposal-header">
            <span class="chip chip-${catIcon === 'fa-bolt' ? 'warning' : 'info'}" style="font-size:10px;padding:3px 9px">
              <i class="fa-solid ${catIcon}"></i> ${escapeHtml(p.category)}
            </span>
            <span class="priority ${priorityClass}" style="font-size:9.5px;padding:2px 8px">
              ${escapeHtml(p.priority)} Priority
            </span>
          </div>
          <h4>${escapeHtml(p.title)}</h4>
          <div class="ai-proposal-meta">
            <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.location)}</span>
          </div>
          <div class="ai-proposal-details">
            ${escapeHtml(p.details || p.title)}
          </div>
          <div class="ai-proposal-actions">
            <button type="button" class="ai-book-btn" id="bookProposalBtn_${Date.now()}">
              <i class="fa-solid fa-bolt"></i> Confirm & Book Ticket
            </button>
            <button type="button" class="ai-edit-btn" id="editProposalBtn_${Date.now()}">
              <i class="fa-solid fa-pen-to-square"></i> Open Form
            </button>
          </div>
        </div>
      `;
    }

    const assistantMsgDiv = appendChatMessage("assistant", bubbleHtml);
    playSound("success");

    // Bind proposal card actions if rendered
    if (data.readyToBook && data.ticketProposal && assistantMsgDiv) {
      const p = data.ticketProposal;
      const bookBtn = assistantMsgDiv.querySelector(".ai-book-btn");
      const editBtn = assistantMsgDiv.querySelector(".ai-edit-btn");

      if (bookBtn) {
        bookBtn.addEventListener("click", async () => {
          bookBtn.disabled = true;
          bookBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Booking Ticket...`;

          try {
            const complaintRes = await authFetch("/api/complaints", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: p.title,
                category: p.category,
                location: p.location,
                priority: p.priority || "Medium",
                details: p.details || p.title,
                createdBy: currentUser ? currentUser.name : "Student"
              })
            });

            const newTicket = await complaintRes.json();
            if (!complaintRes.ok) throw new Error(newTicket.error || "Failed to book ticket.");

            bookBtn.innerHTML = `<i class="fa-solid fa-check"></i> Booked (#${newTicket.id})`;
            bookBtn.style.background = "#10b981";

            // Append confirmation notification inside chat
            appendChatMessage("assistant", `
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;color:#166534">
                <div style="font-weight:800;font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px">
                  <i class="fa-solid fa-circle-check" style="color:#15803d"></i> Ticket #${newTicket.id} Successfully Booked!
                </div>
                <div style="font-size:11px;color:#1e3a8a;line-height:1.4">
                  Campus administration and facilities team have been alerted. Your ticket status is currently <strong>Pending</strong>.
                </div>
                <div style="margin-top:10px">
                  <button type="button" class="btn btn-primary" id="viewBookedTicketBtn_${newTicket.id}" style="padding:5px 12px;font-size:10px">
                    <i class="fa-solid fa-ticket"></i> View in My Complaints
                  </button>
                </div>
              </div>
            `);

            // Bind view ticket button
            const viewBtn = $(`viewBookedTicketBtn_${newTicket.id}`);
            if (viewBtn) {
              viewBtn.addEventListener("click", () => {
                navigateToTicket(newTicket.id);
                if (closeAiChat) closeAiChat();
                else $("aiChatPanel").classList.add("hidden");
              });
            }

            toast("Ticket Booked!", `Ticket #${newTicket.id} has been registered via AI Concierge.`, "fa-circle-check");
            playSound("success");

            // Update app workspace data
            await loadRoleDashboardData();
            await updateNotificationBadges();

          } catch (err) {
            bookBtn.disabled = false;
            bookBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Retry Booking`;
            toast("Booking Failed", err.message, "fa-circle-exclamation");
            playSound("warning");
          }
        });
      }

      if (editBtn) {
        editBtn.addEventListener("click", () => {
          showSection("submitComplaint");
          selectCategory(p.category);
          if ($("complaintTitle")) $("complaintTitle").value = p.title;
          if ($("complaintLocation")) $("complaintLocation").value = p.location;
          if ($("complaintDetails")) $("complaintDetails").value = p.details || p.title;
          if ($("complaintUrgency")) {
            $("complaintUrgency").value = p.priority || "Medium";
            document.querySelectorAll(".urgency-option").forEach(b => {
              b.classList.toggle("selected", b.dataset.urgency === (p.priority || "Medium"));
            });
          }
          if (closeAiChat) closeAiChat();
          else $("aiChatPanel").classList.add("hidden");
          toast("Loaded in Form", "Details transferred to complaint form. You can review or add photos before submitting.", "fa-pen-to-square");
        });
      }
    }

  } catch (err) {
    if (typingEl) typingEl.remove();
    appendChatMessage("assistant", `
      <div style="color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:11px">
        <i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message || "Something went wrong while processing your request.")}
      </div>
    `);
    playSound("warning");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (input) {
      input.disabled = false;
      input.focus();
    }
  }
}

// Bind Mark All Read button
if ($("markAllNotifsReadBtn")) {
  $("markAllNotifsReadBtn").addEventListener("click", markAllNotificationsRead);
}

// Check Existing Active Session on Initial Page Load
async function checkExistingSession() {
  if (!sessionToken) {
    $("loginPage").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }

  try {
    const res = await authFetch("/api/auth/me");
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      currentRole = data.user.role;
      try {
        localStorage.setItem("campusfix_user", JSON.stringify(currentUser));
      } catch (e) {}
      $("loginPage").classList.add("hidden");
      $("app").classList.remove("hidden");
      configureRoleWorkspace();
      await loadRoleDashboardData();
      await updateNotificationBadges();
      initAiChat();
      handlePwaUrlAction();
    } else {
      performLogout();
    }
  } catch (err) {
    // Offline resilience: Check if cached user exists in localStorage
    const cachedUser = localStorage.getItem("campusfix_user");
    if (cachedUser && sessionToken) {
      try {
        currentUser = JSON.parse(cachedUser);
        currentRole = currentUser.role;
        $("loginPage").classList.add("hidden");
        $("app").classList.remove("hidden");
        configureRoleWorkspace();
        await loadRoleDashboardData();
        initAiChat();
        handlePwaUrlAction();
        toast("Offline Cache Active", `Operating offline as ${currentUser.name}. Cached data is displayed.`, "fa-database");
        return;
      } catch (parseErr) {}
    }
    performLogout();
  }
}

// =============================================================================
// PROGRESSIVE WEB APP (PWA) ENGINE: SERVICE WORKER, INSTALLATION & OFFLINE
// =============================================================================

let deferredInstallPrompt = null;
const isIosDevice = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && !window.MSStream;
const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches ||
                        window.navigator.standalone === true ||
                        document.referrer.includes('android-app://');

// Initialize Standalone App Ergonomics
function initStandaloneMode() {
  if (isStandaloneApp) {
    document.body.classList.add('standalone-mode');
    console.log('[CampusFix PWA] Running in Standalone Display Mode');
    hidePwaInstallTriggers();
  }
}

// 1. Service Worker Registration
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => {
          console.log('[CampusFix PWA] Service Worker registered with scope:', registration.scope);

          // Listen for available updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  toast('Update Available', 'A new version of CampusFix is ready. Reload to update.', 'fa-arrows-rotate');
                }
              });
            }
          });
        })
        .catch(err => {
          console.warn('[CampusFix PWA] Service Worker registration failed:', err);
        });
    });
  }
}

// 2. Online / Offline Network Status Monitoring
function initNetworkStatusMonitoring() {
  const offlineIndicator = $('offlineIndicator');

  function updateOnlineStatus() {
    if (navigator.onLine) {
      if (offlineIndicator) offlineIndicator.classList.add('hidden');
      document.body.classList.remove('offline-active');
      toast('Connection Restored', 'Back online. Syncing latest complaints and reports.', 'fa-wifi');
      if (currentUser) {
        loadRoleDashboardData();
        updateNotificationBadges();
      }
    } else {
      if (offlineIndicator) offlineIndicator.classList.remove('hidden');
      document.body.classList.add('offline-active');
      toast('Offline Mode Active', 'Operating with cached campus maintenance data.', 'fa-plane-slash');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  if (!navigator.onLine && offlineIndicator) {
    offlineIndicator.classList.remove('hidden');
    document.body.classList.add('offline-active');
  }
}

// 3. PWA Installation Triggers (Android, Chrome, Edge, Safari iOS)
function showPwaInstallTriggers() {
  if (isStandaloneApp) return;

  const topbarBtn = $('pwaInstallTopbarBtn');
  const sidebarBtn = $('pwaSidebarInstallBtn');
  const loginBox = $('pwaLoginInstallBox');
  const banner = $('pwaInstallBanner');

  if (topbarBtn) topbarBtn.classList.remove('hidden');
  if (sidebarBtn) sidebarBtn.classList.remove('hidden');
  if (loginBox) loginBox.classList.remove('hidden');

  // Show floating prompt banner if not previously dismissed in this session
  if (banner && !sessionStorage.getItem('campusfix_pwa_banner_dismissed')) {
    banner.classList.remove('hidden');
  }
}

function hidePwaInstallTriggers() {
  const topbarBtn = $('pwaInstallTopbarBtn');
  const sidebarBtn = $('pwaSidebarInstallBtn');
  const loginBox = $('pwaLoginInstallBox');
  const banner = $('pwaInstallBanner');

  if (topbarBtn) topbarBtn.classList.add('hidden');
  if (sidebarBtn) sidebarBtn.classList.add('hidden');
  if (loginBox) loginBox.classList.add('hidden');
  if (banner) banner.classList.add('hidden');
}

async function triggerPwaInstall() {
  if (deferredInstallPrompt) {
    try {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        toast('Installing CampusFix', 'CampusFix is being added to your device...', 'fa-download');
        hidePwaInstallTriggers();
      }
      deferredInstallPrompt = null;
      return;
    } catch (e) {
      console.warn('Native prompt error:', e);
    }
  }

  // If native prompt is not available (e.g. running in iframe, iOS, or desktop before prompt fired)
  openPwaInstallModal();
}

function switchPwaPlatformTab(platform) {
  const tabs = {
    desktop: { tab: $('tabDesktopBtn'), guide: $('guideDesktop') },
    android: { tab: $('tabAndroidBtn'), guide: $('guideAndroid') },
    ios: { tab: $('tabIosBtn'), guide: $('guideIos') }
  };

  Object.keys(tabs).forEach(key => {
    const item = tabs[key];
    if (item.tab) {
      if (key === platform) {
        item.tab.classList.add('active');
      } else {
        item.tab.classList.remove('active');
      }
    }
    if (item.guide) {
      if (key === platform) {
        item.guide.classList.remove('hidden');
      } else {
        item.guide.classList.add('hidden');
      }
    }
  });
}

function openPwaInstallModal() {
  const modal = $('iosInstallModal');
  if (!modal) return;

  const isInIframe = window.self !== window.top;
  const iframeNotice = $('pwaIframeNotice');
  const openNewTabBtn = $('pwaOpenNewTabBtn');
  const nativeBlock = $('pwaNativePromptBlock');

  // If inside preview iframe (e.g. AI Studio container)
  if (iframeNotice) {
    if (isInIframe) {
      iframeNotice.classList.remove('hidden');
      if (openNewTabBtn) {
        openNewTabBtn.href = window.location.href;
      }
    } else {
      iframeNotice.classList.add('hidden');
    }
  }

  // Native prompt button
  if (nativeBlock) {
    if (deferredInstallPrompt) {
      nativeBlock.classList.remove('hidden');
    } else {
      nativeBlock.classList.add('hidden');
    }
  }

  // Auto-select platform tab based on OS
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isIosDevice) {
    switchPwaPlatformTab('ios');
  } else if (isAndroid) {
    switchPwaPlatformTab('android');
  } else {
    switchPwaPlatformTab('desktop');
  }

  modal.classList.remove('hidden');
}

function closePwaInstallModal() {
  const modal = $('iosInstallModal');
  if (modal) modal.classList.add('hidden');
}

function initPwaInstallListeners() {
  // Capture native browser install prompt (Chrome Android, Edge, Desktop Chrome)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showPwaInstallTriggers();
    const nativeBlock = $('pwaNativePromptBlock');
    if (nativeBlock) nativeBlock.classList.remove('hidden');
  });

  // Native App Installed Event
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    hidePwaInstallTriggers();
    closePwaInstallModal();
    toast('Installation Complete', 'CampusFix is now installed! You can launch it from your home screen or desktop.', 'fa-circle-check');
  });

  // Bind all install action buttons
  const triggerIds = [
    'pwaInstallTopbarBtn',
    'pwaSidebarInstallBtn',
    'pwaLoginInstallBtn',
    'pwaBannerInstallBtn'
  ];

  triggerIds.forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        triggerPwaInstall();
      });
    }
  });

  // Native prompt block button inside modal
  const directBtn = $('pwaDirectInstallBtn');
  if (directBtn) {
    directBtn.addEventListener('click', () => {
      if (deferredInstallPrompt) {
        triggerPwaInstall();
      }
    });
  }

  // Platform tab click handlers
  const tabDesktop = $('tabDesktopBtn');
  const tabAndroid = $('tabAndroidBtn');
  const tabIos = $('tabIosBtn');

  if (tabDesktop) tabDesktop.addEventListener('click', () => switchPwaPlatformTab('desktop'));
  if (tabAndroid) tabAndroid.addEventListener('click', () => switchPwaPlatformTab('android'));
  if (tabIos) tabIos.addEventListener('click', () => switchPwaPlatformTab('ios'));

  // Banner dismiss button
  const dismissBtn = $('pwaBannerDismissBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = $('pwaInstallBanner');
      if (banner) banner.classList.add('hidden');
      sessionStorage.setItem('campusfix_pwa_banner_dismissed', 'true');
    });
  }

  // Guide Modal Close buttons
  const closeIosBtn = $('closeIosInstallModal');
  const dismissIosBtn = $('dismissIosInstallBtn');
  if (closeIosBtn) closeIosBtn.addEventListener('click', closePwaInstallModal);
  if (dismissIosBtn) dismissIosBtn.addEventListener('click', closePwaInstallModal);

  // ALWAYS show install triggers when not running in standalone display mode
  if (!isStandaloneApp) {
    showPwaInstallTriggers();
  }
}

// 4. Handle PWA Action Shortcuts (e.g. ?action=report, ?action=complaints)
function handlePwaUrlAction() {
  try {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;

    if (action === 'report') {
      if (currentRole === 'student') {
        navigateToSection('submitComplaint');
      }
    } else if (action === 'complaints') {
      if (currentRole === 'student') {
        navigateToSection('studentComplaints');
      } else if (currentRole === 'worker') {
        navigateToSection('workerAssigned');
      } else if (currentRole === 'admin') {
        navigateToSection('adminComplaints');
      }
    } else if (action === 'chat') {
      openAiChat();
    } else if (action === 'install') {
      triggerPwaInstall();
    }
  } catch (e) {
    console.warn('[CampusFix PWA] Error handling URL action shortcut:', e);
  }
}

// Initialize Application
initAuthUI();
initStarRatingSelector();
initAiChat();
initStandaloneMode();
initServiceWorker();
initNetworkStatusMonitoring();
initPwaInstallListeners();
handlePwaUrlAction();
checkExistingSession();

// Periodic Notification Badge Polling
setInterval(updateNotificationBadges, 25000);

