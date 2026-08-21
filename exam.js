// js/exam.js
// Student exam-taking experience: fullscreen + tab-switch monitoring,
// countdown timer with auto-submit, MCQ + Python coding questions,
// in-browser Python execution/grading via Pyodide, and autosave.

import { requireRole, wireLogoutButtons } from "./auth.js";
import {
  getExamById,
  getQuestionsForExam,
  getSubmission,
  startSubmission,
  saveAnswers,
  incrementViolation,
  finalizeSubmission
} from "./student.js";

wireLogoutButtons();

const params = new URLSearchParams(window.location.search);
const examId = params.get("examId");

let currentUser = null;
let studentProfile = null;
let exam = null;
let questions = [];
let answers = {}; // { [questionId]: number (mcq) | { code } (coding) }
let currentIndex = 0;
let violationCount = 0;
let maxViolations = 3;
let remainingSeconds = 0;
let timerInterval = null;
let examLocked = false;
let saveTimeout = null;
let pyodideInstance = null;
let pyodideLoading = null;

if (!examId) {
  window.location.href = "student-dashboard.html";
}

requireRole("student", async (user, profile) => {
  currentUser = user;
  studentProfile = profile;
  await loadExam();
});

/* ============================================================
   LOAD + START SCREEN
   ============================================================ */
async function loadExam() {
  exam = await getExamById(examId);

  if (!exam || !exam.active) {
    showStartError("This exam is not available.");
    return;
  }

  const existing = await getSubmission(examId, currentUser.uid);
  if (existing && existing.status !== "in-progress") {
    alert("You have already submitted this exam.");
    window.location.href = "student-dashboard.html";
    return;
  }

  questions = await getQuestionsForExam(examId);
  maxViolations = exam.maxViolations || 3;

  document.getElementById("startExamTitle").textContent = exam.title;
  document.getElementById("startExamDesc").textContent = exam.description || "";
  document.getElementById("startDuration").textContent = exam.duration;
  document.getElementById("startMarks").textContent = exam.totalMarks;
  document.getElementById("startMaxViolations").textContent = maxViolations;

  document.getElementById("enterFullscreenBtn").addEventListener("click", handleStart);

  // Kick off Pyodide loading in the background for coding exams so it's
  // likely ready by the time the student opens their first question.
  if (exam.examType === "coding") {
    ensurePyodide().catch((e) => console.warn("Pyodide preload failed:", e));
  }
}

function showStartError(message) {
  const el = document.getElementById("startError");
  el.textContent = message;
  el.classList.remove("d-none");
  document.getElementById("enterFullscreenBtn").disabled = true;
}

async function handleStart() {
  try {
    await document.documentElement.requestFullscreen();
  } catch (err) {
    showStartError("Fullscreen was blocked by your browser. Please allow fullscreen and try again.");
    return;
  }

  let submission = await getSubmission(examId, currentUser.uid);
  if (!submission) {
    await startSubmission(examId, studentProfile, maxViolations);
    submission = await getSubmission(examId, currentUser.uid);
  }

  answers = submission.answers || {};
  violationCount = submission.violations || 0;

  const elapsedSeconds = (Date.now() - new Date(submission.startedAt).getTime()) / 1000;
  remainingSeconds = Math.max(Math.round(exam.duration * 60 - elapsedSeconds), 0);

  document.getElementById("startScreen").classList.add("d-none");
  document.getElementById("examUi").classList.remove("d-none");

  document.getElementById("topExamName").textContent = exam.title;
  document.getElementById("topStudentInfo").textContent =
    `${studentProfile.name} \u00b7 Roll ${studentProfile.rollNumber} \u00b7 Section ${studentProfile.section}`;
  document.getElementById("violationCount").textContent = violationCount;

  renderQuestionNav();
  renderCurrentQuestion();
  startTimer();
  attachSecurityListeners();

  if (remainingSeconds <= 0) {
    handleSubmit("auto-submitted");
  }
}

