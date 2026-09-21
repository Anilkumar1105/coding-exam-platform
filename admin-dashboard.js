// js/admin-dashboard.js
// UI wiring for admin-dashboard.html: sidebar navigation, students,
// exams, questions (MCQ + coding), analytics, results, Excel export.

import { requireRole, wireLogoutButtons } from "./auth.js";
import { calculateStreakStats } from "./streak.js";
import {
  SECTIONS,
  addStudent,
  updateStudent,
  sendStudentPasswordReset,
  deleteStudentProfile,
  listStudents,
  listExams,
  createExam,
  updateExamDoc,
  toggleExamActive,
  deleteExamDoc,
  listQuestionsForExam,
  addQuestion,
  updateQuestionDoc,
  deleteQuestionDoc,
  listSubmissions,
  exportResultsToExcel,
  MAX_SCHEDULES_PER_EXAM,
  listSchedulesForExam,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  publishWeeklyToppers,
  publishWeeklyCodingToppers,
  publishAllTimePythonTopper,
  listStudentPoints,
  listDailyLearningActivity,
  publishStreakLeaderboard,
  publishBestLearner
} from "./admin.js";
import {
  computeOverallStats,
  computeSectionStats,
  renderStatCards,
  renderSectionTable,
  renderSectionChart,
  renderResultsTable,
  buildResultRowsWithAbsent,
  buildReportTitle,
  buildFiltersText,
  computeWeeklyToppers,
  renderTopperGrid,
  computeWeeklyCodingToppers,
  renderCodingToppers,
  computeAllTimePythonTopper,
  renderAllTimePythonTopper,
  computeBestLearner,
  renderBestLearner
} from "./dashboard.js";
import { generateReportPDF } from "./pdf-export.js";
import { formatExamWindow, describeExamWindow, formatScheduleWindow, formatScheduleSections } from "./grading.js";
import { auth } from "./firebase-config.js";
import { listCodeSubmissionsForExam } from "./student.js";
import {
  listLevels,
  createLevel,
  updateLevel,
  deleteLevel,
  listConcepts,
  createConcept,
  updateConcept,
  deleteConcept,
  listMcqQuestions,
  createMcqQuestion,
  updateMcqQuestion,
  deleteMcqQuestion,
  listLearningCodingQuestions,
  createLearningCodingQuestion,
  updateLearningCodingQuestion,
  deleteLearningCodingQuestion,
  listProgressForLevel
} from "./learning.js";
import {
  COMPANY_OPTIONS,
  listAllSpecialQuestions,
  createSpecialQuestion,
  updateSpecialQuestion,
  deleteSpecialQuestion
} from "./special-section.js";

wireLogoutButtons();

let students = [];
let exams = [];
let submissions = [];
let studentPoints = [];
let dailyLearningActivity = [];
let currentSectionFilter = "all";
let editingStudentUid = null;
let editingExamId = null;
let activeExamForQuestions = null;
let questions = [];
let editingQuestionId = null;
let sectionChartInstance = null;
let schedulesByExamId = {};
let activeExamForSchedules = null;
let examSchedules = [];
let editingScheduleId = null;
let levels = [];
let activeLevel = null;
let editingLevelId = null;
let levelConcepts = [];
let editingConceptId = null;
let levelMcqQuestions = [];
let editingLearningMcqId = null;
let levelCodingQuestions = [];
let codeforcesProblems = [];
let codeforcesSelected = new Set();

let editingLearningCodingId = null;
let specialQuestions = [];
let specialQuestionsLoaded = false;
let editingSpecialQuestionId = null;
let specialCompanyFilterValue = "all";
let specialBeginnerSelectedTopics = new Set();

/* ============================================================
   AUTH + INITIAL LOAD
   ============================================================ */
requireRole("admin", async (user, profile) => {
  document.getElementById("adminName").textContent = profile.name || profile.email;
  populateSectionControls();
  await loadEverything();
});

async function loadEverything() {
  [students, exams, submissions, studentPoints, dailyLearningActivity] = await Promise.all([
    listStudents("all"),
    listExams(),
    listSubmissions(),
    listStudentPoints(),
    listDailyLearningActivity()
  ]);
  await loadSchedules();
  renderStudentsTable();
  renderExamsTable();
  populateFilterOptions();
  renderAnalytics();
}

async function loadSchedules() {
  const entries = await Promise.all(exams.map(async (ex) => [ex.id, await listSchedulesForExam(ex.id)]));
  schedulesByExamId = Object.fromEntries(entries);
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */
const paneTitles = {
  analyticsPane: "Analytics",
  resultsPane: "Results",
  studentsPane: "Students",
  examsPane: "Exams",
  learningPane: "Learning",
  specialPane: "Special Section"
};

document.querySelectorAll(".app-sidebar .nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".app-sidebar .nav-link").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");

    const paneId = link.dataset.pane;
    document.querySelectorAll(".app-content .tab-pane").forEach((p) => p.classList.add("d-none"));
    document.getElementById(paneId).classList.remove("d-none");
    document.getElementById("pageTitle").textContent = paneTitles[paneId];

    document.getElementById("appSidebar").classList.remove("show");

    if (paneId === "learningPane" && !levels.length) {
      renderLevelsTable();
    }
    if (paneId === "specialPane" && !specialQuestionsLoaded) {
      renderSpecialQuestionsList();
    }
  });
});

document.getElementById("sidebarToggle").addEventListener("click", () => {
  document.getElementById("appSidebar").classList.toggle("show");
});

/* ============================================================
   ANALYTICS
   ============================================================ */
function renderAnalytics() {
  const stats = computeOverallStats(students, exams, submissions);
  renderStatCards(document.getElementById("statCards"), stats);

  const sectionStats = computeSectionStats(students, submissions);
  renderSectionTable(document.getElementById("sectionTableBody"), sectionStats);

  renderBestLearnerAdmin();
  renderAllTimePythonTopperAdmin();
  renderToppersCarousel();
  renderWeeklyCodingToppers();
  renderStreakLeaderboardAdmin();
  renderChartPane();
  applyFiltersAndRenderResults();
}

function renderStreakLeaderboardAdmin() {
  const section = document.getElementById("streakChampionsSection");
  const grid = document.getElementById("streakChampionGrid");
  if (!section || !grid) return;
  const byStudent = {};
  for (const a of dailyLearningActivity) {
    if (!byStudent[a.studentId]) byStudent[a.studentId] = [];
    byStudent[a.studentId].push(a);
  }
  const rows = students.map((st) => {
    const stats = calculateStreakStats(byStudent[st.uid] || []);
    return { uid: st.uid, name: st.name, rollNumber: st.rollNumber, section: st.section, streak: stats.currentStreak, bestStreak: stats.bestStreak, todayQualified: stats.todayQualified };
  }).filter(x => x.streak > 0 || x.bestStreak > 0).sort((a,b) => b.streak - a.streak || b.bestStreak - a.bestStreak || a.name.localeCompare(b.name));
  const top = rows.slice(0, 10);
  if (!top.length) { section.classList.add("d-none"); publishStreakLeaderboard([]).catch(()=>{}); return; }
  section.classList.remove("d-none");
  grid.innerHTML = top.map((e,i) => `<div class="streak-champion-card"><div class="streak-rank">${["🥇","🥈","🥉"][i] || `#${i+1}`}</div><div class="flex-grow-1"><strong>${escapeHtml(e.name)}</strong><div class="small text-muted">${escapeHtml(e.rollNumber || "")} · ${escapeHtml(e.section || "")} · Best ${e.bestStreak} days</div></div><div class="text-end"><div class="fw-bold">🔥 ${e.streak}</div><div class="small text-muted">${e.todayQualified ? "Today done" : "Today pending"}</div></div></div>`).join("");
  publishStreakLeaderboard(top.slice(0,5).map((e,i) => ({ rank:i+1, name:e.name, section:e.section, streak:e.streak, bestStreak:e.bestStreak }))).catch(()=>{});
}

let topperCarouselInstances = [];

function renderToppersCarousel() {
  const section = document.getElementById("toppersSection");
  const entries = computeWeeklyToppers(students, submissions, exams);

  if (!entries.length) {
    section.classList.add("d-none");
    publishWeeklyToppers([]).catch(() => {});
    return;
  }
  section.classList.remove("d-none");

  topperCarouselInstances.forEach((c) => c.dispose());
  topperCarouselInstances = renderTopperGrid(document.getElementById("topperGrid"), entries);

  // Publish a trimmed copy (no exam names/roll numbers beyond what's
  // needed) so students can see the same leaderboard - they can't
  // compute it themselves since they can only read their own
  // submissions.
  publishWeeklyToppers(entries).catch(() => {});
}

let bestLearnerPublished = false;

function renderBestLearnerAdmin() {
  const section = document.getElementById("bestLearnerSection");
  const entries = computeBestLearner(students, studentPoints);

  if (!entries.length) {
    section.classList.add("d-none");
    if (bestLearnerPublished) publishBestLearner([]).catch(() => {});
    return;
  }

  section.classList.remove("d-none");
  renderBestLearner(document.getElementById("bestLearnerGrid"), entries);
  publishBestLearner(entries).then(() => { bestLearnerPublished = true; }).catch(() => {});
}

let pythonTopperPublished = false;

function renderAllTimePythonTopperAdmin() {
  const section = document.getElementById("pythonTopperSection");
  const entries = computeAllTimePythonTopper(students, submissions, exams);

  if (!entries.length) {
    section.classList.add("d-none");
    if (pythonTopperPublished) publishAllTimePythonTopper([]).catch(() => {});
    return;
  }

  section.classList.remove("d-none");
  renderAllTimePythonTopper(document.getElementById("pythonTopperGrid"), entries);
  publishAllTimePythonTopper(entries).then(() => { pythonTopperPublished = true; }).catch(() => {});
}

let codingTopperPublished = false;

function renderWeeklyCodingToppers() {
  const section = document.getElementById("codingToppersSection");
  const entries = computeWeeklyCodingToppers(students, submissions, exams);

  if (!entries.length) {
    section.classList.add("d-none");
    if (codingTopperPublished) {
      publishWeeklyCodingToppers([]).catch(() => {});
    }
    return;
  }

  section.classList.remove("d-none");
  renderCodingToppers(document.getElementById("codingTopperGrid"), entries);

  publishWeeklyCodingToppers(entries)
    .then(() => { codingTopperPublished = true; })
    .catch(() => {});
}

function renderChartPane() {
  const filterEl = document.getElementById("chartExamFilter");
  const previousValue = filterEl.value || "all";

  filterEl.innerHTML =
    `<option value="all">All Exams</option>` +
    exams.map((e) => `<option value="${e.id}">${e.title}</option>`).join("");
  filterEl.value = [...filterEl.options].some((o) => o.value === previousValue) ? previousValue : "all";
  filterEl.onchange = renderChartPane;

  const chartSectionStats = computeSectionStats(students, submissions, filterEl.value);
  sectionChartInstance = renderSectionChart(
    document.getElementById("sectionChart"),
    chartSectionStats,
    sectionChartInstance
  );
}

/* ============================================================
   RESULTS + FILTERS + EXCEL EXPORT
   ============================================================ */
function populateFilterOptions() {
  const examSelect = document.getElementById("filterExam");
  examSelect.innerHTML =
    `<option value="all">All Exams</option>` +
    exams.map((e) => `<option value="${e.id}">${e.title}</option>`).join("");

  const studentSelect = document.getElementById("filterStudent");
  studentSelect.innerHTML =
    `<option value="all">All Students</option>` +
    students.map((s) => `<option value="${s.uid}">${s.name} (${s.rollNumber})</option>`).join("");

  ["filterExam", "filterSection", "filterStudent", "filterDate"].forEach((id) => {
    document.getElementById(id).addEventListener("change", applyFiltersAndRenderResults);
  });
}

function currentFilters() {
  return {
    examId: document.getElementById("filterExam").value,
    section: document.getElementById("filterSection").value,
    studentId: document.getElementById("filterStudent").value,
    date: document.getElementById("filterDate").value
  };
}

function applyFiltersAndRenderResults() {
  const filters = currentFilters();
  const rows = buildResultRowsWithAbsent(submissions, students, exams, filters, schedulesByExamId);
  renderResultsTable(document.getElementById("resultsTableBody"), rows);

  document.querySelectorAll("[data-view-code]").forEach((btn) => {
    btn.addEventListener("click", () => openCodeSubmissionsModal(btn.dataset.viewCode, btn.dataset.examId));
  });

  const reportTitle = buildReportTitle(filters, exams);
  const filtersText = buildFiltersText(filters, exams, students);
  const resultColumns = [
    { key: "rollNumber", label: "Roll Number", width: 14, type: "text" },
    { key: "name", label: "Name", width: 22, type: "text" },
    { key: "section", label: "Section", width: 10, type: "text" },
    { key: "examTitle", label: "Exam", width: 26, type: "text" },
    { key: "score", label: "Score", width: 10, type: "number" },
    { key: "percentage", label: "Percentage", width: 12, type: "percentage" },
    { key: "result", label: "Result", width: 10, type: "status" },
    { key: "status", label: "Status", width: 16, type: "text" },
    { key: "violations", label: "Violations", width: 12, type: "number" },
    { key: "submittedAt", label: "Submitted Time", width: 22, type: "date" }
  ];

  document.getElementById("exportExcelBtn").onclick = async () => {
    const btn = document.getElementById("exportExcelBtn");
    btn.disabled = true;
    try {
      await exportResultsToExcel(rows, resultColumns, {
        filename: `${reportTitle.replace(/\s+/g, "-")}.xlsx`,
        sheetName: "Results",
        title: reportTitle,
        filtersText
      });
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById("exportResultsPdfBtn").onclick = () => {
    const scores = rows.map((r) => Number(r.percentage)).filter((n) => !Number.isNaN(n));
    const passCount = rows.filter((r) => r.result === "PASS").length;
    const failCount = rows.filter((r) => r.result === "FAIL").length;
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;

    generateReportPDF({
      title: reportTitle,
      filtersText,
      summaryCards: [
        { label: "Total Records", value: rows.length },
        { label: "Average %", value: `${avg}%` },
        { label: "Passed", value: passCount },
        { label: "Failed", value: failCount }
      ],
      columns: resultColumns,
      rows,
      filename: `${reportTitle.replace(/\s+/g, "-")}.pdf`
    });
  };
}

/* ============================================================
   STUDENTS
   ============================================================ */
function populateSectionControls() {
  const pillsWrap = document.getElementById("sectionPills");
  SECTIONS.forEach((section) => {
    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-outline-secondary section-pill";
    btn.dataset.section = section;
    btn.textContent = section;
    pillsWrap.appendChild(btn);
  });
  pillsWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".section-pill");
    if (!btn) return;
    currentSectionFilter = btn.dataset.section;
    [...pillsWrap.children].forEach((c) => c.classList.replace("btn-brand", "btn-outline-secondary"));
    btn.classList.replace("btn-outline-secondary", "btn-brand");
    renderStudentsTable();
  });

  document.getElementById("studentSectionInput").innerHTML = SECTIONS.map((s) => `<option value="${s}">${s}</option>`).join("");

  const filterSection = document.getElementById("filterSection");
  SECTIONS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    filterSection.appendChild(opt);
  });
}

