# Code Visualizations: Bulk Delete

The admin Learning tab now includes checkboxes for each imported Code Visualization program, a Select all programs checkbox, and a Delete Selected button.

- Select one or more programs, then choose **Delete Selected**.
- Select all programs to remove all custom visualization documents from the `codeVisualizations` collection.
- A confirmation prompt lists the deletion count and warns that the operation cannot be undone.
- This bulk action only deletes documents in `codeVisualizations`. It does not delete MCQs, coding exam questions, exam results, learning progress, points, or streaks.
- Firestore admin delete permissions must already allow deletion from `codeVisualizations`.

Deploy the updated `admin-dashboard.html` and `code-visualizations-admin.js` files together.
