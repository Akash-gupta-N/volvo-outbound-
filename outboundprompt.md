# OUTBOUND WORKFLOW MONITORING APPLICATION — MASTER BUILD PROMPT

## 1. OBJECTIVE

Build a functional prototype web application for monitoring the warehouse **Outbound process**.

The prototype must allow a mentor/supervisor to:

* Upload expected Outbound Picklist data through Excel.
* View expected Picklists.
* View live Outbound process progress.
* Generate and display four event-specific QR codes for every Picklist.
* Allow an operator to use a phone camera to scan the appropriate QR code.
* Record the exact timestamp of every accepted process event.
* Enforce the correct process sequence for each individual Picklist.
* Monitor Picking and Packing status live.
* Configure a confirmation interval.
* Manually generate a Confirmation Excel whenever required.
* Automatically generate the confirmation batch at the configured confirmation time.
* Move confirmed Picklists from the pending/expected state into permanent History.
* Preserve all operational data after application restart.

This is a **prototype**, not a production deployment.

The initial database must be **SQLite**.

The architecture must nevertheless be designed so that the SQLite database can later be replaced by Firebase Firestore with minimal changes.

---

# 2. SOURCE-OF-TRUTH RULE

**Do not refer to, inspect, or depend on any previous Inbound workflow specification to determine Outbound functionality. Everything required for the Outbound prototype is explicitly defined in this prompt.**

This prompt is the complete and authoritative specification for the Outbound application.

Do NOT assume or invent additional Outbound business requirements.

Do NOT add unnecessary features such as:

* Complicated analytics
* Unnecessary notifications
* Automatic performance penalties
* Unnecessary operator accounts
* Complicated authentication
* Unnecessary workflow states
* Unnecessary scheduling logic
* Unnecessary inventory functionality

If a requirement is not specified here, prefer the simplest implementation necessary for the prototype.

---

# 3. USERS AND ROLES

There are two main users.

## 3.1 Mentor / Supervisor

The mentor primarily uses the application on a laptop/PC.

The mentor must be able to:

* Upload expected Picklist Excel files.
* Make small corrections to expected Picklist data directly inside the application.
* View Expected Picklists.
* View Live Outbound Monitoring.
* View Picking and Packing status.
* View timestamps.
* View the four QR codes associated with each Picklist.
* Configure the confirmation interval/time.
* Manually generate Confirmation Excel.
* View History.
* Continue using the system while new Excel files are uploaded.

Do NOT build complicated authentication or permissions for the prototype.

Authentication can be added during the future Firebase/production phase.

---

## 3.2 Operator

The operator primarily uses a phone.

The operator should have an extremely simple workflow:

```text
Open web application
        ↓
Select required scanner/event
        ↓
Tap Scan
        ↓
Phone camera opens
        ↓
Scan QR
        ↓
See Accepted / Rejected
        ↓
Continue
```

The operator must NOT need to:

* Search for a Picklist.
* Enter Picklist No. manually.
* Enter Lines manually.
* Manage Excel files.
* Use the mentor dashboard.
* Decide the workflow state manually.
* Manually enter timestamps.

The QR code and selected scanner event must determine what operation is being performed.

---

# 4. OUTBOUND INPUT EXCEL

The mentor uploads expected Outbound data using Excel.

The initial Excel contains exactly:

| Picklist No. | Lines No. |
| ------------ | --------: |
| PL001        |        10 |
| PL002        |         8 |
| PL003        |        15 |

These are the required input fields.

No additional input columns are required for the prototype.

---

# 5. MULTIPLE EXCEL UPLOADS

The mentor may upload multiple Excel files over time.

A new Excel upload must NOT destroy unrelated active Picklists.

Example:

First upload:

```text
PL001 | 10
PL002 | 8
```

Later upload:

```text
PL003 | 12
PL004 | 7
```

The active expected data should contain:

```text
PL001 | 10
PL002 | 8
PL003 | 12
PL004 | 7
```

If an uploaded Picklist/Lines combination already exists in the active expected data, do not create a duplicate.

Only new Picklist/Lines combinations should be added.

For the prototype, assume the same Picklist No. will not simultaneously exist with different Lines No. values.

---

# 6. SMALL CORRECTIONS TO EXPECTED DATA

The mentor must be able to make small corrections directly inside the application.

For example:

```text
PL001 | 10
```

can be corrected to:

```text
PL001 | 12
```

The corrected value becomes the current expected value.

