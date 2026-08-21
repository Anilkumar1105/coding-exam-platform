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
