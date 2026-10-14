# Code Visualizations: duplicate state and admin export fix

## Changes
- Prevented the variable-state grid from rendering twice in generic visualization steps.
- Added an admin **Download Programs** button in Learning → Code Visualizations Lab.
- The export downloads all documents in the `codeVisualizations` Firestore collection to `code-visualization-programs-export.xlsx`, including `exampleInput`, `expectedOutput`, `visualizationSteps`, media URL, and publish state.
- Included the latest Excel template with `exampleInput` and `expectedOutput`.

## Deploy
Upload the updated `code-visualizations.js`, `code-visualizations-admin.js`, and `admin-dashboard.html` along with the included template to the existing repository. Commit and push, then hard-refresh the admin and student pages.

The export uses the current admin's existing Firestore access. It does not modify or delete Firebase data. JavaScript syntax was checked; live Firebase/browser behavior still needs verification on the deployed site.
