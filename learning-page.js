// js/learning-page.js
// Drives learning.html: read concepts in order -> pass the MCQ test ->
// practice coding questions. No timers/fullscreen/violations here -
// this is self-paced practice, not a proctored exam.

import { requireRole, wireLogoutButtons } from "./auth.js";
import {
  getLevel,
  listConcepts,
  listMcqQuestions,
  listLearningCodingQuestions,
  getProgress,
  markConceptComplete,
  recordMcqAttempt,
  createLearningCodeSubmission,
  listLearningCodeSubmissions,
  computeConceptStatuses,
  allConceptsCompleted
} from "./learning.js";
import { ensurePyodide, runAllTestCases } from "./python-runner.js";
import { computeCodingMarks } from "./grading.js";

wireLogoutButtons();

const params = new URLSearchParams(window.location.search);
const levelId = params.get("levelId");

let currentUser = null;
let level = null;
let concepts = [];
let mcqQuestions = [];
let codingQuestions = [];
let progress = null;
let view = { type: "concept", id: null }; // current right-panel view
let mcqAnswers = {};
let cmEditor = null;

if (!levelId) window.location.href = "student-dashboard.html";

requireRole("student", async (user) => {
  currentUser = user;
  await load();
});

async function load() {
  level = await getLevel(levelId);
  const body = document.getElementById("pageBody");

  if (!level || level.active === false) {
    body.innerHTML = `<div class="alert alert-warning mt-4">This learning level isn't available.</div>`;
    return;
  }

  [concepts, mcqQuestions, codingQuestions, progress] = await Promise.all([
    listConcepts(levelId),
    listMcqQuestions(levelId),
    listLearningCodingQuestions(levelId),
    getProgress(levelId, currentUser.uid)
  ]);

  body.innerHTML = "";
  body.appendChild(document.getElementById("tmplLoaded").content.cloneNode(true));

  document.getElementById("levelTitle").textContent = level.title;
  document.getElementById("levelDesc").textContent = level.description || "";

  view = { type: "concept", id: concepts[0]?.id || null };
  renderNav();
  renderContent();
}

/* ============================================================
   NAV
   ============================================================ */
function renderNav() {
  const nav = document.getElementById("learningNav");
  const conceptRows = computeConceptStatuses(concepts, progress);
  const mcqDone = allConceptsCompleted(concepts, progress);
  const mcqStatus = progress?.mcqPassed ? "completed" : mcqDone ? "unlocked" : "locked";
  const codingStatus = progress?.codingUnlocked ? "unlocked" : "locked";

  const items = [
    ...conceptRows.map((c, i) => ({ kind: "concept", id: c.id, label: `${i + 1}. ${c.title}`, status: c.status })),
    { kind: "mcq", id: "mcq", label: "MCQ Test", status: mcqStatus },
    { kind: "coding", id: "coding", label: "Coding Practice", status: codingStatus }
  ];

  nav.innerHTML = items
    .map((item) => {
      const icon =
        item.status === "completed" ? "bi-check-circle-fill text-success" : item.status === "locked" ? "bi-lock-fill text-muted" : "bi-unlock-fill text-primary";
      const active = view.type === item.kind && (item.kind !== "concept" || view.id === item.id);
      const disabled = item.status === "locked";
      return `
        <button type="button" class="btn btn-sm text-start learning-nav-item ${active ? "active" : ""} ${disabled ? "disabled" : ""}"
          data-kind="${item.kind}" data-id="${item.id}" ${disabled ? "disabled" : ""}>
          <i class="bi ${icon} me-2"></i>${item.label}
        </button>`;
    })
    .join("");

  nav.querySelectorAll("[data-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = { type: btn.dataset.kind, id: btn.dataset.id };
      renderNav();
      renderContent();
    });
  });
}

/* ============================================================
   CONTENT ROUTER
   ============================================================ */