The mentor should not have to recreate and upload the entire Excel file for a small correction.

Keep this feature simple.

---

# 7. OUTBOUND PROCESS

Every Picklist has its own independent workflow.

Different Picklists can begin at any time and do NOT need to be started in a particular global order.

For example:

```text
PL003 → Picking Start
PL001 → Picking Start
PL007 → Picking Start
```

This is valid.

However, once a particular Picklist begins, **that Picklist must follow the required sequence**.

The sequence for each individual Picklist is:

```text
PICKING START
      ↓
PICKING END
      ↓
PACKING START
      ↓
PACKING END
```

Packing cannot begin while Picking is still in progress.

---

# 8. FOUR PROCESS EVENTS

There are exactly four process events:

1. Picking Start
2. Picking End
3. Packing Start
4. Packing End

Each event must have its own event-specific QR code.

---

# 9. FOUR EVENT-SPECIFIC QR CODES

For every Picklist, generate four unique QR codes.

Example for:

```text
Picklist: PL001
Lines: 10
```

Generate:

```text
PL001 — Picking Start QR
PL001 — Picking End QR
PL001 — Packing Start QR
PL001 — Packing End QR
```

Each QR must contain enough information to identify:

* Picklist No.
* Lines No.
* Event type.

For example, conceptually:

```text
Picklist: PL001
Lines: 10
Event: PICKING_START
```

The exact internal QR encoding can be implemented in a clean machine-readable format.

Keep the QR parsing logic separate/configurable so that it can later be adapted to the company's actual physical sticker/QR format.

---

# 10. QR DISPLAY ON LAPTOP

For the prototype, display the four QR codes in the same row as the Picklist.

Example:

| Picklist | Lines | Picking Start QR | Picking End QR | Packing Start QR | Packing End QR |
| -------- | ----: | ---------------- | -------------- | ---------------- | -------------- |
| PL001    |    10 | QR               | QR             | QR               | QR             |
| PL002    |     8 | QR               | QR             | QR               | QR             |

This is primarily for prototype demonstration and testing.

The mentor should immediately understand which QR belongs to which process event.

Later, these event-specific QR codes can be associated with the physical warehouse sticker/workflow when the company introduces the actual QR/sticker process.

---

# 11. FOUR SCANNER INTERFACES

The application must provide four clearly separated scanner sections/modes:

```text
[ Picking Start ]
[ Picking End ]
[ Packing Start ]
[ Packing End ]
```

The phone operator selects the required scanner/event.

Then the camera opens and scans the corresponding QR.

The scanner interface should clearly indicate which event is currently being scanned.

Example:

```text
CURRENT SCANNER

PICKING START

[ Scan QR ]
```

The operator should not accidentally confuse Picking Start with Packing Start.

Keep the phone interface extremely simple.

---

# 12. PHONE CAMERA SCANNING

The prototype MUST use the phone camera.

When the operator taps Scan:

1. Request camera permission if necessary.
2. Open the phone camera through the web application.
3. Detect the QR automatically.
4. Parse the QR.
5. Send the scan information to the backend.
6. Validate the Picklist and event.
7. Accept or reject the scan.
8. Record the timestamp if accepted.
9. Update the laptop dashboard immediately.
10. Make the scanner ready for the next scan.

The operator must NOT have to:

* Take a photo manually.
* Copy QR contents.
* Paste QR contents.
* Type QR information manually.
* Switch applications.

---

# 13. PHONE + LAPTOP COMMUNICATION

The prototype must allow the phone and laptop to communicate over the same local Wi-Fi/network.

The laptop runs the backend/server.

The phone must be able to open the web application using the laptop's local network IP address.

Do NOT restrict the backend to localhost only.

Configure appropriate:

* Host binding
* Local network access
* CORS where required
* API access

The phone must be able to access the scanner interface directly from its browser.

No USB connection is required.

The intended prototype architecture is:

```text
Laptop
  │
  ├── Frontend
  ├── Backend/API
  └── SQLite
        ↑
        │
     Local Wi-Fi
        │
        ↓
      Phone
   Camera Scanner
```

---

# 14. PICKING STATUS

Each Picklist has a Picking status.

Possible values:

```text
Not Started
In Progress
Completed
```

State transitions:

```text
Initial
  ↓
Not Started

Picking Start QR accepted
  ↓
In Progress

Picking End QR accepted
  ↓
Completed
```

---

