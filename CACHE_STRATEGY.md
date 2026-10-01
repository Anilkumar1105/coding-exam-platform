# Firestore Cache Strategy v3

## Policy

Student/admin read functions are now **cache-first with no TTL**:

1. First request in a browser tab -> read Firestore once.
2. Save the result in `sessionStorage`.
3. Later requests -> return the cached result without another Firestore read.
4. A successful write explicitly invalidates the affected cache collection/document.
5. Logging out or switching Firebase accounts clears the cache to prevent one student's data from appearing to another student.

## Why sessionStorage

The platform is used on shared lab computers. Persistent localStorage/IndexedDB could keep one student's data after the browser is reused. `sessionStorage` is scoped to the current tab/session.

## Updated areas

- users/profile reads
- exams and active exams
- exam schedules
- published exam questions
- student submissions
- coding submission history
- learning levels
- learning concepts
- learning MCQ questions
- learning coding questions
- learning progress
- learning-code submission history
- student points
- daily learning activity
- streak leaderboard
- weekly/topper leaderboards
- special-section questions and submission history
- admin lists used by the dashboard

## Cache invalidation

Writes to these collections clear their related cached reads in the current browser session:

`users`, `exams`, `examSchedules`, `questions`, `submissions`, `codeSubmissions`, `learningLevels`, `learningConcepts`, `learningMcqQuestions`, `learningCodingQuestions`, `learningProgress`, `learningCodeSubmissions`, `studentPoints`, `dailyLearningActivity`, `specialCodingQuestions`, `specialCodeSubmissions`, and published leaderboard documents.

## Important limitation

A cache in one student's browser cannot automatically know that an admin changed data from another computer without some network-based invalidation mechanism. Therefore, this version guarantees immediate invalidation for writes performed in the same browser/session. For cross-device instant invalidation, a small shared version/listener mechanism would be required and would itself create some Firebase traffic.
