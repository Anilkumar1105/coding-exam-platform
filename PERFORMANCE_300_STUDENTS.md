# 300-student concurrency optimization

This update keeps the existing Firebase architecture and exam flow, while reducing avoidable Firestore traffic on the student dashboard.

## Changes in this build

- Student dashboard active exams use the existing `firestore-cache.js` 30-second `sessionStorage` cache.
- Student submission history uses a per-student 30-second cache.
- Historical exam lookups and exam schedules use short-lived caches.
- Published leaderboards use a 5-minute cache because they are read-only dashboard content.
- Learning levels use a 5-minute cache.
- Student learning progress uses a 30-second per-student cache.
- Student points use a 30-second per-student cache and invalidate immediately after a points transaction.
- Exam start/final submission invalidate the student's dashboard submission cache.
- Daily login no longer writes on every dashboard refresh. If today's activity document already exists, it is reused.
- A per-tab daily-login session marker also avoids repeating the daily-login read on repeated refreshes in the same tab.
- Streak dashboard rendering now reads a compact `streakStats/{studentId}` document instead of downloading the student's complete `dailyLearningActivity` history on every dashboard load.
- Existing `dailyLearningActivity` documents are preserved as the audit/history source.
- Existing students are lazily migrated to `streakStats` when their streak is first read or updated after this build.
- Added Firestore rules for `streakStats/{studentId}`.
- Exam timer, local draft, answer debounce/autosave, and coding-submission optimizations from `PERFORMANCE_200_STUDENTS.md` remain unchanged.

## Cache policy

| Data | Cache TTL |
|---|---:|
| Active exams | 30 seconds |
| Student submissions | 30 seconds |
| Exam schedules | 30 seconds |
| Learning progress | 30 seconds |
| Streak summary | 30 seconds |
| Student points | 30 seconds |
| Weekly/public leaderboards | 5 minutes |
| Active learning levels | 5 minutes |

## Important behavior

The browser cache is per tab/student; it is not a shared server cache. Firebase remains the source of truth.

Fresh exam submission data is not trusted from the dashboard cache after an exam starts or finishes because the submission cache is explicitly invalidated on those writes.

This is an optimization, not a quota guarantee. Firestore usage still depends on the number of documents returned by queries, answer autosaves, coding attempts, violations, refreshes, and other activity.

## Recommended rollout

1. Deploy the updated Firestore rules first.
2. Test with 5–10 students.
3. Test with 50 students.
4. Watch Firebase Firestore reads/writes and errors.
5. Increase to 100, then 200, then 300 concurrent users.
6. Only use the full 300-student live exam after the smaller load tests remain stable.
