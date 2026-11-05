# Maintenance Ticketing Dashboard Walkthrough

## What the prototype does

The application accepts a caller or tenant maintenance report, sends it to OpenAI for structured extraction, validates the result, applies deterministic safety rules, and writes one or more work orders to SQLite. The dashboard then shows the tickets with priority, follow-up state, unit number, timestamps, and an editable workflow status.

## Request flow

1. The React and TypeScript form sends the report to `POST /api/reports`.
2. Zod validates and sanitizes the input.
3. The backend calls the OpenAI Responses API using strict JSON-schema Structured Outputs.
4. Zod validates the model result independently of the provider schema.
5. Safety rules escalate possible gas leaks and dangerous electrical conditions.
6. The source report is saved once, and each extracted issue is saved as a linked ticket.
7. Tickets appear in the dashboard with default status `New`.
8. A property manager can change status to `In Progress` or `Done`.

## Handling important edge cases

### Missing information

The prompt forbids inventing missing facts. `unit_number` is nullable. If it is absent, the ticket stores `null`, sets `missing_information` to `true`, records `unit_number` in `missing_fields`, and displays a follow-up badge.

### Multiple issues

The response schema contains a `tickets` array. A mixed plumbing and electrical report should produce two ticket rows sharing the same `report_id`.

### Understated urgency

The model's classification is not the final safety decision. A deterministic post-processing layer checks the original report and extracted description. Possible gas odors and water contacting electrical equipment are forced to `Emergency`, even when the caller says the situation is probably not serious.

## Five required scenarios

| Report | Expected behavior |
| --- | --- |
| Water leak dripping onto an outlet in 4B | One Plumbing ticket, Emergency, unit 4B |
| No heat and freezing, no unit given | One HVAC ticket, High, null unit, needs follow-up |
| Clogged sink and flickering hallway light in 12C | Two linked tickets: Plumbing and Electrical |
| Possible gas smell in 7A, urgency minimized | One Gas/Safety ticket forced to Emergency |
| Window will not close in 2D, not urgent | One Structural ticket, Low, unit 2D |

## Actual verification performed

The following commands were executed successfully on November 5, 2026:

```bash
npm run typecheck
npm test
npm run build
```

Results:

- TypeScript type check passed.
- Production build passed.
- 11 automated tests passed.
- Five controlled pipeline tests covered all client reports.
- The API/database/status/safety-rule tests passed.
- The dashboard was visually inspected in desktop and mobile layouts.
- The missing-key path was exercised and correctly returned `503 LLM_NOT_CONFIGURED`.

## Verification not performed

No `OPENAI_API_KEY` was available in the implementation environment. Therefore, the five live OpenAI calls were not executed and no live model outputs are presented as test results. The live integration suite exists at `server/services/extractor.integration.test.js`; Vitest reported its five cases as skipped.

After adding a key, run:

```bash
npm run test:live-ai
```

Record the resulting five outputs and update this walkthrough before final submission. If a live result differs only in wording but satisfies the required fields and behavior, adjust the assertions conservatively; do not replace the provider call with fixed output.

## Submission checklist

- [x] React, Vite, and TypeScript frontend
- [x] Node.js and Express backend
- [x] Persistent SQLite database
- [x] Real OpenAI Structured Outputs integration
- [x] Zod request and LLM-output validation
- [x] Multiple linked tickets
- [x] Missing-information handling
- [x] Deterministic emergency escalation
- [x] Responsive dashboard and status updates
- [x] Automated tests for the full non-network pipeline
- [x] Conditional live tests for all five client reports
- [x] README and `.env.example`
- [x] No secrets or runtime database committed
- [ ] Add a real `OPENAI_API_KEY` locally
- [ ] Execute `npm run test:live-ai`
- [ ] Record the actual five model outputs
- [ ] Record a Loom video or use this written walkthrough
- [ ] Email the public repository link to the recruiter
