let complaints = [
    { id: "CMP-001", title: "Classroom light not working", category: "Electrical", status: "Pending", assignedTo: "-" },
    { id: "CMP-002", title: "Water leakage in washroom", category: "Plumbing", status: "Ongoing", assignedTo: "Maintenance Staff" },
    { id: "CMP-003", title: "Classroom cleaning required", category: "Cleaning", status: "Resolved", assignedTo: "Maintenance Staff" },
    { id: "CMP-004", title: "Fan not working", category: "Electrical", status: "Ongoing", assignedTo: "Maintenance Staff" },
    { id: "CMP-005", title: "Broken water tap", category: "Plumbing", status: "Pending", assignedTo: "-" },
    { id: "CMP-006", title: "Corridor cleaning required", category: "Cleaning", status: "Resolved", assignedTo: "Maintenance Staff" },
    { id: "CMP-007", title: "Power issue in laboratory", category: "Electrical", status: "Pending", assignedTo: "-" },
    { id: "CMP-008", title: "Water pipe issue", category: "Plumbing", status: "Ongoing", assignedTo: "Maintenance Staff" }
];

let currentUser = { name: "Student", role: "student" };
const loginPage = document.getElementById("loginPage");
const app = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const navItems = document.querySelectorAll(".nav-item");
const actionButtons = document.querySelectorAll("[data-section]");

function updateUserInterface() {
    const roleName = currentUser.role === "student" ? "Student" : "Maintenance Staff";
    const initial = currentUser.name.charAt(0).toUpperCase();
    document.getElementById("sidebarName").textContent = currentUser.name;
    document.getElementById("sidebarRole").textContent = roleName;
    document.getElementById("headerName").textContent = currentUser.name;
    document.getElementById("headerRole").textContent = roleName;
    document.getElementById("welcomeName").textContent = currentUser.name;
    document.getElementById("sidebarAvatar").textContent = initial;
    document.getElementById("headerAvatar").textContent = initial;
}

loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const username = document.getElementById("username").value.trim();
    const role = document.getElementById("userRole").value;
    if (!username) return;
    currentUser = { name: username, role };
    updateUserInterface();
    loginPage.classList.add("hidden");
    app.classList.remove("hidden");
    configureNavigation();
    showSection("dashboard");
});

function showSection(sectionId) {
    document.querySelectorAll(".page-section").forEach(section => section.classList.remove("active-section"));
    const selected = document.getElementById(sectionId);
    if (selected) selected.classList.add("active-section");
    navItems.forEach(item => item.classList.toggle("active", item.dataset.section === sectionId));
    document.querySelector(".sidebar").classList.remove("mobile-open");
}

actionButtons.forEach(button => button.addEventListener("click", () => {
    if (button.dataset.section) showSection(button.dataset.section);
}));

function configureNavigation() {
    const isStudent = currentUser.role === "student";
    document.getElementById("submitNav").style.display = isStudent ? "flex" : "none";
    document.getElementById("trackNav").style.display = isStudent ? "flex" : "none";
    document.getElementById("manageNav").style.display = isStudent ? "none" : "flex";
    document.querySelectorAll(".student-action").forEach(button => button.style.display = isStudent ? "block" : "none");
    document.querySelectorAll(".staff-action").forEach(button => button.style.display = isStudent ? "none" : "block");
}

function statusBadge(status) {
    return `<span class="status ${status.toLowerCase()}">${status}</span>`;
}

function filterComplaints(search, status) {
    const term = search.toLowerCase().trim();
    return complaints.filter(c => {
        const matchesSearch = !term || c.title.toLowerCase().includes(term) || c.id.toLowerCase().includes(term) || c.category.toLowerCase().includes(term);
        return matchesSearch && (status === "all" || status === "" || c.status === status);
    });
}

function renderDashboardTable() {
    const search = document.getElementById("dashboardSearch").value;
    const status = document.getElementById("dashboardStatus").value;
    const table = document.getElementById("dashboardTable");
    const filtered = filterComplaints(search, status).slice(0, 5);
    table.innerHTML = filtered.length ? filtered.map(c => `<tr><td>${c.id}</td><td>${c.title}</td><td>${c.category}</td><td>${statusBadge(c.status)}</td></tr>`).join("") : `<tr><td colspan="4">No complaints found.</td></tr>`;
}