function renderContent() {
  const content = document.getElementById("learningContent");
  if (view.type === "concept") return renderConcept(content);
  if (view.type === "mcq") return renderMcq(content);
  if (view.type === "coding") return renderCodingList(content);
  if (view.type === "codingQuestion") return renderCodingQuestion(content);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------- Concepts ---------- */
function renderConcept(content) {
  const concept = concepts.find((c) => c.id === view.id);
  if (!concept) {
    content.innerHTML = `<p class="text-muted">Select a concept from the left to begin.</p>`;
    return;
  }
  const statuses = computeConceptStatuses(concepts, progress);
  const status = statuses.find((c) => c.id === concept.id)?.status;
  const index = concepts.findIndex((c) => c.id === concept.id);
  const isLast = index === concepts.length - 1;

  content.innerHTML = `
    <div class="d-flex justify-content-between align-items-start mb-3">
      <h5 class="mb-0">${escapeHtml(concept.title)}</h5>
      ${status === "completed" ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Completed</span>' : ""}
    </div>
    <div class="concept-content mb-4">${escapeHtml(concept.content).replace(/\n/g, "<br>")}</div>
    <div id="conceptActionArea"></div>
  `;

  const actionArea = document.getElementById("conceptActionArea");
  if (status === "completed") {
    const next = concepts[index + 1];
    if (next) {
      const btn = document.createElement("button");
      btn.className = "btn btn-brand";
      btn.innerHTML = `Next: ${escapeHtml(next.title)} <i class="bi bi-arrow-right ms-1"></i>`;
      btn.addEventListener("click", () => {
        view = { type: "concept", id: next.id };
        renderNav();
        renderContent();
      });
      actionArea.appendChild(btn);
    } else {
      actionArea.innerHTML = `<div class="alert alert-success mb-0"><i class="bi bi-stars me-1"></i>All concepts completed! The MCQ Test is now unlocked.</div>`;
    }
  } else {
    const btn = document.createElement("button");
    btn.className = "btn btn-brand";
    btn.innerHTML = isLast
      ? `Mark Complete <i class="bi bi-check-lg ms-1"></i>`
      : `Mark Complete &amp; Continue <i class="bi bi-arrow-right ms-1"></i>`;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      progress = await markConceptComplete(
        levelId,
        currentUser.uid,
        concept.id,
        concepts.map((c) => c.id)
      );
      const next = concepts[index + 1];
      view = next ? { type: "concept", id: next.id } : { type: "concept", id: concept.id };
      renderNav();
      renderContent();
    });
    actionArea.appendChild(btn);
  }
}

/* ---------- MCQ Test ---------- */
function renderMcq(content) {
  const mcqDone = allConceptsCompleted(concepts, progress);
  if (!mcqDone) {
    content.innerHTML = `<div class="alert alert-secondary mb-0"><i class="bi bi-lock-fill me-1"></i>Complete every concept first to unlock the MCQ test.</div>`;
    return;
  }
  if (!mcqQuestions.length) {
    content.innerHTML = `<div class="text-muted">No MCQ questions have been added for this level yet.</div>`;
    return;
  }

  if (progress?.mcqPassed) {
    renderMcqResult(content, { passed: true, score: progress.mcqScore, total: progress.mcqTotal, percentage: progress.mcqPercentage });
    return;
  }

  mcqAnswers = {};
  content.innerHTML = `
    <h5 class="mb-3"><i class="bi bi-list-check me-1"></i>MCQ Test</h5>
    <p class="text-muted small">Pass mark: ${level.passMark ?? 40}%. You can retake this test if you don't pass.</p>
    <div id="mcqQuestionsWrap" class="d-flex flex-column gap-4 mb-3"></div>
    <button class="btn btn-brand" id="submitMcqBtn"><i class="bi bi-send-check me-1"></i>Submit Test</button>
  `;

  const wrap = document.getElementById("mcqQuestionsWrap");
  mcqQuestions.forEach((q, qi) => {
    const block = document.createElement("div");
    block.innerHTML = `<div class="fw-semibold mb-2">${qi + 1}. ${escapeHtml(q.questionText)}</div>`;
    const optWrap = document.createElement("div");
    optWrap.className = "d-flex flex-column gap-2";
    q.options.forEach((opt, oi) => {
      const div = document.createElement("div");
      div.className = "mcq-option";
      div.innerHTML = `<input type="radio" name="mcq_${q.id}" /> <span>${escapeHtml(opt)}</span>`;
      div.addEventListener("click", () => {
        mcqAnswers[q.id] = oi;
        [...optWrap.children].forEach((c) => c.classList.remove("selected"));
        div.classList.add("selected");
        div.querySelector("input").checked = true;
      });
      optWrap.appendChild(div);
    });
    block.appendChild(optWrap);
    wrap.appendChild(block);
  });

  document.getElementById("submitMcqBtn").addEventListener("click", async () => {
    const total = mcqQuestions.reduce((sum, q) => sum + (q.marks || 0), 0);
    const score = mcqQuestions.reduce((sum, q) => sum + (mcqAnswers[q.id] === q.correctOptionIndex ? q.marks || 0 : 0), 0);
    const percentage = total ? Math.round((score / total) * 10000) / 100 : 0;
    const passed = percentage >= (level.passMark ?? 40);

    await recordMcqAttempt(levelId, currentUser.uid, { score, total, percentage, passed });
    progress = await getProgress(levelId, currentUser.uid);
    renderNav();
    renderMcqResult(content, { passed, score, total, percentage });
  });
}

