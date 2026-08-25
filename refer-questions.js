// js/refer-questions.js
// Read-only reference view for exams a student was marked Absent for.
// Shows MCQ questions with correct answers and coding questions with
// full details (except hidden test cases, same as everywhere else in
// this app). No editor, no timer, no submission - purely for review.

import { requireRole, wireLogoutButtons } from "./auth.js";
import { getExamById, getQuestionsForExam, getSubmission, listSchedulesForExam } from "./student.js";
import { computeExamAccessStatus } from "./grading.js";

wireLogoutButtons();

const params = new URLSearchParams(window.location.search);
const examId = params.get("examId");

if (!examId) window.location.href = "student-dashboard.html";

requireRole("student", async (user) => {
  const body = document.getElementById("pageBody");

  const exam = await getExamById(examId);
  if (!exam) {
    body.innerHTML = `<div class="alert alert-warning mt-4">This exam could not be found.</div>`;
    return;
  }

  const submission = await getSubmission(examId, user.uid);
  const schedules = await listSchedulesForExam(examId);
  const status = computeExamAccessStatus(exam, submission, schedules);

  // This reference view is only for exams the student was actually
  // marked absent for - never for exams still upcoming/active (that
  // would leak questions and correct answers before/during an attempt)
  // and not for completed exams either (those have their own "View
  // Result" review on the dashboard).
  if (status !== "absent") {
    body.innerHTML = `
      <div class="alert alert-warning mt-4">
        <i class="bi bi-exclamation-triangle-fill me-1"></i>
        This reference page is only available for exams you were marked absent for.
      </div>
      <a href="student-dashboard.html" class="btn btn-brand btn-sm"><i class="bi bi-arrow-left me-1"></i>Back to Dashboard</a>
    `;
    return;
  }

  const questions = await getQuestionsForExam(examId);

  body.innerHTML = "";
  body.appendChild(document.getElementById("tmplLoaded").content.cloneNode(true));

  document.getElementById("examTitle").textContent = exam.title;
  document.getElementById("examDesc").textContent = exam.description || "";
  const typeBadge = document.getElementById("examTypeBadge");
  typeBadge.textContent = (exam.examType || "mcq").toUpperCase();
  typeBadge.classList.add(exam.examType === "coding" ? "coding" : "mcq");

  const wrap = document.getElementById("questionsWrap");
  if (!questions.length) {
    wrap.innerHTML = `<div class="text-muted">No questions were published for this exam.</div>`;
    return;
  }

  wrap.innerHTML = questions.map((q, i) => (exam.examType === "coding" ? renderCodingQuestion(q, i) : renderMcqQuestion(q, i))).join("");
});

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMcqQuestion(q, i) {
  const optionsHtml = q.options
    .map((opt, oi) => {
      const isCorrect = oi === q.correctOptionIndex;
      return `
        <div class="mcq-option ${isCorrect ? "selected" : ""}" style="pointer-events:none;">
          <i class="bi ${isCorrect ? "bi-check-circle-fill text-success" : "bi-circle text-muted"}"></i>
          <span class="${isCorrect ? "fw-semibold text-success" : ""}">${escapeHtml(opt)}</span>
          ${isCorrect ? '<span class="badge bg-success ms-auto">Correct Answer</span>' : ""}
        </div>`;
    })
    .join("");

  return `
    <div class="card question-card p-3">
      <div class="d-flex justify-content-between mb-2">
        <span class="badge bg-secondary">Question ${i + 1}</span>
        <span class="badge bg-brand">${q.marks} marks</span>
      </div>
      <h6 class="mb-3">${escapeHtml(q.questionText)}</h6>
      <div class="d-flex flex-column gap-2">${optionsHtml}</div>
    </div>`;
}

function renderCodingQuestion(q, i) {
  const samplesHtml = (q.examples || [])
    .map(
      (ex, ei) => `
      <div class="mb-2">
        <div class="small text-muted">Sample ${ei + 1}</div>
        <div class="testcase-result">Input:\n${escapeHtml(ex.input || "")}\n\nOutput:\n${escapeHtml(ex.output || "")}</div>
      </div>`
    )
    .join("");

  const visibleTestsHtml = (q.visibleTestCases || [])
    .map(
      (tc, ti) => `
      <div class="mb-2">
        <div class="small text-muted">Public Test Case ${ti + 1}</div>
        <div class="testcase-result">Input:\n${escapeHtml(tc.input || "")}\n\nExpected Output:\n${escapeHtml(tc.expectedOutput || "")}</div>
      </div>`
    )
    .join("");

  return `
    <div class="card question-card p-3">
      <div class="d-flex justify-content-between mb-2">
        <span class="badge bg-secondary">Question ${i + 1}</span>
        <span class="badge ${q.difficulty === "easy" ? "bg-success" : q.difficulty === "hard" ? "bg-danger" : "bg-warning text-dark"}">${(q.difficulty || "medium").toUpperCase()}</span>
        <span class="badge bg-brand">${q.marks} marks</span>
      </div>
      <h6 class="mb-2">${escapeHtml(q.title)}</h6>
      <p class="mb-2">${escapeHtml(q.description)}</p>
      ${q.inputDescription ? `<p class="small mb-1"><strong>Input:</strong> ${escapeHtml(q.inputDescription)}</p>` : ""}
      ${q.outputDescription ? `<p class="small mb-1"><strong>Output:</strong> ${escapeHtml(q.outputDescription)}</p>` : ""}
      ${q.constraints ? `<p class="small text-muted mb-2"><strong>Constraints:</strong> ${escapeHtml(q.constraints)}</p>` : ""}
      ${samplesHtml}
      ${visibleTestsHtml}
      ${
        q.starterCode
          ? `<label class="form-label small fw-semibold mt-2">Starter Code</label><pre class="mono bg-light p-2 rounded" style="white-space:pre-wrap;">${escapeHtml(q.starterCode)}</pre>`
          : ""
      }
      <div class="small text-muted mt-2"><i class="bi bi-lock me-1"></i>Hidden test cases used for grading are not shown here.</div>
    </div>`;
}