function renderStudentsTable() {
  const filtered = (currentSectionFilter === "all" ? students : students.filter((s) => s.section === currentSectionFilter))
    .slice()
    .sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true, sensitivity: "base" }));
  const tbody = document.getElementById("studentsTableBody");

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No students in this section yet.</td></tr>`;
  } else {
    tbody.innerHTML = filtered
      .map(
        (s) => `
        <tr>
          <td>${s.rollNumber}</td>
          <td>${s.name}</td>
          <td><span class="badge bg-secondary">${s.section}</span></td>
          <td>${s.email}</td>
          <td>
            ${
              s.passwordPlain
                ? `<span class="password-mask" data-password-cell="${s.uid}">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                   <button class="btn btn-sm btn-link p-0 ms-1" data-reveal-password="${s.uid}" title="Show/hide"><i class="bi bi-eye"></i></button>`
                : `<span class="text-muted small">Not set</span>
                   <button class="btn btn-sm btn-link p-0 ms-1" data-set-password="${s.uid}">Set</button>`
            }
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1" data-edit="${s.uid}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-delete="${s.uid}"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openEditStudent(btn.dataset.edit)));
    tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDeleteStudent(btn.dataset.delete)));
    tbody.querySelectorAll("[data-reveal-password]").forEach((btn) =>
      btn.addEventListener("click", () => togglePasswordCell(btn))
    );
    tbody.querySelectorAll("[data-set-password]").forEach((btn) =>
      btn.addEventListener("click", () => openEditStudent(btn.dataset.setPassword))
    );
  }

  wireStudentExportButtons(filtered);
}

