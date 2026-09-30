# Manual Marks Update — Admin Results

Added to the Admin Login > Results screen:

- Pencil button for every student result.
- Admin can edit marks obtained and total marks.
- Percentage is calculated automatically.
- PASS/FAIL is calculated using the existing 40% pass rule.
- Existing submissions are updated in Firestore.
- ABSENT/in-progress rows can receive marks manually; a submission is created when needed.
- Manual changes store `manualMarksOverride`, timestamp, admin UID, and optional note.
- Student result pages read the same submission document, so the updated result is reflected there.
- Exam answers and original submission data are preserved; only result/mark fields are changed.

Files changed:
- `admin-dashboard.html`
- `admin-dashboard.js`
- `admin.js`
- `dashboard.js`
