# Online Exam Proctor — Operational Runbook & Governance

This runbook defines the operational procedures, governance rules, and emergency protocols for instructors and administrators managing exams under the 100% Free-Tier (Firebase Spark + Google Apps Script / Google Sheets) architecture.

---

## 1. Emergency Admissions Pause (Circuit Breaker)

### When to Activate
- Widespread school Wi-Fi or regional internet outage during scheduled exam windows.
- Critical error detected in the question bank while an exam is live.
- Administrative directive to halt exam starts immediately.

### Operational Effect
- **New Exam Starts Blocked**: Students cannot begin new exam attempts. The student portal presents a clear notice:
  > *"Exam admissions are temporarily paused by administration. If you already have an exam in progress, you may continue."*
- **Ongoing Attempts Preserved**: Students currently taking the exam are **not** interrupted. Their autosaves, timers, and submissions continue without disruption.

### How to Toggle
1. **Via Teacher Portal (Admin)**:
   - Click the menu button (top-right) ▸ click **🚨 Pause Exam Admissions**.
   - A real-time red banner will display across both the student portal and teacher portal.
   - To resume, open the menu and click **✅ Resume New Exam Admissions**.
2. **Via Google Sheets (Any Authorized Editor)**:
   - In the spreadsheet menu, click **📝 Exam ▸ Setup ▸ Toggle emergency admission pause**.
   - Confirm the dialog. The change takes effect instantaneously via Script Properties.

---

## 2. Protocol for Reopening Interrupted Attempts

### Authorized Roles
- **Course Instructor**: Authorized to reopen attempts for their own assigned exams.
- **System Administrator**: Authorized to reopen attempts across all exams.

### Eligible Criteria
Reopenings are permitted **strictly** for technical interruptions, including:
- Documented hardware failure (e.g. computer reboot, battery exhaustion).
- Sudden power loss in the examination hall or residential vicinity.
- Operating system freeze or verified browser crash.

*Reopening is **strictly prohibited** for regular time expiration resulting from academic hesitation or lack of preparation.*

### Operating Limits
- **Maximum Time Extension**: **60 minutes** maximum per reopen action (recommended: **5 to 15 minutes** to compensate for actual time lost).
- **Mandatory Rationale**: Instructors must supply a concise justification (e.g., *"Lab PC 14 rebooted during power flicker"*).

### Reopening Procedure
1. Open the **Teacher Portal** ▸ navigate to **Exams** ▸ select the active exam.
2. In the **Active & Interrupted Sessions** panel, locate the student's entry.
3. Click **🔄 Reopen (+Time)**.
4. Enter additional minutes (e.g., `10`) and provide the operational reason.
5. Click **Reopen Attempt**.
6. The student's deadline is extended on the server, their active state is unlocked, and the student may reload and click **"Continue where I left off"**.
7. An audit record is permanently appended to the **`_AuditLog`** tab.

---

## 3. Roster Reconciliation Workflow

Before setting an exam to **Closed — no longer accepting**:
1. Open the exam in the **Teacher Portal**.
2. Review the **Roster Reconciliation** card:
   - **Eligible Students**: Total rostered students matching Year, Course, and Section.
   - **Submitted**: Number of completed attempts recorded.
   - **In Progress**: Active or interrupted attempts in the ledger.
   - **Unstarted**: Absent or uninitiated candidates.
3. If students are shown **In Progress**, consult the **Active & Interrupted Sessions** table to determine whether their sessions are expired, active, or require reopening.
4. Once all active sessions are settled, toggle the exam to **Offline / Closed**.

---

## 4. Data Privacy, Telemetry & Dispute Resolution (RA 10173 / NPC Advisory No. 2020-1)

### Non-Adjudicative Operational Telemetry
- Focus-loss events (tab blur) and away durations are logged as **operational telemetry**.
- **Governance Rule**: Telemetry assists instructors in identifying student technical distress (e.g., incoming call, device prompt). It **must never serve as the sole evidentiary basis** for disciplinary action without student consultation.
- When reviewing flagged results, examine the exact focus-loss timestamps in the `Notes` column of the `-RESULTS` sheet.

### Exporting Telemetry for Inquiries
- To export a non-adjudicative telemetry report, click **🛡️ Export Telemetry** in the Teacher Portal.
- The downloaded CSV includes standard legal disclaimers ensuring proper handling under the Philippine Data Privacy Act of 2012.

### Formal Privacy & Data Inquiries
- Inquiries regarding personal data correction or dispute escalation must be directed to:
  **Office of the Data Protection Officer**
  Email: `cecitproctor@gmail.com`

---

## 5. Spreadsheet Security & Access Governance

1. **Access Permissions**:
   - Google Spreadsheet sharing must be limited to authorized faculty and departmental staff.
   - Set the spreadsheet link to **Restricted** (never "Anyone with the link").
2. **Hidden System Tabs**:
   - `_ActiveAttempts`, `_AuditLog`, and `Log` must remain hidden from daily view.
   - Do not delete or rename hidden system sheets.
3. **Data Minimization**:
   - Raw answer snapshots in `_ActiveAttempts` are automatically purged immediately upon submission.
   - Submitted attempt records older than **48 hours** and abandoned sessions older than **7 days** are automatically wiped by the daily cleanup trigger.

---

## 6. Daily Cleanup Time Trigger Maintenance

The system includes an automated retention maintenance trigger:
- **Function**: `dailyCleanupActiveAttempts_`
- **Schedule**: Every day between 2:00 AM and 3:00 AM.
- **Action**: Purges stale active ledger records and logs summary results to `_AuditLog`.

### Trigger Verification & Reinstallation
If the spreadsheet is copied or project triggers are reset:
1. In Google Sheets, navigate to **📝 Exam ▸ Setup ▸ Install daily cleanup trigger**.
2. A confirmation prompt will verify successful registration of the 2:00 AM daily trigger.