function wireStudentExportButtons(filtered) {
  const title =
    currentSectionFilter === "all" ? "All Students Report" : `Section ${currentSectionFilter} Students Report`;
  const columns = [
    { key: "rollNumber", label: "Roll Number", width: 14, type: "text" },
    { key: "name", label: "Name", width: 22, type: "text" },
    { key: "section", label: "Section", width: 10, type: "text" },
    { key: "email", label: "Email", width: 28, type: "text" },
    { key: "passwordPlain", label: "Password", width: 18, type: "text" }
  ];
  // Fall back to a readable label instead of a blank cell for students
  // who don't have a password on record yet.
  const rows = filtered.map((s) => ({ ...s, passwordPlain: s.passwordPlain || "Not Set" }));

  document.getElementById("exportStudentsExcelBtn").onclick = async () => {
    const btn = document.getElementById("exportStudentsExcelBtn");
    btn.disabled = true;
    try {
      await exportResultsToExcel(rows, columns, {
        filename: `${title.replace(/\s+/g, "-")}.xlsx`,
        sheetName: "Students",
        title,
        filtersText: `Section: ${currentSectionFilter === "all" ? "All" : currentSectionFilter}`
      });
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById("exportStudentsPdfBtn").onclick = () => {
    generateReportPDF({
      title,
      filtersText: `Section: ${currentSectionFilter === "all" ? "All" : currentSectionFilter}`,
      summaryCards: [{ label: "Total Students", value: rows.length }],
      columns,
      rows,
      filename: `${title.replace(/\s+/g, "-")}.pdf`
    });
  };
}

function togglePasswordCell(btn) {
  const uid = btn.dataset.revealPassword;
  const cell = document.querySelector(`[data-password-cell="${uid}"]`);
  const student = students.find((s) => s.uid === uid);
  const icon = btn.querySelector("i");
  const isMasked = cell.dataset.revealed !== "true";

  if (isMasked) {
    cell.textContent = student?.passwordPlain || "(not set)";
    cell.dataset.revealed = "true";
    icon.className = "bi bi-eye-slash";
  } else {
    cell.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    cell.dataset.revealed = "false";
    icon.className = "bi bi-eye";
  }
}

function resetStudentForm() {
  document.getElementById("studentForm").reset();
  document.getElementById("studentFormError").classList.add("d-none");
  document.getElementById("studentCreatedInfo").classList.add("d-none");
}

document.getElementById("addStudentBtn").addEventListener("click", () => {
  editingStudentUid = null;
  resetStudentForm();
  document.getElementById("studentModalTitle").textContent = "Add Student";
  document.getElementById("studentEmailInput").disabled = false;
  document.getElementById("studentPasswordInput").required = true;
  document.getElementById("studentPasswordHelp").textContent = "The student logs in with this email + password.";
  document.getElementById("resetPasswordGroup").classList.add("d-none");
});

function openEditStudent(uid) {
  const student = students.find((s) => s.uid === uid);
  if (!student) return;
  editingStudentUid = uid;
  resetStudentForm();
  document.getElementById("studentModalTitle").textContent = "Edit Student";
  document.getElementById("studentNameInput").value = student.name;
  document.getElementById("studentRollInput").value = student.rollNumber;
  document.getElementById("studentSectionInput").value = student.section;
  document.getElementById("studentEmailInput").value = student.email;
  document.getElementById("studentEmailInput").disabled = true;
  document.getElementById("studentPasswordInput").value = student.passwordPlain || "";
  document.getElementById("studentPasswordInput").required = false;
  document.getElementById("studentPasswordHelp").textContent =
    "Shown in the Students table. Leave unchanged to keep the current value.";
  document.getElementById("resetPasswordGroup").classList.remove("d-none");
  new bootstrap.Modal(document.getElementById("studentModal")).show();
}

document.getElementById("togglePasswordBtn").addEventListener("click", () => {
  const input = document.getElementById("studentPasswordInput");
  const icon = document.querySelector("#togglePasswordBtn i");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  icon.className = show ? "bi bi-eye-slash" : "bi bi-eye";
});

document.getElementById("generatePasswordBtn").addEventListener("click", () => {
  const random = Math.random().toString(36).slice(-8);
  const input = document.getElementById("studentPasswordInput");
  input.value = random;
  input.type = "text";
  document.querySelector("#togglePasswordBtn i").className = "bi bi-eye-slash";
});

document.getElementById("resetPasswordBtn").addEventListener("click", async () => {
  const email = document.getElementById("studentEmailInput").value.trim();
  try {
    await sendStudentPasswordReset(email);
    const infoEl = document.getElementById("studentCreatedInfo");
    infoEl.textContent = `Password reset email sent to ${email}. Once they set a new one, update the field above to keep this table accurate.`;
    infoEl.classList.remove("d-none");
  } catch (err) {
    const errorEl = document.getElementById("studentFormError");
    errorEl.textContent = err.message || "Could not send reset email.";
    errorEl.classList.remove("d-none");
  }
});

async function handleDeleteStudent(uid) {
  if (!confirm("Delete this student's profile? This cannot be undone.")) return;
  await deleteStudentProfile(uid);
  students = students.filter((s) => s.uid !== uid);
  renderStudentsTable();
  renderAnalytics();
}

document.getElementById("studentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("studentFormError");
  errorEl.classList.add("d-none");

  const name = document.getElementById("studentNameInput").value.trim();
  const rollNumber = document.getElementById("studentRollInput").value.trim();
  const section = document.getElementById("studentSectionInput").value;
  const email = document.getElementById("studentEmailInput").value.trim();
  const password = document.getElementById("studentPasswordInput").value;
  const submitBtn = document.getElementById("studentSubmitBtn");
  submitBtn.disabled = true;

  try {
    if (editingStudentUid) {
      if (password && password.length < 6) {
        errorEl.textContent = "Password must be at least 6 characters.";
        errorEl.classList.remove("d-none");
        submitBtn.disabled = false;
        return;
      }
      const original = students.find((s) => s.uid === editingStudentUid);
      const trimmedInput = password.trim();
      const changedPassword = trimmedInput && trimmedInput !== original?.passwordPlain ? trimmedInput : undefined;
      await updateStudent(editingStudentUid, { name, rollNumber, section, password: changedPassword });
      const idx = students.findIndex((s) => s.uid === editingStudentUid);
      if (idx > -1) {
        students[idx] = { ...students[idx], name, rollNumber, section };
        if (changedPassword) students[idx].passwordPlain = changedPassword;
      }
      renderStudentsTable();
      renderAnalytics();
      bootstrap.Modal.getInstance(document.getElementById("studentModal"))?.hide();
    } else {
      if (!password || password.length < 6) {
        errorEl.textContent = "Password must be at least 6 characters.";
        errorEl.classList.remove("d-none");
        submitBtn.disabled = false;
        return;
      }
      await addStudent({ name, rollNumber, section, email, password });
      const infoEl = document.getElementById("studentCreatedInfo");
      infoEl.textContent = `Student account created. Share the email + password you set with the student directly.`;
      infoEl.classList.remove("d-none");
      await loadEverything();
    }
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong.";
    errorEl.classList.remove("d-none");
  } finally {
    submitBtn.disabled = false;
  }
});

/* ============================================================
   EXAMS
   ============================================================ */
function renderExamsTable() {
  const tbody = document.getElementById("examsTableBody");
  if (!exams.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No exams created yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = exams
    .map((ex) => {
      const schedules = schedulesByExamId[ex.id] || [];
      const windowText = describeExamWindow(ex, schedules);
      const windowSuffix = schedules.length > 1 ? ` <span class="text-muted">(+${schedules.length - 1} more)</span>` : "";
      return `
      <tr>
        <td>${ex.title}</td>
        <td><span class="badge exam-type-badge ${ex.examType || "mcq"}">${(ex.examType || "mcq").toUpperCase()}</span></td>
        <td>${ex.duration} min</td>
        <td>${ex.totalMarks}</td>
        <td class="small">${windowText}${windowSuffix}</td>
        <td>${ex.active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-schedules="${ex.id}" title="Manage Schedules"><i class="bi bi-calendar-week"></i></button>
          <button class="btn btn-sm btn-outline-secondary me-1" data-questions="${ex.id}" title="Manage Questions"><i class="bi bi-list-check"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1" data-edit-exam="${ex.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm ${ex.active ? "btn-outline-warning" : "btn-outline-success"} me-1" data-toggle-exam="${ex.id}" title="${ex.active ? "Deactivate" : "Activate"}">
            <i class="bi ${ex.active ? "bi-pause-fill" : "bi-play-fill"}"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" data-delete-exam="${ex.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-schedules]").forEach((btn) => btn.addEventListener("click", () => openSchedulesView(btn.dataset.schedules)));
  tbody.querySelectorAll("[data-questions]").forEach((btn) => btn.addEventListener("click", () => openQuestionsView(btn.dataset.questions)));
  tbody.querySelectorAll("[data-edit-exam]").forEach((btn) => btn.addEventListener("click", () => openEditExam(btn.dataset.editExam)));
  tbody.querySelectorAll("[data-toggle-exam]").forEach((btn) => btn.addEventListener("click", () => handleToggleExam(btn.dataset.toggleExam)));
  tbody.querySelectorAll("[data-delete-exam]").forEach((btn) => btn.addEventListener("click", () => handleDeleteExam(btn.dataset.deleteExam)));
}

document.getElementById("createExamBtn").addEventListener("click", () => {
  editingExamId = null;
  document.getElementById("examForm").reset();
  document.getElementById("examModalTitle").textContent = "Create Exam";
  document.getElementById("examSubmitBtn").textContent = "Create Exam";
  document.getElementById("examFormError").classList.add("d-none");
  document.getElementById("examTypeInput").disabled = false;
  document.getElementById("examMaxViolationsInput").value = 3;
  document.getElementById("examActiveInput").checked = true;
  document.getElementById("examShowResultInput").checked = true;
});

function openEditExam(examId) {
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return;
  editingExamId = examId;
  document.getElementById("examModalTitle").textContent = "Edit Exam";
  document.getElementById("examSubmitBtn").textContent = "Save Changes";
  document.getElementById("examFormError").classList.add("d-none");
  document.getElementById("examTitleInput").value = exam.title;
  document.getElementById("examDescInput").value = exam.description || "";
  document.getElementById("examTypeInput").value = exam.examType || "mcq";
  document.getElementById("examTypeInput").disabled = true; // avoid mismatched questions after creation
  document.getElementById("examMaxViolationsInput").value = exam.maxViolations ?? 3;
  document.getElementById("examDurationInput").value = exam.duration;
  document.getElementById("examMarksInput").value = exam.totalMarks;
  document.getElementById("examActiveInput").checked = !!exam.active;
  document.getElementById("examShowResultInput").checked = exam.showResult !== false;
  new bootstrap.Modal(document.getElementById("examModal")).show();
}

async function handleToggleExam(examId) {
  const exam = exams.find((e) => e.id === examId);
  if (!exam) return;
  await toggleExamActive(examId, !exam.active);
  exam.active = !exam.active;
  renderExamsTable();
}

async function handleDeleteExam(examId) {
  if (!confirm("Delete this exam? Its questions and schedules will remain orphaned unless removed separately. This cannot be undone.")) return;
  await deleteExamDoc(examId);
  exams = exams.filter((e) => e.id !== examId);
  delete schedulesByExamId[examId];
  renderExamsTable();
  populateFilterOptions();
  renderAnalytics();
}

document.getElementById("examForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("examFormError");
  errorEl.classList.add("d-none");

  const data = {
    title: document.getElementById("examTitleInput").value.trim(),
    description: document.getElementById("examDescInput").value.trim(),
    examType: document.getElementById("examTypeInput").value,
    maxViolations: Number(document.getElementById("examMaxViolationsInput").value),
    duration: Number(document.getElementById("examDurationInput").value),
    totalMarks: Number(document.getElementById("examMarksInput").value),
    active: document.getElementById("examActiveInput").checked,
    showResult: document.getElementById("examShowResultInput").checked
  };

  try {
    if (editingExamId) {
      await updateExamDoc(editingExamId, data);
    } else {
      await createExam(data, auth.currentUser?.uid || null);
    }
    bootstrap.Modal.getInstance(document.getElementById("examModal"))?.hide();
    await loadEverything();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save exam.";
    errorEl.classList.remove("d-none");
  }
});

/* ============================================================
   EXAM SCHEDULES (up to 7 date/time slots per exam)
   ============================================================ */
async function openSchedulesView(examId) {
  activeExamForSchedules = exams.find((e) => e.id === examId);
  if (!activeExamForSchedules) return;

  document.getElementById("examsListView").classList.add("d-none");
  document.getElementById("examSchedulesView").classList.remove("d-none");
  document.getElementById("schedulesExamTitle").textContent = `Manage Schedules - ${activeExamForSchedules.title}`;

  examSchedules = await listSchedulesForExam(examId);
  schedulesByExamId[examId] = examSchedules;
  renderSchedulesList();
}

document.getElementById("backToExamsFromSchedulesBtn").addEventListener("click", () => {
  document.getElementById("examSchedulesView").classList.add("d-none");
  document.getElementById("examsListView").classList.remove("d-none");
  renderExamsTable();
});

function renderSchedulesList() {
  const wrap = document.getElementById("schedulesList");
  const addBtn = document.getElementById("addScheduleBtn");
  addBtn.disabled = examSchedules.length >= MAX_SCHEDULES_PER_EXAM;
  addBtn.title = addBtn.disabled ? `Maximum of ${MAX_SCHEDULES_PER_EXAM} schedules reached` : "";

  if (!examSchedules.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-3">No schedules added yet. This exam has no time restriction until you add at least one.</div>`;
    return;
  }

  wrap.innerHTML = examSchedules
    .map(
      (s, i) => `
      <div class="question-card p-3 d-flex justify-content-between align-items-center">
        <div>
          <span class="badge bg-secondary me-2">${i + 1}</span>
          <strong>${formatScheduleWindow(s, activeExamForSchedules.duration)}</strong>
          <div class="small text-muted mt-1">${formatScheduleSections(s)}</div>
        </div>
        <div class="text-nowrap">
          <button class="btn btn-sm btn-outline-primary me-1" data-edit-schedule="${s.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-delete-schedule="${s.id}"><i class="bi bi-trash"></i></button>
        </div>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-edit-schedule]").forEach((btn) =>
    btn.addEventListener("click", () => openScheduleModal(examSchedules.find((s) => s.id === btn.dataset.editSchedule)))
  );
  wrap.querySelectorAll("[data-delete-schedule]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this schedule? Students will no longer be able to start the exam during this window.")) return;
      await deleteSchedule(btn.dataset.deleteSchedule);
      examSchedules = await listSchedulesForExam(activeExamForSchedules.id);
      schedulesByExamId[activeExamForSchedules.id] = examSchedules;
      renderSchedulesList();
    })
  );
}

document.getElementById("addScheduleBtn").addEventListener("click", () => openScheduleModal());

function populateScheduleSectionCheckboxes(selectedSections = []) {
  const wrap = document.getElementById("scheduleSectionsWrap");
  wrap.innerHTML = SECTIONS.map(
    (s) => `
    <div class="form-check">
      <input class="form-check-input schedule-section-checkbox" type="checkbox" value="${s}" id="scheduleSection${s}" ${selectedSections.includes(s) ? "checked" : ""} />
      <label class="form-check-label" for="scheduleSection${s}">${s}</label>
    </div>`
  ).join("");
}

document.getElementById("scheduleAllSectionsInput").addEventListener("change", (e) => {
  document.getElementById("scheduleSectionsWrap").classList.toggle("d-none", e.target.checked);
});

function openScheduleModal(schedule = null) {
  editingScheduleId = schedule?.id || null;
  document.getElementById("scheduleForm").reset();
  document.getElementById("scheduleFormError").classList.add("d-none");
  document.getElementById("scheduleModalTitle").textContent = schedule ? "Edit Schedule" : "Add Schedule";

  const hasRestriction = !!(schedule?.sections && schedule.sections.length);
  document.getElementById("scheduleAllSectionsInput").checked = !hasRestriction;
  document.getElementById("scheduleSectionsWrap").classList.toggle("d-none", !hasRestriction);
  populateScheduleSectionCheckboxes(schedule?.sections || []);

  if (schedule) {
    const d = new Date(schedule.startTime);
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("scheduleDateInput").value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    document.getElementById("scheduleTimeInput").value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  new bootstrap.Modal(document.getElementById("scheduleModal")).show();
}

document.getElementById("scheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("scheduleFormError");
  errorEl.classList.add("d-none");

  const date = document.getElementById("scheduleDateInput").value;
  const time = document.getElementById("scheduleTimeInput").value;
  const startTime = new Date(`${date}T${time}`).toISOString();

  const allSections = document.getElementById("scheduleAllSectionsInput").checked;
  const sections = allSections
    ? []
    : [...document.querySelectorAll(".schedule-section-checkbox:checked")].map((cb) => cb.value);

  if (!allSections && !sections.length) {
    errorEl.textContent = 'Select at least one section, or check "All Sections".';
    errorEl.classList.remove("d-none");
    return;
  }

  if (!editingScheduleId && examSchedules.length >= MAX_SCHEDULES_PER_EXAM) {
    errorEl.textContent = `This exam already has the maximum of ${MAX_SCHEDULES_PER_EXAM} schedules.`;
    errorEl.classList.remove("d-none");
    return;
  }

  try {
    if (editingScheduleId) {
      await updateSchedule(editingScheduleId, startTime, sections);
    } else {
      await createSchedule(activeExamForSchedules.id, startTime, sections);
    }
    bootstrap.Modal.getInstance(document.getElementById("scheduleModal"))?.hide();
    examSchedules = await listSchedulesForExam(activeExamForSchedules.id);
    schedulesByExamId[activeExamForSchedules.id] = examSchedules;
    renderSchedulesList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save schedule.";
    errorEl.classList.remove("d-none");
  }
});

/* ============================================================
   QUESTIONS (MCQ + Coding)
   ============================================================ */
async function openQuestionsView(examId) {
  activeExamForQuestions = exams.find((e) => e.id === examId);
  if (!activeExamForQuestions) return;

  document.getElementById("examsListView").classList.add("d-none");
  document.getElementById("examQuestionsView").classList.remove("d-none");
  document.getElementById("questionsExamTitle").textContent = `Manage Questions - ${activeExamForQuestions.title}`;

  const addBtn = document.getElementById("addQuestionBtn");
  addBtn.innerHTML =
    activeExamForQuestions.examType === "coding"
      ? '<i class="bi bi-plus-lg me-1"></i>Add Coding Question'
      : '<i class="bi bi-plus-lg me-1"></i>Add MCQ Question';
  addBtn.onclick = () =>
    activeExamForQuestions.examType === "coding" ? openCodingModal() : openMcqModal();

  questions = await listQuestionsForExam(examId);
  renderQuestionsList();
}

document.getElementById("backToExamsBtn").addEventListener("click", () => {
  document.getElementById("examQuestionsView").classList.add("d-none");
  document.getElementById("examsListView").classList.remove("d-none");
});

function renderQuestionsList() {
  const wrap = document.getElementById("questionsList");
  if (!questions.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-4">No questions added yet.</div>`;
    return;
  }

  wrap.innerHTML = questions
    .map((q, i) => {
      const publishedBadge = q.published
        ? '<span class="badge bg-success">Published</span>'
        : '<span class="badge bg-secondary">Draft</span>';

      if (q.type === "mcq") {
        return `
        <div class="question-card p-3">
          <div class="d-flex justify-content-between">
            <div>
              <span class="badge bg-secondary me-2">Q${i + 1}</span>
              <strong>${q.questionText}</strong>
              <div class="text-muted small mt-1">${q.marks} marks &middot; ${q.options.length} options</div>
            </div>
            <div class="text-nowrap">
              ${publishedBadge}
              <button class="btn btn-sm btn-outline-primary ms-2 me-1" data-edit-q="${q.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-q="${q.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
      }
      const difficultyBadge =
        q.difficulty === "easy" ? "bg-success" : q.difficulty === "hard" ? "bg-danger" : "bg-warning text-dark";
      return `
        <div class="question-card p-3">
          <div class="d-flex justify-content-between">
            <div>
              <span class="badge bg-secondary me-2">Q${i + 1}</span>
              <strong>${q.title}</strong>
              <span class="badge ${difficultyBadge} ms-1">${(q.difficulty || "medium").toUpperCase()}</span>
              <div class="text-muted small mt-1">
                ${q.marks} marks &middot; ${q.timeLimit || "-"}s time limit &middot;
                ${(q.visibleTestCases || []).length} public / ${(q.hiddenTestCases || []).length} hidden test cases
              </div>
            </div>
            <div class="text-nowrap">
              ${publishedBadge}
              <button class="btn btn-sm btn-outline-primary ms-2 me-1" data-edit-q="${q.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-q="${q.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  wrap.querySelectorAll("[data-edit-q]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const q = questions.find((x) => x.id === btn.dataset.editQ);
      if (!q) return;
      q.type === "mcq" ? openMcqModal(q) : openCodingModal(q);
    })
  );
  wrap.querySelectorAll("[data-delete-q]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this question? This cannot be undone.")) return;
      await deleteQuestionDoc(btn.dataset.deleteQ);
      questions = questions.filter((x) => x.id !== btn.dataset.deleteQ);
      renderQuestionsList();
    })
  );
}

/* ---------- MCQ modal ---------- */
function openMcqModal(question = null) {
  editingQuestionId = question?.id || null;
  document.getElementById("mcqForm").reset();
  document.getElementById("mcqFormError").classList.add("d-none");

  const optionsWrap = document.getElementById("mcqOptionsWrap");
  optionsWrap.innerHTML = "";
  const options = question?.options || ["", "", "", ""];
  options.forEach((val, i) => addMcqOptionRow(val, question?.correctOptionIndex === i));

  document.getElementById("mcqQuestionText").value = question?.questionText || "";
  document.getElementById("mcqMarksInput").value = question?.marks || "";

  new bootstrap.Modal(document.getElementById("mcqModal")).show();
}

function addMcqOptionRow(value = "", checked = false) {
  const wrap = document.getElementById("mcqOptionsWrap");
  const row = document.createElement("div");
  row.className = "input-group";
  row.innerHTML = `
    <span class="input-group-text"><input type="radio" name="mcqCorrect" class="form-check-input mt-0" ${checked ? "checked" : ""}></span>
    <input type="text" class="form-control" placeholder="Option text" value="${value.replace(/"/g, "&quot;")}" required />
    <button type="button" class="btn btn-outline-danger" data-remove-option><i class="bi bi-x"></i></button>
  `;
  row.querySelector("[data-remove-option]").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

document.getElementById("mcqForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("mcqFormError");
  errorEl.classList.add("d-none");

  const rows = [...document.querySelectorAll("#mcqOptionsWrap .input-group")];
  const options = rows.map((r) => r.querySelector("input[type=text]").value.trim());
  const correctIndex = rows.findIndex((r) => r.querySelector("input[type=radio]").checked);

  if (options.some((o) => !o) || options.length < 2) {
    errorEl.textContent = "Please fill in at least 2 options.";
    errorEl.classList.remove("d-none");
    return;
  }
  if (correctIndex === -1) {
    errorEl.textContent = "Please mark the correct option.";
    errorEl.classList.remove("d-none");
    return;
  }

  const data = {
    examId: activeExamForQuestions.id,
    type: "mcq",
    published: true,
    questionText: document.getElementById("mcqQuestionText").value.trim(),
    options,
    correctOptionIndex: correctIndex,
    marks: Number(document.getElementById("mcqMarksInput").value)
  };

  try {
    if (editingQuestionId) {
      await updateQuestionDoc(editingQuestionId, data);
    } else {
      await addQuestion(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("mcqModal"))?.hide();
    questions = await listQuestionsForExam(activeExamForQuestions.id);
    renderQuestionsList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.classList.remove("d-none");
  }
});

// Allow adding more than 4 options via keyboard shortcut isn't needed;
// admins can duplicate rows by editing the 4 defaults, but let's also
// expose a quick "+" affordance by double-clicking the wrap (simple, no extra UI clutter).
document.getElementById("mcqOptionsWrap").addEventListener("dblclick", () => addMcqOptionRow());

/* ---------- Coding modal ---------- */
function addDynamicRow(containerId, rowType, initial = {}) {
  const wrap = document.getElementById(containerId);
  const row = document.createElement("div");
  row.className = "row g-2 align-items-start";

  const isTest = rowType === "test";
  const weightCol = isTest
    ? `<div class="col-2">
         <textarea class="form-control mono" rows="2" placeholder="Weight (opt.)" data-field="weight">${initial.weight ?? ""}</textarea>
       </div>`
    : "";
  const outputColClass = isTest ? "col-3" : "col-5";

  row.innerHTML = `
    <div class="col-5">
      <textarea class="form-control mono" rows="2" placeholder="Input" data-field="input">${initial.input || ""}</textarea>
    </div>
    <div class="${outputColClass}">
      <textarea class="form-control mono" rows="2" placeholder="Expected Output" data-field="output">${initial.output || initial.expectedOutput || ""}</textarea>
    </div>
    ${weightCol}
    <div class="col-2">
      <button type="button" class="btn btn-outline-danger btn-sm" data-remove-row><i class="bi bi-x"></i></button>
    </div>
  `;
  row.querySelector("[data-remove-row]").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

document.querySelectorAll("[data-add-row]").forEach((btn) => {
  btn.addEventListener("click", () => addDynamicRow(btn.dataset.addRow, btn.dataset.rowType));
});

function collectDynamicRows(containerId, isTestCase) {
  return [...document.getElementById(containerId).children].map((row) => {
    const input = row.querySelector('[data-field="input"]').value;
    const output = row.querySelector('[data-field="output"]').value;
    if (!isTestCase) return { input, output };
    const weightField = row.querySelector('[data-field="weight"]');
    const weight = weightField && weightField.value !== "" ? Number(weightField.value) : null;
    return { input, expectedOutput: output, weight };
  });
}

function openCodingModal(question = null) {
  editingQuestionId = question?.id || null;
  document.getElementById("codingForm").reset();
  document.getElementById("codingFormError").classList.add("d-none");
  document.getElementById("testRunOutput").classList.add("d-none");
  document.getElementById("testRunOutput").innerHTML = "";

  document.getElementById("codingTitleInput").value = question?.title || "";
  document.getElementById("codingDescInput").value = question?.description || "";
  document.getElementById("codingInputDescInput").value = question?.inputDescription || "";
  document.getElementById("codingOutputDescInput").value = question?.outputDescription || "";
  document.getElementById("codingConstraintsInput").value = question?.constraints || "";
  document.getElementById("codingDifficultyInput").value = question?.difficulty || "medium";
  document.getElementById("codingMarksInput").value = question?.marks || "";
  document.getElementById("codingTimeLimitInput").value = question?.timeLimit || 5;
  document.getElementById("codingMemoryLimitInput").value = question?.memoryLimit || 256;
  document.getElementById("codingStarterInput").value = question?.starterCode || "";

  ["examplesWrap", "visibleTestsWrap", "hiddenTestsWrap"].forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });

  (question?.examples || [{}]).forEach((ex) => addDynamicRow("examplesWrap", "example", ex));
  (question?.visibleTestCases || [{}]).forEach((tc) => addDynamicRow("visibleTestsWrap", "test", tc));
  (question?.hiddenTestCases || [{}]).forEach((tc) => addDynamicRow("hiddenTestsWrap", "test", tc));

  new bootstrap.Modal(document.getElementById("codingModal")).show();
}

function collectCodingFormData() {
  return {
    examId: activeExamForQuestions.id,
    type: "coding",
    language: "python",
    allowedLanguages: ["python"],
    title: document.getElementById("codingTitleInput").value.trim(),
    description: document.getElementById("codingDescInput").value.trim(),
    inputDescription: document.getElementById("codingInputDescInput").value.trim(),
    outputDescription: document.getElementById("codingOutputDescInput").value.trim(),
    constraints: document.getElementById("codingConstraintsInput").value.trim(),
    difficulty: document.getElementById("codingDifficultyInput").value,
    marks: Number(document.getElementById("codingMarksInput").value),
    timeLimit: Number(document.getElementById("codingTimeLimitInput").value),
    memoryLimit: Number(document.getElementById("codingMemoryLimitInput").value),
    starterCode: document.getElementById("codingStarterInput").value,
    examples: collectDynamicRows("examplesWrap", false).filter((r) => r.input || r.output),
    visibleTestCases: collectDynamicRows("visibleTestsWrap", true).filter((r) => r.input || r.expectedOutput),
    hiddenTestCases: collectDynamicRows("hiddenTestsWrap", true).filter((r) => r.input || r.expectedOutput)
  };
}

document.getElementById("codingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("codingFormError");
  errorEl.classList.add("d-none");

  const publish = document.activeElement?.dataset?.publish === "true";
  const data = { ...collectCodingFormData(), published: publish };

  if (!data.visibleTestCases.length && !data.hiddenTestCases.length) {
    errorEl.textContent = "Add at least one test case (public or hidden).";
    errorEl.classList.remove("d-none");
    return;
  }

  try {
    if (editingQuestionId) {
      await updateQuestionDoc(editingQuestionId, data);
    } else {
      await addQuestion(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("codingModal"))?.hide();
    questions = await listQuestionsForExam(activeExamForQuestions.id);
    renderQuestionsList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.classList.remove("d-none");
  }
});

/* ---------- Preview (read-only, as a student would see it) ---------- */
document.getElementById("previewQuestionBtn").addEventListener("click", () => {
  const q = collectCodingFormData();
  const samplesHtml = (q.examples || [])
    .map((ex, i) => `<div class="mb-2"><div class="small text-muted">Sample ${i + 1}</div><div class="testcase-result">Input:\n${ex.input}\n\nOutput:\n${ex.output}</div></div>`)
    .join("");

  document.getElementById("previewBody").innerHTML = `
    <div class="d-flex justify-content-between mb-2">
      <span class="badge ${q.difficulty === "easy" ? "bg-success" : q.difficulty === "hard" ? "bg-danger" : "bg-warning text-dark"}">${q.difficulty.toUpperCase()}</span>
      <span class="badge bg-brand">${q.marks || 0} marks</span>
    </div>
    <h5>${q.title || "(untitled)"}</h5>
    <p>${q.description || ""}</p>
    ${q.inputDescription ? `<p class="small"><strong>Input:</strong> ${q.inputDescription}</p>` : ""}
    ${q.outputDescription ? `<p class="small"><strong>Output:</strong> ${q.outputDescription}</p>` : ""}
    ${q.constraints ? `<p class="small text-muted"><strong>Constraints:</strong> ${q.constraints}</p>` : ""}
    ${samplesHtml}
    <label class="form-label fw-semibold mt-2">Starter Code</label>
    <pre class="mono bg-light p-2 rounded">${q.starterCode || ""}</pre>
  `;
  new bootstrap.Modal(document.getElementById("previewModal")).show();
});

/* ---------- Test Run (admin verifies ALL test cases, incl. hidden, before publishing) ---------- */
document.getElementById("testRunQuestionBtn").addEventListener("click", async () => {
  const outputEl = document.getElementById("testRunOutput");
  outputEl.classList.remove("d-none");
  outputEl.innerHTML = `<div class="small text-muted mt-2">Loading Python and running all test cases...</div>`;

  const q = collectCodingFormData();
  const allTests = [...q.visibleTestCases, ...q.hiddenTestCases];
  if (!allTests.length) {
    outputEl.innerHTML = `<div class="alert alert-warning small mt-2">Add at least one test case first.</div>`;
    return;
  }
  if (!q.starterCode.trim()) {
    outputEl.innerHTML = `<div class="alert alert-warning small mt-2">Add starter code to test-run against.</div>`;
    return;
  }

  try {
    const { ensurePyodide, runAllTestCases } = await import("./python-runner.js");
    const pyodide = await ensurePyodide();
    const results = await runAllTestCases(pyodide, q.starterCode, allTests, (q.timeLimit || 5) * 1000);

    outputEl.innerHTML =
      `<div class="small fw-semibold mt-3 mb-1">Test Run Results (against starter code)</div>` +
      results
        .map(
          (r, i) => `
          <div class="testcase-result ${r.passed ? "pass" : "fail"} mb-2">
            <div><strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong> &middot; ${r.executionStatus} &middot; ${r.executionTimeMs} ms</div>
            <div>Input: ${r.input || "(none)"}</div>
            <div>Expected: ${r.expectedOutput}</div>
            <div>Got: ${r.actualOutput}</div>
            ${r.errorMessage ? `<div>Error: ${r.errorMessage}</div>` : ""}
          </div>`
        )
        .join("");
  } catch (err) {
    outputEl.innerHTML = `<div class="alert alert-danger small mt-2">Could not run: ${err.message}</div>`;
  }
});

/* ============================================================
   ADMIN: VIEW A STUDENT'S CODE SUBMISSION HISTORY (per exam)
   ============================================================ */
async function openCodeSubmissionsModal(studentId, examIdForCode) {
  const body = document.getElementById("codeSubmissionsBody");
  body.innerHTML = `<div class="text-muted small">Loading submissions...</div>`;
  new bootstrap.Modal(document.getElementById("codeSubmissionsModal")).show();

  const student = students.find((s) => s.uid === studentId);
  const exam = exams.find((e) => e.id === examIdForCode);
  const examQuestions = await listQuestionsForExam(examIdForCode);
  const subs = await listCodeSubmissionsForExam(studentId, examIdForCode);

  if (!subs.length) {
    body.innerHTML = `<div class="text-muted small">No code submissions recorded for ${student?.name || "this student"} on this exam.</div>`;
    return;
  }

  const byQuestion = {};
  subs.forEach((s) => {
    (byQuestion[s.questionId] = byQuestion[s.questionId] || []).push(s);
  });

  body.innerHTML = Object.entries(byQuestion)
    .map(([questionId, attempts]) => {
      const q = examQuestions.find((x) => x.id === questionId);
      attempts.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      return `
        <h6 class="mt-2">${q?.title || "Deleted question"}</h6>
        ${attempts
          .map(
            (a) => `
          <div class="question-card p-2 mb-2">
            <div class="d-flex justify-content-between small text-muted">
              <span>${new Date(a.submittedAt).toLocaleString()}</span>
              <span>${a.testCasesPassed}/${a.totalTestCases} passed &middot; ${a.marksObtained} marks &middot; ${a.executionTimeMs} ms</span>
            </div>
            <pre class="mono bg-light p-2 rounded mt-1 mb-0" style="white-space:pre-wrap;">${(a.sourceCode || "").replace(/</g, "&lt;")}</pre>
            ${a.errorMessage ? `<div class="text-danger small mt-1">${a.errorMessage}</div>` : ""}
          </div>`
          )
          .join("")}
      `;
    })
    .join("");
}

/* ============================================================
   LEARNING SECTION - LEVELS
   ============================================================ */
function escapeHtmlL(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function renderLevelsTable() {
  levels = await listLevels();
  const tbody = document.getElementById("levelsTableBody");

  if (!levels.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No learning levels created yet.</td></tr>`;
    return;
  }

  const counts = await Promise.all(
    levels.map(async (lvl) => ({
      id: lvl.id,
      concepts: (await listConcepts(lvl.id)).length,
      mcqs: (await listMcqQuestions(lvl.id)).length,
      coding: (await listLearningCodingQuestions(lvl.id)).length
    }))
  );
  const countsById = Object.fromEntries(counts.map((c) => [c.id, c]));

  // Keep a cached concept total on each level. Student dashboards use this
  // value instead of downloading every concept document. This is also a
  // one-time migration for existing levels that do not have conceptCount.
  await Promise.all(
    counts.map(async (c) => {
      const lvl = levels.find((item) => item.id === c.id);
      if (!lvl || Number(lvl.conceptCount) === c.concepts) return;
      try {
        await updateLevel(c.id, { conceptCount: c.concepts });
        lvl.conceptCount = c.concepts;
      } catch (err) {
        console.warn(`Could not update conceptCount for level ${c.id}:`, err);
      }
    })
  );

  tbody.innerHTML = levels
    .map(
      (lvl) => `
      <tr>
        <td>${escapeHtmlL(lvl.title)}</td>
        <td>${countsById[lvl.id]?.concepts ?? 0}</td>
        <td>${countsById[lvl.id]?.mcqs ?? 0}</td>
        <td>${countsById[lvl.id]?.coding ?? 0}</td>
        <td>${lvl.passMark ?? 40}%</td>
        <td>${lvl.active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-manage-level="${lvl.id}" title="Manage"><i class="bi bi-gear"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1" data-edit-level="${lvl.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-delete-level="${lvl.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-manage-level]").forEach((btn) => btn.addEventListener("click", () => openLevelDetail(btn.dataset.manageLevel)));
  tbody.querySelectorAll("[data-edit-level]").forEach((btn) => btn.addEventListener("click", () => openEditLevel(btn.dataset.editLevel)));
  tbody.querySelectorAll("[data-delete-level]").forEach((btn) => btn.addEventListener("click", () => handleDeleteLevel(btn.dataset.deleteLevel)));
}

document.getElementById("createLevelBtn").addEventListener("click", () => {
  editingLevelId = null;
  document.getElementById("levelForm").reset();
  document.getElementById("levelModalTitle").textContent = "Create Level";
  document.getElementById("levelSubmitBtn").textContent = "Create Level";
  document.getElementById("levelFormError").classList.add("d-none");
  document.getElementById("levelOrderInput").value = 0;
  document.getElementById("levelPassMarkInput").value = 40;
  document.getElementById("levelActiveInput").checked = true;
  new bootstrap.Modal(document.getElementById("levelModal")).show();
});

function openEditLevel(levelId) {
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) return;
  editingLevelId = levelId;
  document.getElementById("levelModalTitle").textContent = "Edit Level";
  document.getElementById("levelSubmitBtn").textContent = "Save Changes";
  document.getElementById("levelFormError").classList.add("d-none");
  document.getElementById("levelTitleInput").value = lvl.title;
  document.getElementById("levelDescInput").value = lvl.description || "";
  document.getElementById("levelOrderInput").value = lvl.order ?? 0;
  document.getElementById("levelPassMarkInput").value = lvl.passMark ?? 40;
  document.getElementById("levelActiveInput").checked = !!lvl.active;
  new bootstrap.Modal(document.getElementById("levelModal")).show();
}

async function handleDeleteLevel(levelId) {
  if (!confirm("Delete this learning level? Its concepts and questions will remain orphaned unless removed separately. This cannot be undone.")) return;
  await deleteLevel(levelId);
  await renderLevelsTable();
}

document.getElementById("levelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("levelFormError");
  errorEl.classList.add("d-none");

  const data = {
    title: document.getElementById("levelTitleInput").value.trim(),
    description: document.getElementById("levelDescInput").value.trim(),
    order: Number(document.getElementById("levelOrderInput").value),
    passMark: Number(document.getElementById("levelPassMarkInput").value),
    active: document.getElementById("levelActiveInput").checked
  };

  try {
    if (editingLevelId) {
      await updateLevel(editingLevelId, data);
    } else {
      await createLevel(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("levelModal"))?.hide();
    await renderLevelsTable();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save level.";
    errorEl.classList.remove("d-none");
  }
});

/* ============================================================
   LEVEL DETAIL: CONCEPTS + MCQ + CODING + PROGRESS
   ============================================================ */
async function openLevelDetail(levelId) {
  activeLevel = levels.find((l) => l.id === levelId);
  if (!activeLevel) return;

  document.getElementById("levelsListView").classList.add("d-none");
  document.getElementById("levelDetailView").classList.remove("d-none");
  document.getElementById("levelDetailTitle").textContent = activeLevel.title;

  await Promise.all([renderConceptsList(), renderLearningMcqList(), renderLearningCodingList(), renderLearningProgress()]);
}

document.getElementById("backToLevelsBtn").addEventListener("click", () => {
  document.getElementById("levelDetailView").classList.add("d-none");
  document.getElementById("levelsListView").classList.remove("d-none");
  renderLevelsTable();
});

/* ---------- Concepts ---------- */
async function renderConceptsList() {
  levelConcepts = await listConcepts(activeLevel.id);
  const wrap = document.getElementById("conceptsListWrap");

  if (!levelConcepts.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-3">No concepts added yet.</div>`;
    return;
  }

  wrap.innerHTML = levelConcepts
    .map(
      (c, i) => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div><span class="badge bg-secondary me-2">${i + 1}</span>${escapeHtmlL(c.title)}</div>
        <div>
          <button class="btn btn-sm btn-outline-primary me-1" data-edit-concept="${c.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-delete-concept="${c.id}"><i class="bi bi-trash"></i></button>
        </div>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-edit-concept]").forEach((btn) => btn.addEventListener("click", () => openConceptModal(levelConcepts.find((c) => c.id === btn.dataset.editConcept))));
  wrap.querySelectorAll("[data-delete-concept]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this concept? This cannot be undone.")) return;
      await deleteConcept(btn.dataset.deleteConcept);
      await renderConceptsList();
    })
  );
}

