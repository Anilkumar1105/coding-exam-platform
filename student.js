// js/student.js
// Data-layer functions for the student dashboard and the exam page.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Fetch all exams currently marked active (visible to students). */
export async function listActiveExams() {
  const q = query(collection(db, "exams"), where("active", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getExamById(examId) {
  const snap = await getDoc(doc(db, "exams", examId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getQuestionsForExam(examId) {
  const q = query(collection(db, "questions"), where("examId", "==", examId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Fetch all submissions belonging to the given student uid. */
export async function getStudentSubmissions(uid) {
  const q = query(collection(db, "submissions"), where("studentId", "==", uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Returns the submission for a given exam, if the student has one. */
export function findSubmissionForExam(submissions, examId) {
  return submissions.find((s) => s.examId === examId) || null;
}

/** Submission doc id is deterministic: {examId}_{studentId}, so a student can only ever have one per exam. */
export function submissionId(examId, studentId) {
  return `${examId}_${studentId}`;
}

export async function getSubmission(examId, studentId) {
  const snap = await getDoc(doc(db, "submissions", submissionId(examId, studentId)));
  return snap.exists() ? snap.data() : null;
}

/** Creates the submission doc the moment a student starts an exam. */
export function startSubmission(examId, student, maxViolations) {
  const id = submissionId(examId, student.uid);
  return setDoc(doc(db, "submissions", id), {
    examId,
    studentId: student.uid,
    rollNumber: student.rollNumber,
    section: student.section,
    answers: {},
    score: null,
    percentage: null,
    violations: 0,
    maxViolations,
    status: "in-progress",
    startedAt: new Date().toISOString(),
    submittedAt: null
  });
}

/** Autosaves partial answers without changing status. */
export function saveAnswers(examId, studentId, answers) {
  return updateDoc(doc(db, "submissions", submissionId(examId, studentId)), { answers });
}

export function incrementViolation(examId, studentId, newCount) {
  return updateDoc(doc(db, "submissions", submissionId(examId, studentId)), { violations: newCount });
}

/** Final submit: writes score/status/submittedAt. */
export function finalizeSubmission(examId, studentId, { answers, score, totalMarks, percentage, status }) {
  return updateDoc(doc(db, "submissions", submissionId(examId, studentId)), {
    answers,
    score,
    totalMarks,
    percentage,
    status,
    submittedAt: new Date().toISOString()
  });
}
