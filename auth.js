import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logoutUser() {
  return signOut(auth);
}

export async function getUserProfile(uid) {
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    console.log("Checking user profile:", uid);
    console.log("Profile exists:", snap.exists());

    if (!snap.exists()) {
      return null;
    }

    return {
      id: snap.id,
      ...snap.data()
    };

  } catch (error) {
    console.error("getUserProfile ERROR:", error);
    throw error;
  }
}

export function requireRole(expectedRole, onReady) {

  onAuthStateChanged(auth, async (user) => {

    try {

      if (!user) {
        window.location.href = "login.html";
        return;
      }

      console.log("Authenticated UID:", user.uid);
      console.log("Authenticated email:", user.email);

      const profile = await getUserProfile(user.uid);

      if (!profile) {

        alert(
          "Your Firebase account exists, but your student/admin profile is missing."
        );

        await logoutUser();
        window.location.href = "login.html";
        return;
      }

      console.log("User profile:", profile);

      if (profile.role !== expectedRole) {

        window.location.href =
          profile.role === "admin"
            ? "admin-dashboard.html"
            : "student-dashboard.html";

        return;
      }

      onReady(user, profile);

    } catch (error) {

      console.error("AUTH GUARD ERROR:", error);

      alert(
        "Unable to load your profile. Check Firebase Firestore permissions."
      );

      await logoutUser();
      window.location.href = "login.html";
    }

  });
}

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

export function wireLogoutButtons() {

  document
    .querySelectorAll('[data-logout="true"]')
    .forEach((btn) => {

      btn.addEventListener("click", async () => {

        await logoutUser();

        window.location.href = "login.html";

      });

    });
}
