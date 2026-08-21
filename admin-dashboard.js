// js/admin-dashboard.js
// UI wiring for admin-dashboard.html: sidebar navigation, students,
// exams, questions (MCQ + coding), analytics, results, Excel export.

import { requireRole, wireLogoutButtons } from "./auth.js";
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
  exportResultsToExcel
} from "./admin.js";
import {
  computeOverallStats,
  computeSectionStats,
  renderStatCards,
  renderSectionTable,
  renderResultsTable,
  buildResultRows
} from "./dashboard.js";
import { auth } from "./firebase-config.js";

wireLogoutButtons();

let students = [];
let exams = [];
let submissions = [];
let currentSectionFilter = "all";
let editingStudentUid = null;
let editingExamId = null;
let activeExamForQuestions = null;
let questions = [];
let editingQuestionId = null;

/* ============================================================
   AUTH + INITIAL LOAD
   ============================================================ */
requireRole("admin", async (user, profile) => {
  document.getElementById("adminName").textContent = profile.name || profile.email;
  populateSectionControls();
  await loadEverything();
});

async function loadEverything() {
  [students, exams, submissions] = await Promise.all([
    listStudents("all"),
    listExams(),
    listSubmissions()
  ]);
  renderStudentsTable();
  renderExamsTable();
  populateFilterOptions();
  renderAnalytics();
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */
const paneTitles = {
  analyticsPane: "Analytics",
  resultsPane: "Results",
  studentsPane: "Students",
  examsPane: "Exams"
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

  applyFiltersAndRenderResults();
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
  const rows = buildResultRows(submissions, students, exams, currentFilters());
  renderResultsTable(document.getElementById("resultsTableBody"), rows);

  document.getElementById("exportExcelBtn").onclick = () => {
    exportResultsToExcel(
      rows,
      [
        { key: "rollNumber", label: "Roll Number", width: 14 },
        { key: "name", label: "Name", width: 22 },
        { key: "section", label: "Section", width: 10 },
        { key: "examTitle", label: "Exam", width: 26 },
        { key: "score", label: "Score", width: 10 },
        { key: "percentage", label: "Percentage", width: 12 },
        { key: "status", label: "Status", width: 16 },
        { key: "violations", label: "Violations", width: 12 },
        { key: "submittedAt", label: "Submitted Time", width: 22 }
      ],
      { filename: "exam-results.xlsx", sheetName: "Results", title: "Coding Exam Platform - Student Results" }
    );
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
  const filtered = currentSectionFilter === "all" ? students : students.filter((s) => s.section === currentSectionFilter);
  const tbody = document.getElementById("studentsTableBody");

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No students in this section yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (s) => `
      <tr>
        <td>${s.rollNumber}</td>
        <td>${s.name}</td>
        <td><span class="badge bg-secondary">${s.section}</span></td>
        <td>${s.email}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" data-edit="${s.uid}"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-delete="${s.uid}"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openEditStudent(btn.dataset.edit)));
  tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => handleDeleteStudent(btn.dataset.delete)));
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
  document.getElementById("studentPasswordGroup").classList.remove("d-none");
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
  document.getElementById("studentPasswordGroup").classList.add("d-none");
  document.getElementById("resetPasswordGroup").classList.remove("d-none");
  new bootstrap.Modal(document.getElementById("studentModal")).show();
}

document.getElementById("generatePasswordBtn").addEventListener("click", () => {
  const random = Math.random().toString(36).slice(-8);
  document.getElementById("studentPasswordInput").value = random;
});

document.getElementById("resetPasswordBtn").addEventListener("click", async () => {
  const email = document.getElementById("studentEmailInput").value.trim();
  try {
    await sendStudentPasswordReset(email);
    const infoEl = document.getElementById("studentCreatedInfo");
    infoEl.textContent = `Password reset email sent to ${email}.`;
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
      await updateStudent(editingStudentUid, { name, rollNumber, section });
      const idx = students.findIndex((s) => s.uid === editingStudentUid);
      if (idx > -1) students[idx] = { ...students[idx], name, rollNumber, section };
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
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No exams created yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = exams
    .map(
      (ex) => `
      <tr>
        <td>${ex.title}</td>
        <td><span class="badge exam-type-badge ${ex.examType || "mcq"}">${(ex.examType || "mcq").toUpperCase()}</span></td>
        <td>${ex.duration} min</td>
        <td>${ex.totalMarks}</td>
        <td>${ex.active ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-secondary">Inactive</span>'}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-questions="${ex.id}" title="Manage Questions"><i class="bi bi-list-check"></i></button>
          <button class="btn btn-sm btn-outline-primary me-1" data-edit-exam="${ex.id}" title="Edit"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm ${ex.active ? "btn-outline-warning" : "btn-outline-success"} me-1" data-toggle-exam="${ex.id}" title="${ex.active ? "Deactivate" : "Activate"}">
            <i class="bi ${ex.active ? "bi-pause-fill" : "bi-play-fill"}"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" data-delete-exam="${ex.id}" title="Delete"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`
    )
    .join("");

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
  if (!confirm("Delete this exam? Its questions will remain orphaned unless removed separately. This cannot be undone.")) return;
  await deleteExamDoc(examId);
  exams = exams.filter((e) => e.id !== examId);
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
              <button class="btn btn-sm btn-outline-primary me-1" data-edit-q="${q.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger" data-delete-q="${q.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>
        </div>`;
      }
      return `
        <div class="question-card p-3">
          <div class="d-flex justify-content-between">
            <div>
              <span class="badge bg-secondary me-2">Q${i + 1}</span>
              <strong>${q.title}</strong>
              <div class="text-muted small mt-1">
                ${q.marks} marks &middot; ${q.timeLimit || "-"} min &middot;
                ${(q.visibleTestCases || []).length} visible / ${(q.hiddenTestCases || []).length} hidden test cases
              </div>
            </div>
            <div class="text-nowrap">
              <button class="btn btn-sm btn-outline-primary me-1" data-edit-q="${q.id}"><i class="bi bi-pencil"></i></button>
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

  const labelA = rowType === "example" ? "Input" : "Input";
  const labelB = rowType === "example" ? "Expected Output" : "Expected Output";

  row.innerHTML = `
    <div class="col-5">
      <textarea class="form-control mono" rows="2" placeholder="${labelA}" data-field="input">${initial.input || ""}</textarea>
    </div>
    <div class="col-5">
      <textarea class="form-control mono" rows="2" placeholder="${labelB}" data-field="output">${initial.output || initial.expectedOutput || ""}</textarea>
    </div>
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
    return isTestCase ? { input, expectedOutput: output } : { input, output };
  });
}

function openCodingModal(question = null) {
  editingQuestionId = question?.id || null;
  document.getElementById("codingForm").reset();
  document.getElementById("codingFormError").classList.add("d-none");

  document.getElementById("codingTitleInput").value = question?.title || "";
  document.getElementById("codingDescInput").value = question?.description || "";
  document.getElementById("codingMarksInput").value = question?.marks || "";
  document.getElementById("codingTimeLimitInput").value = question?.timeLimit || 10;
  document.getElementById("codingStarterInput").value = question?.starterCode || "";

  ["examplesWrap", "visibleTestsWrap", "hiddenTestsWrap"].forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });

  (question?.examples || [{}]).forEach((ex) => addDynamicRow("examplesWrap", "example", ex));
  (question?.visibleTestCases || [{}]).forEach((tc) => addDynamicRow("visibleTestsWrap", "test", tc));
  (question?.hiddenTestCases || [{}]).forEach((tc) => addDynamicRow("hiddenTestsWrap", "test", tc));

  new bootstrap.Modal(document.getElementById("codingModal")).show();
}

document.getElementById("codingForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("codingFormError");
  errorEl.classList.add("d-none");

  const data = {
    examId: activeExamForQuestions.id,
    type: "coding",
    language: "python",
    title: document.getElementById("codingTitleInput").value.trim(),
    description: document.getElementById("codingDescInput").value.trim(),
    marks: Number(document.getElementById("codingMarksInput").value),
    timeLimit: Number(document.getElementById("codingTimeLimitInput").value),
    starterCode: document.getElementById("codingStarterInput").value,
    examples: collectDynamicRows("examplesWrap", false).filter((r) => r.input || r.output),
    visibleTestCases: collectDynamicRows("visibleTestsWrap", true).filter((r) => r.input || r.expectedOutput),
    hiddenTestCases: collectDynamicRows("hiddenTestsWrap", true).filter((r) => r.input || r.expectedOutput)
  };

  if (!data.visibleTestCases.length && !data.hiddenTestCases.length) {
    errorEl.textContent = "Add at least one test case (visible or hidden).";
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
