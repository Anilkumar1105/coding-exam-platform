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

import { getDoc, getDocs, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PREFIX = "cep:firestore-cache:v5:";
const inFlight = new Map();

// One realtime listener per browser page, even if multiple modules ask for it.
// Each caller may register its own callback, but Firebase only receives one
// onSnapshot subscription for cacheVersions/global.
let remoteWatchUnsubscribe = null;
const remoteWatchCallbacks = new Set();
let remoteWatchDb = null;

// Revisions prevent an older Firestore request that was already in flight
// from repopulating a cache after that cache was invalidated or updated.
const keyRevisions = new Map();
const collectionRevisions = new Map();
let globalRevision = 0;

function collectionFromKey(key) {
  const match = String(key).match(/(?:^|:)col:([^:]+):/);
  return match ? match[1] : null;
}

function revisionSnapshot(key) {
  const collection = collectionFromKey(key);
  return {
    key: keyRevisions.get(key) || 0,
    collection: collection ? (collectionRevisions.get(collection) || 0) : 0,
    global: globalRevision
  };
}

function revisionChanged(key, snapshot) {
  const current = revisionSnapshot(key);
  return current.key !== snapshot.key ||
    current.collection !== snapshot.collection ||
    current.global !== snapshot.global;
}

function bumpKeyRevision(key) {
  keyRevisions.set(key, (keyRevisions.get(key) || 0) + 1);
}

function bumpCollectionRevision(collectionName) {
  const collection = String(collectionName);
  collectionRevisions.set(collection, (collectionRevisions.get(collection) || 0) + 1);
}

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

/** Publish a tiny remote version marker after an admin-controlled data change. */
export async function bumpRemoteCacheVersion(db, collectionName) {
  const field = String(collectionName).replace(/[^a-zA-Z0-9_]/g, "_");
  return setDoc(doc(db, "cacheVersions", "global"), {
    [field]: Date.now(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Listen to one shared version document and invalidate changed collections.
 *
 * This function is intentionally idempotent: auth.js, dashboard modules, and
 * future pages can all call it without creating duplicate Firestore listeners.
 */
export function watchRemoteCacheChanges(db, onChanged) {
  if (typeof onChanged === "function") remoteWatchCallbacks.add(onChanged);

  if (!remoteWatchUnsubscribe || remoteWatchDb !== db) {
    if (remoteWatchUnsubscribe) {
      try { remoteWatchUnsubscribe(); } catch {}
    }
    remoteWatchDb = db;
    remoteWatchUnsubscribe = onSnapshot(doc(db, "cacheVersions", "global"), (snap) => {
      if (!snap.exists()) return;

      const values = snap.data() || {};
      let previous = {};
      try {
        previous = JSON.parse(sessionStorage.getItem("cep:remote-cache-versions") || "{}");
      } catch {}

      const changed = [];
      Object.entries(values).forEach(([name, version]) => {
        if (name === "updatedAt") return;
        // First snapshot establishes the baseline. Only a real version change
        // invalidates a cache, preventing a burst of reads on initial login.
        if (previous[name] !== undefined && String(previous[name]) !== String(version)) {
          changed.push(name);
        }
      });

      try {
        sessionStorage.setItem("cep:remote-cache-versions", JSON.stringify(values));
      } catch {}

      changed.forEach((name) => {
        invalidateCollection(name);

        // Generic event for UI modules. This makes realtime cache invalidation
        // independent from the data-layer module that requested the listener.
        try {
          window.dispatchEvent(new CustomEvent("firestore-cache-invalidated", {
            detail: { collectionName: name }
          }));
        } catch {}

        remoteWatchCallbacks.forEach((callback) => {
          try { callback(name); } catch (error) {
            console.warn("Remote cache callback failed:", error);
          }
        });
      });
    }, (error) => console.warn("Remote cache version listener unavailable:", error));
  }

  // Return a per-caller cleanup function. Removing a callback never tears down
  // the shared Firebase listener while other modules still use it.
  return () => {
    if (typeof onChanged === "function") remoteWatchCallbacks.delete(onChanged);
  };
}

/** Cache a single Firestore document forever until explicitly invalidated. */
export async function getDocCached(ref, key) {
  const cached = cachedValue(key);
  if (cached?.kind === "doc") return docSnapshot(cached);

  if (inFlight.has(key)) return inFlight.get(key);

  const revision = revisionSnapshot(key);
  const promise = getDoc(ref).then((snap) => {
    if (!revisionChanged(key, revision)) {
      writeEntry(key, {
        kind: "doc",
        id: snap.id || null,
        exists: snap.exists(),
        data: snap.exists() ? snap.data() : null
      });
    }
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

  const revision = revisionSnapshot(key);
  const promise = getDocs(q).then((snap) => {
    if (!revisionChanged(key, revision)) {
      writeEntry(key, {
        kind: "query",
        docs: snap.docs.map((d) => ({ id: d.id, data: d.data() }))
      });
    }
    return snap;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Merge one known document into an already-cached query without a Firestore read. */
export function upsertCachedQueryDoc(key, id, data) {
  bumpKeyRevision(key);
  const cached = cachedValue(key);
  if (cached?.kind !== "query") return false;
  const docs = Array.isArray(cached.docs) ? [...cached.docs] : [];
  const index = docs.findIndex((row) => row.id === id);
  const row = { id, data };
  if (index >= 0) docs[index] = row; else docs.push(row);
  writeEntry(key, { kind: "query", docs });
  return true;
}

/** Invalidate one exact cache entry. */
export function invalidateCache(key) {
  bumpKeyRevision(key);
  removeStorageKey(key);
}

/**
 * Immediately replace one cached Firestore document after a successful write.
 * This avoids the common write -> invalidate -> read-again pattern.
 */
export function setCachedDoc(key, id, data, exists = true) {
  bumpKeyRevision(key);
  writeEntry(key, {
    kind: "doc",
    id: id || null,
    exists: !!exists,
    data: exists ? data : null
  });
}

/** Merge fields into a cached document without reading Firestore. */
export function mergeCachedDoc(key, id, patch) {
  const cached = cachedValue(key);
  const current = cached?.kind === "doc" && cached.exists ? (cached.data || {}) : {};
  setCachedDoc(key, id, { ...current, ...(patch || {}) }, true);
  return { ...current, ...(patch || {}) };
}

/** Replace a cached query snapshot after a known successful refresh. */
export function setCachedQuery(key, docs) {
  bumpKeyRevision(key);
  writeEntry(key, {
    kind: "query",
    docs: Array.isArray(docs) ? docs.map((d) => ({ id: d.id, data: d.data || d })) : []
  });
}

/** Invalidate every cached read belonging to a Firestore collection. */
export function invalidateCollection(collectionName) {
  const token = `col:${collectionName}:`;
  bumpCollectionRevision(collectionName);
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
  globalRevision += 1;
  keyRevisions.clear();
  collectionRevisions.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}
