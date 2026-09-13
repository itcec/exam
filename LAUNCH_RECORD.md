# Online Exam Proctor — Production Launch Record

**Status**: Production Live & Sustained (Phase 5 Verified)  
**Release Version**: `v2.5.0-phase5`  
**Launch Date**: September 13, 2026  
**Architecture**: 100% Free-Tier (Firebase Spark + Google Apps Script / Google Sheets)

---

## 1. Hosting & Infrastructure Configuration

| Component | Target URL / Identifier | Role | Security Enforcement |
| :--- | :--- | :--- | :--- |
| **Primary Production Host** | `https://onlinecec-bec0e.web.app` | Authoritative Student & Teacher Portal | Enforces CSP, HSTS, X-Frame-Options, Cache-Control via `firebase.json` |
| **Alternative Auth Host** | `https://onlinecec-bec0e.firebaseapp.com` | Firebase Default Domain | Authorized OAuth callback and fallback domain |
| **Source Control & Mirror** | `https://github.com/itcec/exam.git` (`itcec.github.io/exam`) | Git Version Control / Mirror | Source code repository; strictly non-production mirror |
| **Backend API Engine** | Google Apps Script `/exec` Endpoint | Authoritative Grading, Token Verification, Sheets Ledger | Private-key verification, token email-binding, origin check |
| **Durable Database** | Google Sheets (`Workbook`) | Permanent Grade Storage & Audit Trails | Hidden system sheets (`_ActiveAttempts`, `_AuditLog`, `Log`) |

---

## 2. Live Verified Production Headers (HTTP 200 OK)

A live curl check on `https://onlinecec-bec0e.web.app` confirmed active deployment of all security headers:

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://script.google.com https://script.googleusercontent.com; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';
Strict-Transport-Security: max-age=31556926; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 3. Server Safeguards & Origin Verification

1. **Client Origin Whitelist**:
   Apps Script verifies incoming `req.clientOrigin` against:
   `['https://onlinecec-bec0e.web.app', 'https://onlinecec-bec0e.firebaseapp.com', 'https://itcec.github.io', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:3000', 'http://localhost:8080']`.
   Calls from unapproved origins are rejected and logged to `_AuditLog` as `SECURITY_ORIGIN_REJECT`.
2. **Formula Injection Sanitization**:
   All text fields entering Google Sheets (`studentName`, `notes`, `course`, `section`, `mistakes`) are escaped with a leading single-quote if starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
3. **Identity Binding**:
   ID tokens issued by Google Firebase Authentication are checked for valid cryptographic signatures and verified against the registered student email on every write.

---

## 4. Operational Maintenance & Diagnostics

- **Continuous System Health Diagnostic (`getSystemHealthReport_`)**:
  - Automatically inspects tab integrity, daily trigger existence, failure counts in `_AuditLog`, and active attempt ledger rows.
  - Accessible on demand via **Teacher Portal ▸ 🩺 System Health** and **📝 Exam ▸ Setup ▸ Run system health check**.
- **Automated Daily Retention Cleanup Trigger**:
  - Registered Function: `dailyCleanupActiveAttempts_`
  - Cadence: Daily at 2:00 AM (server local time).
  - Scope: Purges completed attempts from `_ActiveAttempts` older than 48 hours and abandoned attempts older than 7 days.
  - Logging: Execution metrics appended to `_AuditLog`.
- **System Backup Snapshot (`backupSpreadsheetData_`)**:
  - Available via **📝 Exam ▸ Setup ▸ Export system snapshot backup** or Teacher Portal menu.
  - Exports structured JSON archives of exams, configs, results, roster, and audit log entries.
  - Rule: Test restorations strictly in a duplicate copy of the sheet, never in production.

---

## 5. Data Integrity, Reconciliation & Audited Corrections

- **Daily Reconciliation Engine (`reconcileExamData_`)**:
  - Cross-references eligible rostered students vs active attempt ledger vs submitted results.
  - Detects duplicate submissions (same student email + attempt number) and flags discrepancies.
- **Audited Grade Correction (`recordAuditedScoreCorrection_`)**:
  - Submitted grades are immutable by default.
  - Manual adjustments require teacher/admin authentication and mandatory written rationale.
  - Appends timestamped audit note to `Notes` column and records `GRADE_CORRECTION` to `_AuditLog`.

---

## 6. Pilot Scoping & Controlled Scale

- **Pilot Exam Codes**: `['PILOT01', 'IT101']`
- **Engine Allocation**:
  - Pilot exam attempts utilize the debounced delta journal (`delta+ledger`).
  - Unlisted exam codes continue using the validated legacy snapshot engine (`legacy`) until pilot reconciliation is verified.
- **Circuit Breaker / Emergency Stop**:
  - Global Emergency Stop Switch (`EMERGENCY_STOP_STARTS`) halts all new exam starts within seconds without affecting ongoing active sessions.

---

## 7. Release Discipline & Pre-Release Checklist

Before any future deployment:
1. **Automated Test Verification**: Run `node tests/all.js` (all 5 test suites must pass 100%).
2. **Deployed Header Verification**: Run `curl.exe -I https://onlinecec-bec0e.web.app` to ensure security headers are active.
3. **Teacher Portal Smoke Test**: Log in to the Teacher Portal, verify exam list, active sessions, and system health status.
4. **Rollback Plan**: In the event of an unexpected regression, toggle Emergency Pause or revert to the prior Git commit (`git revert <commit>`), rebuild, and redeploy to Firebase Hosting.
