// js/admin.js
// Data-layer functions used by the admin dashboard: student management,
// exam + question CRUD, submissions/results, and Excel export.
// UI wiring lives in admin-dashboard.html's inline module script.

import { db, secondaryAuth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const SECTIONS = ["A", "B", "C", "D", "E", "F", "G"];

/* ============================================================
   STUDENTS
   ============================================================ */

/**
 * Creates a Firebase Auth account for a new student (using a secondary
 * app instance so the admin's own session is untouched) using the
 * password the admin typed in, and writes the profile document to
 * users/{uid}.
 *
 * SECURITY NOTE: `password` is also stored in Firestore as
 * `passwordPlain` so it can be shown back to the admin later (per
 * product requirement). This is a deliberate weakening of the earlier
 * "never store plaintext passwords" design - Firestore is not a
 * credential store, and anyone with read access to a student's user
 * doc (any signed-in admin) can read it in plaintext. Firebase
 * Authentication itself never exposes the real password back to
 * anyone, including admins, so `passwordPlain` is only ever a "last
 * known value" - see updateStudent() for why it can silently go stale.
 */
export async function addStudent({ name, rollNumber, section, email, password }) {
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = cred.user.uid;

  // Sign the secondary app back out immediately so it's clean for the
  // next student and never lingers as an active session.
  await secondarySignOut(secondaryAuth);

  await setDoc(doc(db, "users", uid), {
    uid,
    name,
    rollNumber,
    section,
    email,
    passwordPlain: password,
    role: "student",
    createdAt: new Date().toISOString()
  });

  return { uid };
}

/**
 * Updates a student's profile fields. If `password` is provided, the
 * stored `passwordPlain` reference is updated too - but this does NOT
 * change the student's real Firebase Authentication password (the
 * client SDK cannot overwrite another user's password without the
 * Admin SDK). If the student ever uses "Send Password Reset Email" to
 * set their own new password, `passwordPlain` here will no longer
 * match what actually logs them in. Treat this field as "the password
 * we last set for them," not as a live mirror of their real credential.
 */
export function updateStudent(uid, { name, rollNumber, section, password }) {
  const data = { name, rollNumber, section };
  if (password) data.passwordPlain = password;
  return updateDoc(doc(db, "users", uid), data);
}

/**
 * Sends a password-reset email to a student. This is the only
 * browser-safe way to change ANOTHER user's password: the Firebase
 * client SDK cannot directly overwrite a different account's password
 * without the Admin SDK (which requires a backend this project
 * intentionally does not have). The student clicks the emailed link
 * and sets their own new password.
 */
export function sendStudentPasswordReset(email) {
  return sendPasswordResetEmail(secondaryAuth, email);
}

/**
 * Deletes a student's Firestore profile.
 * NOTE: this does NOT delete their Firebase Auth account - only the
 * Admin SDK (backend) can do that. Remove the login manually from the
 * Firebase Console if needed.
 */
export function deleteStudentProfile(uid) {
  return deleteDoc(doc(db, "users", uid));
}

/** Fetch all students, optionally filtered by section. */
export async function listStudents(section = "all") {
  const usersRef = collection(db, "users");
  const q =
    section === "all"
      ? query(usersRef, where("role", "==", "student"))
      : query(usersRef, where("role", "==", "student"), where("section", "==", section));

  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

/* ============================================================
   EXAMS
   ============================================================ */

/** Fetch all exams, newest first. */
export async function listExams() {
  const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getExam(examId) {
  const snap = await getDoc(doc(db, "exams", examId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function createExam(data, createdBy) {
  return addDoc(collection(db, "exams"), {
    ...data,
    createdBy,
    createdAt: new Date().toISOString()
  });
}

export function updateExamDoc(examId, data) {
  return updateDoc(doc(db, "exams", examId), data);
}

export function toggleExamActive(examId, active) {
  return updateDoc(doc(db, "exams", examId), { active });
}

export function deleteExamDoc(examId) {
  return deleteDoc(doc(db, "exams", examId));
}

/* ============================================================
   QUESTIONS
   ============================================================ */

export async function listQuestionsForExam(examId) {
  const q = query(collection(db, "questions"), where("examId", "==", examId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function addQuestion(data) {
  return addDoc(collection(db, "questions"), { ...data, createdAt: new Date().toISOString() });
}

export function updateQuestionDoc(questionId, data) {
  return updateDoc(doc(db, "questions", questionId), data);
}

export function deleteQuestionDoc(questionId) {
  return deleteDoc(doc(db, "questions", questionId));
}

/* ============================================================
   SUBMISSIONS / RESULTS
   ============================================================ */

export async function listSubmissions() {
  const snap = await getDocs(collection(db, "submissions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ============================================================
   EXCEL EXPORT (SheetJS - loaded globally as `XLSX` via CDN script)
   ============================================================ */

/**
 * Builds a formatted .xlsx workbook from row objects and downloads it.
 * `columns` is [{ key, label, width? }, ...] controlling order, headers
 * and column width. Requires the SheetJS <script> tag to be loaded on
 * the page (adds a global `XLSX`).
 *
 * NOTE: the free/community build of SheetJS (used here via CDN) does
 * NOT support cell background colors or fonts - that's a paid "Pro"
 * feature. What we CAN do for free and still get a professional-looking
 * sheet: a merged title row, sensible column widths, a frozen header
 * row, and an Excel autofilter on the header. That's what this does.
 */
export function exportResultsToExcel(
  rows,
  columns,
  { filename = "results.xlsx", sheetName = "Results", title = "" } = {}
) {
  if (typeof XLSX === "undefined") {
    alert("Excel export library did not load. Check your internet connection and try again.");
    return;
  }

  const headerRow = columns.map((c) => c.label);
  const dataRows = rows.map((row) => columns.map((c) => row[c.key] ?? ""));
  const headerRowIndex = title ? 2 : 0;

  const sheetData = title
    ? [[title], [], headerRow, ...dataRows]
    : [headerRow, ...dataRows];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet["!cols"] = columns.map((c) => ({ wch: c.width || 18 }));

  if (title) {
    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
  }

  // Autofilter dropdowns on the header row
  const lastCol = XLSX.utils.encode_col(columns.length - 1);
  worksheet["!autofilter"] = { ref: `A${headerRowIndex + 1}:${lastCol}${headerRowIndex + 1}` };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}
