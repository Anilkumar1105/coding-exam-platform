// js/special-section-page.js
// Drives special-section.html: shows a locked state until the student
// reaches 100 Learning Points, plays a one-time unlock celebration,
// then lets them browse exclusive company-style interview questions
// grouped by company and practice them with the same Run/Submit
// editor used elsewhere - but submissions here never grant further
// points, by design (points only come from the regular Learning
// Section).

import { requireRole, wireLogoutButtons } from "./auth.js";
import { getStudentPoints, isSpecialSectionUnlocked, markUnlockCelebrationShown, SPECIAL_SECTION_UNLOCK_POINTS } from "./points.js";
import {
  listPublishedSpecialQuestions,
  groupQuestionsByCompany,
  createSpecialCodeSubmission,
  listSpecialCodeSubmissions
} from "./special-section.js";
import { ensurePyodide, runAllTestCases } from "./python-runner.js";
import { computeCodingMarks } from "./grading.js";

wireLogoutButtons();

let currentUser = null;
let questionGroups = [];
let cmEditor = null;

requireRole("student", async (user) => {
  currentUser = user;
  const points = await getStudentPoints(user.uid);

  if (!isSpecialSectionUnlocked(points.points)) {
    renderLocked(points.points);
    return;
  }

  if (!points.unlockCelebrationShown) {
    renderCelebration();
    return;
  }

  renderContent(points.points);
});

/* ---------- Locked state ---------- */
function renderLocked(points) {
  const body = document.getElementById("pageBody");
  body.innerHTML = "";
  body.appendChild(document.getElementById("tmplLocked").content.cloneNode(true));

  const pct = Math.min(Math.round((points / SPECIAL_SECTION_UNLOCK_POINTS) * 100), 100);
  const remaining = Math.max(SPECIAL_SECTION_UNLOCK_POINTS - points, 0);

  document.getElementById("lockedPointsCurrent").textContent = points;
  document.getElementById("lockedPointsTarget").textContent = SPECIAL_SECTION_UNLOCK_POINTS;
  document.getElementById("lockedRemainingBadge").textContent = `${remaining} more point${remaining === 1 ? "" : "s"} to unlock`;

  // Animate the fill in after mount, so it visibly grows rather than
  // just appearing - a small touch that makes the progress feel alive.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById("lockedProgressFill").style.width = `${pct}%`;
    });
  });
}

/* ---------- One-time unlock celebration ---------- */
function renderCelebration() {
  const body = document.getElementById("pageBody");
  body.innerHTML = "";
  body.appendChild(document.getElementById("tmplCelebration").content.cloneNode(true));

  document.getElementById("continueToSpecialBtn").addEventListener("click", async () => {
    await markUnlockCelebrationShown(currentUser.uid).catch(() => {});
    const points = await getStudentPoints(currentUser.uid);
    renderContent(points.points);
  });
}

