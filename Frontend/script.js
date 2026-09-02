let complaints = [
  {id:"CMP-001",title:"Flickering lights in Room 101",category:"Electrical",location:"Block A, Room 101",priority:"High",status:"Pending",assignedTo:"-",created:"Today"},
  {id:"CMP-002",title:"Leaking tap in washroom",category:"Plumbing",location:"Block B, First Floor",priority:"Medium",status:"Ongoing",assignedTo:"Maintenance Staff",created:"Yesterday"},
  {id:"CMP-003",title:"Classroom fan not working",category:"Electrical",location:"Block A, Room 204",priority:"High",status:"Ongoing",assignedTo:"Maintenance Staff",created:"2 days ago"},
  {id:"CMP-004",title:"Corridor needs cleaning",category:"Cleaning",location:"Block C, Ground Floor",priority:"Low",status:"Resolved",assignedTo:"Maintenance Staff",created:"3 days ago"},
  {id:"CMP-005",title:"Dripping pipe in laboratory",category:"Plumbing",location:"Science Block, Lab 2",priority:"Medium",status:"Pending",assignedTo:"-",created:"4 days ago"},
  {id:"CMP-006",title:"Campus Wi-Fi unavailable",category:"Network",location:"Library, Second Floor",priority:"High",status:"Resolved",assignedTo:"Maintenance Staff",created:"5 days ago"},
  {id:"CMP-007",title:"Broken chair in classroom",category:"Furniture",location:"Block B, Room 108",priority:"Low",status:"Pending",assignedTo:"-",created:"6 days ago"},
  {id:"CMP-008",title:"Washroom cleaning required",category:"Cleaning",location:"Block A, Ground Floor",priority:"Medium",status:"Resolved",assignedTo:"Maintenance Staff",created:"1 week ago"}
];

let currentUser = {name:"Student", role:"student"};
let soundsEnabled = true;
let selectedFile = null;

const $ = id => document.getElementById(id);
const navItems = document.querySelectorAll(".nav-item");
const sections = document.querySelectorAll(".page-section");

function playSound(type="click"){
  if(!soundsEnabled) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type === "success" ? "sine" : "triangle";
    osc.frequency.value = type === "success" ? 660 : 420;
    gain.gain.setValueAtTime(.045, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .09);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + .09);
  }catch(e){}
}

function toast(title, message, icon="fa-circle-check"){
  const el=document.createElement("div");
  el.className="toast";
  el.innerHTML=`<i class="fa-solid ${icon}"></i><div><strong>${title}</strong><span>${message}</span></div>`;
  $("toastContainer").appendChild(el);
  setTimeout(()=>el.remove(),3500);
}

function updateUserUI(){
  const roleName=currentUser.role==="student"?"Student":"Maintenance Staff";
  const initial=currentUser.name.charAt(0).toUpperCase();
  $("sidebarName").textContent=currentUser.name;
  $("sidebarRole").textContent=roleName;
  $("headerName").textContent=currentUser.name;
  $("headerRole").textContent=roleName;
  $("sidebarAvatar").textContent=initial;
  $("headerAvatar").textContent=initial;
  $("welcomeName").textContent=currentUser.name;
}

function configureRole(){
  const student=currentUser.role==="student";
  document.querySelectorAll(".student-only,.student-action").forEach(el=>el.style.display=student?"":"none");
  document.querySelectorAll(".staff-only,.staff-action").forEach(el=>el.style.display=student?"none":"");
  $("heroSubmitBtn").style.display=student?"inline-flex":"none";
  $("heroTrackBtn").style.display=student?"inline-flex":"none";
  $("viewAllBtn").dataset.section=student?"trackComplaints":"manageComplaints";
}

function showSection(id){
  const target=$(id);
  if(!target) return;
  sections.forEach(s=>s.classList.remove("active-section"));
  target.classList.add("active-section");
  navItems.forEach(n=>n.classList.toggle("active",n.dataset.section===id));
  const title=target.querySelector("h1")?.textContent || "Dashboard";
  $("pageTitle").textContent=title;
  $("sidebar").classList.remove("open");
  window.scrollTo({top:0,behavior:"smooth"});
  playSound();
}

document.querySelectorAll("[data-section]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const id=btn.dataset.section;
    if(id==="submitComplaint" && currentUser.role!=="student") return;
    showSection(id);
    if(btn.dataset.categoryLink){
      setTimeout(()=>selectCategory(btn.dataset.categoryLink),100);
    }
  });
});

$("loginForm").addEventListener("submit",e=>{
  e.preventDefault();
  const username=$("username").value.trim();
  if(!username) return;
  currentUser={name:username,role:$("userRole").value};
  updateUserUI(); configureRole();
  $("loginPage").classList.add("hidden"); $("app").classList.remove("hidden");
  showSection("dashboard"); updateAll();
  playSound("success");
  toast("Welcome to CampusFix",`Signed in as ${currentUser.role==="student"?"Student":"Maintenance Staff"}.`,"fa-hand-wave");
});

