# Exam performance notes — 200 concurrent students

This version keeps the existing Firebase architecture and student login flow, but reduces avoidable Firestore traffic during a simultaneous exam.

## Changes

- Exam start no longer performs a second `getSubmission()` after `startSubmission()` succeeds.
- Exam answers are autosaved after 5 seconds of inactivity instead of 1.2 seconds.
- A local `sessionStorage` draft protects answers during refresh/backgrounding without creating Firestore reads.
- When the tab is backgrounded, the latest answer state is flushed immediately.
- Final submission flushes pending answers before grading.
- Coding submission history is cached per question for the current exam page.
- Best coding marks are tracked in memory during the exam, avoiding a full `codeSubmissions` query on final submit for normal new attempts.
- Timer remains browser-side and does not call Firestore every second. Its source of truth is the absolute exam end timestamp.
- Timer UI polling is 500ms instead of 250ms to reduce unnecessary browser CPU usage; this does not affect Firestore reads.

## Expected effect for 200 simultaneous students

The main reduction is in repeated writes/queries caused by typing, question navigation, and final grading. The exact Firestore usage still depends on the number of questions, coding submissions, refreshes, and dashboard activity.

This is an optimization, not a quota guarantee. Test with a small group first and watch Firebase Usage before the full 200-student exam.
