# Online Exam Proctor — Production Launch Record

**Status**: Ready for Production Cutover  
**Release Version**: Proctor v2.4 (Phase 4 Hardening)  
**Launch Date**: September 13, 2026  
**Architecture**: 100% Free-Tier (Firebase Spark + Google Apps Script / Google Sheets)

---

## 1. Hosting & Infrastructure Configuration

| Component | Target URL / Identifier | Role | Security Enforcement |
| :--- | :--- | :--- | :--- |
| **Primary Production Host** | `https://onlinecec-bec0e.web.app` | Authoritative Student & Teacher Portal | Enforces CSP, HSTS, X-Frame-Options, Cache-Control via `firebase.json` |
| **Alternative Auth Host** | `https://onlinecec-bec0e.firebaseapp.com` | Firebase Default Domain | Authorized OAuth callback and fallback domain |
| **Source Control & Mirror** | `https://github.com/itcec/exam.git` (`itcec.github.io/exam`) | Git Version Control / Mirror | Source code repository; non-production mirror |
| **Backend API Engine** | Google Apps Script `/exec` Endpoint | Authoritative Grading, Token Verification, Sheets Ledger | Private-key verification, token email-binding, origin check |
| **Durable Database** | Google Sheets (`Workbook`) | Permanent Grade Storage & Audit Trails | Hidden system sheets (`_ActiveAttempts`, `_AuditLog`, `Log`) |

---

## 2. Security Headers & Caching Policy

All responses served by Firebase Hosting enforce the following headers:

- **Content-Security-Policy (CSP)**:
  `default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://script.google.com https://script.googleusercontent.com; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';`
- **Strict-Transport-Security (HSTS)**: `max-age=31536000; includeSubDomains`
- **Anti-Framing / Anti-Clickjacking**: `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- **MIME Sniffing Prevention**: `X-Content-Type-Options: nosniff`
- **Referrer Privacy**: `Referrer-Policy: strict-origin-when-cross-origin`
- **Permissions-Policy**: `camera=(), microphone=(), geolocation=(), payment=()`
- **Cache-Control**:
  - `**/index.html` & `**/config.js`: `no-cache, no-store, must-revalidate` (instant configuration propagation).
  - Versioned static scripts & styles (`*.js`, `*.css`): `public, max-age=3600, must-revalidate`.

---

## 3. Server Safeguards & Origin Verification

1. **Client Origin Whitelist**:
   Apps Script verifies incoming `req.clientOrigin` against:
   `['https://onlinecec-bec0e.web.app', 'https://onlinecec-bec0e.firebaseapp.com', 'https://itcec.github.io', 'http://localhost:5000', 'http://127.0.0.1:5000']`.
   Calls from unapproved origins are rejected and logged to `_AuditLog`.
2. **Formula Injection Sanitization**:
   All text fields entering Google Sheets (`studentName`, `notes`, `course`, `section`, `mistakes`) are escaped with a leading single-quote if starting with `=`, `+`, `-`, `@`, `\t`, or `\r`.
3. **Identity Binding**:
   ID tokens issued by Google Firebase Authentication are checked for valid cryptographic signatures and verified against the registered student email on every write.

---

## 4. Operational Maintenance & Trigger Schedule

- **Automated Daily Cleanup Trigger**:
  - Registered Function: `dailyCleanupActiveAttempts_`
  - Cadence: Daily at 2:00 AM (server local time).
  - Scope: Purges completed attempts from `_ActiveAttempts` older than 48 hours and abandoned attempts older than 7 days.
  - Logging: Success and failure counters appended to `_AuditLog`.

---

## 5. Pilot Scoping & Staged Cutover

- **Pilot Exam Codes**: `['PILOT01', 'IT101']`
- **Engine Allocation**:
  - Pilot exam attempts utilize the debounced delta journal (`delta+ledger`).
  - Unlisted exam codes continue using the validated legacy snapshot engine (`legacy`) until pilot reconciliation is verified.
- **Rollback / Circuit Breakers**:
  - Global Emergency Stop Switch (`EMERGENCY_STOP_STARTS`) halts all new exam starts within seconds without affecting active exam sessions.
  - Pilot can be scaled or reverted by updating `pilotExamCodes` in `docs/config.js`.

---

## 6. Deployment Command

To deploy the production site to Firebase Hosting:
```bash
npx firebase-tools deploy --only hosting
```
*(Ensure an authorized Firebase CLI session is active via `npx firebase-tools login`)*
