// js/firebase-config.js
// Central place to initialize Firebase. All other JS files import
// `auth`, `db`, and `secondaryAuth` from here.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TODO: Replace with your own Firebase project config
// (Firebase Console -> Project Settings -> General -> Your apps -> SDK setup)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Primary app: used for the currently logged-in user (admin or student)
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Secondary app instance: lets an admin create a Firebase Auth account
// for a new student WITHOUT signing the admin out of their own session
// (createUserWithEmailAndPassword normally signs the new user in on the
// app instance it's called on).
export const secondaryApp = initializeApp(firebaseConfig, "Secondary");
export const secondaryAuth = getAuth(secondaryApp);
