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


/* ============================================================
   EXAMS
   ============================================================ */

/** Fetch all exams currently marked active (visible to students). */
export async function listActiveExams() {
  const q = query(
    collection(db, "exams"),
    where("active", "==", true)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}


/** Fetch a single exam by ID. */
export async function getExamById(examId) {
  const snap = await getDoc(
    doc(db, "exams", examId)
  );

  return snap.exists()
    ? { id: snap.id, ...snap.data() }
    : null;
}


/** Fetch multiple exams by IDs. */
export async function getExamsByIds(examIds) {
  const uniqueIds = [...new Set(examIds)];

  const exams = await Promise.all(
    uniqueIds.map((id) => getExamById(id))
  );

  return exams.filter(Boolean);
}


/** Get weekly toppers. */
export async function getWeeklyToppers() {
  const snap = await getDoc(
    doc(db, "weeklyToppers", "current")
  );

  return snap.exists()
    ? snap.data()
    : null;
}


/* ============================================================
   EXAM SCHEDULES
   ============================================================ */

/** Fetch schedules for an exam, earliest first. */
export async function listSchedulesForExam(examId) {
  const q = query(
    collection(db, "examSchedules"),
    where("examId", "==", examId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data()
    }))
    .sort(
      (a, b) =>
        new Date(a.startTime) - new Date(b.startTime)
    );
}


/* ============================================================
   QUESTIONS
   ============================================================ */

/** Fetch published questions for an exam. */
export async function listQuestionsForExam(examId) {
  const q = query(
    collection(db, "questions"),
    where("examId", "==", examId),
    where("published", "==", true)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}


/* ============================================================
   STUDENT SUBMISSIONS
   ============================================================ */

/** Fetch all submissions belonging to the given student UID. */
export async function getStudentSubmissions(uid) {
  const q = query(
    collection(db, "submissions"),
    where("studentId", "==", uid)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}


/** Find submission for a specific exam. */
export function findSubmissionForExam(submissions, examId) {
  return submissions.find(
    (s) => s.examId === examId
  ) || null;
}


/** Generate deterministic submission ID. */
export function submissionId(examId, studentId) {
  return `${examId}_${studentId}`;
}


/** Get one submission. */
export async function getSubmission(examId, studentId) {
  const snap = await getDoc(
    doc(
      db,
      "submissions",
      submissionId(examId, studentId)
    )
  );

  return snap.exists()
    ? snap.data()
    : null;
}


/** Create submission when student starts an exam. */
export function startSubmission(
  examId,
  student,
  maxViolations
) {
  const id = submissionId(examId, student.uid);

  return setDoc(
    doc(db, "submissions", id),
    {
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
    }
  );
}


/** Autosave student answers. */
export function saveAnswers(
  examId,
  studentId,
  answers
) {
  return updateDoc(
    doc(
      db,
      "submissions",
      submissionId(examId, studentId)
    ),
    {
      answers
    }
  );
}


/** Update violation count. */
export function incrementViolation(
  examId,
  studentId,
  newCount
) {
  return updateDoc(
    doc(
      db,
      "submissions",
      submissionId(examId, studentId)
    ),
    {
      violations: newCount
    }
  );
}


/** Final exam submission. */
export function finalizeSubmission(
  examId,
  studentId,
  {
    answers,
    score,
    mcqScore,
    codingScore,
    totalMarks,
    percentage,
    status
  }
) {
  return updateDoc(
    doc(
      db,
      "submissions",
      submissionId(examId, studentId)
    ),
    {
      answers,
      score,
      mcqScore,
      codingScore,
      totalMarks,
      percentage,
      status,
      submittedAt: new Date().toISOString()
    }
  );
}


/* ============================================================
   CODE SUBMISSIONS
   ============================================================ */

/** Records one "Submit Code" attempt. */
export async function createCodeSubmission({
  studentId,
  examId,
  questionId,
  language,
  sourceCode,
  compilationStatus,
  executionStatus,
  testCasesPassed,
  totalTestCases,
  marksObtained,
  executionTimeMs,
  memoryUsage,
  errorMessage
}) {
  const ref = doc(
    collection(db, "codeSubmissions")
  );

  await setDoc(ref, {
    submissionId: ref.id,
    studentId,
    examId,
    questionId,
    language,
    sourceCode,

    submittedAt: new Date().toISOString(),

    compilationStatus,
    executionStatus,

    testCasesPassed,
    totalTestCases,
    marksObtained,

    executionTimeMs,

    memoryUsage: memoryUsage ?? null,
    errorMessage: errorMessage || null
  });

  return ref.id;
}


/** All attempts for one student and one question. */
export async function listCodeSubmissions(
  studentId,
  questionId
) {
  const q = query(
    collection(db, "codeSubmissions"),
    where("studentId", "==", studentId),
    where("questionId", "==", questionId)
  );

  const snap = await getDocs(q);

  return snap.docs
    .map((d) => ({
      id: d.id,
      ...d.data()
    }))
    .sort(
      (a, b) =>
        new Date(b.submittedAt) -
        new Date(a.submittedAt)
    );
}


/** All coding submissions for a student across an exam. */
export async function listCodeSubmissionsForExam(
  studentId,
  examId
) {
  const q = query(
    collection(db, "codeSubmissions"),
    where("studentId", "==", studentId),
    where("examId", "==", examId)
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}