document.getElementById("addConceptBtn").addEventListener("click", () => openConceptModal());

function openConceptModal(concept = null) {
  editingConceptId = concept?.id || null;
  document.getElementById("conceptForm").reset();
  document.getElementById("conceptFormError").classList.add("d-none");
  document.getElementById("conceptModalTitle").textContent = concept ? "Edit Concept" : "Add Concept";
  document.getElementById("conceptTitleInput").value = concept?.title || "";
  document.getElementById("conceptContentInput").value = concept?.content || "";
  document.getElementById("conceptOrderInput").value = concept?.order ?? levelConcepts.length;
  new bootstrap.Modal(document.getElementById("conceptModal")).show();
}

document.getElementById("conceptForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("conceptFormError");
  errorEl.classList.add("d-none");

  const data = {
    levelId: activeLevel.id,
    title: document.getElementById("conceptTitleInput").value.trim(),
    content: document.getElementById("conceptContentInput").value,
    order: Number(document.getElementById("conceptOrderInput").value)
  };

  try {
    if (editingConceptId) {
      await updateConcept(editingConceptId, data);
    } else {
      await createConcept(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("conceptModal"))?.hide();
    await renderConceptsList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save concept.";
    errorEl.classList.remove("d-none");
  }
});

/* ---------- Learning MCQ ---------- */
async function renderLearningMcqList() {
  levelMcqQuestions = await listMcqQuestions(activeLevel.id);
  const wrap = document.getElementById("learningMcqListWrap");

  if (!levelMcqQuestions.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-3">No MCQ questions added yet.</div>`;
    return;
  }

  wrap.innerHTML = levelMcqQuestions
    .map(
      (q, i) => `
      <div class="question-card p-3">
        <div class="d-flex justify-content-between">
          <div>
            <span class="badge bg-secondary me-2">Q${i + 1}</span>
            <strong>${escapeHtmlL(q.questionText)}</strong>
            <div class="text-muted small mt-1">${q.marks} marks &middot; ${q.options.length} options</div>
          </div>
          <div class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" data-edit-lmcq="${q.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-delete-lmcq="${q.id}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-edit-lmcq]").forEach((btn) => btn.addEventListener("click", () => openLearningMcqModal(levelMcqQuestions.find((q) => q.id === btn.dataset.editLmcq))));
  wrap.querySelectorAll("[data-delete-lmcq]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this question? This cannot be undone.")) return;
      await deleteMcqQuestion(btn.dataset.deleteLmcq);
      await renderLearningMcqList();
    })
  );
}

document.getElementById("addLearningMcqBtn").addEventListener("click", () => openLearningMcqModal());

function addLmOptionRow(value = "", checked = false) {
  const wrap = document.getElementById("lmOptionsWrap");
  const row = document.createElement("div");
  row.className = "input-group";
  row.innerHTML = `
    <span class="input-group-text"><input type="radio" name="lmCorrect" class="form-check-input mt-0" ${checked ? "checked" : ""}></span>
    <input type="text" class="form-control" placeholder="Option text" value="${value.replace(/"/g, "&quot;")}" required />
    <button type="button" class="btn btn-outline-danger" data-remove-option><i class="bi bi-x"></i></button>
  `;
  row.querySelector("[data-remove-option]").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

document.getElementById("lmAddOptionBtn").addEventListener("click", () => addLmOptionRow());

function openLearningMcqModal(question = null) {
  editingLearningMcqId = question?.id || null;
  document.getElementById("learningMcqForm").reset();
  document.getElementById("learningMcqFormError").classList.add("d-none");
  document.getElementById("lmOptionsWrap").innerHTML = "";

  const options = question?.options || ["", "", "", ""];
  options.forEach((val, i) => addLmOptionRow(val, question?.correctOptionIndex === i));

  document.getElementById("lmQuestionText").value = question?.questionText || "";
  document.getElementById("lmMarksInput").value = question?.marks || "";
  document.getElementById("lmOrderInput").value = question?.order ?? levelMcqQuestions.length;

  new bootstrap.Modal(document.getElementById("learningMcqModal")).show();
}

document.getElementById("learningMcqForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("learningMcqFormError");
  errorEl.classList.add("d-none");

  const rows = [...document.querySelectorAll("#lmOptionsWrap .input-group")];
  const options = rows.map((r) => r.querySelector("input[type=text]").value.trim());
  const correctIndex = rows.findIndex((r) => r.querySelector("input[type=radio]").checked);

  if (options.some((o) => !o) || options.length < 2) {
    errorEl.textContent = "Please fill in at least 2 options.";
    errorEl.classList.remove("d-none");
    return;
  }
  if (correctIndex === -1) {
    errorEl.textContent = "Please mark the correct option.";
    errorEl.classList.remove("d-none");
    return;
  }

  const data = {
    levelId: activeLevel.id,
    questionText: document.getElementById("lmQuestionText").value.trim(),
    options,
    correctOptionIndex: correctIndex,
    marks: Number(document.getElementById("lmMarksInput").value),
    order: Number(document.getElementById("lmOrderInput").value)
  };

  try {
    if (editingLearningMcqId) {
      await updateMcqQuestion(editingLearningMcqId, data);
    } else {
      await createMcqQuestion(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("learningMcqModal"))?.hide();
    await renderLearningMcqList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.classList.remove("d-none");
  }
});

/* ---------- Learning Coding Questions ---------- */
async function renderLearningCodingList() {
  levelCodingQuestions = await listLearningCodingQuestions(activeLevel.id);
  const wrap = document.getElementById("learningCodingListWrap");

  if (!levelCodingQuestions.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-3">No coding questions added yet.</div>`;
    return;
  }

  wrap.innerHTML = levelCodingQuestions
    .map(
      (q, i) => `
      <div class="question-card p-3">
        <div class="d-flex justify-content-between">
          <div>
            <span class="badge bg-secondary me-2">Q${i + 1}</span>
            <strong>${escapeHtmlL(q.title)}</strong>
            <div class="text-muted small mt-1">
              ${q.external ? `<span class="badge bg-primary-subtle text-primary me-1">${escapeHtmlL(q.source || "external")}</span>${q.rating ? `Rating ${escapeHtmlL(q.rating)} &middot; ` : ""}${(q.tags || []).slice(0, 4).map(escapeHtmlL).join(", ")}` : `${q.marks} marks &middot; ${(q.visibleTestCases || []).length} public / ${(q.hiddenTestCases || []).length} hidden test cases`}
            </div>
          </div>
          <div class="text-nowrap">
            <button class="btn btn-sm btn-outline-primary me-1" data-edit-lcoding="${q.id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-delete-lcoding="${q.id}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-edit-lcoding]").forEach((btn) => btn.addEventListener("click", () => openLearningCodingModal(levelCodingQuestions.find((q) => q.id === btn.dataset.editLcoding))));
  wrap.querySelectorAll("[data-delete-lcoding]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this question? This cannot be undone.")) return;
      await deleteLearningCodingQuestion(btn.dataset.deleteLcoding);
      await renderLearningCodingList();
    })
  );
}

document.getElementById("addLearningCodingBtn").addEventListener("click", () => openLearningCodingModal());

document.getElementById("importCodeforcesBtn").addEventListener("click", () => openCodeforcesImportModal());
document.getElementById("cfRefreshBtn").addEventListener("click", () => loadCodeforcesProblems(true));
document.getElementById("cfSearchInput").addEventListener("input", renderCodeforcesResults);
document.getElementById("cfTagInput").addEventListener("change", renderCodeforcesResults);
document.getElementById("cfMinRatingInput").addEventListener("input", renderCodeforcesResults);
document.getElementById("cfMaxRatingInput").addEventListener("input", renderCodeforcesResults);
document.getElementById("cfSelectVisibleBtn").addEventListener("click", () => {
  getFilteredCodeforcesProblems().slice(0, 100).forEach((p) => codeforcesSelected.add(codeforcesKey(p)));
  renderCodeforcesResults();
});
document.getElementById("cfAddSelectedBtn").addEventListener("click", addSelectedCodeforcesProblems);

function codeforcesKey(p) {
  return `${p.contestId}-${p.index}`;
}

function codeforcesUrl(p) {
  return p.contestId
    ? `https://codeforces.com/problemset/problem/${p.contestId}/${encodeURIComponent(p.index)}`
    : `https://codeforces.com/problemset`;
}