function renderMcqResult(content, { passed, score, total, percentage }) {
  content.innerHTML = `
    <div class="text-center py-3">
      <div class="result-badge-icon ${passed ? "pass" : "fail"} mx-auto mb-3">
        <i class="bi ${passed ? "bi-trophy-fill" : "bi-x-lg"}"></i>
      </div>
      <span class="badge ${passed ? "bg-success" : "bg-danger"} fs-6 px-3 py-2 mb-2">
        <i class="bi ${passed ? "bi-check-circle-fill" : "bi-x-circle-fill"} me-1"></i>${passed ? "PASSED" : "NOT YET PASSED"}
      </span>
      <div class="display-6 fw-bold mt-2">${score} <span class="fs-5 text-muted fw-normal">/ ${total}</span></div>
      <div class="text-muted mb-3">${percentage}% \u00b7 Pass mark: ${level.passMark ?? 40}%</div>
      ${
        passed
          ? `<div class="alert alert-success mb-0"><i class="bi bi-unlock-fill me-1"></i>Coding Practice is now unlocked.</div>`
          : `<button class="btn btn-brand" id="retakeMcqBtn"><i class="bi bi-arrow-repeat me-1"></i>Retake Test</button>`
      }
    </div>
  `;
  document.getElementById("retakeMcqBtn")?.addEventListener("click", () => renderMcq(content));
}

