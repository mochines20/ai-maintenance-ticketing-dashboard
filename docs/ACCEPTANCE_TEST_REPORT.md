# Maintenance Desk — Five-Report End-to-End Acceptance Test

**Execution date:** November 6, 2026 (Asia/Manila)
**Decision:** **CONDITIONAL PASS — Ready for client submission with documented non-live fault-injection limitations**

## A. Test environment

- Frontend: React 19, Vite, TypeScript
- Backend: Node.js, Express 5
- Database: SQLite persistence through `sql.js`
- Active AI provider: Groq
- Model: `openai/gpt-oss-120b`
- Local URLs: `http://localhost:5173/workspace`, `http://localhost:3001/api/health`
- Production database protection: acceptance runner used a fresh temporary SQLite database under the OS temp directory; the existing `data/maintenance.sqlite` was not reset, truncated, or written.
- Live run: the final acceptance pass sent each of the five exact client reports once through the configured Groq provider. Two earlier diagnostic passes were used only to identify and retest the extraction safeguards described in the defect log. Provider responses were parsed through the provider JSON schema, Zod, source-evidence validation, deterministic safety rules, review commit, SQLite persistence, and retrieval.
- Deterministic run: `npm test` uses injected providers for repeatable API, safety, transaction, status, and contract checks.
- Browser run: desktop Edge and the in-app browser mobile viewport were inspected against the running localhost application.

## B. Requirements traceability matrix

| Requirement | Test IDs | Actual result | Outcome | Evidence |
| --- | --- | --- | --- | --- |
| Real structured AI extraction | AT-01–AT-05 | All five exact reports returned structured tickets from Groq. | PASS | Live run output below; provider/model recorded. |
| Missing facts are not invented | AT-02, AT-05, AT-10 | AT-02 retained `unit_number: null`; AT-05 explicit `2D` was recovered only from an exact source token after the first live miss. | PASS | `extractor.js` explicit-token guard; retest output. |
| Multiple issues become linked tickets | AT-03 | Two tickets (`3`, `4`) shared one report and were committed together. | PASS | `report_id` relationship and two saved IDs. |
| Deterministic emergency escalation | AT-01, AT-04 | Water/electrical and possible gas were both forced to Emergency with safety reasons. | PASS | Safety results below and safety-rule tests. |
| Review before persistence | AT-01–AT-06 | Analyze did not persist; commit persisted only after reviewed payload. | PASS | API flow and duplicate commit test. |
| SQLite persistence and timestamps | AT-01–AT-05, AT-08 | All six acceptance tickets were retrieved after commit with default `New`. | PASS | Saved IDs and persisted record checks. |
| Status lifecycle | AT-07 | `New → In Progress → Done` persisted; invalid and missing IDs returned errors. | PASS | 200/400/404 results below. |
| KPI definitions | AT-08 | Independent counts matched summary API exactly before and after lifecycle changes. | PASS | `6/2/1/0` before status changes. |
| Active queue, FIFO, filters, pagination | AT-09 | Default Open view, emergency-first FIFO, status/priority/text filters, and five-item pagination are implemented and regression-tested. | PASS | Browser snapshot and client implementation. |
| Error handling and recovery | AT-10 | Missing-key and rate-limit responses are explicit; duplicate and rollback paths verified. | PASS with limits | Controlled tests; provider timeout/invalid JSON/DB I/O fault injection not live-tested. |
| Responsive/accessibility behavior | AT-11 | Desktop and mobile views loaded; text labels, status text, keyboard-oriented controls, dialog stages, and reduced-motion CSS inspected. | PASS | Browser screenshots/snapshots; tablet-specific viewport emulation was not available. |

## C. Five client report results

The following are the **retest** results after the two defects found in the initial live run were fixed. Analyze and commit status were `200` and `201` for every case.

### AT-01 — Water leak and electrical hazard