function codeforcesDifficulty(rating) {
  const r = Number(rating || 0);
  if (!r) return "Unrated";
  if (r < 1000) return "Easy";
  if (r < 1400) return "Easy / Medium";
  if (r < 1800) return "Medium";
  if (r < 2200) return "Hard";
  return "Very Hard";
}

function getFilteredCodeforcesProblems() {
  const search = document.getElementById("cfSearchInput").value.trim().toLowerCase();
  const tag = document.getElementById("cfTagInput").value;
  const min = Number(document.getElementById("cfMinRatingInput").value || 0);
  const max = Number(document.getElementById("cfMaxRatingInput").value || 999999);
  return codeforcesProblems.filter((p) => {
    if (p.type !== "PROGRAMMING" || !p.contestId || !p.index) return false;
    if (search && !String(p.name || "").toLowerCase().includes(search)) return false;
    if (tag && !(p.tags || []).includes(tag)) return false;
    const rating = Number(p.rating || 0);
    if (rating && (rating < min || rating > max)) return false;
    if (!rating && min > 0) return false;
    return true;
  }).slice(0, 100);
}

async function loadCodeforcesProblems(force = false) {
  const info = document.getElementById("cfResultInfo");
  const results = document.getElementById("codeforcesResults");
  info.textContent = "Loading Codeforces problems...";
  results.innerHTML = `<div class="text-muted small py-3">Fetching the public Codeforces problem list...</div>`;
  try {
    if (!force && codeforcesProblems.length) {
      renderCodeforcesResults();
      return;
    }
    const response = await fetch("https://codeforces.com/api/problemset.problems?lang=en", { cache: "no-store" });
    if (!response.ok) throw new Error(`Codeforces API returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== "OK") throw new Error(payload.comment || "Codeforces API request failed.");
    codeforcesProblems = payload.result?.problems || [];
    const tags = [...new Set(codeforcesProblems.flatMap((p) => p.tags || []))].sort();
    document.getElementById("cfTagInput").innerHTML = `<option value="">All tags</option>` + tags.map((t) => `<option value="${escapeHtmlL(t)}">${escapeHtmlL(t)}</option>`).join("");
    renderCodeforcesResults();
  } catch (err) {
    info.textContent = "Could not load Codeforces problems.";
    results.innerHTML = `<div class="alert alert-danger small">${escapeHtmlL(err.message || "Unknown error")}</div>`;
  }
}

function renderCodeforcesResults() {
  const list = getFilteredCodeforcesProblems();
  const info = document.getElementById("cfResultInfo");
  const wrap = document.getElementById("codeforcesResults");
  info.textContent = `${list.length} problems shown${codeforcesProblems.length > 100 ? " (maximum 100 shown)" : ""}`;
  if (!list.length) {
    wrap.innerHTML = `<div class="text-muted text-center py-4">No matching Codeforces problems.</div>`;
  } else {
    wrap.innerHTML = list.map((p) => {
      const key = codeforcesKey(p);
      const checked = codeforcesSelected.has(key);
      const rating = p.rating ? `${p.rating}` : "Unrated";
      return `<label class="question-card p-3 d-flex align-items-center gap-3" style="cursor:pointer">
        <input class="form-check-input mt-0 cf-problem-check" type="checkbox" data-cf-key="${escapeHtmlL(key)}" ${checked ? "checked" : ""}>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold">${escapeHtmlL(p.contestId + p.index)} - ${escapeHtmlL(p.name)}</div>
          <div class="small text-muted mt-1">Rating: ${escapeHtmlL(rating)} &middot; ${escapeHtmlL(codeforcesDifficulty(p.rating))} &middot; ${(p.tags || []).slice(0, 5).map(escapeHtmlL).join(", ")}</div>
        </div>
        <a class="btn btn-sm btn-outline-secondary" href="${codeforcesUrl(p)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">View</a>
      </label>`;
    }).join("");
  }
  wrap.querySelectorAll(".cf-problem-check").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.dataset.cfKey;
      if (input.checked) codeforcesSelected.add(key); else codeforcesSelected.delete(key);
      updateCodeforcesSelectedInfo();
    });
  });
  updateCodeforcesSelectedInfo();
}

function updateCodeforcesSelectedInfo() {
  document.getElementById("cfSelectedInfo").textContent = `${codeforcesSelected.size} selected`;
}

function openCodeforcesImportModal() {
  codeforcesSelected = new Set();
  document.getElementById("cfSearchInput").value = "";
  document.getElementById("cfMinRatingInput").value = "";
  document.getElementById("cfMaxRatingInput").value = "";
  document.getElementById("cfTagInput").value = "";
  document.getElementById("codeforcesImportError").classList.add("d-none");
  new bootstrap.Modal(document.getElementById("codeforcesImportModal")).show();
  loadCodeforcesProblems();
}

async function addSelectedCodeforcesProblems() {
  const selected = codeforcesProblems.filter((p) => codeforcesSelected.has(codeforcesKey(p)) && p.contestId && p.index);
  const errorEl = document.getElementById("codeforcesImportError");
  errorEl.classList.add("d-none");
  if (!selected.length) {
    errorEl.textContent = "Select at least one problem first.";
    errorEl.classList.remove("d-none");
    return;
  }
  const existingKeys = new Set((levelCodingQuestions || []).filter((q) => q.source === "codeforces").map((q) => `${q.contestId}-${q.problemIndex}`));
  const duplicates = selected.filter((p) => existingKeys.has(codeforcesKey(p)));
  const toAdd = selected.filter((p) => !existingKeys.has(codeforcesKey(p)));
  if (!toAdd.length) {
    errorEl.textContent = "All selected problems are already added to this level.";
    errorEl.classList.remove("d-none");
    return;
  }
  const baseOrder = levelCodingQuestions.length;
  try {
    for (let i = 0; i < toAdd.length; i++) {
      const p = toAdd[i];
      await createLearningCodingQuestion({
        levelId: activeLevel.id,
        language: "python",
        title: `${p.contestId}${p.index} - ${p.name}`,
        description: `Practice this problem on Codeforces. Open the original problem statement using the button in the Learning Portal.`,
        inputDescription: "See the original Codeforces problem statement.",
        outputDescription: "See the original Codeforces problem statement.",
        marks: 10,
        timeLimit: 5,
        order: baseOrder + i,
        starterCode: "# Write your solution here\n",
        examples: [],
        visibleTestCases: [],
        hiddenTestCases: [],
        source: "codeforces",
        external: true,
        externalUrl: codeforcesUrl(p),
        contestId: p.contestId,
        problemIndex: p.index,
        rating: p.rating || null,
        tags: p.tags || [],
        difficulty: codeforcesDifficulty(p.rating)
      });
    }
    bootstrap.Modal.getInstance(document.getElementById("codeforcesImportModal"))?.hide();
    if (duplicates.length) alert(`${toAdd.length} problem(s) added. ${duplicates.length} duplicate(s) skipped.`);
    await renderLearningCodingList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not import Codeforces problems.";
    errorEl.classList.remove("d-none");
  }
}


function openLearningCodingModal(question = null) {
  editingLearningCodingId = question?.id || null;
  document.getElementById("learningCodingForm").reset();
  document.getElementById("learningCodingFormError").classList.add("d-none");

  document.getElementById("lcTitleInput").value = question?.title || "";
  document.getElementById("lcDescInput").value = question?.description || "";
  document.getElementById("lcInputDescInput").value = question?.inputDescription || "";
  document.getElementById("lcOutputDescInput").value = question?.outputDescription || "";
  document.getElementById("lcMarksInput").value = question?.marks || "";
  document.getElementById("lcTimeLimitInput").value = question?.timeLimit || 5;
  document.getElementById("lcOrderInput").value = question?.order ?? levelCodingQuestions.length;
  document.getElementById("lcStarterInput").value = question?.starterCode || "";

  ["lcExamplesWrap", "lcVisibleTestsWrap", "lcHiddenTestsWrap"].forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });

  (question?.examples || [{}]).forEach((ex) => addDynamicRow("lcExamplesWrap", "example", ex));
  (question?.visibleTestCases || [{}]).forEach((tc) => addDynamicRow("lcVisibleTestsWrap", "test", tc));
  (question?.hiddenTestCases || [{}]).forEach((tc) => addDynamicRow("lcHiddenTestsWrap", "test", tc));

  new bootstrap.Modal(document.getElementById("learningCodingModal")).show();
}

document.getElementById("learningCodingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("learningCodingFormError");
  errorEl.classList.add("d-none");

  const data = {
    levelId: activeLevel.id,
    language: "python",
    title: document.getElementById("lcTitleInput").value.trim(),
    description: document.getElementById("lcDescInput").value.trim(),
    inputDescription: document.getElementById("lcInputDescInput").value.trim(),
    outputDescription: document.getElementById("lcOutputDescInput").value.trim(),
    marks: Number(document.getElementById("lcMarksInput").value),
    timeLimit: Number(document.getElementById("lcTimeLimitInput").value),
    order: Number(document.getElementById("lcOrderInput").value),
    starterCode: document.getElementById("lcStarterInput").value,
    examples: collectDynamicRows("lcExamplesWrap", false).filter((r) => r.input || r.output),
    visibleTestCases: collectDynamicRows("lcVisibleTestsWrap", true).filter((r) => r.input || r.expectedOutput),
    hiddenTestCases: collectDynamicRows("lcHiddenTestsWrap", true).filter((r) => r.input || r.expectedOutput)
  };

  if (!data.visibleTestCases.length && !data.hiddenTestCases.length) {
    errorEl.textContent = "Add at least one test case (public or hidden).";
    errorEl.classList.remove("d-none");
    return;
  }

  try {
    if (editingLearningCodingId) {
      await updateLearningCodingQuestion(editingLearningCodingId, data);
    } else {
      await createLearningCodingQuestion(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("learningCodingModal"))?.hide();
    await renderLearningCodingList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.classList.remove("d-none");
  }
});

/* ---------- Student Progress ---------- */
let learningProgressDocs = [];
let learningProgressTotalConcepts = 0;

async function renderLearningProgress() {
  const [progressDocs, totalConcepts] = await Promise.all([
    listProgressForLevel(activeLevel.id),
    listConcepts(activeLevel.id).then((c) => c.length)
  ]);
  learningProgressDocs = progressDocs;
  learningProgressTotalConcepts = totalConcepts;

  const filterEl = document.getElementById("learningProgressSectionFilter");
  const previousValue = filterEl.value || "all";
  filterEl.innerHTML = `<option value="all">All Sections</option>` + SECTIONS.map((s) => `<option value="${s}">${s}</option>`).join("");
  filterEl.value = [...filterEl.options].some((o) => o.value === previousValue) ? previousValue : "all";
  filterEl.onchange = renderLearningProgressTable;

  renderLearningProgressTable();
}

function renderLearningProgressTable() {
  const tbody = document.getElementById("learningProgressTableBody");
  const sectionFilter = document.getElementById("learningProgressSectionFilter").value;

  const rows = learningProgressDocs.filter((p) => {
    if (sectionFilter === "all") return true;
    const student = students.find((s) => s.uid === p.studentId);
    return student?.section === sectionFilter;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No student progress recorded${sectionFilter === "all" ? " yet" : ` for Section ${sectionFilter}`}.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((p) => {
      const student = students.find((s) => s.uid === p.studentId);
      const mcqCell = p.mcqPassed
        ? `<span class="badge bg-success">Passed (${p.mcqPercentage}%)</span>`
        : p.mcqAttempts
        ? `<span class="badge bg-danger">Failed (${p.mcqPercentage}%)</span>`
        : `<span class="badge bg-secondary">Not attempted</span>`;
      const codingCell = p.codingUnlocked
        ? '<span class="badge bg-success">Unlocked</span>'
        : '<span class="badge bg-secondary">Locked</span>';

      return `
        <tr>
          <td>${student?.rollNumber ?? "-"}</td>
          <td>${student?.name ?? "Unknown"}</td>
          <td><span class="badge bg-secondary">${student?.section ?? "-"}</span></td>
          <td>${(p.completedConceptIds || []).length}/${learningProgressTotalConcepts}</td>
          <td>${mcqCell}</td>
          <td>${codingCell}</td>
        </tr>`;
    })
    .join("");
}

/* ============================================================
   SPECIAL CODING SECTION (exclusive company-style questions)
   ============================================================ */
async function renderSpecialQuestionsList() {
  specialQuestions = await listAllSpecialQuestions();
  specialQuestionsLoaded = true;

  const filterEl = document.getElementById("specialCompanyFilter");
  const previousValue = filterEl.value || "all";
  const companiesPresent = [...new Set(specialQuestions.map((q) => q.company).filter(Boolean))];
  const allCompanies = [...COMPANY_OPTIONS.filter((c) => companiesPresent.includes(c)), ...companiesPresent.filter((c) => !COMPANY_OPTIONS.includes(c))];
  filterEl.innerHTML = `<option value="all">All Companies</option>` + allCompanies.map((c) => `<option value="${c}">${escapeHtmlL(c)}</option>`).join("");
  filterEl.value = [...filterEl.options].some((o) => o.value === previousValue) ? previousValue : "all";
  filterEl.onchange = () => {
    specialCompanyFilterValue = filterEl.value;
    renderSpecialQuestionsListBody();
  };

  renderSpecialQuestionsListBody();
}

function renderSpecialQuestionsListBody() {
  const wrap = document.getElementById("specialQuestionsList");
  const rows = specialCompanyFilterValue === "all" ? specialQuestions : specialQuestions.filter((q) => q.company === specialCompanyFilterValue);

  if (!rows.length) {
    wrap.innerHTML = `<div class="text-center text-muted py-4">No special coding questions ${specialCompanyFilterValue === "all" ? "added yet" : `for ${escapeHtmlL(specialCompanyFilterValue)}`}.</div>`;
    return;
  }

  wrap.innerHTML = rows
    .map((q) => {
      const publishedBadge = q.published
        ? '<span class="badge bg-success">Published</span>'
        : '<span class="badge bg-secondary">Draft</span>';
      const difficultyBadge =
        q.difficulty === "easy" ? "bg-success" : q.difficulty === "hard" ? "bg-danger" : "bg-warning text-dark";

      return `
        <div class="question-card p-3">
          <div class="d-flex justify-content-between">
            <div>
              <span class="company-badge ${companyBadgeClass(q.company)} me-2">${escapeHtmlL(q.company || "Other")}</span>
              <strong>${escapeHtmlL(q.title)}</strong>
              <span class="badge ${difficultyBadge} ms-1">${(q.difficulty || "medium").toUpperCase()}</span>
              <div class="text-muted small mt-1">
                ${q.external ? `${q.topic ? `Topic: ${escapeHtmlL(q.topic)} &middot; ` : ""}${q.rating ? `Rating ${escapeHtmlL(q.rating)} &middot; ` : ""}${escapeHtmlL(q.source || "External practice")}` : `${q.marks} marks &middot; ${(q.visibleTestCases || []).length} public / ${(q.hiddenTestCases || []).length} hidden test cases`}
              </div>
            </div>
            <div class="text-nowrap">
              ${publishedBadge}
              <button class="btn btn-sm btn-outline-primary ms-2 me-1" data-edit-special="${q.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-special="${q.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  wrap.querySelectorAll("[data-edit-special]").forEach((btn) =>
    btn.addEventListener("click", () => openSpecialModal(specialQuestions.find((q) => q.id === btn.dataset.editSpecial)))
  );
  wrap.querySelectorAll("[data-delete-special]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this special coding question? This cannot be undone.")) return;
      await deleteSpecialQuestion(btn.dataset.deleteSpecial);
      await renderSpecialQuestionsList();
    })
  );
}

