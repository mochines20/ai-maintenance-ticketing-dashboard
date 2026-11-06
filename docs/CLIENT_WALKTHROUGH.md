# Maintenance Desk Client Walkthrough

Maintenance Desk is a lightweight property-operations workspace. A manager enters a caller's exact report, reviews the AI extraction beside the unchanged source text, creates one or more linked work orders, and then manages the saved queue and workflow status.

## Architecture

The React and TypeScript frontend sends reports to an Express API. The API calls the configured Groq provider for strict JSON-schema extraction, validates the response with Zod, applies deterministic safety rules, and stores only the reviewed result in SQLite. The dashboard reads tickets and KPI totals from the database rather than from hardcoded sample data.

The flow is deliberately two-stage:

1. **Report** — paste or type the caller's exact words and select Analyze report.
2. **Review & Create** — inspect and correct each extracted issue, then create the reviewed work order(s).

Analysis alone does not write to SQLite. A review token is consumed after a successful commit, so repeating the same commit cannot duplicate tickets.

## Extraction and validation

Groq is the active provider in the submitted configuration, using `openai/gpt-oss-120b` through the OpenAI-compatible API. The model is instructed to return separate issues, avoid guessing, and include source evidence. The server validates the structured response against both the provider JSON schema and Zod. Source-evidence phrases are retained only when they appear verbatim in the original report.

The server treats the report as untrusted data, limits request size, uses bound SQL parameters, and returns sanitized provider errors. Missing-unit state is recalculated from the nullable unit value. A narrow safeguard can recover a unit only when an exact token such as `2D` is present in the original report; it never infers a location.

## Safety and edge cases

- Gas or propane smell/leak becomes `Gas/Safety` and `Emergency`.
- Water contacting an outlet, wire, panel, or electrical equipment becomes `Emergency`.
- Fire, smoke, or sparking becomes `Emergency`.
- Freezing/no-heat reports become at least `High`.
- A missing unit remains null and is highlighted as needing follow-up.
- A report containing multiple issues creates separate linked tickets with one shared source report.

## Saved work orders

The Attention Queue defaults to active New/In Progress work. It supports status, priority, and text search filters, emergency-first FIFO ordering, and five-ticket pagination. The Ticket Inspector displays the description, category, unit, priority, status, safety warning, follow-up state, timestamp, and original report.

After creation, **Edit ticket** lets a manager correct category, priority, unit/location, or summary description without rerunning the LLM. The original report, ticket ID, report relationship, creation timestamp, and workflow status remain unchanged. Save uses the current `updated_at` value as an optimistic concurrency token; stale edits receive a conflict response instead of overwriting newer work. Edits create a compact field-level change-history row. Cancel discards the draft.

Status changes remain explicit and server-confirmed: `New`, `In Progress`, and `Done`. Dashboard KPI values are calculated from saved rows.

## Five official client reports

The current working tree was executed on November 6, 2026 through live Groq in an isolated temporary SQLite database. Each analysis returned HTTP 200 and each reviewed commit returned HTTP 201.

| Report | Actual result | Saved IDs | Outcome |
| --- | --- | --- | --- |
| 1. Water leak in 4B dripping onto outlet | Plumbing, Emergency, unit 4B; electrical safety escalation | WO-0001 | PASS |
| 2. Heat not working and freezing, no unit | HVAC, High, unit null; follow-up flagged | WO-0002 | PASS |
| 3. Clogged sink and flickering hallway light in 12C | Two linked tickets: Plumbing/Medium and Electrical/Medium, both unit 12C | WO-0003, WO-0004 | PASS |
| 4. Possible gas smell near stove in 7A | Gas/Safety, Emergency, unit 7A; understated urgency overridden | WO-0005 | PASS |
| 5. Bedroom window will not close in 2D | Structural, Low, unit 2D | WO-0006 | PASS |

The six records produced KPI totals of **6 open work orders, 2 open emergencies, 1 needs follow-up, and 0 completed** before status changes. After one isolated ticket moved to Done, the API totals became **5, 1, 1, and 1**, matching independent database calculations.

## Verification summary

- `npm run typecheck`: passed
- `npm test`: 23 passed, 1 opt-in live test skipped
- `npm run build`: passed
- Clean clone: `npm ci`, typecheck, tests, and build passed
- Fresh clean database backend: `/api/health` and `/` both returned HTTP 200
- Browser: desktop and mobile dashboard/intake/editor checks passed

Known verification limits are documented in `docs/ACCEPTANCE_TEST_REPORT.md`: provider timeout/invalid-JSON/database-I/O fault injection was not run against live infrastructure, and a separately emulated tablet viewport was unavailable.
