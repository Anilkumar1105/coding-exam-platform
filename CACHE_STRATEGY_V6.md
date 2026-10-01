# Firestore Cache Strategy V6

## Goal

Provide fast student dashboards with minimal Firestore reads while still allowing admin changes to reach already-open student sessions without logout/login.

## Architecture

- `sessionStorage` is the student cache. It is intentionally session-scoped so a shared lab computer does not retain another student's cache after the session ends.
- Cached reads use `getDocCached()` / `getDocsCached()`.
- `inFlight` deduplicates concurrent requests for the same cache key.
- Successful student-owned writes update the relevant cache directly instead of doing write -> invalidate -> read.
- Admin-controlled writes call `bumpRemoteCacheVersion()` for the affected collection.
- Students listen only to the tiny `cacheVersions/global` document.
- The cache watcher is idempotent: multiple modules can call it, but one browser page creates only one Firestore `onSnapshot` listener.
- Remote changes invalidate only the affected collection.
- `firestore-cache-invalidated` is dispatched for UI modules that need an immediate refresh.
- Revision guards prevent an older in-flight Firestore request from repopulating a cache after invalidation/update.

## Freshness flow

```text
Admin writes exam/schedule/leaderboard
        |
        +--> Firestore data changes
        |
        +--> cacheVersions/global changes
                         |
                         v
                one student listener
                         |
                         v
              invalidate affected cache
                         |
                         +--> UI event
                         |
                         v
              next read goes to Firestore
                         |
                         v
                  fresh data cached
```

## Read flow

```text
Request -> sessionStorage hit -> return immediately
                    |
                    +-- miss -> Firestore read -> cache result
```

## Race protection

If a read is already in progress when an invalidation happens, the read may still complete, but its result is not written back into the invalidated cache. This prevents stale data from returning after a realtime update.

## Realtime listener cost

Before V6, the student dashboard could create two listeners to `cacheVersions/global` (one from auth and one from the schedule helper). V6 keeps one underlying listener per page even when multiple modules request cache watching.

For 300 simultaneously open student pages:

- Before: potentially 600 `cacheVersions/global` listeners from the duplicate path.
- V6: 300 listeners, one per browser page/session.

The application still does not subscribe each student to full Firestore collections for realtime updates.

## Schedule update behavior

1. Admin creates/updates/deletes a schedule.
2. Admin invalidates local schedule caches.
3. Admin updates `cacheVersions/global.examSchedules`.
4. Student listener receives the version change.
5. Student schedule caches are invalidated.
6. `firestore-cache-invalidated` is emitted for `examSchedules`.
7. Dashboard re-reads schedules and re-renders without logout/login.

## Additional cleanup

- Removed the older separate `cacheVersions/examSchedules` write path; one global version document is now the single source of remote invalidation truth.
- Standardized admin cache keys so collection invalidation also works for admin-side cached queries.
- Removed a duplicate `return` in the schedule batch function.

## Validation

- All local JavaScript files pass `node --check` syntax validation.
- No direct `getDoc()` / `getDocs()` reads remain outside the cache layer in the application JavaScript.
- No `onSnapshot()` calls remain outside the cache layer.
- Local named-import/export validation passes.
