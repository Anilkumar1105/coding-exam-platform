# Cache-First V5 — Immediate Cross-Client Invalidation

## Goal
Students should normally read from session cache. When an admin changes shared data, already-open student pages should detect the change immediately without logout/login or manual refresh.

## Architecture
- Student browser keeps Firestore results in `sessionStorage` until explicitly changed.
- Student auth starts **one** Firestore listener on `cacheVersions/global`.
- Admin writes update the changed collection's version field in that single document.
- Every open student tab receives the version change and invalidates only that collection's cached queries/documents.
- The next request reads the new data once and caches it again.
- Student-owned writes update their own cache directly instead of invalidating and re-reading.

## Shared/admin-controlled data
Exams, schedules, exam questions, users, learning levels/concepts/MCQ/coding questions, special coding questions, toppers, streak leaderboard, Best Learner, and admin-edited results publish a remote version marker.

## Student-owned data
Learning points, streak activity, learning progress, exam submission state, and coding submission history update local cached documents/query snapshots after successful writes.

## Important behavior
- GET does not invalidate cache.
- Successful WRITE updates the affected cache when the writer knows the new document, or publishes a remote version for shared/admin data.
- A student's exam submission updates the cached submission immediately, so Start Exam/Submitted state can change without a second Firestore read.
- No collection-wide realtime listeners are used.
- One small version listener is used per signed-in student session.

## Firestore rules
`cacheVersions/{versionId}` must be readable by signed-in users and writable by admins. The existing rules already allow this.