# 15. PACKING STATUS

Each Picklist has a Packing status.

Possible values:

```text
Not Started
In Progress
Completed
```

State transitions:

```text
Initial
  ↓
Not Started

Packing Start QR accepted
  ↓
In Progress

Packing End QR accepted
  ↓
Completed
```

---

# 16. SEQUENTIAL VALIDATION

The application must enforce the process sequence for each Picklist.

Valid sequence:

```text
Picking Start
    ↓
Picking End
    ↓
Packing Start
    ↓
Packing End
```

Examples:

### Valid

```text
Picking Start → Accepted
Picking End → Accepted
Packing Start → Accepted
Packing End → Accepted
```

### Invalid

Packing Start before Picking End:

```text
Packing Start
      ↓
REJECTED
```

Show a simple message:

> Picking must be completed before Packing can start.

Similarly:

* Picking End before Picking Start → reject.
* Packing End before Packing Start → reject.
* Packing Start before Picking End → reject.
* Duplicate Picking Start → reject.
* Duplicate Picking End → reject.
* Duplicate Packing Start → reject.
* Duplicate Packing End → reject.

A rejected scan must NOT overwrite existing timestamps or operational data.

---

# 17. PICKLIST INDEPENDENCE

The state of one Picklist must not interfere with another Picklist.

Example:

```text
PL001 → Picking In Progress
PL002 → Picking Not Started
PL003 → Packing In Progress
```

These states can coexist.

The sequence applies independently to each Picklist.

---

# 18. PHONE SCAN RESULT

After every scan, clearly show the result on the phone.

Accepted example:

```text
✅ Scan Accepted

Picklist: PL001
Lines: 10
Event: Picking Start
Time: 09:10:15
```

Rejected example:

```text
❌ Scan Rejected

Picking must be completed before Packing can start.
```

For duplicate:

```text
❌ Scan Rejected

Picking Start has already been recorded for PL001.
```

After showing the result, the scanner should be ready for the next scan.

Do not force unnecessary screens between scans.

---

# 19. EXPECTED PICKLISTS SECTION

The mentor application must contain a dedicated:

## Expected Picklists

section.

This section represents the Picklists that are currently expected/pending.

It should allow the mentor to:

* View expected Picklists.
* See Picklist No.
* See Lines.
* Make small corrections.
* See which Picklists are still awaiting completion/confirmation.

Once a Picklist is successfully confirmed through the Confirmation process, it must be removed from the pending/expected confirmation list.

---

# 20. LIVE OUTBOUND MONITORING SECTION

Create a separate:

## Live Outbound Monitoring

section.

This is the mentor's main live monitoring area.

Use one row per Picklist.

Example:

| Picklist | Lines | Picking     | Packing     | Picking Start | Picking End | Packing Start | Packing End |
| -------- | ----: | ----------- | ----------- | ------------- | ----------- | ------------- | ----------- |
| PL001    |    10 | Completed   | In Progress | 09:10         | 09:35       | 09:42         | —           |
| PL002    |     8 | In Progress | Not Started | 09:20         | —           | —             | —           |

The dashboard must update automatically after every accepted scan.

Do NOT require manual page refresh.

The mentor should be able to watch the process live while the operator scans from the phone.

---

# 21. LIVE MONITORING SUMMARY

Provide a simple summary, such as:

* Total Expected Picklists
* Picking In Progress
* Packing In Progress
* Completed / Awaiting Confirmation
* Last Scan Time

Do NOT create complicated analytics.

The mentor primarily needs to understand:

> What is happening right now?

---

# 22. TIMESTAMPS AND TIMEZONE

Record timestamps for all four accepted events:

* Picking Start Time
* Picking End Time
* Packing Start Time
* Packing End Time

All application business timestamps MUST use:

**Indian Standard Time (IST), UTC+05:30.**

This applies consistently to:

* Picking timestamps
* Packing timestamps
* Confirmation time
* Confirmation date/time
* History dates
* Displayed application times
* Generated Excel timestamps
* Any other business-related date/time values

Do NOT use UTC for business timestamps.

Do NOT depend on the browser, server, or device timezone for business records.

If the system internally stores timestamps in another representation for technical reasons, all business-facing values must be converted and displayed in **IST (UTC+05:30)**.

If there is a long gap between events, simply record and display the actual timestamps.

Do NOT automatically judge or penalize the operator.

Do NOT create unnecessary alerts such as:

> Operator has not scanned for two hours.

The application records facts.

The mentor decides why a delay occurred.

---

# 23. COMPLETION

A Picklist is considered fully completed only after all four events have been successfully recorded:

```text
Picking Start ✅
Picking End ✅
Packing Start ✅
Packing End ✅
```

Then:

```text
Picking = Completed
Packing = Completed
Overall Process = Completed / Awaiting Confirmation
```

A Picklist with only Picking completed is NOT fully completed.

A Picklist with Packing in progress is NOT fully completed.

Only a Picklist with both Picking and Packing completed can enter the confirmation batch.

---

# 24. CONFIRMATION INTERVAL

The mentor must be able to configure the confirmation timing/interval.

Example:

```text
Confirmation Time: 5:00 PM
```

Completed Picklists wait for confirmation until the configured confirmation cycle.

The application should normally generate the confirmation batch at the configured interval.

The configured confirmation time must be interpreted in **IST (UTC+05:30)**.

---

# 25. MANUAL CONFIRMATION

The mentor must also have a:

```text
[ Generate Confirmation Excel ]
```

button.

If the mentor presses it manually, immediately generate a confirmation Excel containing all currently completed-but-not-yet-confirmed Picklists.

The manual generation should NOT require waiting for the configured time.

Example:

Configured time:

```text
5:00 PM IST
```

Mentor manually presses the button at:

```text
3:00 PM IST
```

The system generates the confirmation file immediately for all eligible completed Picklists.

---

# 26. CONFIRMATION ELIGIBILITY

A Picklist is eligible for confirmation ONLY when:

```text
Picking Start exists
AND
Picking End exists
AND
Packing Start exists
AND
Packing End exists
```

Incomplete Picklists must NOT appear in the Confirmation Excel.

Example:

```text
PL001 → Picking ✅ Packing ✅ → Include

PL002 → Picking ✅ Packing In Progress → Do NOT include

PL003 → Picking In Progress → Do NOT include
```

---

# 27. CONFIRMATION EXCEL

The Confirmation Excel must contain ONLY these six columns:

| Picklist No. | Lines | Picking Start Time | Picking End Time | Package Start Time | Package End Time |
| ------------ | ----: | ------------------ | ---------------- | ------------------ | ---------------- |
| PL001        |    10 | 09:10              | 09:35            | 09:42              | 10:05            |

Do NOT add:

* Picking Status
* Packing Status
* Duration calculations
* Delay calculations
* Analytics
* Extra fields

The Confirmation Excel is intended to match the mentor's required confirmation format.

All timestamps in the generated Excel must use **IST (UTC+05:30)**.

---

# 28. CONFIRMATION STATE

When a Picklist is successfully included in a generated Confirmation Excel:

1. Mark the Picklist as Confirmed.
2. Remove it from the Expected/Pending list.
3. Remove it from the pending confirmation set.
4. Keep its complete record in History.
5. Ensure it does not appear in future Confirmation Excel files.

The same confirmed Picklist must never be included in a later confirmation batch.

The removal from the pending/expected confirmation list must happen only after the Confirmation Excel has been successfully generated.

---

# 29. HISTORY

Create a dedicated:

## History

section.

History must retain confirmed Picklist records permanently.

History should contain:

* Date
* Picklist No.
* Lines
* Picking Start Time
* Picking End Time
* Package Start Time
* Package End Time

All date/time values must use **IST (UTC+05:30)**.

This is sufficient for the prototype.

Keep History simple.

A date field should allow the mentor to distinguish records from different days.

Do not build complicated analytics.

---

# 30. DATA PERSISTENCE

Closing or restarting the application must NOT erase data.

After restart:

* Expected Picklists remain available.
* Active Picklists remain available.
* Picking status remains correct.
* Packing status remains correct.
* Timestamps remain intact.
* Confirmation state remains correct.
* History remains available.

The application must resume from its previous state.

---

# 31. WI-FI INTERRUPTION

If the phone temporarily loses Wi-Fi/network connectivity:

1. Retain the pending scan information temporarily on the phone.
2. Do not lose the scan merely because of temporary connectivity loss.
3. Automatically synchronize pending scan information when the connection returns.
4. Prevent duplicate synchronization.
5. Apply the normal validation/business rules during synchronization.
6. Record the accepted event exactly once.

Do not assume future physical scanners will have the same offline capability.

---

# 32. DATABASE ARCHITECTURE

SQLite is the active database for this prototype.

