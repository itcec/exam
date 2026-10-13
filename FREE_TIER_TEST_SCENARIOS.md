# Free-Tier Browser Acceptance Tests — ChatGPT Desktop

Use this checklist after deploying both Firebase Hosting and the Apps Script web
app. It is written for a ChatGPT Desktop browser test run against the approved
free-tier architecture: Firebase Hosting + Firebase Authentication + Google Apps
Script/Google Sheets. Firestore, Realtime Database, Cloud Functions, and Cloud
Scheduler are **not** part of this system.

## Safety and setup

- Test only at `https://cec-exam.web.app`; do not use the GitHub Pages mirror.
- Run destructive tests only with pilot exams and disposable test accounts. Do
  not change real student grades, rosters, or teacher access during a test.
- Before starting, deploy the current Hosting files **and** publish a new version
  of the existing Apps Script web-app deployment. A Hosting deploy does not
  publish `.gs` or Apps Script HTML changes.
- Have the administrator complete any Google sign-in or two-factor prompts. Do
  not provide passwords, ID tokens, or student personal data to ChatGPT.
- Create this test data in advance:
  - `Admin`: a configured administrator.
  - `Teacher A` and `Teacher B`: non-admin accounts; each owns a different pilot exam.
  - `Student A` and `Student B`: eligible for Teacher A's pilot exam.
  - One pilot exam with at least two EDP codes and at least one student who has
    two submitted attempts with different scores.
- Use separate browser profiles (or normal + Incognito) for accounts that must
  be signed in at the same time. Record the outcome and a screenshot for every
  failed check.

## ChatGPT Desktop test run

| # | Scenario | Browser action | Expected result / evidence |
| --- | --- | --- | --- |
| 1 | Deployment preflight | Open the student portal, `/teacher`, and `/privacy`. Sign in as the Admin. | All three pages load at `cec-exam.web.app`; Google sign-in succeeds; the Teacher Portal identifies the user as Admin. |
| 2 | Teacher isolation | Sign in as Teacher A. Inspect the exam picker/cards, then attempt to open or manage Teacher B's known pilot exam through normal portal navigation. Repeat as Teacher B. | Each non-admin sees and manages only their own exam. The Admin can see both. Capture the picker/card state. |
| 3 | Admin-only operations | While signed in as Teacher A, verify that Manage Access, emergency admissions, system backup, audit log, telemetry export, and system health are not offered. Then sign in as Admin and verify those controls are available. | Non-admin UI does not expose global operations. Admin controls load successfully. UI hiding is not the security control; the Apps Script endpoint checks are covered by automated tests. |
| 4 | Active-attempt ownership | Start an attempt on Teacher A's pilot exam as Student A. As Teacher A, open that exam detail and verify the active session appears without live answers. As Teacher B, verify Teacher A's exam and active attempt cannot be reached through normal portal navigation. | The owning teacher can see recovery metadata only (student, state, deadline, checkpoint), never answer snapshots or keys. Teacher B has no access. |
| 5 | Results — All | As Teacher A, open Results, select the prepared pilot exam, choose **All**. | Every submitted attempt is shown. The test student with two attempts appears twice. |
| 6 | Results — Highest | With the same exam selected, choose **Highest**. | Exactly one row appears per student, using the highest submitted score. The CSV export and copy control match the visible rows. |
| 7 | Results — Average | Choose **Average**. | Exactly one row appears per student. Scores display with two decimal places (for example `7.33 / 10`); grade-correction controls are absent for aggregate rows. CSV and copied TSV match the visible average rows. |
| 8 | Results — EDP intersection | Select one EDP code while in Highest, then again in Average. | The table, CSV, and copied data contain only that EDP's students and still honor the selected score mode. Change back to All EDP codes and confirm all rows return. |
| 9 | Timer — portal builder | In the Teacher Portal builder, select **per-section** for a new draft. | Untouched section timers become `5 min 0 sec`. Change one to `1 min 0 sec`, switch to whole-exam, then back to per-section. The edited `1:00` remains unchanged. |
| 10 | Timer — Apps Script sidebar | In the Google Sheet's Add Questions sidebar, repeat the prior timer test. | The sidebar uses the same behavior and no longer displays the old “cinematic transition” wording for per-section mode. |
| 11 | Multi-admin access | Use only disposable teacher accounts. As Admin, promote a second teacher to Admin, save, close/reopen the dialog, then revoke the second Admin. | Both Admins are visibly marked while promoted. The role persists after reopening. The UI blocks removal/revocation of the last remaining Admin. |
| 12 | Empty-role protection | In the access dialog, try clearing all accounts, then Save. | Save is rejected with “At least one teacher account is required.” Restore the original test accounts before continuing. |
| 13 | Student identity boundary | With Student A's active attempt open, sign out and sign in as Student B. Student B must not be able to resume Student A's attempt. | Student B sees only their own state; no prior answers, timer, or result are exposed or changed. |
| 14 | Concurrent start | As Student A, double-click Start and repeat from a second tab. | Only one active attempt exists. The Teacher Portal shows one active session and no duplicate result is created. |
| 15 | Closed/draft exam | Change a disposable exam to Draft or Closed, then attempt a student start. | The student cannot start it. No question bank or answer key is revealed. Restore the intended exam status. |
| 16 | Duplicate submit | Submit a disposable attempt, then refresh/retry from the finished screen. | The result is preserved once; Results contains one row for that attempt. |
| 17 | Deadline integrity | Use a short disposable exam. After the server deadline passes, change the device clock and try changing an answer/submitting. | The server accepts only the last checkpoint made before its deadline. The browser clock does not extend the exam. |
| 18 | Crash/offline recovery | Answer several questions, wait for a checkpoint indicator, disconnect or close the browser, then reopen while signed in as the same student. | Local IndexedDB recovery and authenticated resume restore the most recent saved state. Answers never checkpointed before expiry are not treated as server answers. |
| 19 | Emergency admissions pause | As Admin, enable Emergency Stop. Try starting a new student attempt and resuming an already-active one. | New starts are blocked. Existing attempts can resume, save, and submit. Turn Emergency Stop off at the end. |

## Optional technical checks

Run these only when the tester has explicit permission to use browser developer
tools or a terminal. Do not put tokens or private student records into tickets,
screenshots, or prompts.

| Scenario | Action | Expected result |
| --- | --- | --- |
| Direct endpoint role check | Replay a permitted teacher request with a different non-admin teacher's Firebase session, targeting a known foreign exam code. | Apps Script returns a permission failure; it never returns foreign results, active attempts, telemetry, or mutable data. |
| Hosting headers | Run `curl.exe -I https://cec-exam.web.app` and repeat for `/teacher`. | HTML responses include CSP, HSTS, `X-Content-Type-Options: nosniff`, clickjacking protection, and a no-store cache policy. |
| Asset MIME type | Request `/teacher.css` and `/teacher.js`. | Both return HTTP 200 with CSS/JavaScript MIME types, not an HTML fallback. |

## Pass criteria and cleanup

The run passes when every applicable row has the expected outcome, no browser
console error blocks sign-in or portal use, and `node tests/all.js` remains green
(currently **536 assertions**). Revert every pilot exam status, emergency-stop
setting, temporary role, test result, and test roster record after the run.

## Explicitly non-applicable legacy tests

Do not run scenarios that require RTDB paths, Firestore document paths, Cloud
Functions, Cloud Scheduler, or a Firebase-to-Sheets webhook. Those services are
not enabled in the approved free-tier architecture.
