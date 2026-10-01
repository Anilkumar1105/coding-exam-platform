// Persistent-until-invalidated browser cache for Firestore reads.
//
// Read policy:
//   1. If a cached value exists, return it immediately and DO NOT hit Firestore.
//   2. If there is no cached value, read Firestore once and cache the result.
//   3. A write must explicitly invalidate the affected collection/document.
//
// This intentionally uses sessionStorage: a lab computer can be reused by another
// student, so data must disappear when the tab/session is closed. User-specific
// cache keys should include the Firebase UID.

import { getDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PREFIX = "cep:firestore-cache:v3:";
const inFlight = new Map();

function storageKey(key) {
  return `${PREFIX}${key}`;
}

function readEntry(key) {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeEntry(key, value) {
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // If storage is unavailable/full, the application can still use Firestore.
  }
}

function removeStorageKey(key) {
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {}
}

function docSnapshot(serialized) {
  return {
    id: serialized?.id || null,
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

function cachedValue(key) {
  const entry = readEntry(key);
  return entry?.value || null;
}

/** Cache a single Firestore document forever until explicitly invalidated. */
export async function getDocCached(ref, key) {
  const cached = cachedValue(key);
  if (cached?.kind === "doc") return docSnapshot(cached);

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = getDoc(ref).then((snap) => {
    writeEntry(key, {
      kind: "doc",
      id: snap.id || null,
      exists: snap.exists(),
      data: snap.exists() ? snap.data() : null
    });
    return snap;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Cache a Firestore query forever until explicitly invalidated. */
export async function getDocsCached(q, key) {
  const cached = cachedValue(key);
  if (cached?.kind === "query") return querySnapshot(cached);

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = getDocs(q).then((snap) => {
    writeEntry(key, {
      kind: "query",
      docs: snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    });
    return snap;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Invalidate one exact cache entry. */
export function invalidateCache(key) {
  removeStorageKey(key);
}

/**
 * Immediately replace one cached Firestore document after a successful write.
 * This avoids the common write -> invalidate -> read-again pattern.
 */
export function setCachedDoc(key, id, data, exists = true) {
  writeEntry(key, {
    kind: "doc",
    id: id || null,
    exists: !!exists,
    data: exists ? data : null
  });
}

/** Replace a cached query snapshot after a known successful refresh. */
export function setCachedQuery(key, docs) {
  writeEntry(key, {
    kind: "query",
    docs: Array.isArray(docs) ? docs.map((d) => ({ id: d.id, data: d.data || d })) : []
  });
}

/** Invalidate every cached read belonging to a Firestore collection. */
export function invalidateCollection(collectionName) {
  const token = `col:${collectionName}:`;
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(PREFIX) && key.slice(PREFIX.length).includes(token)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}

/** Invalidate all cached reads for the current browser tab/session. */
export function clearFirestoreCache() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}