$("togglePassword").addEventListener("click",()=>{
  const input=$("password"), icon=$("togglePassword i");
  input.type=input.type==="password"?"text":"password";
  $("togglePassword").innerHTML=`<i class="fa-regular ${input.type==="password"?"fa-eye":"fa-eye-slash"}"></i>`;
});

$("logoutBtn").addEventListener("click",()=>{
  $("app").classList.add("hidden"); $("loginPage").classList.remove("hidden"); $("loginForm").reset();
  playSound();
});

$("mobileMenu").addEventListener("click",()=>{$("sidebar").classList.add("open");playSound()});
$("closeSidebar").addEventListener("click",()=>{$("sidebar").classList.remove("open");playSound()});
$("soundToggle").addEventListener("click",()=>{
  soundsEnabled=!soundsEnabled;
  $("soundToggle").innerHTML=`<i class="fa-solid ${soundsEnabled?"fa-volume-high":"fa-volume-xmark"}"></i>`;
  if(soundsEnabled) playSound("success");
});

function statusBadge(status){
  const text=status==="Ongoing"?"In Progress":status;
  return `<span class="status ${status.toLowerCase()}">${text}</span>`;
}
function priorityBadge(priority){
  return `<span class="priority ${priority.toLowerCase()}">${priority}</span>`;
}

function filteredList(search="",status="all"){
  const q=search.toLowerCase();
  return complaints.filter(c=>{
    const matches=!q || [c.id,c.title,c.category,c.location].some(v=>v.toLowerCase().includes(q));
    return matches && (status==="all" || c.status===status);
  });
}

function updateCounts(){
  const total=complaints.length;
  const resolved=complaints.filter(c=>c.status==="Resolved").length;
  const pending=complaints.filter(c=>c.status==="Pending").length;
  const ongoing=complaints.filter(c=>c.status==="Ongoing").length;
  const high=complaints.filter(c=>c.priority==="High" && c.status!=="Resolved").length;
  $("totalComplaints").textContent=total;
  $("resolvedComplaints").textContent=resolved;
  $("highPriorityComplaints").textContent=high;
  $("reportPending").textContent=pending;
  $("reportOngoing").textContent=ongoing;
  $("reportResolved").textContent=resolved;
  $("donutTotal").textContent=total;
  $("legendPending").textContent=pending;
  $("legendOngoing").textContent=ongoing;
  $("legendResolved").textContent=resolved;
  const p=total?pending/total*100:0, o=total?ongoing/total*100:0;
  $("donutChart").style.background=`conic-gradient(var(--green) 0 ${resolved/Math.max(total,1)*100}%, var(--blue) ${resolved/Math.max(total,1)*100}% ${(resolved+ongoing)/Math.max(total,1)*100}%, var(--orange) ${(resolved+ongoing)/Math.max(total,1)*100}% 100%)`;
}

function renderDashboard(){
  $("dashboardTable").innerHTML=complaints.slice(0,5).map(c=>`
    <tr><td><strong>${c.id}</strong></td><td>${c.title}<small style="display:block;color:#94a3b8;font-size:8px;margin-top:2px">${c.location}</small></td>
    <td>${c.category}</td><td>${priorityBadge(c.priority)}</td><td>${statusBadge(c.status)}</td></tr>`).join("");
}

function renderTrack(){
  const list=filteredList($("trackSearch").value,$("trackStatus").value);
  $("trackCards").innerHTML=list.length?list.map((c,i)=>ticketCard(c,i)).join(""):`<div class="empty-state" style="padding:35px;text-align:center;color:#64748b;font-size:11px">No complaints found.</div>`;
}

function ticketCard(c,i){
  const states=["Pending","Ongoing","Resolved"];
  const current=c.status==="Pending"?0:c.status==="Ongoing"?2:3;
  const progress=current===0?0:current===2?58:100;
  const steps=["Submitted","Under Review","In Progress","Resolved"];
  return `<article class="ticket-card" style="animation-delay:${i*45}ms">
    <div class="ticket-head"><div><span class="ticket-id">${c.id}</span><h3 class="ticket-title">${c.title}</h3><div class="ticket-meta"><span><i class="fa-solid fa-location-dot"></i> ${c.location}</span><span><i class="fa-solid fa-layer-group"></i> ${c.category}</span></div></div><div>${priorityBadge(c.priority)} ${statusBadge(c.status)}</div></div>
    <div class="stepper"><div class="stepper-progress" style="width:${progress}%"></div>${steps.map((s,idx)=>{
      const done=idx<=current;
      return `<div class="step ${done?"done":""} ${idx===current?"current":""}"><div class="step-dot">${done?'<i class="fa-solid fa-check"></i>':idx+1}</div>${s}</div>`;
    }).join("")}</div>
  </article>`;
}

function renderManage(){
  const list=filteredList($("manageSearch").value,$("manageStatus").value);
  $("manageTable").innerHTML=list.map(c=>`
    <tr><td><strong>${c.id}</strong></td><td>${c.title}<small style="display:block;color:#94a3b8;font-size:8px">${c.location}</small></td>
    <td>${c.category}</td><td>${priorityBadge(c.priority)}</td><td>${c.assignedTo}</td><td>${statusBadge(c.status)}</td>
    <td><button class="action-btn update-btn" data-id="${c.id}" style="border:1px solid #dbe3ef;background:#fff;color:#2563eb;border-radius:7px;padding:6px 9px;font-size:8.5px;font-weight:800">Update</button></td></tr>`).join("");
  document.querySelectorAll(".update-btn").forEach(btn=>btn.addEventListener("click",()=>updateComplaint(btn.dataset.id)));
}

