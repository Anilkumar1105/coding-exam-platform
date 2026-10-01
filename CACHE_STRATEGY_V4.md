# Cache-First V4

## Policy
- Reads use sessionStorage indefinitely until the affected data is changed.
- Successful single-document writes update that document's cache immediately instead of invalidating it and forcing a follow-up read.
- Query/list caches are invalidated after writes because the exact affected result set may be unknown.

## Optimized
- Learning Points: transaction remains atomic; successful result is written directly to points cache.
- Streak: today's activity document cache is updated directly; aggregate activity query caches are invalidated.
- Learning Progress: per-student/level progress cache is updated directly after successful writes.
- Exams, toppers, schedules, questions and results: existing admin/student write paths invalidate affected query caches.

## Important
A browser cannot know that another computer changed Firestore without a network signal. Therefore admin-controlled query caches are broken on the next local write, or when explicitly refreshed. This avoids a permanent Firestore listener for every student.
