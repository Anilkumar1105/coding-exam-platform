// js/exam.js
// Student exam-taking experience: fullscreen + tab-switch monitoring,
// countdown timer with auto-submit, MCQ + Python coding questions
// (CodeMirror editor, separate Run/Submit actions, per-question
// submission history), and final MCQ + coding score aggregation.

import { requireRole, wireLogoutButtons } from "./auth.js";
import {
  getExamById,
  getQuestionsForExam,
  getSubmission,
  startSubmission,
  saveAnswers,
  incrementViolation,
  finalizeSubmission,
  createCodeSubmission,
  listCodeSubmissions,
  listCodeSubmissionsForExam
} from "./student.js";
import { ensurePyodide, runAllTestCases } from "./python-runner.js";
import { computeCodingMarks, isPass, PASS_MARK, computeExamAccessStatus, formatExamWindow } from "./grading.js";

wireLogoutButtons();

const params = new URLSearchParams(window.location.search);
const examId = params.get("examId");

let currentUser = null;
let studentProfile = null;
let exam = null;
let questions = [];
let answers = {}; // { [questionId]: number (mcq) | { code } (coding, code text only - marks live in codeSubmissions) }
let currentIndex = 0;
let violationCount = 0;
let maxViolations = 3;
let remainingSeconds = 0;
let timerInterval = null;
let examLocked = false;
let saveTimeout = null;
let cmEditor = null; // current CodeMirror instance, one at a time

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
  const accessStatus = computeExamAccessStatus(exam, existing);

  if (accessStatus === "completed") {
    alert("You have already submitted this exam.");
    window.location.href = "student-dashboard.html";
    return;
  }

  if (accessStatus === "upcoming") {
    showStartError(`This exam hasn't started yet. It opens at ${formatExamWindow(exam)}.`);
    return;
  }

  if (accessStatus === "absent") {
    if (existing && existing.status === "in-progress") {
      // They started but never finished, and the deadline has now passed
      // while they were away - finalize with whatever they had, marked absent.
      questions = await getQuestionsForExam(examId);
      answers = existing.answers || {};
      const { score, mcqScore, codingScore, totalMarks } = await gradeSubmission();
      const percentage = totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0;
      await finalizeSubmission(examId, currentUser.uid, {
        answers,
        score,
        mcqScore,
        codingScore,
        totalMarks,
        percentage,
        status: "absent"
      }).catch((e) => console.error("Failed to finalize stale submission:", e));
      alert("The exam window has closed. You did not complete this exam in time and have been marked absent.");
    } else {
      alert("The exam window has closed. You did not attempt this exam in time and have been marked absent.");
    }
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

  if (exam.startTime && exam.endTime) {
    const windowNote = document.createElement("li");
    windowNote.innerHTML = `<i class="bi bi-calendar-event me-1"></i> Window: ${formatExamWindow(exam)}`;
    document.querySelector("#startScreen ul.list-unstyled").appendChild(windowNote);
  }

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

  if (exam.endTime) {
    const windowRemainingSeconds = Math.round((new Date(exam.endTime).getTime() - Date.now()) / 1000);
    remainingSeconds = Math.max(Math.min(remainingSeconds, windowRemainingSeconds), 0);
  }

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
  // Code editor typing must still work - only block copy/cut/paste/context-menu,
  // which this listener is scoped to already (see attachSecurityListeners).
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
  cmEditor = null; // old instance's DOM is about to be thrown away
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

  const samplesHtml = (q.examples || [])
    .map(
      (ex, i) => `
      <div class="mb-2">
        <div class="small text-muted">Sample ${i + 1}</div>
        <div class="testcase-result">Input:\n${escapeHtml(ex.input || "")}\n\nOutput:\n${escapeHtml(ex.output || "")}</div>
      </div>`
    )
    .join("");

  card.innerHTML = `
    <div class="d-flex justify-content-between mb-2">
      <span class="badge bg-secondary">Question ${currentIndex + 1} of ${questions.length}</span>
      <span class="badge ${difficultyBadgeClass(q.difficulty)}">${(q.difficulty || "medium").toUpperCase()}</span>
      <span class="badge bg-brand">${q.marks} marks</span>
    </div>
    <div class="row g-3">
      <div class="col-lg-5">
        <h5 class="mb-2">${q.title}</h5>
        <p>${q.description}</p>
        ${q.inputDescription ? `<p class="small"><strong>Input:</strong> ${q.inputDescription}</p>` : ""}
        ${q.outputDescription ? `<p class="small"><strong>Output:</strong> ${q.outputDescription}</p>` : ""}
        ${q.constraints ? `<p class="small text-muted"><strong>Constraints:</strong> ${q.constraints}</p>` : ""}
        ${samplesHtml}
        <div id="submissionHistory" class="mt-3"></div>
      </div>

      <div class="col-lg-7">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <select class="form-select form-select-sm w-auto" disabled title="More languages coming soon">
            <option>Python</option>
          </select>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="clearCodeBtn"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset</button>
        </div>

        <textarea id="codeEditorTextarea">${escapeHtml(code)}</textarea>

        <div class="d-flex align-items-center gap-2 mt-2">
          <button class="btn btn-outline-secondary btn-sm" id="runCodeBtn"><i class="bi bi-play-fill me-1"></i>Run Code</button>
          <button class="btn btn-brand btn-sm" id="submitCodeBtn"><i class="bi bi-cloud-arrow-up me-1"></i>Submit Code</button>
          <span class="python-status" id="pythonStatus"></span>
        </div>

        <div id="testResults" class="d-flex flex-column gap-2 mt-3"></div>
      </div>
    </div>
  `;

  cmEditor = CodeMirror.fromTextArea(document.getElementById("codeEditorTextarea"), {
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    matchBrackets: true,
    theme: "dracula",
    viewportMargin: Infinity
  });
  cmEditor.setSize("100%", "320px");

  cmEditor.on("change", () => {
    answers[q.id] = { ...(answers[q.id] || {}), code: cmEditor.getValue() };
    scheduleAutosave();
    renderQuestionNav();
  });

  document.getElementById("clearCodeBtn").addEventListener("click", () => {
    if (!confirm("Reset your code back to the starter template? This cannot be undone.")) return;
    cmEditor.setValue(q.starterCode || "");
  });

  document.getElementById("runCodeBtn").addEventListener("click", () => runVisibleTests(q, cmEditor.getValue()));
  document.getElementById("submitCodeBtn").addEventListener("click", () => submitCode(q, cmEditor.getValue()));

  renderSubmissionHistory(q.id);
}

