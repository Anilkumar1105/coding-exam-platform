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
   EXAM TIME WINDOW (up to 7 schedules, or the older single window)
   ============================================================ */

/**
 * A schedule with no `sections` (or an empty array) applies to every
 * section - that's the "same slot for all sections" case. Otherwise it
 * only applies to the sections explicitly listed.
 */
export function scheduleAppliesToSection(schedule, section) {
  return !schedule.sections || schedule.sections.length === 0 || (section && schedule.sections.includes(section));
}

/** Schedules relevant to a given section (or all of them if `section` isn't provided). */
export function filterSchedulesForSection(schedules = [], section = null) {
  if (!section) return schedules;
  return schedules.filter((s) => scheduleAppliesToSection(s, section));
}

/**
 * Normalizes an exam's timing into a list of { start: Date, end: Date }
 * windows, regardless of whether it uses the newer multiple-schedules
 * model or the older single startTime/endTime pair:
 *   - `schedules` (array of { startTime, sections? }) takes priority
 *     when given - each schedule's window is
 *     [startTime, startTime + exam.duration]. Pass only the schedules
 *     already relevant to the student (see filterSchedulesForSection)
 *     if you want section-restricted slots excluded.
 *   - Falls back to the legacy exam.startTime/exam.endTime pair when no
 *     schedules exist, so exams created before schedules existed keep
 *     working exactly as before.
 *   - Returns [] when neither is set (exam is always open).
 */
export function resolveExamWindows(exam, schedules = []) {
  if (schedules && schedules.length) {
    return schedules
      .map((s) => {
        const start = new Date(s.startTime);
        const end = new Date(start.getTime() + (Number(exam?.duration) || 0) * 60000);
        return { id: s.id, start, end, sections: s.sections || [] };
      })
      .sort((a, b) => a.start - b.start);
  }
  if (exam?.startTime && exam?.endTime) {
    return [{ id: "legacy", start: new Date(exam.startTime), end: new Date(exam.endTime), sections: [] }];
  }
  return [];
}

/**
 * Resolves what a student can currently do with an exam, combining its
 * time window(s), any section restriction per schedule, and any
 * existing submission.
 * Returns one of: "upcoming" | "active" | "completed" | "absent" | "not-assigned".
 *
 * - Exams with no schedules and no legacy startTime/endTime are always
 *   "active" once the admin's separate active/inactive toggle allows
 *   them (unchanged behavior for exams with no time restriction).
 * - With multiple schedules, being between two windows (missed one
 *   slot but a later one hasn't started yet) is "upcoming", not
 *   "absent" - a student isn't absent until every window relevant to
 *   their section has passed.
 * - "not-assigned": the exam has schedules, but none of them include
 *   this student's section - it was never scheduled for them at all,
 *   which is different from being absent (they were never expected to
 *   attend). Only applies before any submission exists; a submission
 *   already on record always takes priority so historical attempts
 *   still show correctly even if section assignments changed later.
 * - "absent" covers both "never started" and "started but never
 *   finished" once every relevant window has closed - the caller
 *   decides how to act on it (block access, show a badge, finalize a
 *   stale attempt).
 */
export function computeExamAccessStatus(exam, submission, schedules = [], section = null, now = new Date()) {
  if (submission) {
    if (submission.status === "submitted" || submission.status === "auto-submitted") return "completed";
    if (submission.status === "absent") return "absent";
    // else status === "in-progress" - fall through to the window check below
  }

  if (schedules.length && section) {
    const relevant = filterSchedulesForSection(schedules, section);
    if (!relevant.length) return "not-assigned";
    schedules = relevant;
  }

  const windows = resolveExamWindows(exam, schedules);
  if (!windows.length) return "active";

  if (windows.some((w) => now >= w.start && now <= w.end)) return "active";
  if (windows.some((w) => w.start > now)) return "upcoming";
  return "absent";
}

/** The window a student is currently inside, or the next upcoming one, or null if none apply. */
export function findRelevantWindow(exam, schedules = [], now = new Date()) {
  const windows = resolveExamWindows(exam, schedules);
  return windows.find((w) => now >= w.start && now <= w.end) || windows.find((w) => w.start > now) || null;
}

/** The window that contains a given timestamp - used to cap a resumed session's remaining time to the schedule the student actually started in. */
export function findWindowContaining(exam, schedules = [], at) {
  const windows = resolveExamWindows(exam, schedules);
  return windows.find((w) => at >= w.start && at <= w.end) || null;
}

function formatWindowRange(start, end) {
  const dateOpts = { day: "2-digit", month: "short", year: "numeric" };
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)} - ${end.toLocaleTimeString(undefined, timeOpts)}`
    : `${start.toLocaleDateString(undefined, dateOpts)} ${start.toLocaleTimeString(undefined, timeOpts)} - ${end.toLocaleDateString(undefined, dateOpts)} ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

/** Human-readable "10 Aug 2026, 10:00 AM - 11:30 AM" summary of the legacy single window. */
export function formatExamWindow(exam) {
  if (!exam?.startTime || !exam?.endTime) return "No time limit set";
  return formatWindowRange(new Date(exam.startTime), new Date(exam.endTime));
}

/** Human-readable summary of one schedule's window plus which sections it's for. */
export function formatScheduleWindow(schedule, duration) {
  const start = new Date(schedule.startTime);
  const end = new Date(start.getTime() + (Number(duration) || 0) * 60000);
  return formatWindowRange(start, end);
}

/** "All Sections" or "Sections: A, C" summary for a schedule. */
export function formatScheduleSections(schedule) {
  return !schedule.sections || schedule.sections.length === 0 ? "All Sections" : `Sections: ${schedule.sections.join(", ")}`;
}

/**
 * Best available description of an exam's timing for a student-facing
 * card: the currently-open or next-upcoming schedule/window, falling
 * back to the most recent one if every window has passed, or "No time
 * limit set" if the exam has no time restriction at all. Pass
 * already-section-filtered schedules if relevant.
 */
export function describeExamWindow(exam, schedules = [], now = new Date()) {
  const windows = resolveExamWindows(exam, schedules);
  if (!windows.length) return "No time limit set";
  const relevant = findRelevantWindow(exam, schedules, now);
  if (relevant) return formatWindowRange(relevant.start, relevant.end);
  const last = windows[windows.length - 1];
  return formatWindowRange(last.start, last.end);
}