/* ============================================================
   TIMER
   ============================================================ */
function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    remainingSeconds -= 1;
    updateTimerDisplay();
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      handleSubmit("auto-submitted");
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(Math.max(remainingSeconds, 0) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.max(remainingSeconds, 0) % 60;
  const el = document.getElementById("timerDisplay");
  el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  el.classList.toggle("timer-warning", remainingSeconds <= 60);
}

/* ============================================================
   SECURITY: fullscreen exit + tab switch + copy/paste block
   ============================================================ */
function attachSecurityListeners() {
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("contextmenu", blockEvent);
  document.addEventListener("copy", blockEvent);
  document.addEventListener("cut", blockEvent);
  document.addEventListener("paste", blockEvent);
  window.addEventListener("beforeunload", onBeforeUnload);
}

function detachSecurityListeners() {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  document.removeEventListener("contextmenu", blockEvent);
  document.removeEventListener("copy", blockEvent);
  document.removeEventListener("cut", blockEvent);
  document.removeEventListener("paste", blockEvent);
  window.removeEventListener("beforeunload", onBeforeUnload);
}

function blockEvent(e) {
  if (examLocked) return;
  e.preventDefault();
}

function onBeforeUnload(e) {
  if (examLocked) return;
  e.preventDefault();
  e.returnValue = "";
}

function onFullscreenChange() {
  if (examLocked) return;
  if (!document.fullscreenElement) {
    registerViolation("You exited fullscreen. This has been recorded.");
  }
}

function onVisibilityChange() {
  if (examLocked) return;
  if (document.hidden) {
    registerViolation("You switched tabs or minimized the window. This has been recorded.");
  }
}

async function registerViolation(message) {
  violationCount += 1;
  document.getElementById("violationCount").textContent = violationCount;
  incrementViolation(examId, currentUser.uid, violationCount).catch(() => {});

  if (violationCount >= maxViolations) {
    handleSubmit("auto-submitted", "Maximum violations reached. Your exam was auto-submitted.");
    return;
  }

  document.getElementById("violationMessage").textContent = message;
  document.getElementById("violationModalCount").textContent = violationCount;
  document.getElementById("violationModalMax").textContent = maxViolations;
  const modal = new bootstrap.Modal(document.getElementById("violationModal"));
  modal.show();

  document.getElementById("violationAckBtn").onclick = async () => {
    modal.hide();
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (e) {
        /* user may need to click again; fullscreenchange will re-fire if they leave again */
      }
    }
  };
}

/* ============================================================
   QUESTION NAVIGATION + RENDERING
   ============================================================ */
function renderQuestionNav() {
  const nav = document.getElementById("questionNav");
  nav.innerHTML = questions
    .map((q, i) => {
      const answered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== "";
      const classes = ["btn", "btn-sm", "question-nav-btn", answered ? "answered" : "btn-outline-secondary"];
      if (i === currentIndex) classes.push("current");
      return `<button type="button" class="${classes.join(" ")}" data-index="${i}">${i + 1}</button>`;
    })
    .join("");

  nav.querySelectorAll("[data-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentIndex = Number(btn.dataset.index);
      renderCurrentQuestion();
      renderQuestionNav();
    });
  });
}

function renderCurrentQuestion() {
  const q = questions[currentIndex];
  const card = document.getElementById("questionCard");
  if (!q) {
    card.innerHTML = `<p class="text-muted">No questions in this exam yet.</p>`;
    return;
  }
  q.type === "mcq" ? renderMcqQuestion(card, q) : renderCodingQuestion(card, q);
}

