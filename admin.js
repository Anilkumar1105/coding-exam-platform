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

export const SECTIONS = ["IT-A", "IT-B", "IT-C", "AIDS-A", "AIDS-B", "AIML", "CYS"];

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
  const trimmedPassword = String(password || "").trim();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, trimmedPassword);
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
    passwordPlain: trimmedPassword,
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
  const trimmed = password ? String(password).trim() : "";
  if (trimmed) data.passwordPlain = trimmed;
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
   EXCEL EXPORT (ExcelJS - loaded globally as `ExcelJS` via CDN script)
   ============================================================ */
/*
 * We use ExcelJS instead of SheetJS here on purpose: the free/community
 * build of SheetJS cannot style cells at all (bold, fills, borders are
 * a paid "Pro" feature), so it can't produce what "professional export"
 * actually requires. ExcelJS is free (MIT) and supports real styling.
 */

const BRAND_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
const PASS_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
const FAIL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
const ABSENT_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const THIN_BORDER = { style: "thin", color: { argb: "FFD1D5DB" } };
const ALL_BORDERS = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

/**
 * Builds a professionally formatted .xlsx workbook and downloads it.
 * `columns` is [{ key, label, width?, type? }, ...] where `type` is one
 * of "text" (default), "number", "percentage", "date", or "status"
 * (renders PASS/FAIL with colored fill). Column width auto-adjusts to
 * the longest value unless a fixed `width` is given.
 */
export async function exportResultsToExcel(
  rows,
  columns,
  { filename = "results.xlsx", sheetName = "Results", title = "", filtersText = "" } = {}
) {
  if (typeof ExcelJS === "undefined") {
    alert("Excel export library did not load. Check your internet connection and try again.");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Coding Exam Platform";
  workbook.created = new Date();

  // Meta rows above the table: title, generated-on, filters-used (each optional except title).
  const metaLines = [];
  if (title) metaLines.push({ text: title, font: { bold: true, size: 14, color: { argb: "FF1F2937" } } });
  if (title) metaLines.push({ text: `Generated on: ${new Date().toLocaleString()}`, font: { italic: true, size: 10, color: { argb: "FF6B7280" } } });
  if (filtersText) metaLines.push({ text: `Filters: ${filtersText}`, font: { italic: true, size: 10, color: { argb: "FF6B7280" } } });

  const headerRowNum = metaLines.length ? metaLines.length + 2 : 1; // +1 blank spacer row before headers
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: headerRowNum }] });

  metaLines.forEach((line, i) => {
    sheet.mergeCells(i + 1, 1, i + 1, columns.length);
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line.text;
    cell.font = line.font;
  });

  // Header row
  const headerRow = sheet.getRow(headerRowNum);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = BRAND_FILL;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = ALL_BORDERS;
  });
  headerRow.height = 20;

  // Data rows
  rows.forEach((row, rIdx) => {
    const excelRow = sheet.getRow(headerRowNum + 1 + rIdx);
    columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const raw = row[col.key];
      applyCellValue(cell, raw, col.type);
      cell.border = ALL_BORDERS;
      if (col.type === "status") {
        cell.font = { bold: true, color: { argb: raw === "PASS" ? "FF065F46" : raw === "ABSENT" ? "FF374151" : "FF991B1B" } };
        cell.fill = raw === "PASS" ? PASS_FILL : raw === "FAIL" ? FAIL_FILL : raw === "ABSENT" ? ABSENT_FILL : undefined;
        cell.alignment = { horizontal: "center" };
      } else if (col.type === "number" || col.type === "percentage") {
        cell.alignment = { horizontal: "right" };
      } else {
        cell.alignment = { horizontal: "left" };
      }
    });
  });

  // Column widths: use the given hint as a floor, auto-grow to fit content
  columns.forEach((col, i) => {
    const longest = rows.reduce((max, row) => {
      const val = row[col.key];
      const len = val == null ? 0 : String(val).length;
      return Math.max(max, len);
    }, col.label.length);
    sheet.getColumn(i + 1).width = Math.min(Math.max(col.width || 12, longest + 2), 40);
  });

  sheet.autoFilter = {
    from: { row: headerRowNum, column: 1 },
    to: { row: headerRowNum, column: columns.length }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function applyCellValue(cell, raw, type) {
  switch (type) {
    case "number":
      cell.value = raw == null || raw === "" ? null : Number(raw);
      cell.numFmt = "0";
      break;
    case "percentage":
      cell.value = raw == null || raw === "" ? null : Number(raw);
      cell.numFmt = '0.00"%"';
      break;
    case "date":
      cell.value = raw ? new Date(raw) : null;
      cell.numFmt = "dd-mmm-yyyy hh:mm AM/PM";
      break;
    default:
      cell.value = raw ?? "";
  }
}