However, do NOT tightly couple the application to SQLite.

Use a structure similar to:

```text
FRONTEND
    ↓
BACKEND / API
    ↓
CORE OUTBOUND BUSINESS LOGIC
    ↓
DATABASE / REPOSITORY INTERFACE
    ↓
SQLite
```

Critical requirements:

* Do NOT put SQLite queries directly inside frontend components.
* Do NOT scatter SQLite-specific operations throughout business logic.
* Do NOT make the frontend depend directly on SQLite.
* All database operations must go through a clearly defined repository/database-access layer.
* Core business logic must be independent of the underlying database.
* Data models and repository interfaces should allow SQLite to later be replaced by Firestore with minimal changes.

SQLite is the actual working database during this prototype phase.

---

# 33. CORE DATA MODEL

At minimum, the application must maintain information representing:

### Picklist

* Picklist No.
* Lines No.
* Picking Status
* Packing Status
* Picking Start Time
* Picking End Time
* Packing Start Time
* Packing End Time
* Confirmation Status
* Confirmation Date/Time
* History Date

### QR Event

* Picklist No.
* Lines No.
* Event Type
* QR identity/data

### Event timestamps

Each accepted event must be recorded exactly once.

The data model should support future association with a scanner/operator source without requiring a redesign.

---

# 34. SCAN INPUT ABSTRACTION

The current prototype scanner is:

```text
Phone Camera
```

Future input sources may include:

```text
Phone Camera
Physical Scanner
Multiple Physical Scanners
```

Keep the scanner/input layer separate from the core Outbound business logic.

The future physical scanner should be able to send the same conceptual event information:

```text
Picklist
Lines
Event
```

without requiring the core Picking/Packing/Confirmation logic to be rewritten.

Do NOT build complicated multi-scanner UI now.

Design the underlying architecture so future multiple scanners can share the same active Picklist data.

---

# 35. QR PARSER

The QR parser must be separate from the core business logic.

The prototype QR format can be created specifically for development.

However:

* Do not hard-code the entire business logic around one QR format.
* Keep parsing configurable.
* Make it possible to adapt the parser later when the actual company sticker/QR format becomes available.
* The parser must produce the required conceptual information:

```text
Picklist No.
Lines No.
Event Type
```

---

# 36. FUTURE FIRESTORE MIGRATION

After the SQLite prototype is working, the database may later move to:

```text
SQLite
   ↓
Firebase Firestore
```

The prototype should therefore prepare clean separation between:

* Frontend
* Backend/API
* Business logic
* Repository/database layer

Do NOT rewrite the working prototype around Firestore now.

Do NOT allow Firebase preparation to break the working SQLite prototype.

The future Firestore implementation should be a database-layer replacement rather than a complete business-logic rewrite.

---

# 37. FUTURE AUTHENTICATION AND AUDIT LOGGING

The prototype does NOT require complicated authentication.

In the future production/company phase, the system may use:

* Firebase Authentication
* Google login
* Audit logging
* Company authentication/authorization
* Company database/system integration

Do not implement complicated authentication in the prototype unless specifically required for testing.

The architecture should not prevent these future additions.

---

# 38. FUTURE COMPANY SYSTEM INTEGRATION

This prototype is not responsible for directly integrating into the company's production database or authentication system.

The eventual company integration will be handled by professional software/IT engineers.

The prototype's purpose is to demonstrate:

```text
Expected Excel
     ↓
Outbound workflow
     ↓
QR scanning
     ↓
Timestamp recording
     ↓
Live monitoring
     ↓
Confirmation Excel
     ↓
History
```

The future IT team can then determine how this workflow should be integrated into the company's actual systems.

Do NOT attempt to invent or simulate the company's internal database/authentication system.

---

# 39. NO ROUTINE NOTIFICATIONS

Do not send routine notifications to the mentor for:

* Every invalid scan
* Every duplicate scan
* Long gaps between scans
* Normal process transitions

Simply show Accepted/Rejected results to the operator and update the dashboard.

Technical/audit logging may retain rejected attempts if useful internally, but do not turn them into unnecessary mentor notifications.

---

# 40. FRONTEND / UX PHILOSOPHY

The UI must be:

* Simple
* Clean
* Professional
* Practical
* Easy for the mentor
* Extremely simple for the operator

The mentor should immediately understand:

> What Picklists are expected?

> What is happening right now?

> Which Picklists are being picked?