function renderMcqQuestion(card, q) {
  const selected = answers[q.id];
  card.innerHTML = `
    <div class="d-flex justify-content-between mb-2">
      <span class="badge bg-secondary">Question ${currentIndex + 1} of ${questions.length}</span>
      <span class="badge bg-brand">${q.marks} marks</span>
    </div>
    <h5 class="mb-4">${q.questionText}</h5>
    <div class="d-flex flex-column gap-2" id="mcqOptionsList"></div>
  `;

  const list = document.getElementById("mcqOptionsList");
  q.options.forEach((opt, i) => {
    const div = document.createElement("div");
    div.className = `mcq-option ${selected === i ? "selected" : ""}`;
    div.innerHTML = `<input type="radio" name="mcqAnswer" ${selected === i ? "checked" : ""} /> <span>${opt}</span>`;
    div.addEventListener("click", () => {
      answers[q.id] = i;
      scheduleAutosave();
      renderMcqQuestion(card, q);
      renderQuestionNav();
    });
    list.appendChild(div);
  });
}

function renderCodingQuestion(card, q) {
  const saved = answers[q.id] || {};
  const code = saved.code !== undefined ? saved.code : q.starterCode || "";

  const examplesHtml = (q.examples || [])
    .map(
      (ex, i) => `
      <div class="mb-2">
        <div class="small text-muted">Example ${i + 1}</div>
        <div class="testcase-result">Input:\n${escapeHtml(ex.input || "")}\n\nOutput:\n${escapeHtml(ex.output || "")}</div>
      </div>`
    )
    .join("");

  card.innerHTML = `
    <div class="d-flex justify-content-between mb-2">
      <span class="badge bg-secondary">Question ${currentIndex + 1} of ${questions.length}</span>
      <span class="badge bg-brand">${q.marks} marks</span>
    </div>
    <h5 class="mb-2">${q.title}</h5>
    <p class="text-muted">${q.description}</p>
    ${examplesHtml ? `<div class="mb-3">${examplesHtml}</div>` : ""}

    <label class="form-label fw-semibold">Your Code (Python)</label>
    <textarea id="codeEditor" class="form-control mono" spellcheck="false">${escapeHtml(code)}</textarea>

    <div class="d-flex align-items-center gap-2 mt-2">
      <button class="btn btn-outline-secondary btn-sm" id="runCodeBtn"><i class="bi bi-play-fill me-1"></i>Run Code</button>
      <span class="python-status" id="pythonStatus"></span>
    </div>

    <div id="testResults" class="d-flex flex-column gap-2 mt-3"></div>
  `;

  const editor = document.getElementById("codeEditor");
  editor.addEventListener("input", () => {
    answers[q.id] = { ...(answers[q.id] || {}), code: editor.value };
    scheduleAutosave();
    renderQuestionNav();
  });

  document.getElementById("runCodeBtn").addEventListener("click", () => runVisibleTests(q, editor.value));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ============================================================
   AUTOSAVE
   ============================================================ */
function scheduleAutosave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveAnswers(examId, currentUser.uid, answers).catch(() => {});
  }, 1200);
}

/* ============================================================
   PYTHON EXECUTION (Pyodide)
   ============================================================ */
function ensurePyodide() {
  if (pyodideInstance) return Promise.resolve(pyodideInstance);
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" }).then((p) => {
    pyodideInstance = p;
    return p;
  });
  return pyodideLoading;
}

/**
 * Runs `code` once per test case with fresh globals each time (so
 * variables don't leak between test cases) and captures stdout as the
 * program's output. Student code is expected to read input() line by
 * line and print() its answer, matching a classic stdin/stdout judge.
 */
async function runTestCase(pyodide, code, testCase) {
  const inputLines = (testCase.input || "").split("\n");
  let lineIdx = 0;
  let output = "";

  pyodide.setStdout({ batched: (s) => { output += s + "\n"; } });
  pyodide.setStderr({ batched: (s) => { output += s + "\n"; } });
  pyodide.setStdin({
    stdin: () => (lineIdx < inputLines.length ? inputLines[lineIdx++] : "")
  });

  try {
    const namespace = pyodide.globals.get("dict")();
    await pyodide.runPythonAsync(code, { globals: namespace });
    const actual = output.trim();
    const expected = (testCase.expectedOutput || "").trim();
    return { input: testCase.input, expectedOutput: expected, actualOutput: actual, passed: actual === expected };
  } catch (err) {
    return { input: testCase.input, expectedOutput: testCase.expectedOutput, actualOutput: "", passed: false, error: String(err) };
  }
}

