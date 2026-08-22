// js/dashboard.js
// Pure computation + rendering helpers for the admin dashboard's
// analytics view (stat cards, section-wise report, results table).
// Data fetching lives in js/admin.js; this file just crunches numbers
// and paints them into the DOM.

import { SECTIONS } from "./admin.js";
import { PASS_MARK, isPass } from "./grading.js";

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the top-level stat cards from raw students + submissions.
 * A student is "attempted" if they have at least one submission.
 */
export function computeOverallStats(students, exams, submissions) {
  const attemptedIds = new Set(submissions.map((s) => s.studentId));
  const totalStudents = students.length;
  const attempted = attemptedIds.size;
  const notAttempted = Math.max(totalStudents - attempted, 0);

  const scores = submissions
    .map((s) => Number(s.percentage))
    .filter((n) => !Number.isNaN(n));

  const average = scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const highest = scores.length ? round(Math.max(...scores)) : 0;
  const lowest = scores.length ? round(Math.min(...scores)) : 0;
  const passed = scores.filter((s) => isPass(s)).length;
  const passPercentage = scores.length ? round((passed / scores.length) * 100) : 0;

  return {
    totalStudents,
    totalExams: exams.length,
    attempted,
    notAttempted,
    average,
    highest,
    lowest,
    passPercentage
  };
}

/**
 * Computes the per-section (A-G) report rows.
 * Pass `examId` to restrict to one exam's submissions; "all" (default)
 * combines every exam's submissions per section.
 */
export function computeSectionStats(students, submissions, examId = "all") {
  const scoped = examId === "all" ? submissions : submissions.filter((s) => s.examId === examId);

  return SECTIONS.map((section) => {
    const sectionStudents = students.filter((s) => s.section === section);
    const sectionIds = new Set(sectionStudents.map((s) => s.uid));
    const sectionSubs = scoped.filter((sub) => sectionIds.has(sub.studentId));
    const attemptedIds = new Set(sectionSubs.map((s) => s.studentId));

    const scores = sectionSubs
      .map((s) => Number(s.percentage))
      .filter((n) => !Number.isNaN(n));

    const average = scores.length ? round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const highest = scores.length ? round(Math.max(...scores)) : 0;
    const passed = scores.filter((s) => isPass(s)).length;
    const passPercentage = scores.length ? round((passed / scores.length) * 100) : 0;

    return {
      section,
      total: sectionStudents.length,
      attempted: attemptedIds.size,
      notAttempted: Math.max(sectionStudents.length - attemptedIds.size, 0),
      average,
      highest,
      passPercentage
    };
  });
}

/**
 * Builds a report heading from the active filters, e.g. "All Exams
 * Report", "Midterm Report", "Section A Report", or a combination.
 * Shared by Excel and PDF export so both show the same heading.
 */
export function buildReportTitle(filters, exams) {
  const examName = filters.examId && filters.examId !== "all" ? exams.find((e) => e.id === filters.examId)?.title : null;
  const sectionPart = filters.section && filters.section !== "all" ? `Section ${filters.section}` : null;

  if (examName && sectionPart) return `${examName} - ${sectionPart} Report`;
  if (examName) return `${examName} Report`;
  if (sectionPart) return `${sectionPart} Report`;
  return "All Exams Report";
}

/** Builds a human-readable "Exam: X | Section: Y | ..." summary of the active filters. */
export function buildFiltersText(filters, exams, students) {
  const parts = [];
  parts.push(`Exam: ${filters.examId && filters.examId !== "all" ? exams.find((e) => e.id === filters.examId)?.title || "-" : "All"}`);
  parts.push(`Section: ${filters.section && filters.section !== "all" ? filters.section : "All"}`);
  if (filters.studentId && filters.studentId !== "all") {
    const student = students.find((s) => s.uid === filters.studentId);
    parts.push(`Student: ${student ? student.name : "-"}`);
  }
  if (filters.date) parts.push(`Date: ${filters.date}`);
  return parts.join("  \u00b7  ");
}

/** Renders the row of top stat cards into `container`. */
export function renderStatCards(container, stats) {
  const cards = [
    { label: "Total Students", value: stats.totalStudents, icon: "bi-people-fill", color: "#4f46e5" },
    { label: "Total Exams", value: stats.totalExams, icon: "bi-journal-code", color: "#0ea5e9" },
    { label: "Attempted", value: stats.attempted, icon: "bi-pencil-square", color: "#16a34a" },
    { label: "Not Attempted", value: stats.notAttempted, icon: "bi-hourglass-split", color: "#f59e0b" },
    { label: "Average Score", value: `${stats.average}%`, icon: "bi-bar-chart-fill", color: "#8b5cf6" },
    { label: "Highest Score", value: `${stats.highest}%`, icon: "bi-trophy-fill", color: "#eab308" },
    { label: "Lowest Score", value: `${stats.lowest}%`, icon: "bi-graph-down", color: "#ef4444" },
    { label: "Pass Percentage", value: `${stats.passPercentage}%`, icon: "bi-check-circle-fill", color: "#10b981" }
  ];

  container.innerHTML = cards
    .map(
      (c) => `
      <div class="col-6 col-md-3">
        <div class="card stat-card p-3 h-100">
          <div class="stat-icon" style="background-color:${c.color}"><i class="bi ${c.icon}"></i></div>
          <div>
            <div class="stat-label">${c.label}</div>
            <div class="stat-value">${c.value}</div>
          </div>
        </div>
      </div>`
    )
    .join("");
}