> Which Picklists are being packed?

> Which Picklists are completed?

> Which Picklists are waiting for confirmation?

> Which Picklists have already been confirmed?

The operator should only need to think:

> Select scanner → Scan → See result → Continue.

Do not over-design the prototype.

Functional correctness is more important than visual polish.

---

# 41. MAIN APPLICATION STRUCTURE

The laptop application should have clearly separated sections.

At minimum:

```text
1. Expected Picklists
2. Live Outbound Monitoring
3. QR / Expected Scans
4. Confirmation
5. History
```

The QR/Expected Scans area should display the four event-specific QR codes for each Picklist in one row.

The mentor should be able to navigate these sections easily.

---

# 42. EXPECTED PICKLIST SECTION

Display:

* Picklist No.
* Lines
* Current overall state
* Relevant pending state

Allow:

* Excel upload
* Multiple Excel uploads
* Small direct corrections

Do not duplicate existing active Picklist/Lines combinations.

---

# 43. LIVE MONITORING SECTION

Display one row per Picklist.

At minimum:

```text
Picklist
Lines
Picking Status
Packing Status
Picking Start
Picking End
Packing Start
Packing End
```

Update automatically after every accepted scan.

No manual refresh should be required.

---

# 44. QR / EXPECTED SCANS SECTION

Display four event-specific QR codes in the same row for each Picklist.

Example:

```text
PL001 | 10 | [Picking Start QR] | [Picking End QR] | [Packing Start QR] | [Packing End QR]
```

This is a prototype representation of the future physical scanning workflow.

The QR codes should be clearly labelled so that there is no ambiguity.

---

# 45. CONFIRMATION SECTION

Provide:

* Confirmation interval/time configuration
* Next confirmation time
* Number of completed-but-unconfirmed Picklists
* Generate Confirmation Excel button

The mentor must be able to manually generate the confirmation file at any time.

The system must normally generate confirmation at the configured interval.

Only fully completed Picklists are eligible.

All confirmation scheduling must use **IST (UTC+05:30)**.

---

# 46. HISTORY SECTION

Display confirmed records.

At minimum:

```text
Date
Picklist
Lines
Picking Start
Picking End
Packing Start
Packing End
```

Keep this simple and useful.

---

# 47. APPLICATION RESTART TEST

The prototype must be tested by:

1. Uploading expected Picklists.
2. Starting one or more Picklists.
3. Recording some scan events.
4. Closing/restarting the application.
5. Verifying that:

   * Picklists remain.
   * Statuses remain.
   * Timestamps remain.
   * History remains.
   * Confirmation state remains.

---

# 48. PROTOTYPE DEVELOPMENT PRIORITY

Build in this order.

## Priority 1 — Core functionality

* SQLite database
* Data models
* Repository/database abstraction
* Excel upload
* Multiple Excel uploads
* Expected Picklists
* QR generation
* Four scanner/event types
* Phone camera scanning
* QR parsing
* Scan validation
* Accepted/rejected result
* Sequential workflow validation
* Timestamp recording
* Picking status
* Packing status
* Live monitoring
* Confirmation Excel
* Confirmation state
* History

## Priority 2 — Communication

* Phone ↔ laptop communication
* Local Wi-Fi access
* Live dashboard updates
* Wi-Fi interruption handling
* Reconnection synchronization

## Priority 3 — Mentor usability

* Clear Expected Picklists section
* Clear Live Monitoring
* QR/Expected Scans section
* Confirmation management
* History
* Small expected-data corrections

## Priority 4 — Visual polish

Only after the complete workflow is functional.

Do NOT sacrifice functional correctness for visual design.

---

# 49. FINAL END-TO-END TEST

Before considering the prototype complete, verify this exact scenario.

### Expected data

1. Mentor opens the laptop application.
2. Mentor uploads an Excel containing Picklist No. + Lines.
3. Expected Picklists appear.
4. Mentor can make a small correction.
5. Mentor uploads another Excel.
6. Existing active Picklist/Lines combinations are not duplicated.
7. New Picklists are added without destroying unrelated active data.

### QR

8. Four event-specific QR codes are generated for each Picklist.
9. The four QR codes appear together in the QR/Expected Scans section.
10. Each QR contains Picklist, Lines, and Event information.

### Phone

