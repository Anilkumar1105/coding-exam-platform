# Coding Exam Platform — concurrency optimization

Target: 500 registered students with approximately 200–300 concurrent active users.

## What was changed

1. Activated the existing short-lived `sessionStorage` Firestore cache for student dashboard reads.
2. Added 30-second caching for active exams, student submissions, schedules, learning progress, streak summary, and student points.
3. Added 5-minute caching for published leaderboards and active learning levels.
4. Invalidated the student submission cache after exam start/final submission.
5. Invalidated learning-progress caches after progress writes.
6. Invalidated student-points cache after points transactions.
7. Changed daily login tracking so an existing daily activity document is not rewritten on every refresh.
8. Added a per-tab daily-login marker to avoid repeating the login read on refreshes in the same tab.
9. Added compact `streakStats/{studentId}` documents and changed the student dashboard to read that summary instead of the complete streak history.
10. Added Firestore security rules for `streakStats/{studentId}`.

## Deployment order

1. Deploy `firestore.rules`.
2. Upload the JavaScript/HTML files from this build.
3. Test one student login, dashboard refresh, learning progress update, and exam submission.
4. Verify Firebase Firestore reads/writes.
5. Load-test progressively: 10 → 50 → 100 → 200 → 300 concurrent users.

## Cache and source-of-truth rule

The cache is only a short-lived optimization. Firestore remains authoritative. Exam questions, current submissions, timer state, and final results are not replaced by dashboard caching.

## Rollback

The original source files were preserved during development outside the release ZIP. If a problem appears after deployment, restore the previous build and keep the new rules disabled until the issue is diagnosed.
