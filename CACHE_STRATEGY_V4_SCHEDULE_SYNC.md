# Exam Schedule Cache Synchronization

## Problem fixed
Student browsers previously cached `examSchedules` indefinitely. Admin changes invalidated only the admin browser's cache, so refreshing a student page could still show the old schedule. Logout/login cleared the session cache, which is why the new schedule appeared only after login again.

## New behavior
- Students cache schedules normally.
- Each student tab listens to one tiny `cacheVersions/examSchedules` document.
- Admin create/update/delete of a schedule updates that version document.
- All open student tabs immediately invalidate only their `examSchedules` cache.
- On the next dashboard render, the new schedule is read once and cached again.
- A page refresh also receives the latest version and invalidates stale cached schedules without requiring logout/login.

This avoids listening to the whole `examSchedules` collection.