- Input: “Hi, this is apartment 4B. There is a major water leak coming from the ceiling in the bathroom and it's dripping onto the outlet!”
- Groq request timestamp: `2026-11-06T00:15:19.958Z`; duration: 1,930 ms
- Extracted: one `Plumbing` ticket, `Emergency`, unit `4B`, missing information `false`.
- Description: “Water leak from bathroom ceiling dripping onto outlet.”
- Safety: “Water was reported near electrical equipment.”
- Saved work order: `WO-0001`; retrieved record matched the reviewed extraction and original report.
- Default status: `New`.
- Outcome: **PASS**.

### AT-02 — Heating failure with missing unit

- Input: “Hey, the heat isn't working in my place and it's freezing. Can someone come today?”
- Groq request timestamp: `2026-11-06T00:15:21.904Z`; duration: 1,120 ms
- Extracted: one `HVAC` ticket, `High`, `unit_number: null`.
- Missing information: `true`; `missing_fields: ["unit_number"]`.
- Saved work order: `WO-0002`; retrieved record kept the unit null and the original report unchanged.
- Outcome: **PASS**.

### AT-03 — Multiple issues in one call

- Input: “Unit 12C here. The kitchen sink is clogged, and also the hallway light outside my door has been flickering for a week.”
- Groq request timestamp: `2026-11-06T00:15:23.036Z`; duration: 3,026 ms
- Extracted two separate tickets:
  - `WO-0003`: `Plumbing`, `Medium`, unit `12C`, “Kitchen sink is clogged.”
  - `WO-0004`: `Electrical`, `Low`, unit `12C`, “Hallway light outside the door is flickering.”
- The two priorities are both appropriate non-emergency classifications for the client brief; no fixed AT-03 priority was required.
- Both were committed through one request, shared the same source report, and started as `New`.
- Outcome: **PASS**.

### AT-04 — Understated possible gas leak

- Input: “Yeah hi, so um, I'm in 7A, and I don't know if it's a big deal, but there's kind of a weird smell near the stove, like maybe gas? My neighbor said it's probably nothing but I wanted to call anyway.”
- Groq request timestamp: `2026-11-06T00:15:26.076Z`; duration: 1,384 ms
- Extracted: one `Gas/Safety` ticket, `Emergency`, unit `7A`, missing information `false`.
- Safety: “Possible gas or propane leak reported.”
- Saved work order: `WO-0005`; retrieved record remained Emergency.
- Outcome: **PASS**.

### AT-05 — Low-priority window repair

- Input: “This is 2D. My bedroom window won't close all the way. Not urgent, whenever you get a chance.”
- Groq request timestamp: `2026-11-06T00:15:27.469Z`; duration: 1,587 ms
- Extracted: one `Structural` ticket, `Low`, unit `2D`, missing information `false`.
- Saved work order: `WO-0006`; retrieved record preserved unit `2D` and original report.
- Outcome: **PASS**.

## D. Additional functional tests

### AT-06 — Manual correction acceptance

The live analysis initially returned unit `2D`. The reviewed payload intentionally changed it to `3B`. Temporary acceptance record `WO-0008` and its subsequent GET returned `3B`, while `original_text` still contained `2D`. **PASS.**

### AT-07 — Status lifecycle

On an isolated ticket, PATCH requests for `In Progress` and `Done` returned `200`; GET requests confirmed each persisted value. Invalid status returned `400` (`Validation failed.`). A nonexistent ticket returned `404` (`Ticket not found.`). The browser inspector and queue use the server-confirmed response. **PASS.**

### AT-08 — KPI reconciliation

For the six tickets created by AT-01–AT-05, independent calculations matched `/api/dashboard/summary` exactly:

| State | Open work orders | Open emergencies | Needs follow-up | Completed |
| --- | ---: | ---: | ---: | ---: |
| Before status changes | 6 | 2 | 1 | 0 |
| After one ticket became Done | 5 | 1 | 1 | 1 |

The live browser loaded the current production database and displayed its matching current values (`1`, `1`, `0`, `0`). **PASS.**

### AT-09 — Filtering and sorting

