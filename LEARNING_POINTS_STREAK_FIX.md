# Learning Points & Streak Fix

## Root causes found
1. Learning Points and streak were saved sequentially. If the Points transaction failed, the streak write was never attempted.
2. Streak qualification depended on the separate login write having succeeded. A missing login record could leave `qualified: true` but with no `loginAt`, so streak calculation ignored the day.
3. Firestore/network failures were mostly swallowed, making the student see a normal submission even when the reward write failed.

## Changes
- `points.js`: retry the Learning Points transaction up to 3 times for transient failures.
- `streak.js`: use a transaction and create `loginAt` automatically when a solved problem is recorded.
- `learning-page.js`: save Points and streak independently with `Promise.allSettled()`.
- The UI now reports when either reward write fails instead of silently hiding it.
- Existing idempotency remains: the same coding question can only award the 2 Learning Points once.

## Expected behavior
After all test cases pass:
- +2 Learning Points are saved in `studentPoints/{studentId}`.
- The current IST day is marked as a qualified learning-streak day.
- Re-submitting the same solved question does not add another 2 points.
- If one write temporarily fails, the other still completes and the student receives a visible message.
