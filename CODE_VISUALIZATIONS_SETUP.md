# Code Visualizations Lab — implementation notes

## What's included
- New **Code Visualizations Lab** item in the existing Learning navigation.
- Interactive built-in demos: Bubble Sort, Binary Search, Two Pointers, Linear Search, Stack (LIFO), and Recursion/Factorial.
- Step controls: Play/Pause, Previous, Next, Reset, and speed selector.
- Search and topic filters; responsive layout for mobile screens.
- Custom programs loaded from the `codeVisualizations` Firestore collection. Only documents with `published: true` appear to students.
- Dedicated admin-only Excel import, template download, media-reference editing, publish/unpublish, and delete controls in the Admin Dashboard → Learning pane. The importer uses the existing XLSX library and does not touch the MCQ/coding-question import collections.
- Optional `mediaUrl` on Firestore documents can display a hosted GIF/image or embedded YouTube/Vimeo video in the page. No link button is shown. For YouTube watch URLs, the UI converts them to the privacy-enhanced embed URL. The media host must permit embedding; a provider that blocks iframe embedding cannot be forced to embed.

## Excel template columns
Required: `title`.

Supported columns: `title`, `topic`, `difficulty`, `description`, `code`, `type`, `published`.

`type` selects the built-in animation layout where supported: `bubble-sort`, `binary-search`, `two-pointers`, `linear-search`, `stack`, or `recursion`. For a custom title, use one of these types to reuse an animation layout. `published` accepts TRUE/FALSE, yes/no, or 1/0. Imported rows are saved as new documents in `codeVisualizations`.

## Firebase setup
1. Deploy the updated `firestore.rules` to Firebase Console → Firestore Database → Rules (or deploy rules through Firebase CLI).
2. Ensure the existing `users/{uid}` profile has `role: "admin"` for admin accounts. The new rules use the project's existing `isAdmin()` helper.
3. Deploy the website files as usual. No new npm dependency is required; the admin page already loads SheetJS/XLSX.
4. Sign in as admin → Learning → Code Visualizations Lab → Download Excel Template → fill rows → Import Programs. Use Media to attach a direct GIF/image URL or embeddable YouTube/Vimeo URL, and Publish/Unpublish to control student visibility.
5. Sign in as a student → Learning → open any level → Code Visualizations Lab.

## Media notes
For custom Firestore documents, an optional `mediaUrl` field may point to a directly hosted `.gif`, `.webp`, `.png`, or `.jpg` file, or an embeddable YouTube/Vimeo URL. The file/video is shown inside the Learning page; the UI does not redirect students. Only use media you have permission to embed. Google search result pages themselves are not embeddable media sources.

## Safety and compatibility
- Existing exams, timers, grading, learning progress, points, streaks, MCQs, and coding question collections are unchanged.
- Built-in demos remain usable if Firestore reads fail; a console warning is logged.
- The Excel importer is intentionally separate from existing question imports. It caps a single import at 300 rows and asks for confirmation before writing.