function renderTrackTable() {
    const filtered = filterComplaints(document.getElementById("trackSearch").value, document.getElementById("trackStatus").value);
    document.getElementById("trackTable").innerHTML = filtered.length ? filtered.map(c => `<tr><td>${c.id}</td><td>${c.title}</td><td>${c.category}</td><td>${statusBadge(c.status)}</td></tr>`).join("") : `<tr><td colspan="4">No complaints found.</td></tr>`;
}

function renderManageTable() {
    const filtered = filterComplaints(document.getElementById("manageSearch").value, document.getElementById("manageStatus").value);
    document.getElementById("manageTable").innerHTML = filtered.length ? filtered.map(c => `<tr><td>${c.id}</td><td>${c.title}</td><td>${c.category}</td><td>${c.assignedTo}</td><td>${statusBadge(c.status)}</td><td><button class="action-btn" onclick="updateComplaint('${c.id}')">Update</button></td></tr>`).join("") : `<tr><td colspan="6">No complaints found.</td></tr>`;
}

function renderReportTable() {
    document.getElementById("reportTable").innerHTML = complaints.map(c => `<tr><td>${c.id}</td><td>${c.title}</td><td>${c.category}</td><td>${statusBadge(c.status)}</td></tr>`).join("");
}

function updateComplaint(id) {
    const complaint = complaints.find(c => c.id === id);
    if (!complaint) return;
    if (complaint.status === "Pending") {
        complaint.status = "Ongoing";
        complaint.assignedTo = "Maintenance Staff";
    } else if (complaint.status === "Ongoing") {
        complaint.status = "Resolved";
    } else {
        complaint.status = "Pending";
        complaint.assignedTo = "-";
    }
    updateAllTables();
}

window.updateComplaint = updateComplaint;

document.getElementById("complaintForm").addEventListener("submit", function (event) {
    event.preventDefault();
    const title = document.getElementById("complaintTitle").value.trim();
    const category = document.getElementById("complaintCategory").value;
    const details = document.getElementById("complaintDetails").value.trim();
    if (!title || !category || !details) return;
    complaints.push({ id: "CMP-" + String(complaints.length + 1).padStart(3, "0"), title, category, status: "Pending", assignedTo: "-" });
    this.reset();
    updateAllTables();
    showSection("trackComplaints");
});

function updateCounts() {
    const total = complaints.length;
    const pending = complaints.filter(c => c.status === "Pending").length;
    const ongoing = complaints.filter(c => c.status === "Ongoing").length;
    const resolved = complaints.filter(c => c.status === "Resolved").length;
    document.getElementById("totalComplaints").textContent = total;
    document.getElementById("pendingComplaints").textContent = pending;
    document.getElementById("ongoingComplaints").textContent = ongoing;
    document.getElementById("resolvedComplaints").textContent = resolved;
    document.getElementById("reportPending").textContent = pending;
    document.getElementById("reportOngoing").textContent = ongoing;
    document.getElementById("reportResolved").textContent = resolved;
    document.getElementById("donutTotal").textContent = total;
    document.getElementById("legendPending").textContent = pending;
    document.getElementById("legendOngoing").textContent = ongoing;
    document.getElementById("legendResolved").textContent = resolved;

    const pendingEnd = total ? (pending / total) * 100 : 0;
    const ongoingEnd = total ? pendingEnd + (ongoing / total) * 100 : 0;
    document.getElementById("statusDonut").style.background = total
        ? `conic-gradient(#f6b51d 0 ${pendingEnd}%, #2878eb ${pendingEnd}% ${ongoingEnd}%, #20c486 ${ongoingEnd}% 100%)`
        : "#e9edf5";
}

function updateAllTables() {
    updateCounts();
    renderDashboardTable();
    renderTrackTable();
    renderManageTable();
    renderReportTable();
}

document.getElementById("dashboardSearch").addEventListener("input", renderDashboardTable);
document.getElementById("dashboardStatus").addEventListener("change", renderDashboardTable);
document.getElementById("trackSearch").addEventListener("input", renderTrackTable);
document.getElementById("trackStatus").addEventListener("change", renderTrackTable);
document.getElementById("manageSearch").addEventListener("input", renderManageTable);
document.getElementById("manageStatus").addEventListener("change", renderManageTable);

document.getElementById("globalSearch").addEventListener("input", function () {
    const search = this.value.toLowerCase();
    if (!search) return;
    if (currentUser.role === "student") {
        showSection("trackComplaints");
        document.getElementById("trackSearch").value = search;
        renderTrackTable();
    } else {
        showSection("manageComplaints");
        document.getElementById("manageSearch").value = search;
        renderManageTable();
    }
});

document.getElementById("mobileMenu").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("mobile-open"));

updateAllTables();
