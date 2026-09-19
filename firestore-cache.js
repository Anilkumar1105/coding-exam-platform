// Short-lived browser cache for dashboard reads.
//
// IMPORTANT: this deliberately uses sessionStorage rather than persistent
// Firestore/IndexedDB persistence. The platform is used on lab computers
// where different students may use the same browser/device. Keeping the
// dashboard cache in the current tab avoids carrying one student's private
// data into another student's session.

import { getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PREFIX = "cep:dashboard-cache:v2:";

function keyFor(key) {
  return `${PREFIX}${key}`;
}

function readEntry(key) {
  try {
    const raw = sessionStorage.getItem(keyFor(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEntry(key, value) {
  try {
    sessionStorage.setItem(keyFor(key), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage can be unavailable or full. Firestore remains the source of truth.
  }
}

function isFresh(entry, ttlMs) {
  return !!entry && Number.isFinite(entry.savedAt) && Date.now() - entry.savedAt < ttlMs;
}

function docSnapshot(serialized) {
  return {
    exists: () => !!serialized?.exists,
    data: () => serialized?.data || undefined
  };
}

function querySnapshot(serialized) {
  const docs = Array.isArray(serialized?.docs) ? serialized.docs : [];
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((row) => ({
      id: row.id,
      data: () => row.data
    }))
  };
}

export function markCacheFresh(key) {
  const entry = readEntry(key);
  if (!entry) return;
  try {
    entry.savedAt = Date.now();
    sessionStorage.setItem(keyFor(key), JSON.stringify(entry));
  } catch {}
}

export function clearCacheStamp(key) {
  try {
    sessionStorage.removeItem(keyFor(key));
  } catch {}
}

export async function getDocCached(ref, key, ttlMs = 30000) {
  const cached = readEntry(key);
  if (isFresh(cached, ttlMs) && cached.value?.kind === "doc") {
    return docSnapshot(cached.value);
  }

  try {
    const snap = await getDoc(ref);
    writeEntry(key, {
      kind: "doc",
      exists: snap.exists(),
      data: snap.exists() ? snap.data() : null
    });
    return snap;
  } catch (error) {
    if (cached?.value?.kind === "doc") return docSnapshot(cached.value);
    throw error;
  }
}

export async function getDocsCached(q, key, ttlMs = 30000) {
  const cached = readEntry(key);
  if (isFresh(cached, ttlMs) && cached.value?.kind === "query") {
    return querySnapshot(cached.value);
  }

  try {
    const snap = await getDocs(q);
    writeEntry(key, {
      kind: "query",
      docs: snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    });
    return snap;
  } catch (error) {
    if (cached?.value?.kind === "query") return querySnapshot(cached.value);
    throw error;
  }
}