function companyBadgeClass(company) {
  const map = {
    Google: "company-google",
    Amazon: "company-amazon",
    Microsoft: "company-microsoft",
    TCS: "company-tcs",
    Infosys: "company-infosys",
    Accenture: "company-accenture"
  };
  return map[company] || "company-other";
}

document.getElementById("addSpecialQuestionBtn").addEventListener("click", () => openSpecialModal());
document.getElementById("importSpecialBeginnerBtn").addEventListener("click", () => openSpecialBeginnerImportModal());
document.getElementById("specialBeginnerSelectAllBtn").addEventListener("click", selectAllSpecialBeginnerTopics);
document.getElementById("specialBeginnerImportBtn").addEventListener("click", importSelectedSpecialBeginnerTopics);

document.getElementById("spCompanySelect").addEventListener("change", (e) => {
  document.getElementById("spCompanyOtherWrap").classList.toggle("d-none", e.target.value !== "Other");
});

/* ---------- Beginner DSA importer for Special Section ---------- */
// These are original beginner-friendly problems designed for this portal.
// The importer creates the full in-site question, starter code, public tests,
// and hidden tests automatically, so students solve and submit entirely here.
const SPECIAL_BEGINNER_PROBLEMS = [
  {
    id: "arrays-sum", label: "Arrays", icon: "bi-grid-3x3-gap", title: "Sum of Array Elements",
    description: "Given an array of integers, find and print the sum of all elements.",
    inputDescription: "First line contains n. Second line contains n integers.",
    outputDescription: "Print one integer: the sum of all array elements.",
    constraints: "1 ≤ n ≤ 1000. Array values are integers.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\n\n# Write your solution below\n",
    examples: [{ input: "5\n1 2 3 4 5", output: "15" }, { input: "4\n10 -2 7 5", output: "20" }],
    visibleTestCases: [{ input: "5\n1 2 3 4 5", expectedOutput: "15", weight: 1 }, { input: "4\n10 -2 7 5", expectedOutput: "20", weight: 1 }],
    hiddenTestCases: [{ input: "1\n9", expectedOutput: "9", weight: 1 }, { input: "6\n1 1 1 1 1 1", expectedOutput: "6", weight: 1 }, { input: "5\n-5 -4 -3 -2 -1", expectedOutput: "-15", weight: 1 }, { input: "7\n10 20 30 40 50 60 70", expectedOutput: "280", weight: 1 }, { input: "3\n100 -50 25", expectedOutput: "75", weight: 1 }]
  },
  {
    id: "strings-vowels", label: "Strings", icon: "bi-fonts", title: "Count Vowels",
    description: "Given a string, count how many vowels (a, e, i, o, u) it contains. Treat uppercase and lowercase letters the same.",
    inputDescription: "One line containing a string without leading or trailing spaces.",
    outputDescription: "Print the number of vowels.",
    constraints: "1 ≤ length of string ≤ 1000.",
    starterCode: "s = input().strip()\n\n# Write your solution below\n",
    examples: [{ input: "hello", output: "2" }, { input: "Programming", output: "3" }],
    visibleTestCases: [{ input: "hello", expectedOutput: "2", weight: 1 }, { input: "Programming", expectedOutput: "3", weight: 1 }],
    hiddenTestCases: [{ input: "AEIOU", expectedOutput: "5", weight: 1 }, { input: "xyz", expectedOutput: "0", weight: 1 }, { input: "education", expectedOutput: "5", weight: 1 }, { input: "Python", expectedOutput: "1", weight: 1 }, { input: "umbrella", expectedOutput: "3", weight: 1 }]
  },
  {
    id: "sorting-ascending", label: "Sorting", icon: "bi-sort-down", title: "Sort an Array",
    description: "Given an array of integers, print the elements in ascending order.",
    inputDescription: "First line contains n. Second line contains n integers.",
    outputDescription: "Print the sorted array in one line, separated by spaces.",
    constraints: "1 ≤ n ≤ 1000.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\n\n# Write your solution below\n",
    examples: [{ input: "5\n4 1 3 2 5", output: "1 2 3 4 5" }, { input: "4\n10 2 8 1", output: "1 2 8 10" }],
    visibleTestCases: [{ input: "5\n4 1 3 2 5", expectedOutput: "1 2 3 4 5", weight: 1 }, { input: "4\n10 2 8 1", expectedOutput: "1 2 8 10", weight: 1 }],
    hiddenTestCases: [{ input: "1\n7", expectedOutput: "7", weight: 1 }, { input: "5\n5 4 3 2 1", expectedOutput: "1 2 3 4 5", weight: 1 }, { input: "6\n2 2 1 1 3 3", expectedOutput: "1 1 2 2 3 3", weight: 1 }, { input: "4\n-1 -5 0 2", expectedOutput: "-5 -1 0 2", weight: 1 }, { input: "7\n9 1 8 2 7 3 6", expectedOutput: "1 2 3 6 7 8 9", weight: 1 }]
  },
  {
    id: "binary-search", label: "Searching / Binary Search", icon: "bi-search", title: "Binary Search",
    description: "Given a sorted array and a target value, find the 0-based index of the target. Print -1 if it is not present.",
    inputDescription: "First line n. Second line contains n sorted integers. Third line contains target.",
    outputDescription: "Print the 0-based index of target, or -1.",
    constraints: "1 ≤ n ≤ 1000. The array is sorted in non-decreasing order.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\ntarget = int(input())\n\n# Write your binary search below\n",
    examples: [{ input: "5\n1 3 5 7 9\n7", output: "3" }, { input: "5\n2 4 6 8 10\n5", output: "-1" }],
    visibleTestCases: [{ input: "5\n1 3 5 7 9\n7", expectedOutput: "3", weight: 1 }, { input: "5\n2 4 6 8 10\n5", expectedOutput: "-1", weight: 1 }],
    hiddenTestCases: [{ input: "1\n10\n10", expectedOutput: "0", weight: 1 }, { input: "6\n1 2 3 4 5 6\n1", expectedOutput: "0", weight: 1 }, { input: "6\n1 2 3 4 5 6\n6", expectedOutput: "5", weight: 1 }, { input: "7\n2 4 6 8 10 12 14\n8", expectedOutput: "3", weight: 1 }, { input: "7\n2 4 6 8 10 12 14\n9", expectedOutput: "-1", weight: 1 }]
  },
  {
    id: "two-pointers-pair", label: "Two Pointers", icon: "bi-arrows-expand", title: "Pair With Given Sum",
    description: "Given a sorted array and a target, determine whether there are two different elements whose sum equals the target.",
    inputDescription: "First line n. Second line contains n sorted integers. Third line contains target.",
    outputDescription: "Print YES if such a pair exists; otherwise print NO.",
    constraints: "1 ≤ n ≤ 1000. The array is sorted.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\ntarget = int(input())\n\n# Use the two-pointer technique\n",
    examples: [{ input: "5\n1 2 3 4 6\n7", output: "YES" }, { input: "4\n1 2 5 9\n10", output: "NO" }],
    visibleTestCases: [{ input: "5\n1 2 3 4 6\n7", expectedOutput: "YES", weight: 1 }, { input: "4\n1 2 5 9\n10", expectedOutput: "NO", weight: 1 }],
    hiddenTestCases: [{ input: "2\n1 9\n10", expectedOutput: "YES", weight: 1 }, { input: "2\n1 9\n8", expectedOutput: "NO", weight: 1 }, { input: "6\n1 2 4 7 9 12\n13", expectedOutput: "YES", weight: 1 }, { input: "5\n-5 -2 0 3 8\n1", expectedOutput: "YES", weight: 1 }, { input: "5\n1 3 5 7 9\n20", expectedOutput: "NO", weight: 1 }]
  },
  {
    id: "prefix-range-sum", label: "Prefix Sum", icon: "bi-bar-chart-steps", title: "Range Sum Queries",
    description: "Answer multiple range-sum queries on an array. For each query [l, r], print the sum from position l to r. Positions are 1-based.",
    inputDescription: "First line n. Second line contains n integers. Third line q. Next q lines contain l and r.",
    outputDescription: "Print one answer per query.",
    constraints: "1 ≤ n, q ≤ 1000.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\nq = int(input())\n\n# Build a prefix sum array and answer each query\n",
    examples: [{ input: "5\n1 2 3 4 5\n3\n1 3\n2 5\n4 4", output: "6\n14\n4" }, { input: "4\n10 20 30 40\n2\n1 2\n3 4", output: "30\n70" }],
    visibleTestCases: [{ input: "5\n1 2 3 4 5\n3\n1 3\n2 5\n4 4", expectedOutput: "6\n14\n4", weight: 1 }, { input: "4\n10 20 30 40\n2\n1 2\n3 4", expectedOutput: "30\n70", weight: 1 }],
    hiddenTestCases: [{ input: "1\n8\n1\n1 1", expectedOutput: "8", weight: 1 }, { input: "5\n2 2 2 2 2\n2\n1 5\n2 4", expectedOutput: "10\n6", weight: 1 }, { input: "4\n-1 5 -2 7\n2\n1 4\n2 3", expectedOutput: "9\n3", weight: 1 }, { input: "6\n1 3 5 7 9 11\n3\n1 6\n3 5\n2 2", expectedOutput: "36\n21\n3", weight: 1 }, { input: "3\n10 0 -5\n2\n1 2\n2 3", expectedOutput: "10\n-5", weight: 1 }]
  },
  {
    id: "stack-parentheses", label: "Stack", icon: "bi-stack", title: "Balanced Parentheses",
    description: "Check whether a string containing (), {}, and [] has correctly matched and nested brackets.",
    inputDescription: "One line containing only bracket characters.",
    outputDescription: "Print YES if the brackets are balanced; otherwise print NO.",
    constraints: "1 ≤ length ≤ 1000.",
    starterCode: "s = input().strip()\n\n# Use a stack to check matching brackets\n",
    examples: [{ input: "({[]})", output: "YES" }, { input: "([)]", output: "NO" }],
    visibleTestCases: [{ input: "({[]})", expectedOutput: "YES", weight: 1 }, { input: "([)]", expectedOutput: "NO", weight: 1 }],
    hiddenTestCases: [{ input: "()", expectedOutput: "YES", weight: 1 }, { input: "", expectedOutput: "YES", weight: 1 }, { input: "((()))", expectedOutput: "YES", weight: 1 }, { input: "{[}]", expectedOutput: "NO", weight: 1 }, { input: "{[()()]}", expectedOutput: "YES", weight: 1 }]
  },
  {
    id: "queue-operations", label: "Queue", icon: "bi-list-ol", title: "Simple Queue Operations",
    description: "Process queue operations. ENQUEUE x adds x to the rear. DEQUEUE removes and prints the front value. If the queue is empty, DEQUEUE prints -1.",
    inputDescription: "First line q. Next q lines contain either ENQUEUE x or DEQUEUE.",
    outputDescription: "Print one value for every DEQUEUE operation.",
    constraints: "1 ≤ q ≤ 1000.",
    starterCode: "q = int(input())\nqueue = []\n\n# Process the operations\n",
    examples: [{ input: "6\nENQUEUE 10\nENQUEUE 20\nDEQUEUE\nENQUEUE 30\nDEQUEUE\nDEQUEUE", output: "10\n20\n30" }, { input: "3\nDEQUEUE\nENQUEUE 5\nDEQUEUE", output: "-1\n5" }],
    visibleTestCases: [{ input: "6\nENQUEUE 10\nENQUEUE 20\nDEQUEUE\nENQUEUE 30\nDEQUEUE\nDEQUEUE", expectedOutput: "10\n20\n30", weight: 1 }, { input: "3\nDEQUEUE\nENQUEUE 5\nDEQUEUE", expectedOutput: "-1\n5", weight: 1 }],
    hiddenTestCases: [{ input: "1\nDEQUEUE", expectedOutput: "-1", weight: 1 }, { input: "5\nENQUEUE 1\nENQUEUE 2\nDEQUEUE\nDEQUEUE\nDEQUEUE", expectedOutput: "1\n2\n-1", weight: 1 }, { input: "5\nENQUEUE 7\nDEQUEUE\nENQUEUE 8\nDEQUEUE\nDEQUEUE", expectedOutput: "7\n8\n-1", weight: 1 }, { input: "4\nENQUEUE -3\nENQUEUE 4\nDEQUEUE\nDEQUEUE", expectedOutput: "-3\n4", weight: 1 }, { input: "6\nENQUEUE 5\nENQUEUE 6\nENQUEUE 7\nDEQUEUE\nDEQUEUE\nDEQUEUE", expectedOutput: "5\n6\n7", weight: 1 }]
  },
  {
    id: "linked-list-reverse", label: "Linked List", icon: "bi-link-45deg", title: "Reverse a Linked List",
    description: "A linked list is given as its node values in order. Print the values in reverse order.",
    inputDescription: "First line n. Second line contains n node values.",
    outputDescription: "Print the node values from tail to head.",
    constraints: "1 ≤ n ≤ 1000.",
    starterCode: "n = int(input())\nvalues = list(map(int, input().split()))\n\n# Reverse the linked-list values\n",
    examples: [{ input: "5\n1 2 3 4 5", output: "5 4 3 2 1" }, { input: "3\n10 20 30", output: "30 20 10" }],
    visibleTestCases: [{ input: "5\n1 2 3 4 5", expectedOutput: "5 4 3 2 1", weight: 1 }, { input: "3\n10 20 30", expectedOutput: "30 20 10", weight: 1 }],
    hiddenTestCases: [{ input: "1\n7", expectedOutput: "7", weight: 1 }, { input: "4\n4 3 2 1", expectedOutput: "1 2 3 4", weight: 1 }, { input: "5\n-1 -2 -3 -4 -5", expectedOutput: "-5 -4 -3 -2 -1", weight: 1 }, { input: "2\n100 200", expectedOutput: "200 100", weight: 1 }, { input: "6\n1 1 2 3 5 8", expectedOutput: "8 5 3 2 1 1", weight: 1 }]
  },
  {
    id: "hash-frequency", label: "Hashing / Frequency", icon: "bi-hash", title: "Count Frequency of a Number",
    description: "Given an array and a target value, count how many times the target occurs.",
    inputDescription: "First line n. Second line contains n integers. Third line contains target.",
    outputDescription: "Print the frequency of target.",
    constraints: "1 ≤ n ≤ 1000.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\ntarget = int(input())\n\n# Count the target using a dictionary\n",
    examples: [{ input: "7\n2 3 2 4 2 5 2\n2", output: "4" }, { input: "5\n1 2 3 4 5\n9", output: "0" }],
    visibleTestCases: [{ input: "7\n2 3 2 4 2 5 2\n2", expectedOutput: "4", weight: 1 }, { input: "5\n1 2 3 4 5\n9", expectedOutput: "0", weight: 1 }],
    hiddenTestCases: [{ input: "1\n8\n8", expectedOutput: "1", weight: 1 }, { input: "6\n1 1 1 1 1 1\n1", expectedOutput: "6", weight: 1 }, { input: "5\n-1 -2 -1 3 -1\n-1", expectedOutput: "3", weight: 1 }, { input: "4\n2 4 6 8\n2", expectedOutput: "1", weight: 1 }, { input: "8\n5 5 4 5 3 5 2 5\n5", expectedOutput: "5", weight: 1 }]
  },
  {
    id: "recursion-factorial", label: "Recursion", icon: "bi-arrow-repeat", title: "Factorial Using Recursion",
    description: "Find n! using a recursive function. Factorial of 0 is 1.",
    inputDescription: "One integer n.",
    outputDescription: "Print n!.",
    constraints: "0 ≤ n ≤ 12.",
    starterCode: "n = int(input())\n\ndef factorial(x):\n    # Write the recursive function\n    pass\n\nprint(factorial(n))\n",
    examples: [{ input: "5", output: "120" }, { input: "0", output: "1" }],
    visibleTestCases: [{ input: "5", expectedOutput: "120", weight: 1 }, { input: "0", expectedOutput: "1", weight: 1 }],
    hiddenTestCases: [{ input: "1", expectedOutput: "1", weight: 1 }, { input: "2", expectedOutput: "2", weight: 1 }, { input: "6", expectedOutput: "720", weight: 1 }, { input: "8", expectedOutput: "40320", weight: 1 }, { input: "10", expectedOutput: "3628800", weight: 1 }]
  },
  {
    id: "greedy-coins", label: "Greedy", icon: "bi-lightning", title: "Minimum Coins",
    description: "Using coins of values 50, 20, 10, 5 and 1, find the minimum number of coins needed to make the given amount.",
    inputDescription: "One integer amount.",
    outputDescription: "Print the minimum number of coins.",
    constraints: "0 ≤ amount ≤ 100000.",
    starterCode: "amount = int(input())\ncoins = [50, 20, 10, 5, 1]\n\n# Apply the greedy strategy\n",
    examples: [{ input: "93", output: "6" }, { input: "41", output: "4" }],
    visibleTestCases: [{ input: "93", expectedOutput: "6", weight: 1 }, { input: "41", expectedOutput: "4", weight: 1 }],
    hiddenTestCases: [{ input: "0", expectedOutput: "0", weight: 1 }, { input: "1", expectedOutput: "1", weight: 1 }, { input: "50", expectedOutput: "1", weight: 1 }, { input: "99", expectedOutput: "8", weight: 1 }, { input: "100", expectedOutput: "2", weight: 1 }]
  },
  {
    id: "trees-sum", label: "Trees", icon: "bi-diagram-3", title: "Sum of Binary Tree Nodes",
    description: "A binary tree is represented in level order. -1 means that a node is absent. Find the sum of all present node values.",
    inputDescription: "First line n. Second line contains n level-order values; -1 represents a missing node.",
    outputDescription: "Print the sum of all values except -1 markers.",
    constraints: "1 ≤ n ≤ 1000.",
    starterCode: "n = int(input())\nvalues = list(map(int, input().split()))\n\n# Process the level-order tree representation\n",
    examples: [{ input: "7\n1 2 3 4 5 -1 7", output: "22" }, { input: "3\n10 5 15", output: "30" }],
    visibleTestCases: [{ input: "7\n1 2 3 4 5 -1 7", expectedOutput: "22", weight: 1 }, { input: "3\n10 5 15", expectedOutput: "30", weight: 1 }],
    hiddenTestCases: [{ input: "1\n8", expectedOutput: "8", weight: 1 }, { input: "3\n1 -1 2", expectedOutput: "3", weight: 1 }, { input: "5\n5 3 7 2 4", expectedOutput: "21", weight: 1 }, { input: "7\n10 -1 20 -1 -1 15 25", expectedOutput: "70", weight: 1 }, { input: "6\n0 1 2 3 4 5", expectedOutput: "15", weight: 1 }]
  },
  {
    id: "graphs-degree", label: "Graphs", icon: "bi-share", title: "Degree of a Vertex",
    description: "Given an undirected graph, find the degree of vertex k.",
    inputDescription: "First line n m. Next m lines contain edges u v. Last line contains k. Vertices are numbered 1 to n.",
    outputDescription: "Print the number of edges connected to k.",
    constraints: "1 ≤ n ≤ 1000. 0 ≤ m ≤ 2000.",
    starterCode: "n, m = map(int, input().split())\n\n# Count edges connected to the requested vertex\nfor _ in range(m):\n    u, v = map(int, input().split())\n\nk = int(input())\n",
    examples: [{ input: "5 4\n1 2\n1 3\n2 4\n1 5\n1", output: "3" }, { input: "4 3\n1 2\n2 3\n3 4\n2", output: "2" }],
    visibleTestCases: [{ input: "5 4\n1 2\n1 3\n2 4\n1 5\n1", expectedOutput: "3", weight: 1 }, { input: "4 3\n1 2\n2 3\n3 4\n2", expectedOutput: "2", weight: 1 }],
    hiddenTestCases: [{ input: "3 0\n2", expectedOutput: "0", weight: 1 }, { input: "2 1\n1 2\n1", expectedOutput: "1", weight: 1 }, { input: "5 5\n1 2\n1 3\n1 4\n1 5\n2 3\n1", expectedOutput: "4", weight: 1 }, { input: "4 4\n1 2\n2 3\n2 4\n3 4\n4", expectedOutput: "2", weight: 1 }, { input: "6 3\n1 2\n3 4\n5 6\n5", expectedOutput: "1", weight: 1 }]
  },
  {
    id: "heap-min", label: "Heap / Priority Queue", icon: "bi-bar-chart-fill", title: "Minimum Element with a Heap",
    description: "Given numbers, print the smallest value. Solve it using a min-heap (priority queue).",
    inputDescription: "First line n. Second line contains n integers.",
    outputDescription: "Print the smallest value.",
    constraints: "1 ≤ n ≤ 1000.",
    starterCode: "import heapq\n\nn = int(input())\na = list(map(int, input().split()))\n\n# Use heapq to create a min-heap\n",
    examples: [{ input: "5\n7 2 9 1 6", output: "1" }, { input: "4\n10 -3 5 2", output: "-3" }],
    visibleTestCases: [{ input: "5\n7 2 9 1 6", expectedOutput: "1", weight: 1 }, { input: "4\n10 -3 5 2", expectedOutput: "-3", weight: 1 }],
    hiddenTestCases: [{ input: "1\n8", expectedOutput: "8", weight: 1 }, { input: "5\n5 4 3 2 1", expectedOutput: "1", weight: 1 }, { input: "4\n-10 -2 -30 -4", expectedOutput: "-30", weight: 1 }, { input: "6\n100 50 75 25 10 90", expectedOutput: "10", weight: 1 }, { input: "3\n0 5 -1", expectedOutput: "-1", weight: 1 }]
  },
  {
    id: "bit-xor", label: "Bit Manipulation", icon: "bi-toggle-on", title: "Odd One Out Using XOR",
    description: "Every number appears exactly twice except one number that appears once. Find the number that appears once using XOR.",
    inputDescription: "First line n. Second line contains n integers. n is odd.",
    outputDescription: "Print the number that appears once.",
    constraints: "1 ≤ n ≤ 1001. Every number except one occurs exactly twice.",
    starterCode: "n = int(input())\na = list(map(int, input().split()))\n\n# Use XOR (^) to find the unique number\n",
    examples: [{ input: "5\n4 1 2 1 2", output: "4" }, { input: "7\n7 3 5 3 5 7 9", output: "9" }],
    visibleTestCases: [{ input: "5\n4 1 2 1 2", expectedOutput: "4", weight: 1 }, { input: "7\n7 3 5 3 5 7 9", expectedOutput: "9", weight: 1 }],
    hiddenTestCases: [{ input: "1\n8", expectedOutput: "8", weight: 1 }, { input: "5\n1 2 1 2 9", expectedOutput: "9", weight: 1 }, { input: "7\n10 20 30 20 10 40 30", expectedOutput: "40", weight: 1 }, { input: "5\n-1 -2 -1 -2 -7", expectedOutput: "-7", weight: 1 }, { input: "9\n1 2 3 4 5 4 3 2 1", expectedOutput: "5", weight: 1 }]
  },
  {
    id: "dp-climbing", label: "Dynamic Programming", icon: "bi-diagram-2", title: "Climbing Stairs",
    description: "You can climb either 1 or 2 steps at a time. Find the number of different ways to reach step n.",
    inputDescription: "One integer n.",
    outputDescription: "Print the number of ways. For n = 1, the answer is 1; for n = 2, the answer is 2.",
    constraints: "1 ≤ n ≤ 30.",
    starterCode: "n = int(input())\n\n# Use dynamic programming to build the answer\n",
    examples: [{ input: "5", output: "8" }, { input: "6", output: "13" }],
    visibleTestCases: [{ input: "5", expectedOutput: "8", weight: 1 }, { input: "6", expectedOutput: "13", weight: 1 }],
    hiddenTestCases: [{ input: "1", expectedOutput: "1", weight: 1 }, { input: "2", expectedOutput: "2", weight: 1 }, { input: "3", expectedOutput: "3", weight: 1 }, { input: "10", expectedOutput: "89", weight: 1 }, { input: "20", expectedOutput: "10946", weight: 1 }]
  },
  {
    id: "math-prime", label: "Basic Math", icon: "bi-calculator", title: "Check Prime Number",
    description: "Given an integer n, determine whether it is prime.",
    inputDescription: "One integer n.",
    outputDescription: "Print YES if n is prime; otherwise print NO.",
    constraints: "2 ≤ n ≤ 100000.",
    starterCode: "n = int(input())\n\n# Check whether n has a divisor other than 1 and itself\n",
    examples: [{ input: "17", output: "YES" }, { input: "20", output: "NO" }],
    visibleTestCases: [{ input: "17", expectedOutput: "YES", weight: 1 }, { input: "20", expectedOutput: "NO", weight: 1 }],
    hiddenTestCases: [{ input: "2", expectedOutput: "YES", weight: 1 }, { input: "3", expectedOutput: "YES", weight: 1 }, { input: "4", expectedOutput: "NO", weight: 1 }, { input: "97", expectedOutput: "YES", weight: 1 }, { input: "100", expectedOutput: "NO", weight: 1 }]
  }
];