/* ---------- Coding Practice ---------- */
function renderCodingList(content) {
  if (!progress?.codingUnlocked) {
    content.innerHTML = `<div class="alert alert-secondary mb-0"><i class="bi bi-lock-fill me-1"></i>Pass the MCQ test first to unlock coding practice.</div>`;
    return;
  }
  if (!codingQuestions.length) {
    content.innerHTML = `<div class="text-muted">No coding questions have been added for this level yet.</div>`;
    return;
  }

  content.innerHTML = `<h5 class="mb-3"><i class="bi bi-code-slash me-1"></i>Coding Practice</h5><div id="codingListWrap" class="d-flex flex-column gap-2"></div>`;
  const wrap = document.getElementById("codingListWrap");

  wrap.innerHTML = codingQuestions
    .map(
      (q, i) => `
      <div class="question-card p-3 d-flex justify-content-between align-items-center">
        <div>
          <span class="badge bg-secondary me-2">Q${i + 1}</span>
          <strong>${escapeHtml(q.title)}</strong>
          <div class="text-muted small mt-1">${q.marks} marks</div>
        </div>
        <button class="btn btn-sm btn-brand" data-open-question="${q.id}">Practice <i class="bi bi-arrow-right ms-1"></i></button>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-open-question]").forEach((btn) => {
    btn.addEventListener("click", () => {
      view = { type: "codingQuestion", id: btn.dataset.openQuestion };
      renderNav();
      renderContent();
    });
  });
}

function renderCodingQuestion(content) {
  const q = codingQuestions.find((x) => x.id === view.id);
  if (!q) {
    content.innerHTML = `<p class="text-muted">Question not found.</p>`;
    return;
  }

  const samplesHtml = (q.examples || [])
    .map(
      (ex, i) => `<div class="mb-2"><div class="small text-muted">Sample ${i + 1}</div><div class="testcase-result">Input:\n${escapeHtml(ex.input || "")}\n\nOutput:\n${escapeHtml(ex.output || "")}</div></div>`
    )
    .join("");

  content.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary mb-3" id="backToCodingListBtn"><i class="bi bi-arrow-left me-1"></i>Back to list</button>
    <div class="row g-3">
      <div class="col-lg-5">
        <h5 class="mb-2">${escapeHtml(q.title)}</h5>
        <p>${escapeHtml(q.description)}</p>
        ${q.inputDescription ? `<p class="small"><strong>Input:</strong> ${escapeHtml(q.inputDescription)}</p>` : ""}
        ${q.outputDescription ? `<p class="small"><strong>Output:</strong> ${escapeHtml(q.outputDescription)}</p>` : ""}
        ${samplesHtml}
        <div id="learningSubmissionHistory" class="mt-3"></div>
      </div>
      <div class="col-lg-7">
        <textarea id="learningCodeEditor">${escapeHtml(q.starterCode || "")}</textarea>
        <div class="d-flex align-items-center gap-2 mt-2">
          <button class="btn btn-outline-secondary btn-sm" id="learningRunBtn"><i class="bi bi-play-fill me-1"></i>Run Code</button>
          <button class="btn btn-brand btn-sm" id="learningSubmitBtn"><i class="bi bi-cloud-arrow-up me-1"></i>Submit Code</button>
          <span class="python-status" id="learningPythonStatus"></span>
        </div>
        <div id="learningTestResults" class="d-flex flex-column gap-2 mt-3"></div>
      </div>
    </div>
  `;

  document.getElementById("backToCodingListBtn").addEventListener("click", () => {
    view = { type: "coding", id: "coding" };
    renderNav();
    renderContent();
  });

  cmEditor = CodeMirror.fromTextArea(document.getElementById("learningCodeEditor"), {
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    matchBrackets: true,
    theme: "dracula",
    viewportMargin: Infinity
  });
  cmEditor.setSize("100%", "300px");

  document.getElementById("learningRunBtn").addEventListener("click", () => runVisible(q));
  document.getElementById("learningSubmitBtn").addEventListener("click", () => submitPractice(q));
  renderLearningHistory(q.id);
}

async function runVisible(q) {
  const statusEl = document.getElementById("learningPythonStatus");
  const resultsEl = document.getElementById("learningTestResults");
  statusEl.textContent = "Running Python...";
  resultsEl.innerHTML = "";
  try {
    const pyodide = await ensurePyodide();
    const results = await runAllTestCases(pyodide, cmEditor.getValue(), q.visibleTestCases || [], (q.timeLimit || 5) * 1000);
    statusEl.textContent = `${results.filter((r) => r.passed).length} / ${results.length} public test cases passed`;
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="testcase-result ${r.passed ? "pass" : "fail"}">
          <div><strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong> \u00b7 ${r.executionTimeMs} ms</div>
          <div>Input: ${escapeHtml(r.input || "(none)")}</div>
          <div>Expected: ${escapeHtml(r.expectedOutput)}</div>
          <div>Got: ${escapeHtml(r.actualOutput)}</div>
          ${r.errorMessage ? `<div>Error: ${escapeHtml(r.errorMessage)}</div>` : ""}
        </div>`
      )
      .join("");
  } catch (err) {
    statusEl.textContent = "Could not run Python in this browser.";
  }
}

async function submitPractice(q) {
  const statusEl = document.getElementById("learningPythonStatus");
  const resultsEl = document.getElementById("learningTestResults");
  statusEl.textContent = "Submitting and grading...";
  document.getElementById("learningSubmitBtn").disabled = true;

  try {
    const pyodide = await ensurePyodide();
    const allTests = [...(q.visibleTestCases || []), ...(q.hiddenTestCases || [])];
    const results = await runAllTestCases(pyodide, cmEditor.getValue(), allTests, (q.timeLimit || 5) * 1000);
    const passedCount = results.filter((r) => r.passed).length;
    const marksObtained = computeCodingMarks(q.marks, results);
    const totalExecutionTimeMs = results.reduce((sum, r) => sum + (r.executionTimeMs || 0), 0);
    const hadError = results.some((r) => r.executionStatus === "error" || r.executionStatus === "timeout");

    await createLearningCodeSubmission({
      studentId: currentUser.uid,
      levelId,
      questionId: q.id,
      language: "python",
      sourceCode: cmEditor.getValue(),
      executionStatus: hadError ? "error" : "completed",
      testCasesPassed: passedCount,
      totalTestCases: allTests.length,
      marksObtained,
      executionTimeMs: totalExecutionTimeMs,
      errorMessage: results.find((r) => r.errorMessage)?.errorMessage || null
    });

    statusEl.textContent = `Submitted: ${passedCount} / ${allTests.length} test cases passed \u00b7 ${marksObtained} / ${q.marks} marks`;
    resultsEl.innerHTML = results
      .map((r, i) => `<div class="testcase-result ${r.passed ? "pass" : "fail"}"><strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong></div>`)
      .join("");
    renderLearningHistory(q.id);
  } catch (err) {
    statusEl.textContent = "Could not submit code.";
  } finally {
    document.getElementById("learningSubmitBtn").disabled = false;
  }
}

async function renderLearningHistory(questionId) {
  const wrap = document.getElementById("learningSubmissionHistory");
  if (!wrap) return;
  const history = await listLearningCodeSubmissions(currentUser.uid, questionId);
  if (!history.length) {
    wrap.innerHTML = `<div class="small text-muted">No submissions yet for this question.</div>`;
    return;
  }
  wrap.innerHTML =
    `<div class="small fw-semibold mb-1">Your Submissions</div>` +
    history
      .map(
        (s) => `
        <div class="small text-muted d-flex justify-content-between border-bottom py-1">
          <span>${new Date(s.submittedAt).toLocaleTimeString()}</span>
          <span>${s.testCasesPassed}/${s.totalTestCases} passed</span>
          <span>${s.marksObtained} marks</span>
        </div>`
      )
      .join("");
}