/** Renders the section-wise report table into `tbodyEl`. */
export function renderSectionTable(tbodyEl, sectionStats) {
  tbodyEl.innerHTML = sectionStats
    .map(
      (row) => `
      <tr>
        <td><span class="badge bg-secondary">${row.section}</span></td>
        <td>${row.total}</td>
        <td>${row.attempted}</td>
        <td>${row.notAttempted}</td>
        <td>${row.average}%</td>
        <td>${row.highest}%</td>
        <td>${row.passPercentage}%</td>
      </tr>`
    )
    .join("");
}

/**
 * Renders (or re-renders) a Chart.js bar chart comparing each section's
 * average score. Pass the same `chartInstance` back in on the next call
 * so it's destroyed and recreated instead of stacking canvases.
 * Returns the new Chart instance - keep it and pass it back in next time.
 */
export function renderSectionChart(canvasEl, sectionStats, chartInstance) {
  if (chartInstance) chartInstance.destroy();

  return new Chart(canvasEl, {
    type: "bar",
    data: {
      labels: sectionStats.map((s) => `Section ${s.section}`),
      datasets: [
        {
          label: "Average Score (%)",
          data: sectionStats.map((s) => s.average),
          backgroundColor: sectionStats.map((s) => (isPass(s.average) ? "#4f46e5" : "#f59e0b")),
          borderRadius: 6,
          maxBarThickness: 48
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const s = sectionStats[ctx.dataIndex];
              return `${s.attempted}/${s.total} attempted \u00b7 Pass rate ${s.passPercentage}%`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: (v) => `${v}%` },
          grid: { color: "#eef0f4" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/**
 * Renders the student results table.
 * `rows` should already be filtered/joined: each row needs
 * rollNumber, name, section, examTitle, score, percentage, status,
 * violations, submittedAt, studentId, examId, examType.
 */
export function renderResultsTable(tbodyEl, rows) {
  if (!rows.length) {
    tbodyEl.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">No results match the current filters.</td></tr>`;
    return;
  }

  tbodyEl.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.rollNumber ?? "-"}</td>
        <td>${r.name ?? "-"}</td>
        <td><span class="badge bg-secondary">${r.section ?? "-"}</span></td>
        <td>${r.examTitle ?? "-"}</td>
        <td>${r.score ?? "-"}</td>
        <td>${r.percentage != null ? r.percentage + "%" : "-"}</td>
        <td>${r.percentage != null ? passFailBadge(r.percentage) : "-"}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.violations ?? 0}</td>
        <td>${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "-"}</td>
        <td class="text-end">
          ${
            r.examType === "coding"
              ? `<button class="btn btn-sm btn-outline-secondary" data-view-code="${r.studentId}" data-exam-id="${r.examId}"><i class="bi bi-code-slash"></i></button>`
              : ""
          }
        </td>
      </tr>`
    )
    .join("");
}

function passFailBadge(percentage) {
  return isPass(percentage)
    ? '<span class="badge bg-success">PASS</span>'
    : '<span class="badge bg-danger">FAIL</span>';
}

function statusBadge(status) {
  const map = {
    submitted: "bg-success",
    "in-progress": "bg-warning text-dark",
    "auto-submitted": "bg-danger"
  };
  const cls = map[status] || "bg-secondary";
  return `<span class="badge ${cls}">${status || "unknown"}</span>`;
}

/**
 * Joins raw submissions with student + exam lookups and applies the
 * exam / section / student / date filters. Returns rows ready for
 * renderResultsTable / exportToCSV.
 */
export function buildResultRows(submissions, students, exams, filters = {}) {
  const studentById = new Map(students.map((s) => [s.uid, s]));
  const examById = new Map(exams.map((e) => [e.id, e]));

  return submissions
    .map((sub) => {
      const student = studentById.get(sub.studentId) || {};
      const exam = examById.get(sub.examId) || {};
      return {
        rollNumber: sub.rollNumber || student.rollNumber,
        name: student.name,
        section: sub.section || student.section,
        examId: sub.examId,
        examTitle: exam.title,
        examType: exam.examType,
        score: sub.score,
        percentage: sub.percentage,
        result: sub.percentage != null ? (isPass(sub.percentage) ? "PASS" : "FAIL") : "-",
        status: sub.status,
        violations: sub.violations,
        submittedAt: sub.submittedAt,
        studentId: sub.studentId
      };
    })
    .filter((row) => {
      if (filters.examId && filters.examId !== "all" && row.examId !== filters.examId) return false;
      if (filters.section && filters.section !== "all" && row.section !== filters.section) return false;
      if (filters.studentId && filters.studentId !== "all" && row.studentId !== filters.studentId) return false;
      if (filters.date) {
        const rowDate = row.submittedAt ? row.submittedAt.slice(0, 10) : null;
        if (rowDate !== filters.date) return false;
      }
      return true;
    });
}