function updateSpecialBeginnerSelectedInfo() {
  const n = specialBeginnerSelectedTopics.size;
  document.getElementById("specialBeginnerSelectedInfo").textContent = `${n} topic${n === 1 ? "" : "s"} selected`;
}

function renderSpecialBeginnerTopics() {
  const wrap = document.getElementById("specialBeginnerTopicList");
  const existingTopics = new Set(
    (specialQuestions || [])
      .filter((q) => q.source === "internal-beginner-dsa" && q.topicId)
      .map((q) => q.topicId)
  );

  wrap.innerHTML = SPECIAL_BEGINNER_PROBLEMS.map((problem) => {
    const exists = existingTopics.has(problem.id);
    const checked = specialBeginnerSelectedTopics.has(problem.id);
    return `
      <label class="question-card p-3 d-flex align-items-center gap-3 ${exists ? "opacity-50" : ""}" style="cursor:${exists ? "not-allowed" : "pointer"}">
        <input class="form-check-input mt-0 special-beginner-check" type="checkbox" data-topic-id="${problem.id}" ${checked && !exists ? "checked" : ""} ${exists ? "disabled" : ""}>
        <div class="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary" style="width:38px;height:38px;flex:0 0 38px"><i class="bi ${problem.icon}"></i></div>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold">${escapeHtmlL(problem.label)} <span class="text-muted">— ${escapeHtmlL(problem.title)}</span></div>
          <div class="small text-muted mt-1">${exists ? "Already imported · students solve this inside your portal" : "Beginner · in-site judge · public + hidden tests included automatically"}</div>
        </div>
      </label>`;
  }).join("");

  wrap.querySelectorAll(".special-beginner-check").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) specialBeginnerSelectedTopics.add(input.dataset.topicId);
      else specialBeginnerSelectedTopics.delete(input.dataset.topicId);
      updateSpecialBeginnerSelectedInfo();
    });
  });
  document.getElementById("specialBeginnerInfo").textContent = `${SPECIAL_BEGINNER_PROBLEMS.length} beginner DSA topics · one in-site problem per topic`;
  updateSpecialBeginnerSelectedInfo();
}

