// js/grading.js
// Shared logic for turning a set of test-case results into marks.
// Used by js/exam.js (real grading) and the admin "Test Run" panel
// (preview only, no marks are saved there).

/**
 * results: [{ passed: boolean, weight?: number }, ...]
 * totalMarks: marks configured on the question.
 *
 * If any test case has an explicit weight, marks are distributed by
 * weight (sum of passed weights / sum of all weights). Otherwise every
 * test case counts equally (simple passed/total proportion).
 */
export function computeCodingMarks(totalMarks, results) {
  if (!results.length) return 0;

  const hasWeights = results.some((r) => r.weight != null && r.weight !== "");
  if (hasWeights) {
    const totalWeight = results.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    if (totalWeight <= 0) return 0;
    const passedWeight = results
      .filter((r) => r.passed)
      .reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    return Math.round((totalMarks * passedWeight) / totalWeight);
  }

  const passedCount = results.filter((r) => r.passed).length;
  return Math.round((totalMarks * passedCount) / results.length);
}

/**
 * Compares actual vs expected output the way a normal judge would:
 * tolerant of trailing/leading whitespace and trailing blank lines on
 * each line, but NOT tolerant of genuinely different content (extra
 * spaces mid-line still count if they change the value on that line
 * would require exact tokenizing - here we normalize per-line trim +
 * collapse trailing newlines, which covers the common "extra newline
 * at the end" / "trailing spaces" judge gotchas without being so loose
 * that a wrong answer with the right first token is accepted).
 */
export function outputsMatch(actual, expected) {
  const normalize = (s) =>
    String(s ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n+$/g, "")
      .trim();

  return normalize(actual) === normalize(expected);
}

/* ============================================================
   PASS / FAIL
   ============================================================ */

/** Single source of truth for the pass mark, used everywhere a
 *  score is judged pass/fail: exam results, dashboard analytics,
 *  the results table, and Excel exports. */
export const PASS_MARK = 40;

export function isPass(percentage) {
  return Number(percentage) >= PASS_MARK;
}

/* ============================================================
   EXAM TIME WINDOW (startTime / endTime)
   ============================================================ */

/**
 * Resolves what a student can currently do with an exam, combining the
 * admin's start/end time window with any existing submission.
 * Returns one of: "upcoming" | "active" | "completed" | "absent".
 *
 * - Exams with no startTime/endTime configured are always "active" once
 *   the admin's separate active/inactive toggle allows them (unchanged
 *   behavior for older exams created before this feature existed).
 * - "absent" covers both "never started" and "started but never
 *   finished" once the window has closed - the caller decides how to
 *   act on it (block access, show a badge, finalize a stale attempt).
 */
export function computeExamAccessStatus(exam, submission, now = new Date()) {
  if (submission) {
    if (submission.status === "submitted" || submission.status === "auto-submitted") return "completed";
    if (submission.status === "absent") return "absent";
    // else status === "in-progress" - fall through to the window check below
  }

  const hasWindow = !!(exam?.startTime && exam?.endTime);
  if (!hasWindow) return "active";

  const start = new Date(exam.startTime);
  const end = new Date(exam.endTime);
  if (now < start) return "upcoming";
  if (now > end) return "absent";
  return "active";
}

/** Human-readable "10 Aug 2026, 10:00 AM - 11:30 AM" window summary. */
export function formatExamWindow(exam) {
  if (!exam?.startTime || !exam?.endTime) return "No time limit set";
  const start = new Date(exam.startTime);
  const end = new Date(exam.endTime);
  const dateOpts = { day: "2-digit", month: "short", year: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();

  return sameDay
    ? `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)} - ${end.toLocaleTimeString(undefined, timeOpts)}`
    : `${start.toLocaleDateString(undefined, dateOpts)} ${start.toLocaleTimeString(undefined, timeOpts)} - ${end.toLocaleDateString(undefined, dateOpts)} ${end.toLocaleTimeString(undefined, timeOpts)}`;
}
