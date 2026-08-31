// js/special-section.js
// Data layer for the premium "Special Coding Section": exclusive,
// company-style interview practice questions unlocked once a student
// reaches 100 Learning Points. Reuses the same coding-question shape
// (starter code, examples, visible/hidden test cases) as the exam and
// learning coding questions, so the same editor/grading pipeline works
// unchanged - only the storage collection and the `company` field are new.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const COMPANY_OPTIONS = ["Google", "Amazon", "Microsoft", "TCS", "Infosys", "Accenture", "Other"];

/* ============================================================
   QUESTIONS (admin CRUD)
   ============================================================ */

export async function listAllSpecialQuestions() {
  const snap = await getDocs(collection(db, "specialCodingQuestions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function createSpecialQuestion(data) {
  return addDoc(collection(db, "specialCodingQuestions"), { ...data, createdAt: new Date().toISOString() });
}

export function updateSpecialQuestion(questionId, data) {
  return updateDoc(doc(db, "specialCodingQuestions", questionId), data);
}

export function deleteSpecialQuestion(questionId) {
  return deleteDoc(doc(db, "specialCodingQuestions", questionId));
}

/* ============================================================
   QUESTIONS (student-facing read: published only)
   ============================================================ */

export async function listPublishedSpecialQuestions() {
  const q = query(collection(db, "specialCodingQuestions"), where("published", "==", true));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Published questions grouped by company, in COMPANY_OPTIONS order, only including companies that have at least one question. */
export function groupQuestionsByCompany(questions) {
  const byCompany = {};
  questions.forEach((q) => {
    const company = q.company || "Other";
    (byCompany[company] = byCompany[company] || []).push(q);
  });

  const orderedCompanies = [...COMPANY_OPTIONS.filter((c) => byCompany[c]), ...Object.keys(byCompany).filter((c) => !COMPANY_OPTIONS.includes(c))];
  return orderedCompanies.map((company) => ({ company, questions: byCompany[company] }));
}

/* ============================================================
   SUBMISSIONS (Run/Submit history, practice only - no further points)
   ============================================================ */

export async function createSpecialCodeSubmission({
  studentId,
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
  const ref = doc(collection(db, "specialCodeSubmissions"));
  await setDoc(ref, {
    submissionId: ref.id,
    studentId,
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

export async function listSpecialCodeSubmissions(studentId, questionId) {
  const q = query(
    collection(db, "specialCodeSubmissions"),
    where("studentId", "==", studentId),
    where("questionId", "==", questionId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}
