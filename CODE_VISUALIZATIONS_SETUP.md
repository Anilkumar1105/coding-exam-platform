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


## Student dashboard entry point
The student dashboard now includes a **Code Visualizations Lab** card directly below the Learning Section cards. It opens `code-visualizations.html`, which is student-role protected and loads published records from the `codeVisualizations` Firestore collection. Built-in demos remain available even if no custom programs have been published. If custom imported programs do not appear, verify that deployed Firestore rules allow signed-in students to read documents in `codeVisualizations` when `published == true`.

## Automatic and custom visualization steps (updated)

The student visualizer now infers common program patterns from the program title, topic, and code. Supported automatic examples include factorial, prime checks, palindrome/reverse number, printing 1..N, sum of natural numbers, quotient/remainder, word count, GCD, subtraction, voting eligibility, character counts, searching, sorting, stack, and recursion. When a program is not recognized, it displays a generic code/loop trace rather than incorrectly showing Bubble Sort bars.

The Excel template supports these columns:
- `title`, `topic`, `difficulty`, `description`, `code`
- `type`: use `auto` for automatic inference, or a supported type such as `factorial`, `prime`, `palindrome`, `reverse-number`, `print-range`, `sum-range`, `quotient`, `word-count`, `gcd`, `subtract`, `voting`, `char-count`, `bubble-sort`, `binary-search`, `two-pointers`, `linear-search`, `stack`, or `recursion`.
- `exampleInput`: optional sample input for programs such as word count.
- `visualizationSteps`: optional JSON array to override the automatically generated trace. Each item may contain `note`, `variables`, `output`, and `visualization`. Example: `[ {"note":"Initialize total = 0","variables":{"total":0}}, {"note":"Final result","variables":{"total":10},"output":"10","visualization":{"kind":"result","value":10}} ]`
- `mediaUrl`, `published`

Admins can also click **Customize** next to an imported program to select a visualization type and enter custom steps. Custom steps override automatic steps. Leave custom steps blank to return to automatic generation. This is a lightweight educational trace generator, not a secure Python execution engine; it does not execute arbitrary imported Python code.

After updating files, push `code-visualizations.js`, `code-visualizations-admin.js`, `code-visualizations.css`, and this setup guide to GitHub Pages. Existing Firestore documents and other collections are not migrated or deleted. Hard refresh the browser after deployment.
