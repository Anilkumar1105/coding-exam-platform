// streak.js
// Daily learning streaks: a day qualifies only when the student has
// logged in AND fully solved at least one Learning Section coding problem.

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLLECTION = "dailyLearningActivity";

export function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function activityId(studentId, dateKey) {
  return `${studentId}_${dateKey}`;
}

export async function recordDailyLogin(studentId) {
  const dateKey = getTodayKey();
  const ref = doc(db, COLLECTION, activityId(studentId, dateKey));
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  await setDoc(ref, {
    studentId,
    dateKey,
    loginAt: existing.loginAt || new Date().toISOString(),
    solvedAt: existing.solvedAt || null,
    solvedQuestionId: existing.solvedQuestionId || null,
    qualified: Boolean(existing.solvedAt),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return { ...existing, studentId, dateKey, loginAt: existing.loginAt || new Date().toISOString() };
}

export async function recordLearningProblemSolved(studentId, questionId) {
  const dateKey = getTodayKey();
  const ref = doc(db, COLLECTION, activityId(studentId, dateKey));
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  await setDoc(ref, {
    studentId,
    dateKey,
    loginAt: existing.loginAt || null,
    solvedAt: existing.solvedAt || new Date().toISOString(),
    solvedQuestionId: existing.solvedQuestionId || questionId,
    qualified: true,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  return { ...existing, studentId, dateKey, solvedAt: existing.solvedAt || new Date().toISOString(), qualified: true };
}

export async function getMyDailyLearningActivity(studentId) {
  const snap = await getDocs(query(collection(db, COLLECTION), where("studentId", "==", studentId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllDailyLearningActivity() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function calculateStreakStats(activityDocs, todayKey = getTodayKey()) {
  const qualified = new Set(
    activityDocs.filter((a) => a.qualified === true && a.loginAt && a.solvedAt).map((a) => a.dateKey).filter(Boolean)
  );

  let currentStreak = 0;
  let cursor = new Date(`${todayKey}T00:00:00+05:30`);
  const todayQualified = qualified.has(todayKey);

  // If today is not finished yet, keep yesterday's streak alive in the UI.
  if (!todayQualified) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(cursor);
    if (!qualified.has(key)) break;
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let bestStreak = 0;
  let run = 0;
  const sorted = [...qualified].sort();
  let previous = null;
  for (const key of sorted) {
    if (previous) {
      const a = new Date(`${previous}T00:00:00+05:30`);
      const b = new Date(`${key}T00:00:00+05:30`);
      const diff = Math.round((b - a) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    bestStreak = Math.max(bestStreak, run);
    previous = key;
  }

  const last7 = [];
  const d = new Date(`${todayKey}T00:00:00+05:30`);
  for (let i = 6; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(day.getDate() - i);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
    last7.push({ dateKey: key, qualified: qualified.has(key) });
  }

  return {
    currentStreak,
    bestStreak,
    qualifiedDays: qualified.size,
    todayQualified,
    last7,
    nextMilestone: [3, 7, 14, 30, 60, 100, 180, 365].find((n) => n > currentStreak) || currentStreak + 30
  };
}


export async function getStreakLeaderboard() {
  const snap = await getDoc(doc(db, "streakLeaderboard", "current"));
  return snap.exists() ? snap.data() : null;
}
