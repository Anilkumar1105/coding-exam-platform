// streak.js
// Daily learning streaks: a day qualifies only when the student has
// logged in AND fully solved at least one Learning Section coding problem.
//
// The original dailyLearningActivity collection is kept as the audit/history
// source. A compact streakStats/{studentId} document is maintained for the
// dashboard so we do not download a student's entire activity history on
// every dashboard refresh.

import { db } from "./firebase-config.js";
import { getDocCached, getDocsCached, clearCacheStamp } from "./firestore-cache.js";
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
const STREAK_STATS_COLLECTION = "streakStats";
const STREAK_CACHE_TTL = 30000;

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

function streakStatsId(studentId) {
  return studentId;
}

function previousDateKey(dateKey) {
  const d = new Date(`${dateKey}T00:00:00+05:30`);
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function buildLast7(todayKey, qualifiedDates) {
  const last7 = [];
  const d = new Date(`${todayKey}T00:00:00+05:30`);
  for (let i = 6; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(day.getDate() - i);
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(day);
    last7.push({ dateKey: key, qualified: qualifiedDates.has(key) });
  }
  return last7;
}

export async function recordDailyLogin(studentId) {
  const dateKey = getTodayKey();
  const sessionKey = `cep:daily-login:${studentId}:${dateKey}`;

  // Same student + same day in this browser tab: the login is already known.
  // This avoids even the read on repeated dashboard refreshes.
  try {
    if (sessionStorage.getItem(sessionKey) === "1") {
      return { studentId, dateKey, sessionCached: true };
    }
  } catch {}

  const ref = doc(db, COLLECTION, activityId(studentId, dateKey));
  const snap = await getDoc(ref);

  // A login for today already exists. Do not rewrite the same document on
  // every dashboard refresh/tab load. This removes a large source of writes.
  if (snap.exists()) {
    try { sessionStorage.setItem(sessionKey, "1"); } catch {}
    return { ...snap.data(), studentId, dateKey };
  }

  const now = new Date().toISOString();
  const data = {
    studentId,
    dateKey,
    loginAt: now,
    solvedAt: null,
    solvedQuestionId: null,
    qualified: false,
    updatedAt: now
  };

  await setDoc(ref, data);
  try { sessionStorage.setItem(sessionKey, "1"); } catch {}
  return data;
}

export async function recordLearningProblemSolved(studentId, questionId) {
  const dateKey = getTodayKey();
  const ref = doc(db, COLLECTION, activityId(studentId, dateKey));
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : {};
  const solvedAt = existing.solvedAt || new Date().toISOString();

  const data = {
    studentId,
    dateKey,
    loginAt: existing.loginAt || null,
    solvedAt,
    solvedQuestionId: existing.solvedQuestionId || questionId,
    qualified: true,
    updatedAt: new Date().toISOString()
  };

  await setDoc(ref, data, { merge: true });
  await updateStreakSummaryAfterQualification(studentId, dateKey);
  return { ...existing, ...data };
}

async function updateStreakSummaryAfterQualification(studentId, dateKey) {
  const ref = doc(db, STREAK_STATS_COLLECTION, streakStatsId(studentId));
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : null;

  // If there is no summary yet, build it once from history. This is only a
  // migration path for students who earned streak activity before this
  // optimization was deployed.
  if (!current) {
    const history = await getDocs(
      query(collection(db, COLLECTION), where("studentId", "==", studentId))
    );
    const docs = history.docs.map((d) => ({ id: d.id, ...d.data() }));
    const stats = calculateStreakStats(docs, dateKey);
    await setDoc(ref, {
      studentId,
      ...stats,
      lastQualifiedDate: dateKey,
      updatedAt: new Date().toISOString()
    });
    clearCacheStamp(`streak-stats:${studentId}`);
    return stats;
  }

  const lastQualifiedDate = current.lastQualifiedDate || null;
  let currentStreak = Number(current.currentStreak) || 0;

  if (lastQualifiedDate === dateKey) {
    // Same day was already qualified. No streak increment.
    currentStreak = Math.max(currentStreak, 1);
  } else if (lastQualifiedDate === previousDateKey(dateKey)) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  const qualifiedDays = (Number(current.qualifiedDays) || 0) +
    (lastQualifiedDate === dateKey ? 0 : 1);
  const bestStreak = Math.max(Number(current.bestStreak) || 0, currentStreak);
  const todayQualified = true;

  const previousLast7 = new Map(
    Array.isArray(current.last7) ? current.last7.map((d) => [d.dateKey, !!d.qualified]) : []
  );
  previousLast7.set(dateKey, true);

  // Rebuild the visible 7-day strip without querying history.
  const qualifiedDates = new Set(
    [...previousLast7.entries()].filter(([, qualified]) => qualified).map(([key]) => key)
  );

  const summary = {
    studentId,
    currentStreak,
    bestStreak,
    qualifiedDays,
    todayQualified,
    lastQualifiedDate: dateKey,
    last7: buildLast7(dateKey, qualifiedDates),
    nextMilestone: [3, 7, 14, 30, 60, 100, 180, 365].find((n) => n > currentStreak) || currentStreak + 30,
    updatedAt: new Date().toISOString()
  };

  await setDoc(ref, summary, { merge: true });
  clearCacheStamp(`streak-stats:${studentId}`);
  return summary;
}

export async function getMyDailyLearningActivity(studentId) {
  const snap = await getDocsCached(
    query(collection(db, COLLECTION), where("studentId", "==", studentId)),
    `daily-learning-history:${studentId}`,
    300000
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Dashboard-safe streak read. Prefer the compact summary document. If this
 * student predates streakStats, migrate their history once and then use the
 * summary from that point forward.
 */
export async function getMyStreakStats(studentId) {
  const ref = doc(db, STREAK_STATS_COLLECTION, streakStatsId(studentId));
  const snap = await getDocCached(ref, `streak-stats:${studentId}`, STREAK_CACHE_TTL);

  if (snap.exists()) {
    return snap.data();
  }

  const history = await getDocs(
    query(collection(db, COLLECTION), where("studentId", "==", studentId))
  );
  const docs = history.docs.map((d) => ({ id: d.id, ...d.data() }));
  const stats = calculateStreakStats(docs);

  await setDoc(ref, {
    studentId,
    ...stats,
    lastQualifiedDate: [...docs]
      .filter((d) => d.qualified && d.solvedAt && d.loginAt)
      .map((d) => d.dateKey)
      .sort()
      .pop() || null,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  clearCacheStamp(`streak-stats:${studentId}`);
  return stats;
}

export async function listAllDailyLearningActivity() {
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function calculateStreakStats(activityDocs, todayKey = getTodayKey()) {
  const qualified = new Set(
    activityDocs
      .filter((a) => a.qualified === true && a.loginAt && a.solvedAt)
      .map((a) => a.dateKey)
      .filter(Boolean)
  );

  let currentStreak = 0;
  let cursor = new Date(`${todayKey}T00:00:00+05:30`);
  const todayQualified = qualified.has(todayKey);

  // If today is not finished yet, keep yesterday's streak alive in the UI.
  if (!todayQualified) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(cursor);
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

  return {
    currentStreak,
    bestStreak,
    qualifiedDays: qualified.size,
    todayQualified,
    last7: buildLast7(todayKey, qualified),
    nextMilestone: [3, 7, 14, 30, 60, 100, 180, 365].find((n) => n > currentStreak) || currentStreak + 30
  };
}

export async function getStreakLeaderboard() {
  const snap = await getDocCached(
    doc(db, "streakLeaderboard", "current"),
    "streak-leaderboard",
    300000
  );
  return snap.exists() ? snap.data() : null;
}
