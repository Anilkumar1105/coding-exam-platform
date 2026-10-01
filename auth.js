// js/auth.js
// Shared authentication + role-guard helpers.

import { auth, db } from "./firebase-config.js";
import { getDocCached, clearFirestoreCache, watchRemoteCacheChanges } from "./firestore-cache.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Log in with email/password. Returns the Firebase user credential. */
export function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Log the current user out. */
export async function logoutUser() {
  clearFirestoreCache();
  return signOut(auth);
}

/** Fetch the Firestore profile (users/{uid}) for a given uid. */
export async function getUserProfile(uid) {
  const snap = await getDocCached(doc(db, "users", uid), `user:${uid}:col:users:doc:${uid}`);
  return snap.exists() ? snap.data() : null;
}

/**
 * Guards a page so only signed-in users with the expected role can view it.
 * - Not signed in -> redirect to login.html
 * - Signed in but no Firestore profile -> sign out, redirect to login.html
 * - Signed in with the WRONG role -> redirect to their correct dashboard
 * - Signed in with the RIGHT role -> calls onReady(user, profile)
 */
let lastAuthUid = null;
let stopRemoteCacheWatch = null;

export function requireRole(expectedRole, onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (user && lastAuthUid && lastAuthUid !== user.uid) clearFirestoreCache();
    lastAuthUid = user?.uid || null;
    if (!user) {
      if (stopRemoteCacheWatch) { stopRemoteCacheWatch(); stopRemoteCacheWatch = null; }
      window.location.href = "login.html";
      return;
    }
    if (lastAuthUid && lastAuthUid !== user.uid && stopRemoteCacheWatch) {
      stopRemoteCacheWatch();
      stopRemoteCacheWatch = null;
    }

    const profile = await getUserProfile(user.uid);

    if (!profile) {
      alert("No profile was found for this account. Please contact your admin.");
      await logoutUser();
      window.location.href = "login.html";
      return;
    }

    if (profile.role !== expectedRole) {
      window.location.href =
        profile.role === "admin" ? "admin-dashboard.html" : "student-dashboard.html";
      return;
    }

    if (profile.role === "student" && !stopRemoteCacheWatch) stopRemoteCacheWatch = watchRemoteCacheChanges(db);
    onReady(user, profile);
  });
}

/** Small helper to show a Bootstrap alert element by id. */
export function showError(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove("d-none");
}

export function hideError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.add("d-none");
}

/** Wire up any element with data-logout="true" to sign the user out. */
export function wireLogoutButtons() {
  document.querySelectorAll('[data-logout="true"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      await logoutUser();
      window.location.href = "login.html";
    });
  });
}
