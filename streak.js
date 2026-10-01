// streak.js
// Daily learning streaks: a day qualifies only when the student has
// logged in AND fully solved at least one Learning Section coding problem.

import { db } from "./firebase-config.js";
import { getDocCached, getDocsCached, invalidateCache, invalidateCollection, setCachedDoc } from "./firestore-cache.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  runTransaction
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
  const now = new Date().toISOString();
  await setDoc(ref, {
    studentId,
    dateKey,
    // Merge-only write: no read is needed just to record a login.
    // The daily document remains idempotent for the same student/date.
    loginAt: now,
    updatedAt: now
  }, { merge: true });
  setCachedDoc(`col:${COLLECTION}:doc:${activityId(studentId, dateKey)}`, activityId(studentId, dateKey), { studentId, dateKey, loginAt: now, updatedAt: now }, true);
  // Query caches are aggregates; invalidate them because this write changes their contents.
  invalidateCache(`user:${studentId}:col:${COLLECTION}:all`);
  invalidateCache(`col:${COLLECTION}:all`);
  return { studentId, dateKey, loginAt: now };
}

export async function recordLearningProblemSolved(studentId, questionId) {
  const dateKey = getTodayKey();
  const ref = doc(db, COLLECTION, activityId(studentId, dateKey));

  // Do not depend on the separate login write having succeeded. If a
  // student opens the coding page directly, or the login write was lost
  // because of a transient error, solving a problem should still create a
  // complete qualifying activity record.
  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const existing = snap.exists() ? snap.data() : {};
    const now = new Date().toISOString();

    const updated = {
      studentId,
      dateKey,
      loginAt: existing.loginAt || now,
      solvedAt: existing.solvedAt || now,
      solvedQuestionId: existing.solvedQuestionId || questionId,
      qualified: true,
      updatedAt: now
    };

    transaction.set(ref, updated, { merge: true });
    return updated;
  });
  setCachedDoc(`col:${COLLECTION}:doc:${activityId(studentId, dateKey)}`, activityId(studentId, dateKey), result, true);
  // Query caches are aggregates; invalidate them because this write changes their contents.
  invalidateCache(`user:${studentId}:col:${COLLECTION}:all`);
  invalidateCache(`col:${COLLECTION}:all`);
  return result;
}

export async function getMyDailyLearningActivity(studentId) {
  const snap = await getDocsCached(query(collection(db, COLLECTION), where("studentId", "==", studentId)), `user:${studentId}:col:${COLLECTION}:all`);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listAllDailyLearningActivity() {
  const snap = await getDocsCached(collection(db, COLLECTION), `col:${COLLECTION}:all`);
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
  const snap = await getDocCached(doc(db, "streakLeaderboard", "current"), "col:streakLeaderboard:doc:current");
  return snap.exists() ? snap.data() : null;
}
