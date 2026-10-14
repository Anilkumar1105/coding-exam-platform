# Visualization Excel Import — Duplicate Handling

The admin visualization importer checks the existing `codeVisualizations` collection and rows in the selected workbook before writing.

- Duplicate matching uses case-insensitive `title + topic`.
- Existing matching programs are skipped and never overwritten.
- Duplicate rows within the workbook are skipped.
- New rows are imported individually; one failed write will not stop the remaining rows.
- The status message reports imported, skipped, and failed counts.

Deploy `code-visualizations-admin.js` with the existing project. Existing documents are not deleted or modified.
