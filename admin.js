// js/admin.js
// Data-layer functions used by the admin dashboard: student management,
// reading exams/submissions, and CSV export. UI wiring for the dashboard
// (stat cards, filters, tables) lives in js/dashboard.js.

import { db, secondaryAuth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signOut as secondarySignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const SECTIONS = ["IT-A", "IT-B", "IT-C", "AIDS-A", "AIDS-A", "AIMS", "CYS"];

/** Generates a simple, memorable temporary password for a new student. */
export function generateTempPassword(rollNumber) {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${rollNumber}@${random}`;
}

/**
 * Creates a Firebase Auth account for a new student (using a secondary
 * app instance so the admin's own session is untouched) and writes the
 * matching profile document to users/{uid}.
 * Returns { uid, tempPassword }.
 */
export async function addStudent({ name, rollNumber, section, email }) {
  const tempPassword = generateTempPassword(rollNumber);

  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
  const uid = cred.user.uid;

  // Immediately sign the secondary app back out so it's ready for the
  // next student creation and never lingers as an active session.
  await secondarySignOut(secondaryAuth);

  await setDoc(doc(db, "users", uid), {
    uid,
    name,
    rollNumber,
    section,
    email,
    role: "student",
    createdAt: new Date().toISOString()
  });

  return { uid, tempPassword };
}

/** Updates a student's profile fields (name, rollNumber, section). Email/role are not editable here. */
export function updateStudent(uid, { name, rollNumber, section }) {
  return updateDoc(doc(db, "users", uid), { name, rollNumber, section });
}

/**
 * Deletes a student's Firestore profile.
 * NOTE: This does NOT delete their Firebase Auth account - that requires
 * the Firebase Admin SDK (a backend), which this client-only project does
 * not have. The student's login will still exist unless removed manually
 * from the Firebase Console.
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

/** Fetch all exams, newest first. */
export async function listExams() {
  const snap = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Fetch all submissions (results). */
export async function listSubmissions() {
  const snap = await getDocs(collection(db, "submissions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Builds a CSV string from an array of row objects and triggers a
 * browser download. `columns` is [{ key, label }, ...] to control
 * order and headers.
 */
export function exportToCSV(rows, columns, filename = "export.csv") {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = row[c.key] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    )
    .join("\n");

  const csvContent = `${header}\n${body}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