The default browser view showed `Open` and the queue label `Emergency first, then oldest request`. The UI now exposes status, priority, and text-search filters, plus FIFO/newest/unit sorting and five-ticket pagination. The implementation resets pagination when filters/search/sort change. **PASS.**

### AT-10 — Negative and failure testing

- Short/invalid report: `400` validation response covered by automated tests.
- Missing provider key: `503 LLM_NOT_CONFIGURED` covered by automated tests.
- Provider rate limit: controlled `429 LLM_RATE_LIMITED` test passed.
- Invalid status: `400` covered.
- Missing analysis session: `404` covered.
- Duplicate commit: repeated commit returned `404`; ticket count did not duplicate.
- Invalid multi-ticket commit: `400`; ticket count before and after was unchanged, confirming rollback/no partial save.
- Provider timeout, malformed provider JSON, invalid credential against the network, and simulated database I/O failure were **not** executed against live infrastructure. **PASS with documented test limitation.**

### AT-11 — UI and accessibility

- Desktop Edge: dashboard, KPI cards, attention queue, inspector, status select, source report, and New Report dialog rendered without critical errors.
- Mobile in-app browser viewport: KPI cards reflowed to two columns, the queue controls remained usable, and the page was inspected for overflow.
- Intake modal: compact Report stage and two-stage `Review & Create` workflow were visually confirmed.
- Text labels are present for status/priority; controls expose accessible names; reduced-motion CSS is present.
- Tablet-specific viewport emulation and screenshot capture were not available in the browser tool. **PASS with limitation.**

## E. Defects identified and retested

### DEF-001 — Explicit unit omitted by live extraction

- Related test: AT-05
- Severity: High (mandatory field extraction)
- Reproduction: first live Groq run returned `unit_number: null` for the exact text “This is 2D.”
- Expected: unit `2D`, no follow-up.
- Actual: null unit and follow-up flag.
- Fix: added a narrow post-processing guard that recovers a unit only when an exact unit token is present in the original report; this does not infer locations or replace the LLM.
- Retest: second live run returned `2D`, `missing_information: false`, and persisted `WO-0006` correctly.

### DEF-002 — False follow-up fields from valid model output

- Related test: AT-03
- Severity: Medium
- Reproduction: first live run returned valid `Medium` priorities but included `priority` in `missing_fields`.
- Expected: both tickets complete with no follow-up.
- Actual: both tickets were incorrectly flagged for follow-up.
- Fix: normalized follow-up state from the only nullable required field (`unit_number`) at the deterministic safety/validation boundary.
- Retest: second live run returned both tickets with `missing_information: false` and empty `missing_fields`.

## F. Evidence and commands

Executed successfully:

```text
npm run typecheck
npm test
npm run build
node scripts/acceptance-live-run.mjs
```

Final automated totals for the acceptance baseline: **4 test files passed, 19 tests passed, 1 opt-in live test skipped**. The subsequent post-creation editing regression added four focused scenarios, bringing the current suite to **23 tests passed, 1 skipped**. The skipped test is the ordinary `npm test` live-suite gate; the acceptance runner separately executed all five live reports and persistence checks.

Sanitized localhost checks:

```text
GET http://localhost:3001/api/health -> 200
AI configured: true; provider: groq; model: openai/gpt-oss-120b
GET http://localhost:5173/workspace -> 200
```

No API key, secret, or current production database contents were written to this report.

## G. Limitations and final decision

The five mandatory live scenarios, persistence, deterministic safety behavior, human correction, status lifecycle, KPI reconciliation, duplicate prevention, rollback, and browser desktop/mobile checks all passed after the two targeted fixes. The remaining limitations are controlled fault-injection for provider timeout/invalid JSON/database I/O and the lack of a separately emulated tablet viewport. These are nonblocking for the current prototype but should be exercised before a production rollout.

**Final acceptance decision: CONDITIONAL PASS.** The application is ready for client submission as a verified prototype, with the limitations above explicitly recorded.
