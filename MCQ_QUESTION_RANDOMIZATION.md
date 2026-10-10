# MCQ Question and Option Randomization

- MCQ-only exams use a repeatable student-specific question order.
- Each MCQ's options are also shuffled deterministically per student, exam, and question.
- Refreshing or resuming with the same student and exam keeps both question and option order stable.
- Display labels A/B/C/D reflect the shuffled display positions.
- Answers are saved as the original option indexes, preserving compatibility with Firestore `correctOptionIndex`.
- The original question documents and option arrays are not modified.
- Mixed MCQ/coding exams keep their configured question order and option order.
- Test two student accounts, refresh/resume, and verify scores before a live exam.