function selectAllSpecialBeginnerTopics() {
  const available = SPECIAL_BEGINNER_PROBLEMS.filter((p) =>
    !(specialQuestions || []).some((q) => q.source === "internal-beginner-dsa" && q.topicId === p.id)
  );
  const allSelected = available.length > 0 && available.every((p) => specialBeginnerSelectedTopics.has(p.id));
  specialBeginnerSelectedTopics = new Set(allSelected ? [] : available.map((p) => p.id));
  renderSpecialBeginnerTopics();
}

async function openSpecialBeginnerImportModal() {
  specialBeginnerSelectedTopics = new Set();
  document.getElementById("specialBeginnerImportError").classList.add("d-none");
  new bootstrap.Modal(document.getElementById("specialBeginnerImportModal")).show();
  renderSpecialBeginnerTopics();
}

async function importSelectedSpecialBeginnerTopics() {
  const errorEl = document.getElementById("specialBeginnerImportError");
  errorEl.classList.add("d-none");
  const selected = SPECIAL_BEGINNER_PROBLEMS.filter((p) => specialBeginnerSelectedTopics.has(p.id));
  if (!selected.length) {
    errorEl.textContent = "Select at least one DSA topic first.";
    errorEl.classList.remove("d-none");
    return;
  }

  const existing = new Set(
    (specialQuestions || [])
      .filter((q) => q.source === "internal-beginner-dsa" && q.topicId)
      .map((q) => q.topicId)
  );
  const chosen = selected.filter((p) => !existing.has(p.id));
  if (!chosen.length) {
    errorEl.textContent = "All selected beginner topics are already imported.";
    errorEl.classList.remove("d-none");
    return;
  }

  try {
    const baseOrder = specialQuestions.length;
    for (let i = 0; i < chosen.length; i++) {
      const p = chosen[i];
      await createSpecialQuestion({
        title: p.title,
        description: p.description,
        inputDescription: p.inputDescription,
        outputDescription: p.outputDescription,
        constraints: p.constraints,
        company: "Beginner DSA",
        category: "DSA",
        topic: p.label,
        topicId: p.id,
        difficulty: "easy",
        marks: 10,
        timeLimit: 5,
        order: baseOrder + i,
        starterCode: p.starterCode,
        examples: p.examples,
        visibleTestCases: p.visibleTestCases,
        hiddenTestCases: p.hiddenTestCases,
        source: "internal-beginner-dsa",
        external: false,
        published: true
      });
    }
    bootstrap.Modal.getInstance(document.getElementById("specialBeginnerImportModal"))?.hide();
    await renderSpecialQuestionsList();
    alert(`${chosen.length} beginner DSA problem${chosen.length === 1 ? "" : "s"} imported. Students can solve them directly inside your portal.`);
  } catch (err) {
    errorEl.textContent = err.message || "Could not import beginner DSA problems.";
    errorEl.classList.remove("d-none");
  }
}

function openSpecialModal(question = null) {
  editingSpecialQuestionId = question?.id || null;
  document.getElementById("specialForm").reset();
  document.getElementById("specialFormError").classList.add("d-none");

  document.getElementById("spTitleInput").value = question?.title || "";
  document.getElementById("spDescInput").value = question?.description || "";
  document.getElementById("spInputDescInput").value = question?.inputDescription || "";
  document.getElementById("spOutputDescInput").value = question?.outputDescription || "";
  document.getElementById("spConstraintsInput").value = question?.constraints || "";
  document.getElementById("spDifficultyInput").value = question?.difficulty || "medium";
  document.getElementById("spMarksInput").value = question?.marks || "";
  document.getElementById("spTimeLimitInput").value = question?.timeLimit || 5;
  document.getElementById("spOrderInput").value = question?.order ?? specialQuestions.length;
  document.getElementById("spStarterInput").value = question?.starterCode || "";

  const knownCompany = question?.company && COMPANY_OPTIONS.includes(question.company) ? question.company : question?.company ? "Other" : "Google";
  document.getElementById("spCompanySelect").value = knownCompany;
  document.getElementById("spCompanyOtherWrap").classList.toggle("d-none", knownCompany !== "Other");
  document.getElementById("spCompanyOtherInput").value = knownCompany === "Other" ? question?.company || "" : "";

  ["spExamplesWrap", "spVisibleTestsWrap", "spHiddenTestsWrap"].forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });
  (question?.examples || [{}]).forEach((ex) => addDynamicRow("spExamplesWrap", "example", ex));
  (question?.visibleTestCases || [{}]).forEach((tc) => addDynamicRow("spVisibleTestsWrap", "test", tc));
  (question?.hiddenTestCases || [{}]).forEach((tc) => addDynamicRow("spHiddenTestsWrap", "test", tc));

  new bootstrap.Modal(document.getElementById("specialModal")).show();
}

document.getElementById("specialForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("specialFormError");
  errorEl.classList.add("d-none");

  const companySelect = document.getElementById("spCompanySelect").value;
  const company = companySelect === "Other" ? document.getElementById("spCompanyOtherInput").value.trim() : companySelect;

  if (!company) {
    errorEl.textContent = "Enter a company name.";
    errorEl.classList.remove("d-none");
    return;
  }

  const publish = document.activeElement?.dataset?.publish === "true";
  const data = {
    title: document.getElementById("spTitleInput").value.trim(),
    description: document.getElementById("spDescInput").value.trim(),
    inputDescription: document.getElementById("spInputDescInput").value.trim(),
    outputDescription: document.getElementById("spOutputDescInput").value.trim(),
    constraints: document.getElementById("spConstraintsInput").value.trim(),
    company,
    difficulty: document.getElementById("spDifficultyInput").value,
    marks: Number(document.getElementById("spMarksInput").value),
    timeLimit: Number(document.getElementById("spTimeLimitInput").value),
    order: Number(document.getElementById("spOrderInput").value),
    starterCode: document.getElementById("spStarterInput").value,
    examples: collectDynamicRows("spExamplesWrap", false).filter((r) => r.input || r.output),
    visibleTestCases: collectDynamicRows("spVisibleTestsWrap", true).filter((r) => r.input || r.expectedOutput),
    hiddenTestCases: collectDynamicRows("spHiddenTestsWrap", true).filter((r) => r.input || r.expectedOutput),
    published: publish
  };

  if (!data.visibleTestCases.length && !data.hiddenTestCases.length) {
    errorEl.textContent = "Add at least one test case (public or hidden).";
    errorEl.classList.remove("d-none");
    return;
  }

  try {
    if (editingSpecialQuestionId) {
      await updateSpecialQuestion(editingSpecialQuestionId, data);
    } else {
      await createSpecialQuestion(data);
    }
    bootstrap.Modal.getInstance(document.getElementById("specialModal"))?.hide();
    await renderSpecialQuestionsList();
  } catch (err) {
    errorEl.textContent = err.message || "Could not save question.";
    errorEl.classList.remove("d-none");
  }
});