async function runVisibleTests(q, code) {
  const statusEl = document.getElementById("pythonStatus");
  const resultsEl = document.getElementById("testResults");
  statusEl.textContent = "Running Python...";
  resultsEl.innerHTML = "";

  try {
    const pyodide = await ensurePyodide();
    const testCases = q.visibleTestCases || [];
    const results = [];
    for (const tc of testCases) {
      results.push(await runTestCase(pyodide, code, tc));
    }
    statusEl.textContent = `${results.filter((r) => r.passed).length} / ${results.length} visible test cases passed`;
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="testcase-result ${r.passed ? "pass" : "fail"}">
          <div><strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong></div>
          <div>Input: ${escapeHtml(r.input || "(none)")}</div>
          <div>Expected: ${escapeHtml(r.expectedOutput)}</div>
          <div>Got: ${escapeHtml(r.actualOutput)}</div>
          ${r.error ? `<div>Error: ${escapeHtml(r.error)}</div>` : ""}
        </div>`
      )
      .join("");
  } catch (err) {
    statusEl.textContent = "Could not run Python in this browser.";
    console.error(err);
  }
}

/* ============================================================
   SUBMIT
   ============================================================ */
document.getElementById("submitExamBtn").addEventListener("click", () => {
  new bootstrap.Modal(document.getElementById("submitConfirmModal")).show();
});

document.getElementById("confirmSubmitBtn").addEventListener("click", () => {
  bootstrap.Modal.getInstance(document.getElementById("submitConfirmModal"))?.hide();
  handleSubmit("submitted");
});

async function handleSubmit(status, message) {
  if (examLocked) return;
  examLocked = true;

  clearInterval(timerInterval);
  clearTimeout(saveTimeout);
  detachSecurityListeners();

  document.querySelectorAll("#examUi input, #examUi textarea, #examUi button").forEach((el) => (el.disabled = true));

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  const { score, totalMarks } = await gradeSubmission();
  const percentage = totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  await finalizeSubmission(examId, currentUser.uid, {
    answers,
    score,
    totalMarks,
    percentage,
    status
  }).catch((e) => console.error("Failed to finalize submission:", e));

  showResult(status, message, score, totalMarks);
}

async function gradeSubmission() {
  let score = 0;
  let totalMarks = 0;
  let pyodide = null;

  for (const q of questions) {
    totalMarks += q.marks || 0;

    if (q.type === "mcq") {
      if (answers[q.id] === q.correctOptionIndex) score += q.marks || 0;
      continue;
    }

    // coding
    const code = (answers[q.id] && answers[q.id].code) || "";
    const allTests = [...(q.visibleTestCases || []), ...(q.hiddenTestCases || [])];
    if (!allTests.length || !code.trim()) continue;

    try {
      pyodide = pyodide || (await ensurePyodide());
      let passed = 0;
      for (const tc of allTests) {
        const result = await runTestCase(pyodide, code, tc);
        if (result.passed) passed += 1;
      }
      score += Math.round(((q.marks || 0) * passed) / allTests.length);
    } catch (err) {
      console.error("Grading failed for question", q.id, err);
    }
  }

  return { score, totalMarks };
}

function showResult(status, message, score, totalMarks) {
  const resultMessage = document.getElementById("resultMessage");
  resultMessage.textContent =
    message ||
    (status === "auto-submitted"
      ? "Your exam was automatically submitted."
      : "Your exam has been submitted successfully.");

  if (exam.showResult !== false) {
    document.getElementById("resultScore").textContent = score;
    document.getElementById("resultTotal").textContent = totalMarks;
    document.getElementById("resultScoreBlock").classList.remove("d-none");
  }

  new bootstrap.Modal(document.getElementById("resultModal")).show();
}
