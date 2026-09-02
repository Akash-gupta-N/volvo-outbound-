# Outbound Workflow Monitoring System

A prototype for monitoring the warehouse **outbound** process. A mentor uploads
expected picklists from Excel; the system generates four event-specific QR codes
per picklist; operators scan them from a phone camera at each stage of picking
and packing. Every accepted scan is timestamped in IST, the process sequence is
enforced per picklist, and completed picklists are exported to a confirmation
spreadsheet either on a daily schedule or on demand.

## Contents

- [The workflow](#the-workflow)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scanning from a phone](#scanning-from-a-phone)
- [Excel formats](#excel-formats)
- [QR code format](#qr-code-format)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Notes and limitations](#notes-and-limitations)

## The workflow

Each picklist moves through four scan events, and they must happen in order:

```
   PICKING_START ──▶ PICKING_END ──▶ PACKING_START ──▶ PACKING_END
        │                │                 │                │
   Picking:          Picking:          Packing:         Packing:
   In Progress       Completed         In Progress      Completed
                                                             │
                                                             ▼
                                            eligible for confirmation
                                            (scheduled 17:00 IST, or manual)
                                                             │
                                                             ▼
                                            CONFIRMED → permanent history
```

The engine rejects anything out of order and records *why*. Scanning
`PACKING_START` before picking finishes returns "Picking must be completed
before Packing can start."; scanning `PICKING_START` twice returns "Picking
Start has already been recorded for PL001." Rejections are written to
`scan_events` with `status = 'REJECTED'` and the reason, so the audit trail
captures failed attempts, not just successful ones.

There is a second guard on top of sequence: the operator picks a scanner mode
before scanning, and if the mode does not match the QR's event type the scan is
rejected as a mismatch. This catches an operator scanning the right picklist at
the wrong station.

## Features

**Mentor dashboard** (`/`, laptop)
- Upload expected picklists from `.xlsx`. Re-uploading is safe: picklists that
  already exist are preserved rather than reset, and the response reports how
  many were added versus skipped.
- Inline correction of a picklist's line count, blocked once it is confirmed.
- Live monitoring of picking and packing status with IST timestamps, pushed over
  Socket.IO — no polling.
- Displays all four QR codes for every picklist, ready to print.
- Configure the daily confirmation time, or generate a batch immediately and
  download the spreadsheet.
- Permanent history of confirmed picklists.

**Operator scanner** (`/operator.html`, phone)
- In-browser camera scanning, no app install.
- Explicit scanner-mode selection per event type, cross-checked against the QR.
- Accept/reject feedback showing the exact rejection reason.
- **Offline queue**: scans are buffered in `localStorage` when the network drops
  and replayed automatically once it returns.

**Confirmation**
- Scheduler polls every 30 seconds and fires when the clock reaches the
  configured `HH:mm` IST, guarded so it runs at most once per minute.
- Exports exactly six columns — Picklist No., Lines, Picking Start Time, Picking
  End Time, Package Start Time, Package End Time — with a styled header row.
- Every batch is written to `confirmations/` and recorded, so a spreadsheet the
  scheduler produced overnight can still be downloaded the next morning. The
  file is saved before any picklist is marked confirmed, so a failed write
  aborts the batch instead of confirming picklists with nothing to show for it.
- Confirmed picklists leave the active list and move to permanent history, so
  they are never re-exported.

## Tech stack

| Layer | Choice |
| --- | --- |
| Server | Node.js, Express 4 |
| Realtime | Socket.IO 4, attached to both the HTTP and HTTPS servers |
| Database | SQLite via `better-sqlite3`, WAL mode |
| Time | Luxon, fixed to `Asia/Kolkata` |
| Excel | `xlsx` for reading, `exceljs` for styled output |
| QR | `qrcode` (generation), `html5-qrcode` (camera decoding) |
| Frontend | Vanilla ES modules + plain CSS, no build step |

Data access sits behind `src/db/repositoryInterface.js` so the SQLite
implementation can be replaced without touching the engine or the routes.

## Getting started

### Prerequisites

- Node.js 18 or newer (developed against Node 20)
- npm
- GNU Make (preinstalled on macOS and Linux; on Windows use `start_app.bat` or
  the npm commands below, or `make` from WSL / Git Bash)

`better-sqlite3` is a native module compiled for the machine it is installed on,
so install dependencies locally rather than copying a `node_modules` directory
between operating systems.

### Quick start

```bash
git clone https://github.com/Akash-gupta-N/volvo-outbound-.git
cd volvo-outbound-
make dev
```

`make dev` installs dependencies and then starts the server. Nothing else to
run. Open <http://localhost:3000>.

The SQLite file `outbound.db` and its tables are created automatically on first
start, with the confirmation time defaulting to `17:00` IST. The dependency
install is tracked against `package.json`/`package-lock.json`, so the second
`make dev` skips straight to starting the server.

| Service | URL |
| --- | --- |
| Mentor dashboard (HTTP) | http://localhost:3000 |
| Same app over HTTPS | https://localhost:3001 |
| Operator scanner | http://localhost:3000/operator.html |

The server binds to `0.0.0.0`, so any device on the same Wi-Fi can reach it, and
it prints the detected LAN address on startup. `GET /api/system-info` returns the
same information.

### Make targets

Run `make` with no arguments to list these at any time.

| Target | What it does |
| --- | --- |
| `make dev` | Install dependencies, then run the server |
| `make tunnel` | Keep a public HTTPS tunnel alive for phone scanning |
| `make install` | Install dependencies only |
| `make sample` | Regenerate `test_picklists.xlsx` |
| `make test` | Engine tests — backs up and resets the database first |
| `make test-api` | API integration tests — needs the server running |
| `make test-persistence` | Restart-persistence check — needs `make test-api` first |
| `make rebuild` | Rebuild `better-sqlite3` after copying `node_modules` across operating systems |
| `make reset-db` | Back up and remove `outbound.db` |
| `make clean` | Remove generated confirmation spreadsheets |
| `make distclean` | Remove `node_modules` |

`make reset-db` never deletes data outright: an existing `outbound.db` is moved
to a timestamped `outbound.db.backup-*` file and the restore command is printed.

### Windows

`start_app.bat` launches the server and the tunnel keep-alive and opens the
dashboard in one double-click, without needing make.

### Public tunnel (optional)

The server opens a [localtunnel](https://localtunnel.me) on startup and prints a
public HTTPS URL for the scanner. `make tunnel` runs `keep_tunnel_alive.js`,
which reconnects it if it drops and writes the current URL to `public_url.txt`.
Useful for scanning from a phone that is not on the same network — and, because
the tunnel is HTTPS with a real certificate, it is the least friction way to get
the camera working.

### Without make

```bash
npm install                          # dependencies
npm start                            # run the server
node keep_tunnel_alive.js            # tunnel supervisor
node create_sample_excel.js          # regenerate test_picklists.xlsx
npm test                             # engine suite only
```

## Scanning from a phone

Browsers only grant camera access in a *secure context*:

- **`http://<laptop-ip>:3000/operator.html`** — everything works except the camera.
- **`https://<laptop-ip>:3001/operator.html`** — camera works, but the
  certificate is self-signed, so you must accept the browser warning once. The
  certificate includes your LAN IPs as subject alternative names, so the warning
  is the only obstacle.
- **the localtunnel URL** — camera works with no warning. localtunnel may first
  show an interstitial asking for your public IP as a password.

## Excel formats

### Upload (expected picklists)

One row per picklist. Header matching is case-insensitive and substring-based:
any column containing `picklist` supplies the number, any column containing
`line` supplies the line count. Rows without a picklist number, or with a line
count that is missing or not a positive integer, are skipped.

| Picklist No. | Lines No. |
| --- | --- |
| PL001 | 10 |
| PL002 | 8 |
| PL003 | 15 |

`test_picklists.xlsx` in the repository root is a ready-made upload, and
`create_sample_excel.js` regenerates it.

Re-uploading is safe. A picklist that is still active is left untouched rather
than reset. A picklist number that has already been confirmed is reported back
by name as skipped, because `picklist_no` is the primary key and a number that
has moved into history cannot start a second run.

### Download (confirmation batch)

Exactly six columns, one row per confirmed picklist, times rendered in IST:

| Picklist No. | Lines | Picking Start Time | Picking End Time | Package Start Time | Package End Time |
| --- | --- | --- | --- | --- | --- |
| PL001 | 10 | 09:14:02 | 09:41:37 | 09:45:10 | 10:02:55 |

## QR code format

Four codes are generated per picklist, one per event. The standard payload is
pipe-delimited:

```
OUTBOUND|<picklistNo>|<lines>|<eventType>
```

for example `OUTBOUND|PL001|10|PICKING_START`. `eventType` must be one of
`PICKING_START`, `PICKING_END`, `PACKING_START`, `PACKING_END`; anything else is
rejected as malformed.

A JSON payload is also accepted as a fallback, so codes produced by third-party
generators still work:

```json
{ "picklistNo": "PL001", "lines": 10, "eventType": "PICKING_START" }
```

## Project structure

```
.
├── Makefile                        # install / run / test targets
├── server.js                       # Express app, HTTP + HTTPS, Socket.IO, all routes
├── src/
│   ├── config/timezone.js          # Luxon helpers pinned to Asia/Kolkata
│   ├── db/
│   │   ├── database.js             # connection, WAL, schema, default config
│   │   ├── repositoryInterface.js  # storage contract
│   │   └── sqliteRepository.js     # better-sqlite3 implementation
│   └── services/
│       ├── outboundEngine.js       # sequence validation and state transitions
│       ├── qrService.js            # payload encode/parse, QR data URLs
│       ├── excelService.js         # xlsx import, exceljs export
│       └── schedulerService.js     # daily confirmation batch
├── public/
│   ├── index.html, js/mentor.js    # mentor dashboard
│   ├── operator.html, js/operator.js  # phone scanner + offline queue
│   ├── js/common.js                # fetch wrapper
│   ├── js/html5-qrcode.min.js      # vendored camera decoder
│   └── css/styles.css
├── confirmations/                  # generated batches (git-ignored)
├── tests/                          # engine, API integration, persistence
├── outboundprompt.md               # original build specification
├── create_sample_excel.js          # regenerates test_picklists.xlsx
├── keep_tunnel_alive.js            # localtunnel supervisor
├── start_tunnel.js                 # one-shot tunnel
└── start_app.bat                   # Windows launcher
```

## API reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/system-info` | LAN IPs, ports, current IST time |
| `GET` | `/api/picklists/expected` | Expected (unconfirmed) picklists |
| `POST` | `/api/picklists/upload` | Import from Excel (multipart, field `excelFile`) |
| `PATCH` | `/api/picklists/:picklistNo` | Correct the line count |
| `GET` | `/api/picklists/live` | Live monitoring rows and summary |
| `GET` | `/api/picklists/qr-codes` | All four QR codes per picklist, as data URLs |
| `POST` | `/api/scan` | Submit a scan |
| `GET` | `/api/confirmation/config` | Confirmation time and pending count |
| `POST` | `/api/confirmation/config` | Set confirmation time (`HH:mm`, 24-hour) |
| `POST` | `/api/confirmation/generate` | Generate a batch now; responds with the `.xlsx` |
| `GET` | `/api/confirmation/batches` | Every batch generated so far, newest first |
| `GET` | `/api/confirmation/download/:batchId` | Re-download a batch's spreadsheet |
| `GET` | `/api/history` | Confirmed picklists |

`POST /api/scan` accepts either a raw QR string or pre-parsed fields, plus the
operator's selected mode:

```jsonc
// raw scan from the camera
{ "rawQR": "OUTBOUND|PL001|10|PICKING_START", "selectedEventType": "PICKING_START" }

// pre-parsed / manual entry
{ "picklistNo": "PL001", "lines": 10, "eventType": "PICKING_START" }
```

It returns HTTP 200 for any processed scan — check `success`:

```jsonc
{ "success": true,  "message": "Scan Accepted", "picklistNo": "PL001",
  "eventType": "PICKING_START", "time": "09:14:02", "picklist": { … } }

{ "success": false, "message": "Picking must be completed before Packing can start." }
```

Socket.IO emits `liveUpdate` after any state change, and
`confirmationGenerated` with `{ triggerType, count, timestamp }` when a batch is
written.

## Data model

| Table | Purpose |
| --- | --- |
| `picklists` | One row per picklist: line count, picking/packing status, the four event timestamps, and `confirmation_status` (`PENDING` → `CONFIRMED`) with its date. |
| `scan_events` | Append-only log of every scan, accepted **and** rejected, with the event type, IST timestamp and rejection reason. |
| `config` | Key/value settings; currently `confirmation_time` (default `17:00`). |
| `confirmation_batches` | One row per generated batch: file name and path, whether it was `MANUAL` or `AUTOMATIC`, the picklist count and the timestamp. |

Timestamps are stored as IST ISO strings with a `+05:30` offset, not UTC.

## Testing

The three suites are ordered and have prerequisites — they are not independent.

```bash
# 1. Engine and service unit tests. Needs a fresh database; the target backs up
#    any existing outbound.db to a timestamped file before resetting it.
make test

# 2. API integration tests. Need the server running, and seed PL101/PL102.
make dev           # in another terminal
make test-api

# 3. Restart-persistence check. Needs step 2 to have run first.
make test-persistence
```

`make test-api` and `make test-persistence` check that the server is responding
on port 3000 first and tell you to start it if not, rather than failing with a
connection error.

Without make, the equivalents are `node tests/test_engine.js` (after deleting
`outbound.db`), `node tests/test_api_integration.js` and
`node tests/test_persistence.js`. `npm test` runs only `tests/test_engine.js`.

Coverage: picklist ingestion, line correction, QR encode/parse, out-of-sequence
rejection, duplicate rejection, the full four-event happy path, live monitoring,
confirmation eligibility, the six-column export, migration into permanent
history, and offline-queue resynchronisation — 11 checks in the integration
suite.

> **Careful:** the suites run against the real `outbound.db`, because
> `src/db/database.js` hardcodes that path. There is no separate test database,
> so running them will modify your working data. `test_engine.js` in particular
> assumes a clean database and will fail against one that already has picklists
> in a completed state.

## Troubleshooting

**`ERR_DLOPEN_FAILED`, or "not a valid Win32/mach-o application" from `better-sqlite3`**
The native binary was built for a different OS or architecture. Rebuild it:

```bash
make rebuild
# or, without make:
rm -rf node_modules/better-sqlite3
npm install better-sqlite3
```

**Phone camera does not start**
The page must be a secure context. Use the HTTPS URL on port 3001 or the
localtunnel URL. Plain HTTP over the LAN works for every other screen but will
not grant camera permission.

**"Mismatched Scanner Mode!"**
The scanner mode selected on the phone does not match the event encoded in the
QR code. Switch modes, or scan the code for the stage you are actually at.

**A valid-looking scan is rejected**
Sequence is enforced per picklist and each event can only be recorded once.
Check the live dashboard for which stages the picklist has already passed.

**Confirmation batch is empty**
Only picklists with *both* picking and packing completed are eligible. Already
confirmed picklists have moved to history and will not reappear.

**`test_engine.js` fails on a rejection-reason assertion**
The database already contains completed picklists from an earlier run. Run
`make test`, which backs up and resets the database first — see
[Testing](#testing).

## Notes and limitations

This is a prototype built as an internship project. Known gaps:

- No authentication; anyone who can reach the server can scan or confirm.
- The scheduler is an in-process timer that compares against `HH:mm`, so a batch
  is missed if the server is down at the configured minute; it does not catch up
  on the next start.
- Picklist numbers cannot be re-used once confirmed, since `picklist_no` is the
  primary key and the same row serves as the history record. Supporting repeat
  numbers would mean moving history into its own table.
- The HTTPS certificate is generated in memory at startup, so it changes on every
  restart and the browser warning has to be accepted again.
- Tests share the production database, as described above.
- `html5-qrcode` is vendored into `public/js/` rather than resolved from
  `node_modules`, since the frontend has no build step.
- SQLite on a local file suits a single warehouse host; a networked deployment
  would need a different repository implementation.
