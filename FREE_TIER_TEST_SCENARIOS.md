# Free-Tier Security and Resilience Test Scenarios

This is the acceptance test matrix for the production architecture: Firebase
Hosting and Firebase Authentication, with Google Apps Script and Google Sheets
as the authoritative exam engine. It intentionally does **not** use Firestore,
Realtime Database, Cloud Functions, or Cloud Scheduler.

## Preconditions

- Use `https://cec-exam.web.app`, not the GitHub Pages mirror.
- Prepare two student accounts assigned to the same pilot exam, plus two teacher
  accounts that own different exams.
- Keep the Teacher Portal open in a separate browser profile for observation.
- Never use production student records for destructive or grade-correction tests.

| Scenario | Desktop test action | Expected free-tier defense |
| --- | --- | --- |
| Cross-student attempt access | Start Student A's exam. Copy its opaque attempt token from browser developer tools, then try resume, save-delta, and submit while signed in as Student B. | Apps Script verifies Student B's Firebase ID token and compares its email to the stored attempt owner. All three actions fail; no answer or result is exposed or changed. |
| Concurrent starts | Double-click Start, then repeat with two tabs signed in as the same student. | Apps Script locking and idempotent start return one active attempt; there is no duplicate active ledger row or result. |
| Unpublished exam access | As a student, try a direct start/resume request for a closed or draft exam code. | The Apps Script exam-status and roster/eligibility checks reject it. Answer keys are never sent to the browser. |
| Teacher cross-exam mutation | Sign in as Teacher A and try editing, deleting, reopening, or correcting data belonging to Teacher B's exam. | Server-side teacher ownership checks reject the action unless the caller is an administrator. |
| Duplicate submit / retry | Submit once, then replay the same submit request or use the retry UI after a simulated delayed response. | Submission is idempotent: the existing result is returned or preserved and the results tab has one row for the attempt. |
| Post-deadline tampering | Let the server deadline pass, alter the browser clock, then attempt a save-delta and submit with changed answers. | Server time and the stored deadline reject post-deadline saves. Submission grades the last server snapshot only. |
| Offline / crash recovery | Answer several questions, disconnect the network or close the browser, then reopen it while signed into the same student account. | IndexedDB restores the local journal; authenticated resume restores the server checkpoint. Only answers successfully checkpointed before expiry are server-authoritative. |
| Emergency admissions pause | Turn on Emergency Stop in the teacher portal, then try a new student start while an existing student attempt remains open. | New starts are blocked. Existing attempts can resume, save, and submit. |
| Hosting headers and cache | In a terminal run `curl.exe -I https://cec-exam.web.app`. Repeat for `/teacher`. | Both return the expected security headers. The student root entry page returns `Cache-Control` containing `no-store`; JavaScript/CSS may use the shorter configured cache policy. |

## Explicit non-applicable Blaze scenarios

Do not execute the old-plan tests that refer to RTDB paths, Firestore document
paths, Cloud Functions, a Cloud Scheduler reaper, or a Firebase-to-Sheets
webhook. Those components do not exist in the approved free-tier system.

For an offline student who never reconnects, Apps Script cannot recover answers
that never left the device. On a later authenticated resume or submission, the
server uses the most recent durable checkpoint and its own deadline. This is an
intentional integrity boundary, not a defect.
