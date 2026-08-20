// js/student.js
// Data-layer functions for the student dashboard.

import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Fetch all exams currently marked active (visible to students). */
export async function listActiveExams() {
  const q = query(collection(db, "exams"), where("active", "==", true));
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