/* ---------- Unlocked content: company-grouped question list ---------- */
async function renderContent(points) {
  const body = document.getElementById("pageBody");
  body.innerHTML = "";
  body.appendChild(document.getElementById("tmplContent").content.cloneNode(true));

  document.getElementById("contentPoints").textContent = points;

  const questions = await listPublishedSpecialQuestions();
  questionGroups = groupQuestionsByCompany(questions);

  const wrap = document.getElementById("companySections");
  if (!questionGroups.length) {
    wrap.innerHTML = `<div class="text-center text-white-50 py-5">No exclusive questions have been published yet - check back soon!</div>`;
    return;
  }

  wrap.innerHTML = questionGroups
    .map(
      (group) => `
      <div class="mb-4">
        <div class="special-company-header">
          <span class="company-badge ${companyBadgeClass(group.company)}">${escapeHtml(group.company)}</span>
          <span class="special-company-count">${group.questions.length} question${group.questions.length === 1 ? "" : "s"}</span>
        </div>
        <div class="special-question-grid">
          ${group.questions
            .map(
              (q) => `
            <div class="special-question-card" data-open-question="${q.id}">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <span class="badge ${difficultyBadgeClass(q.difficulty)}">${(q.difficulty || "medium").toUpperCase()}</span>
                <span class="special-question-marks">${q.marks} pts</span>
              </div>
              <div class="special-question-title">${escapeHtml(q.title)}</div>
              <div class="special-question-cta">Practice <i class="bi bi-arrow-right ms-1"></i></div>
            </div>`
            )
            .join("")}
        </div>
      </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-open-question]").forEach((card) => {
    card.addEventListener("click", () => {
      const question = questionGroups.flatMap((g) => g.questions).find((q) => q.id === card.dataset.openQuestion);
      if (question) renderQuestionDetail(question, points);
    });
  });
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

function difficultyBadgeClass(difficulty) {
  if (difficulty === "easy") return "bg-success";
  if (difficulty === "hard") return "bg-danger";
  return "bg-warning text-dark";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ---------- Question detail / practice editor ---------- */
function renderQuestionDetail(q, points) {
  const body = document.getElementById("pageBody");

  const samplesHtml = (q.examples || [])
    .map(
      (ex, i) => `
      <div class="mb-2">
        <div class="small text-white-50">Sample ${i + 1}</div>
        <div class="testcase-result">Input:\n${escapeHtml(ex.input || "")}\n\nOutput:\n${escapeHtml(ex.output || "")}</div>
      </div>`
    )
    .join("");

  body.innerHTML = `
    <button class="btn btn-sm btn-outline-light mb-3" id="backToSpecialListBtn"><i class="bi bi-arrow-left me-1"></i>Back to Questions</button>
    <div class="special-detail-card">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <span class="company-badge ${companyBadgeClass(q.company)}">${escapeHtml(q.company)}</span>
        <span class="badge ${difficultyBadgeClass(q.difficulty)}">${(q.difficulty || "medium").toUpperCase()}</span>
      </div>
      <div class="row g-3">
        <div class="col-lg-5">
          <h5 class="mb-2 text-white">${escapeHtml(q.title)}</h5>
          <p class="text-white-75">${escapeHtml(q.description)}</p>
          ${q.inputDescription ? `<p class="small text-white-75"><strong>Input:</strong> ${escapeHtml(q.inputDescription)}</p>` : ""}
          ${q.outputDescription ? `<p class="small text-white-75"><strong>Output:</strong> ${escapeHtml(q.outputDescription)}</p>` : ""}
          ${q.constraints ? `<p class="small text-white-50"><strong>Constraints:</strong> ${escapeHtml(q.constraints)}</p>` : ""}
          ${samplesHtml}
          <div id="specialSubmissionHistory" class="mt-3"></div>
        </div>
        <div class="col-lg-7">
          <textarea id="specialCodeEditor">${escapeHtml(q.starterCode || "")}</textarea>
          <div class="d-flex align-items-center gap-2 mt-2">
            <button class="btn btn-outline-light btn-sm" id="specialRunBtn"><i class="bi bi-play-fill me-1"></i>Run Code</button>
            <button class="btn btn-special btn-sm" id="specialSubmitBtn"><i class="bi bi-cloud-arrow-up me-1"></i>Submit Code</button>
            <span class="small text-white-50" id="specialPythonStatus"></span>
          </div>
          <div id="specialTestResults" class="d-flex flex-column gap-2 mt-3"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("backToSpecialListBtn").addEventListener("click", () => renderContent(points));

  cmEditor = CodeMirror.fromTextArea(document.getElementById("specialCodeEditor"), {
    mode: "python",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    matchBrackets: true,
    theme: "dracula",
    viewportMargin: Infinity
  });
  cmEditor.setSize("100%", "300px");

  document.getElementById("specialRunBtn").addEventListener("click", () => runVisible(q));
  document.getElementById("specialSubmitBtn").addEventListener("click", () => submitSpecial(q));
  renderSpecialHistory(q.id);
}

async function runVisible(q) {
  const statusEl = document.getElementById("specialPythonStatus");
  const resultsEl = document.getElementById("specialTestResults");
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

async function submitSpecial(q) {
  const statusEl = document.getElementById("specialPythonStatus");
  const resultsEl = document.getElementById("specialTestResults");
  statusEl.textContent = "Submitting and grading...";
  document.getElementById("specialSubmitBtn").disabled = true;

  try {
    const pyodide = await ensurePyodide();
    const allTests = [...(q.visibleTestCases || []), ...(q.hiddenTestCases || [])];
    const results = await runAllTestCases(pyodide, cmEditor.getValue(), allTests, (q.timeLimit || 5) * 1000);
    const passedCount = results.filter((r) => r.passed).length;
    const marksObtained = computeCodingMarks(q.marks, results);
    const totalExecutionTimeMs = results.reduce((sum, r) => sum + (r.executionTimeMs || 0), 0);
    const hadError = results.some((r) => r.executionStatus === "error" || r.executionStatus === "timeout");

    await createSpecialCodeSubmission({
      studentId: currentUser.uid,
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
    renderSpecialHistory(q.id);
  } catch (err) {
    statusEl.textContent = "Could not submit code.";
  } finally {
    document.getElementById("specialSubmitBtn").disabled = false;
  }
}

async function renderSpecialHistory(questionId) {
  const wrap = document.getElementById("specialSubmissionHistory");
  if (!wrap) return;
  const history = await listSpecialCodeSubmissions(currentUser.uid, questionId);
  if (!history.length) {
    wrap.innerHTML = `<div class="small text-white-50">No submissions yet for this question.</div>`;
    return;
  }
  wrap.innerHTML =
    `<div class="small fw-semibold text-white mb-1">Your Submissions</div>` +
    history
      .map(
        (s) => `
        <div class="small text-white-50 d-flex justify-content-between border-bottom py-1" style="border-color:rgba(255,255,255,0.15) !important;">
          <span>${new Date(s.submittedAt).toLocaleTimeString()}</span>
          <span>${s.testCasesPassed}/${s.totalTestCases} passed</span>
          <span>${s.marksObtained} marks</span>
        </div>`
      )
      .join("");
}
