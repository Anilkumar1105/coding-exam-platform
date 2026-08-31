// js/points.js
// Tracks "Learning Points" earned from the existing Learning Section
// (2 points per fully-solved coding question) and gates the Special
// Coding Section behind a 100-point threshold. Kept in its own
// collection (studentPoints) rather than on the users doc so this
// feature never needs write access to more sensitive user fields.

import { db } from "./firebase-config.js";
import { doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const POINTS_PER_COMPLETED_QUESTION = 2;
export const SPECIAL_SECTION_UNLOCK_POINTS = 100;

function emptyPoints(studentId) {
  return {
    studentId,
    points: 0,
    completedCodingQuestionIds: [],
    unlockCelebrationShown: false,
    updatedAt: new Date().toISOString()
  };
}

/** Reads a student's points doc, or a zeroed default if they don't have one yet (no write). */
export async function getStudentPoints(studentId) {
  const snap = await getDoc(doc(db, "studentPoints", studentId));
  return snap.exists() ? snap.data() : emptyPoints(studentId);
}

export function isSpecialSectionUnlocked(points) {
  return (points || 0) >= SPECIAL_SECTION_UNLOCK_POINTS;
}

/**
 * Awards points for fully solving a learning coding question, exactly
 * once per question no matter how many times the student re-submits
 * it. Uses a Firestore transaction (not just a client-side check) so
 * this is safe even against the same account submitting from two tabs
 * at once - the read-check-write cycle is atomic on the server, not
 * just in this tab's JS.
 *
 * Returns { points, awarded } - `awarded` is true only if this call
 * was the one that actually granted the 2 points (false if the
 * question was already completed before, or on any question outside
 * the regular Learning Section - the Special Section's own exclusive
 * questions never grant further points, by design).
 */
export async function awardPointsForCompletedQuestion(studentId, questionId) {
  const ref = doc(db, "studentPoints", studentId);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data() : emptyPoints(studentId);
    const alreadyCompleted = (current.completedCodingQuestionIds || []).includes(questionId);

    if (alreadyCompleted) {
      return { points: current.points || 0, awarded: false };
    }

    const updated = {
      ...current,
      studentId,
      points: (current.points || 0) + POINTS_PER_COMPLETED_QUESTION,
      completedCodingQuestionIds: [...(current.completedCodingQuestionIds || []), questionId],
      updatedAt: new Date().toISOString()
    };
    transaction.set(ref, updated);
    return { points: updated.points, awarded: true };
  });
}

/** Marks the one-time unlock celebration as shown, so it doesn't replay on every visit. */
export async function markUnlockCelebrationShown(studentId) {
  const ref = doc(db, "studentPoints", studentId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data() : emptyPoints(studentId);
    transaction.set(ref, { ...current, studentId, unlockCelebrationShown: true, updatedAt: new Date().toISOString() });
  });
}
