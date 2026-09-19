// js/learning.js
// Data layer for the self-paced Learning Section: levels -> concepts
// (read in order) -> MCQ test (must pass) -> coding questions. Shared
// by the admin management UI and the student-facing learning page.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   LEVELS
   ============================================================ */

export async function listLevels() {
  const snap = await getDocs(query(collection(db, "learningLevels"), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listActiveLevels() {
  const snap = await getDocs(query(collection(db, "learningLevels"), where("active", "==", true)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function getLevel(levelId) {
  const snap = await getDoc(doc(db, "learningLevels", levelId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function createLevel(data) {
  return addDoc(collection(db, "learningLevels"), { ...data, createdAt: new Date().toISOString() });
}

export function updateLevel(levelId, data) {
  return updateDoc(doc(db, "learningLevels", levelId), data);
}

export function deleteLevel(levelId) {
  return deleteDoc(doc(db, "learningLevels", levelId));
}

/* ============================================================
   CONCEPTS
   ============================================================ */

export async function listConcepts(levelId) {
  const snap = await getDocs(query(collection(db, "learningConcepts"), where("levelId", "==", levelId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function createConcept(data) {
  return addDoc(collection(db, "learningConcepts"), { ...data, createdAt: new Date().toISOString() });
}

export function updateConcept(conceptId, data) {
  return updateDoc(doc(db, "learningConcepts", conceptId), data);
}

export function deleteConcept(conceptId) {
  return deleteDoc(doc(db, "learningConcepts", conceptId));
}

/* ============================================================
   MCQ QUESTIONS
   ============================================================ */

export async function listMcqQuestions(levelId) {
  const snap = await getDocs(query(collection(db, "learningMcqQuestions"), where("levelId", "==", levelId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function createMcqQuestion(data) {
  return addDoc(collection(db, "learningMcqQuestions"), { ...data, createdAt: new Date().toISOString() });
}

export function updateMcqQuestion(questionId, data) {
  return updateDoc(doc(db, "learningMcqQuestions", questionId), data);
}

export function deleteMcqQuestion(questionId) {
  return deleteDoc(doc(db, "learningMcqQuestions", questionId));
}

/* ============================================================
   CODING QUESTIONS
   ============================================================ */

export async function listLearningCodingQuestions(levelId) {
  const snap = await getDocs(query(collection(db, "learningCodingQuestions"), where("levelId", "==", levelId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function createLearningCodingQuestion(data) {
  return addDoc(collection(db, "learningCodingQuestions"), { ...data, createdAt: new Date().toISOString() });
}

export function updateLearningCodingQuestion(questionId, data) {
  return updateDoc(doc(db, "learningCodingQuestions", questionId), data);
}

export function deleteLearningCodingQuestion(questionId) {
  return deleteDoc(doc(db, "learningCodingQuestions", questionId));
}

/* ============================================================
   PROGRESS  (doc id: {levelId}_{studentId})
   ============================================================ */

export function progressId(levelId, studentId) {
  return `${levelId}_${studentId}`;
}

export async function getProgress(levelId, studentId) {
  const snap = await getDoc(doc(db, "learningProgress", progressId(levelId, studentId)));
  return snap.exists() ? snap.data() : null;
}

/** Fetch every progress doc for a level (admin's "student progress" view). */
export async function listProgressForLevel(levelId) {
  const snap = await getDocs(query(collection(db, "learningProgress"), where("levelId", "==", levelId)));
  return snap.docs.map((d) => d.data());
}

/** Fetch every progress doc for a student, across all levels. */
export async function listProgressForStudent(studentId) {
  const snap = await getDocs(query(collection(db, "learningProgress"), where("studentId", "==", studentId)));
  return snap.docs.map((d) => d.data());
}

function emptyProgress(levelId, studentId) {
  return {
    levelId,
    studentId,
    completedConceptIds: [],
    mcqUnlocked: false,
    mcqPassed: false,
    mcqScore: null,
    mcqTotal: null,
    mcqPercentage: null,
    mcqAttempts: 0,
    codingUnlocked: false,
    updatedAt: new Date().toISOString()
  };
}

async function ensureProgress(levelId, studentId) {
  const existing = await getProgress(levelId, studentId);
  if (existing) return existing;
  const fresh = emptyProgress(levelId, studentId);
  await setDoc(doc(db, "learningProgress", progressId(levelId, studentId)), fresh);
  return fresh;
}

/** Marks a concept as read/completed and unlocks the next one. */
export async function markConceptComplete(levelId, studentId, conceptId, allConceptIds) {
  const progress = await ensureProgress(levelId, studentId);
  const completed = new Set(progress.completedConceptIds || []);
  completed.add(conceptId);

  const allDone = allConceptIds.every((id) => completed.has(id));
  const data = {
    completedConceptIds: [...completed],
    mcqUnlocked: allDone || progress.mcqUnlocked,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(doc(db, "learningProgress", progressId(levelId, studentId)), data);
  return { ...progress, ...data };
}

/** Records an MCQ test attempt and unlocks coding questions if passed. */
export async function recordMcqAttempt(levelId, studentId, { score, total, percentage, passed, answers = {} }) {
  await ensureProgress(levelId, studentId);
  const ref = doc(db, "learningProgress", progressId(levelId, studentId));
  const current = await getDoc(ref);
  const attempts = (current.data()?.mcqAttempts || 0) + 1;

  const data = {
    mcqScore: score,
    mcqTotal: total,
    mcqPercentage: percentage,
    mcqPassed: passed,
    mcqAttempts: attempts,
    mcqAnswers: answers,
    codingUnlocked: passed || current.data()?.codingUnlocked || false,
    updatedAt: new Date().toISOString()
  };
  await updateDoc(ref, data);
  return data;
}

/* ============================================================
   LEARNING CODE SUBMISSIONS (practice coding questions)
   ============================================================ */

export async function createLearningCodeSubmission({
  studentId,
  levelId,
  questionId,
  language,
  sourceCode,
  executionStatus,
  testCasesPassed,
  totalTestCases,
  marksObtained,
  executionTimeMs,
  errorMessage
}) {
  const ref = doc(collection(db, "learningCodeSubmissions"));
  await setDoc(ref, {
    submissionId: ref.id,
    studentId,
    levelId,
    questionId,
    language,
    sourceCode,
    submittedAt: new Date().toISOString(),
    executionStatus,
    testCasesPassed,
    totalTestCases,
    marksObtained,
    executionTimeMs,
    memoryUsage: null,
    errorMessage: errorMessage || null
  });
  return ref.id;
}

export async function listLearningCodeSubmissions(studentId, questionId) {
  const q = query(
    collection(db, "learningCodeSubmissions"),
    where("studentId", "==", studentId),
    where("questionId", "==", questionId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

/* ============================================================
   DERIVED VIEW HELPERS
   ============================================================ */

/**
 * Turns raw concepts + progress into a display-ready list with each
 * concept's status: "completed" | "unlocked" (current, readable) |
 * "locked" (must finish earlier concepts first).
 */
export function computeConceptStatuses(concepts, progress) {
  const completed = new Set(progress?.completedConceptIds || []);
  let unlockedAssigned = false;

  return concepts.map((concept) => {
    if (completed.has(concept.id)) return { ...concept, status: "completed" };
    if (!unlockedAssigned) {
      unlockedAssigned = true;
      return { ...concept, status: "unlocked" };
    }
    return { ...concept, status: "locked" };
  });
}

/** Whether every concept in the level has been completed. */
export function allConceptsCompleted(concepts, progress) {
  const completed = new Set(progress?.completedConceptIds || []);
  return concepts.length > 0 && concepts.every((c) => completed.has(c.id));
}
