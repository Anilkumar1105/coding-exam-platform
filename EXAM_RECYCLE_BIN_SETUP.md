# Exam Recycle Bin setup

## Included behavior
- Deleting an exam marks it as deleted, sets it inactive, and records who/when deleted it.
- Deleted exams disappear from active admin exam lists, admin analytics/results/averages, and student exam history/averages.
- The Admin > Exams > Bin view supports Restore and Delete forever.
- Restore returns the exam to its previous active/inactive state and keeps the original question, schedule, result, and coding-submission documents.
- Permanent deletion removes the exam plus top-level documents in `questions`, `examSchedules`, `submissions`, and `codeSubmissions` that reference its `examId`.
- `functions/index.js` provides a daily scheduled purge for exams older than 30 days in the Bin.

## Enable automatic 30-day cleanup

Automatic deletion requires deploying the Firebase Cloud Function; editing the website alone cannot run a reliable scheduled background job. Scheduled Cloud Functions require the Firebase project to use the Blaze billing plan and have billing enabled.

From this project directory, install the Firebase CLI if needed, sign in, select the correct Firebase project, then run:

```bash
firebase use YOUR_FIREBASE_PROJECT_ID
cd functions
npm install
cd ..
firebase deploy --only functions:purgeExpiredExamBin
```

Review the selected Firebase project and billing costs before deployment. Until the function is deployed, admins can manually use **Delete forever** in the Bin, but automatic 30-day purge will not run.

## Notes
- Existing Firestore security rules already permit admins to update and delete exam-related documents. No student permissions were broadened.
- The purge job uses bounded batches and retries failed exams on the next daily run.
