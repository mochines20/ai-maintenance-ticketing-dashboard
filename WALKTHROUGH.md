# Maintenance Ticketing Dashboard Walkthrough

## What the prototype does

The application accepts a caller or tenant maintenance report, sends it to the configured Groq, Gemini, or OpenAI provider for structured extraction, and presents the result beside the original report for human review. The reviewer can correct fields, add a missed issue, remove an extra issue, and inspect the exact source phrase behind an extracted value. Only an explicit commit writes one or more linked work orders to SQLite. The workspace then shows priority, follow-up state, unit number, timestamps, original context, and editable status.

## Request flow

1. The React and TypeScript intake sends the report to `POST /api/intake/analyze`.
2. Zod validates and sanitizes the input.
3. The backend calls Groq Chat Completions with strict JSON-schema structured output (Gemini Generate Content and OpenAI Responses remain optional providers).
4. Zod validates the model result independently of the provider schema, and claimed evidence is kept only when it appears verbatim in the report.
5. Safety rules escalate possible gas leaks and dangerous electrical conditions.
6. The analysis is held in a 15-minute in-memory review session; SQLite remains unchanged.
7. The user reviews or edits the issues and sends them to `POST /api/intake/:analysisId/commit`.
8. The server revalidates the reviewed data and safety rules, saves the source report once, and saves every issue as a linked ticket with default status `New`.
9. A property manager can search, filter, inspect the source report, and change status to `In Progress` or `Done`.

The review token is consumed after a successful commit, so repeating the same commit cannot create a second copy of the work orders.

## Workspace design

The interface is intentionally a work surface rather than a decorative dashboard: warm neutral background, low-saturation semantic color, compact operational type, a four-card summary, a prioritized queue, and a persistent ticket inspector. Intake now uses two user-facing stages—`Report` and `Review & Create`. The initial modal is compact and contains only the caller report, sample selector, validation feedback, and Analyze action. After analysis it expands into a two-panel review workspace so the original words and structured extraction remain visible together. Motion is limited to short state transitions and respects `prefers-reduced-motion`.

The report field supports `Ctrl+Enter` / `Cmd+Enter` to analyze, while Escape only dismisses an empty entry state (entered text is preserved rather than silently discarded). A successful save reports the actual number of work orders and offers a direct View work orders action.

## Handling important edge cases

### Missing information

The prompt forbids inventing missing facts. `unit_number` is nullable. If it is absent, the ticket stores `null`, sets `missing_information` to `true`, records `unit_number` in `missing_fields`, and displays a follow-up badge.

### Multiple issues

The response schema contains a `tickets` array. A mixed plumbing and electrical report should produce two ticket rows sharing the same `report_id`.

### Understated urgency

The model's classification is not the final safety decision. A deterministic post-processing layer checks the original report and extracted description. Possible gas odors and water contacting electrical equipment are forced to `Emergency`, even when the caller says the situation is probably not serious.

### Unsupported AI evidence

The extraction schema asks the model for short source phrases for issue type, priority, unit, and description. The server compares each phrase with the untouched report and replaces it with `null` unless it is present verbatim. The UI can therefore highlight only real source text and never manufactured evidence.

### Review before persistence

Analysis and persistence are separate API actions. This prevents an unreviewed extraction from entering the work queue and allows normal corrections without editing the original caller report. Commit re-runs validation and deterministic escalation, so a reviewer cannot accidentally downgrade a gas or electrical emergency.

## Five required scenarios

| Report | Expected behavior |
| --- | --- |
| Water leak dripping onto an outlet in 4B | One Plumbing ticket, Emergency, unit 4B |
| No heat and freezing, no unit given | One HVAC ticket, High, null unit, needs follow-up |
| Clogged sink and flickering hallway light in 12C | Two linked tickets: Plumbing and Electrical |
| Possible gas smell in 7A, urgency minimized | One Gas/Safety ticket forced to Emergency |
| Window will not close in 2D, not urgent | One Structural ticket, Low, unit 2D |

## Actual verification performed

The following commands were executed successfully on November 6, 2026:

```bash
npm run typecheck
npm test
npm run build
```

Results:

- TypeScript type check passed.
- Production build passed.
- 15 automated tests passed across four test files.
- Five controlled pipeline tests covered all client reports.
- The API/database/status/safety-rule and source-evidence tests passed.
- The dashboard and compact two-stage intake were visually inspected in desktop and mobile layouts.
- Sample selection, report preservation on Escape, the reduced two-stage indicator, normal-user AI-unavailable messaging, and browser console output were checked in the live local preview.
- The missing-key path remains covered and returns `503 LLM_NOT_CONFIGURED` when the selected provider has no key.
- The previous Gemini key produced one real structured extraction before Google rejected further calls for free-tier quota exhaustion; Groq is now the active local provider.
- A real Groq smoke extraction and localhost analyze request completed with a synthetic, non-tenant report.

## Verification not performed

The live integration suite exists at `server/services/extractor.integration.test.js`. The active provider is now Groq, configured through the server-only `GROQ_API_KEY`. The five client reports were not sent to Groq because they contain tenant/unit details; only the synthetic smoke request was run against the external provider.

After adding a key, run:

```bash
npm run test:live-ai
```

Record the resulting five outputs and update this walkthrough before final submission. If a live result differs only in wording but satisfies the required fields and behavior, adjust the assertions conservatively; do not replace the provider call with fixed output.

## Submission checklist

- [x] React, Vite, and TypeScript frontend
- [x] Node.js and Express backend
- [x] Persistent SQLite database
- [x] Real Groq structured-output integration (Gemini and OpenAI remain optional providers)
- [x] Zod request and LLM-output validation
- [x] Multiple linked tickets
- [x] Missing-information handling
- [x] Deterministic emergency escalation
- [x] Human review before database persistence
- [x] Verbatim source-evidence validation and highlighting
- [x] Responsive dashboard and status updates
- [x] Automated tests for the full non-network pipeline
- [x] Conditional live tests for all five client reports
- [x] README and `.env.example`
- [x] No secrets or runtime database committed
- [x] Add a real `GROQ_API_KEY` locally without committing it
- [ ] Run `npm run test:live-ai` with the active Groq provider after explicitly approving external submission of the five client reports
- [ ] Record all five live model outputs
- [ ] Record a Loom video or use this written walkthrough
- [ ] Email the public repository link to the recruiter