function renderReport(){
  $("reportTable").innerHTML=complaints.map(c=>`<tr><td>${c.id}</td><td>${c.title}</td><td>${c.category}</td><td>${priorityBadge(c.priority)}</td><td>${statusBadge(c.status)}</td></tr>`).join("");
}

function updateComplaint(id){
  const c=complaints.find(x=>x.id===id);
  if(!c)return;
  if(c.status==="Pending"){c.status="Ongoing";c.assignedTo="Maintenance Staff"}
  else if(c.status==="Ongoing"){c.status="Resolved"}
  else {c.status="Pending";c.assignedTo="-"}
  updateAll(); playSound("success");
  toast("Complaint updated",`${id} is now ${c.status==="Ongoing"?"In Progress":c.status}.`,"fa-screwdriver-wrench");
}

function updateAll(){
  updateCounts(); renderDashboard(); renderTrack(); renderManage(); renderReport();
}

function selectCategory(category){
  document.querySelectorAll(".category-option").forEach(b=>b.classList.toggle("selected",b.dataset.category===category));
  $("complaintCategory").value=category;
}

document.querySelectorAll(".category-option").forEach(btn=>btn.addEventListener("click",()=>{selectCategory(btn.dataset.category);playSound()}));
document.querySelectorAll(".urgency-option").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".urgency-option").forEach(b=>b.classList.remove("selected"));
  btn.classList.add("selected"); $("complaintUrgency").value=btn.dataset.urgency; playSound();
}));

$("complaintForm").addEventListener("submit",e=>{
  e.preventDefault();
  if(!$("complaintCategory").value){toast("Choose a category","Please select the issue category first.","fa-circle-exclamation");return}
  const title=$("complaintTitle").value.trim(), location=$("complaintLocation").value.trim(), details=$("complaintDetails").value.trim();
  if(!title||!location||!details)return;
  const id=`CMP-${String(complaints.length+1).padStart(3,"0")}`;
  complaints.unshift({id,title,category:$("complaintCategory").value,location,priority:$("complaintUrgency").value,status:"Pending",assignedTo:"-",created:"Just now",details,evidence:selectedFile?.name||""});
  e.target.reset(); selectedFile=null; $("complaintCategory").value=""; $("complaintUrgency").value="Medium";
  document.querySelectorAll(".category-option").forEach(b=>b.classList.remove("selected"));
  document.querySelectorAll(".urgency-option").forEach(b=>b.classList.toggle("selected",b.dataset.urgency==="Medium"));
  $("filePreview").classList.add("hidden"); $("filePreview").textContent="";
  updateAll(); showSection("trackComplaints"); $("trackSearch").value=id; renderTrack();
  playSound("success"); toast("Complaint submitted",`${id} has been added and is pending review.`,"fa-circle-check");
});

["trackSearch","trackStatus"].forEach(id=>$(id).addEventListener(id==="trackSearch"?"input":"change",renderTrack));
["manageSearch","manageStatus"].forEach(id=>$(id).addEventListener(id==="manageSearch"?"input":"change",renderManage));

$("globalSearch").addEventListener("input",e=>{
  const q=e.target.value;
  if(!q)return;
  const target=currentUser.role==="student"?"trackComplaints":"manageComplaints";
  showSection(target);
  const field=currentUser.role==="student"?$("trackSearch"):$("manageSearch");
  field.value=q; currentUser.role==="student"?renderTrack():renderManage();
});

$("browseBtn").addEventListener("click",()=>$("evidenceInput").click());
$("evidenceInput").addEventListener("change",e=>handleFile(e.target.files[0]));
["dragenter","dragover"].forEach(ev=>$("dropZone").addEventListener(ev,e=>{e.preventDefault();$("dropZone").classList.add("dragover")}));
["dragleave","drop"].forEach(ev=>$("dropZone").addEventListener(ev,e=>{e.preventDefault();$("dropZone").classList.remove("dragover")}));
$("dropZone").addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));

function handleFile(file){
  if(!file)return;
  if(!["image/jpeg","image/png"].includes(file.type)){toast("Unsupported file","Please choose a JPG or PNG image.","fa-file-circle-exclamation");return}
  if(file.size>5*1024*1024){toast("File too large","Please choose an image under 5 MB.","fa-file-circle-exclamation");return}
  selectedFile=file; $("filePreview").classList.remove("hidden"); $("filePreview").innerHTML=`<i class="fa-solid fa-image"></i> ${file.name} — ${(file.size/1024/1024).toFixed(2)} MB`;
  playSound();
}

$("helperMessage").textContent="Include a clear location and useful details so the maintenance team can understand the issue quickly.";

updateUserUI(); configureRole(); updateAll();