function difficultyBadgeClass(difficulty) {
  if (difficulty === "easy") return "bg-success";
  if (difficulty === "hard") return "bg-danger";
  return "bg-warning text-dark";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ============================================================
   AUTOSAVE (code text only - marks/scoring live in codeSubmissions)
   ============================================================ */
function scheduleAutosave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveAnswers(examId, currentUser.uid, answers).catch(() => {});
  }, 1200);
}

/* ============================================================
   RUN CODE (public/sample test cases only - never scored)
   ============================================================ */
async function runVisibleTests(q, code) {
  const statusEl = document.getElementById("pythonStatus");
  const resultsEl = document.getElementById("testResults");
  statusEl.textContent = "Running Python...";
  resultsEl.innerHTML = "";

  try {
    const pyodide = await ensurePyodide();
    const testCases = q.visibleTestCases || [];
    const results = await runAllTestCases(pyodide, code, testCases, (q.timeLimit || 5) * 1000);

    statusEl.textContent = `${results.filter((r) => r.passed).length} / ${results.length} public test cases passed`;
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="testcase-result ${r.passed ? "pass" : "fail"}">
          <div><strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong> &middot; ${r.executionStatus} &middot; ${r.executionTimeMs} ms</div>
          <div>Input: ${escapeHtml(r.input || "(none)")}</div>
          <div>Expected: ${escapeHtml(r.expectedOutput)}</div>
          <div>Got: ${escapeHtml(r.actualOutput)}</div>
          ${r.errorMessage ? `<div>Error: ${escapeHtml(r.errorMessage)}</div>` : ""}
        </div>`
      )
      .join("");
  } catch (err) {
    statusEl.textContent = "Could not run Python in this browser.";
    console.error(err);
  }
}

/* ============================================================
   SUBMIT CODE (full test suite incl. hidden - scored + saved)
   ============================================================ */
async function submitCode(q, code) {
  const statusEl = document.getElementById("pythonStatus");
  const resultsEl = document.getElementById("testResults");
  statusEl.textContent = "Submitting and grading...";
  document.getElementById("submitCodeBtn").disabled = true;

  try {
    const pyodide = await ensurePyodide();
    const allTests = [...(q.visibleTestCases || []), ...(q.hiddenTestCases || [])];
    const results = await runAllTestCases(pyodide, code, allTests, (q.timeLimit || 5) * 1000);

    const passedCount = results.filter((r) => r.passed).length;
    const marksObtained = computeCodingMarks(q.marks, results);
    const totalExecutionTimeMs = results.reduce((sum, r) => sum + (r.executionTimeMs || 0), 0);
    const hadError = results.some((r) => r.executionStatus === "error" || r.executionStatus === "timeout");
    const firstError = results.find((r) => r.errorMessage)?.errorMessage || null;

    await createCodeSubmission({
      studentId: currentUser.uid,
      examId,
      questionId: q.id,
      language: "python",
      sourceCode: code,
      compilationStatus: results.some((r) => r.compilationStatus === "error") ? "error" : "success",
      executionStatus: hadError ? "error" : "completed",
      testCasesPassed: passedCount,
      totalTestCases: allTests.length,
      marksObtained,
      executionTimeMs: totalExecutionTimeMs,
      memoryUsage: null, // not measurable from in-browser Pyodide execution
      errorMessage: firstError
    });

    answers[q.id] = { ...(answers[q.id] || {}), code };
    scheduleAutosave();

    statusEl.textContent = `Submitted: ${passedCount} / ${allTests.length} test cases passed \u00b7 ${marksObtained} / ${q.marks} marks`;

    // Only show pass/fail per test - never reveal hidden inputs/expected output.
    resultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="testcase-result ${r.passed ? "pass" : "fail"}">
          <strong>Test ${i + 1}: ${r.passed ? "PASSED" : "FAILED"}</strong> &middot; ${r.executionStatus} &middot; ${r.executionTimeMs} ms
        </div>`
      )
      .join("");

    renderSubmissionHistory(q.id);
    renderQuestionNav();
  } catch (err) {
    statusEl.textContent = "Could not submit code.";
    console.error(err);
  } finally {
    document.getElementById("submitCodeBtn").disabled = false;
  }
}