11. Phone opens the same web application over local Wi-Fi.
12. Operator selects Picking Start.
13. Operator taps Scan.
14. Phone camera opens.
15. Operator scans a valid Picking Start QR.
16. Scan is accepted.
17. Picking Start timestamp is recorded in IST.
18. Picking status becomes In Progress.
19. Mentor dashboard updates immediately.

### Sequential validation

20. Operator attempts Packing Start before Picking End.
21. Scan is rejected.
22. No timestamp is overwritten.
23. Picking End QR is scanned.
24. Picking status becomes Completed.
25. Packing Start QR is scanned.
26. Packing status becomes In Progress.
27. Packing End QR is scanned.
28. Packing status becomes Completed.
29. All four timestamps are preserved.

### Duplicate validation

30. Operator scans an already-completed event QR again.
31. Scan is rejected.
32. Original timestamp remains unchanged.

### Multiple Picklists

33. Operator starts another Picklist.
34. The second Picklist can progress independently.
35. One Picklist being in progress does not block another Picklist.

### Confirmation

36. Completed Picklists become Completed / Awaiting Confirmation.
37. Incomplete Picklists are NOT included.
38. Configured confirmation interval is reached.
39. Eligible Picklists are included in the confirmation batch.
40. Mentor can also manually press Generate Confirmation Excel before the configured time.
41. Manual generation includes all currently completed-but-unconfirmed Picklists.

### Confirmation Excel

42. Verify the Excel contains ONLY:

```text
Picklist No.
Lines
Picking Start Time
Picking End Time
Package Start Time
Package End Time
```

43. Confirmed Picklists are removed from the pending/expected confirmation list.
44. Confirmed Picklists do not appear in later confirmation files.
45. Confirmed Picklists appear in History.
46. History contains the required six fields plus Date.

### Persistence

47. Restart the application.
48. Verify data remains intact.

### Wi-Fi

49. Temporarily disconnect phone Wi-Fi.
50. Verify pending scan information is retained.
51. Restore Wi-Fi.
52. Verify the scan synchronizes exactly once.
53. Verify normal validation rules still apply.

### Architecture

54. Verify frontend does not directly depend on SQLite.
55. Verify database operations go through the repository/database layer.
56. Verify core business logic is independent of SQLite.
57. Verify the phone scanner/input layer is separated from core business logic.
58. Verify the architecture can later support physical scanners.
59. Verify SQLite can later be replaced by Firestore without rewriting the core Outbound workflow.

---

# 50. DO NOT BUILD A GENERIC INVENTORY SYSTEM

This application is specifically an:

# OUTBOUND WORKFLOW MONITORING SYSTEM

The intended workflow is:

```text
Excel Upload
      ↓
Expected Picklists
      ↓
Four Event-Specific QR Codes
      ↓
Phone Scanner
      ↓
Validate Picklist + Event
      ↓
Accept / Reject
      ↓
Record Timestamp
      ↓
Picking / Packing Status
      ↓
Live Outbound Monitoring
      ↓
Completed / Awaiting Confirmation
      ↓
Configured Confirmation Interval
      OR
Manual Generate Confirmation Excel
      ↓
Confirmation Excel
      ↓
Remove from Pending/Expected
      ↓
Permanent History
```

Build this specific workflow.

Do not turn it into a generic warehouse/inventory management application.

---

# 51. FUTURE EXTENSIBILITY

The prototype should be functional now while keeping the following future possibilities in mind.

### Current prototype

```text
Phone Camera
     ↓
Local Wi-Fi
     ↓
Backend
     ↓
SQLite
```

### Future

```text
Phone Camera
       +
Physical Scanner
       +
Multiple Physical Scanners
       ↓
Backend / API
       ↓
Core Outbound Business Logic
       ↓
Repository Layer
       ↓
Firebase Firestore
       ↓
Company Systems
```

Future physical scanners should be able to use the same core event-processing logic.

Adding a physical scanner later should not require rewriting the Picking/Packing/Confirmation business logic.

---

# 52. IMPORTANT IMPLEMENTATION PRINCIPLE

Do not try to solve future production integration during the prototype.

The goal now is:

> **Prove that the Outbound workflow works correctly.**

The prototype must be reliable, understandable, demonstrable, and easy for the mentor to use.

Future production integration, authentication, company database access, physical scanner hardware, Firestore deployment, and enterprise system integration are later responsibilities.

Build the Outbound application according to this specification.

**This prompt is complete and self-contained. Do not refer to, inspect, or depend on any previous Inbound workflow specification to determine Outbound functionality.**