async function renderSubmissionHistory(questionId) {
  const wrap = document.getElementById("submissionHistory");
  if (!wrap) return;
  wrap.innerHTML = `<div class="small text-muted">Loading submission history...</div>`;

  try {
    const history = await listCodeSubmissions(currentUser.uid, questionId);
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
  } catch (err) {
    wrap.innerHTML = "";
  }
}

/* ============================================================
   SUBMIT EXAM (final)
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

  document.querySelectorAll("#examUi input, #examUi textarea, #examUi button, #examUi select").forEach((el) => (el.disabled = true));
  if (cmEditor) cmEditor.setOption("readOnly", true);

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  const { score, mcqScore, codingScore, totalMarks } = await gradeSubmission();
  const percentage = totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  await finalizeSubmission(examId, currentUser.uid, {
    answers,
    score,
    mcqScore,
    codingScore,
    totalMarks,
    percentage,
    status
  }).catch((e) => console.error("Failed to finalize submission:", e));

  showResult(status, message, { score, mcqScore, codingScore, totalMarks });
}

/**
 * Final score = MCQ marks (compared live against correctOptionIndex) +
 * coding marks (the BEST "Submit Code" attempt per question, since a
 * submission history is kept precisely so a student's strongest attempt
 * counts - not just whichever one happened to be last).
 */
async function gradeSubmission() {
  let mcqScore = 0;
  let codingScore = 0;
  let totalMarks = 0;

  const codingSubs =
    exam.examType === "coding" ? await listCodeSubmissionsForExam(currentUser.uid, examId) : [];

  for (const q of questions) {
    totalMarks += q.marks || 0;

    if (q.type === "mcq") {
      if (answers[q.id] === q.correctOptionIndex) mcqScore += q.marks || 0;
      continue;
    }

    const attempts = codingSubs.filter((s) => s.questionId === q.id);
    if (attempts.length) {
      const best = attempts.reduce((max, s) => (s.marksObtained > max ? s.marksObtained : max), 0);
      codingScore += best;
    }
  }

  return { score: mcqScore + codingScore, mcqScore, codingScore, totalMarks };
}

function showResult(status, message, { score, mcqScore, codingScore, totalMarks }) {
  const resultMessage = document.getElementById("resultMessage");
  resultMessage.textContent =
    message ||
    (status === "auto-submitted"
      ? "Your exam was automatically submitted."
      : "Your exam has been submitted successfully.");

  if (exam.showResult !== false) {
    document.getElementById("resultScore").textContent = score;
    document.getElementById("resultTotal").textContent = totalMarks;
    document.getElementById("resultMcqScore").textContent = mcqScore;
    document.getElementById("resultCodingScore").textContent = codingScore;

    const percentage = totalMarks ? Math.round((score / totalMarks) * 10000) / 100 : 0;
    const passed = isPass(percentage);
    document.getElementById("resultPassFail").innerHTML =
      `<span class="badge ${passed ? "bg-success" : "bg-danger"} fs-6">${passed ? "PASS" : "FAIL"}</span>` +
      `<div class="small text-muted mt-1">Pass mark: ${PASS_MARK}%</div>`;

    document.getElementById("resultScoreBlock").classList.remove("d-none");
  }

  new bootstrap.Modal(document.getElementById("resultModal")).show();
}
