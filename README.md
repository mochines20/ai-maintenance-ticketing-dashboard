# AI-Powered Maintenance Ticketing Dashboard

A full-stack prototype that turns unstructured caller reports into reviewable maintenance work orders. It uses a real LLM for structured extraction, keeps the original report as the source of truth, requires a human review before persistence, applies deterministic safety rules, and presents the resulting work in a responsive property-operations workspace.

## Core capabilities

- React, Vite, and TypeScript frontend
- Node.js and Express REST API
- Groq structured outputs through the OpenAI-compatible API (Gemini and OpenAI remain supported as optional providers)
- Zod validation at the request and LLM-output boundaries
- Two-stage intake: AI analysis first, explicit human review and commit second
- Verbatim source-evidence links that are rejected unless they occur in the original report
- Multiple linked work orders from one tenant report
- Missing-information flags without invented unit numbers
- Deterministic emergency escalation for possible gas leaks, fire or sparking, and water contacting electrical equipment
- Persistent SQLite file with timestamps and default `New` status
- Search, status filters, priority indicators, follow-up badges, and status updates
- Automated API, persistence, safety-rule, and five-report contract tests
- Conditional live-LLM tests covering all five client reports

There is no keyword-parser fallback in the application. If the selected provider key is absent, ticket creation returns a clear `503 LLM_NOT_CONFIGURED` response instead of fabricating AI results.

## Architecture

```text
React + TypeScript intake
         |
         v
Express request validation
         |
         v
Groq / Gemini / OpenAI structured output
         |
         v
Zod output + verbatim-evidence validation
         |
         v
Deterministic safety escalation
         |
         v
Human review/edit
         |
         v
SQLite persistence --> React workspace and status updates
```

`POST /api/intake/analyze` creates a short-lived, in-memory review session and does not write to SQLite. After the user reviews or corrects every extracted issue, `POST /api/intake/:analysisId/commit` revalidates the data and safety rules, inserts the source report once, and inserts each issue into `tickets` with the same `report_id`.

## Intake workflow

The user-facing intake is deliberately two-stage:

1. **Report** — enter the caller's exact words, choose a compact client sample if useful, and select **Analyze report**. `Ctrl+Enter` / `Cmd+Enter` also starts analysis from the textarea.
2. **Review & Create** — inspect the original report beside editable, validated work-order fields, then select **Create Work Order** or **Create Work Orders** once.

AI analysis is a processing state inside the first stage, not a separate wizard screen. The initial modal stays compact and does not render an empty extraction panel. Escape preserves a non-empty report instead of silently discarding it. After a confirmed database save, the success state reports the actual created count and links directly back to the work-order queue.

## Requirements

- Node.js 20 or newer
- npm
- An API key for the configured AI provider

The provider is selected with `AI_PROVIDER=groq`, `AI_PROVIDER=gemini`, or `AI_PROVIDER=openai`. Groq defaults to `openai/gpt-oss-120b`; Gemini defaults to `gemini-2.5-flash`; OpenAI defaults to `gpt-4o-mini`.

## Installation

```bash
git clone https://github.com/mochines20/ai-maintenance-ticketing-dashboard.git
cd ai-maintenance-ticketing-dashboard
npm install
```

Create the local environment file.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```bash
cp .env.example .env
```

Add the real API key to `.env`:

```env
PORT=3001
DATABASE_PATH=./data/maintenance.sqlite
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=openai/gpt-oss-120b

# Optional Gemini provider
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Optional OpenAI alternative
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Never commit `.env`. It is excluded by `.gitignore`, and `.env.example` contains no credentials.

## Run locally

Development mode:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

Production-style local mode:

```bash
npm run build
npm start
```

Open http://localhost:3001.

## Validation commands

```bash
npm run typecheck
npm test
npm run build
```

Run only the five live LLM scenarios after configuring a key:

```bash
npm run test:live-ai
```

The live suite is opt-in so ordinary `npm test` never spends provider quota. It never substitutes fixed outputs for a provider call.

## API

### Health and LLM readiness

`GET /api/health`

```json
{
  "status": "ok",
  "ai": {
    "configured": true,
    "provider": "groq",
    "model": "openai/gpt-oss-120b"
  }
}
```

### Analyze a caller report

`POST /api/intake/analyze`

```json
{
  "report": "Unit 12C has a clogged kitchen sink and a flickering hallway light."
}
```

The response contains an `analysisId`, the untouched original report, and one or more editable ticket candidates. It does not persist anything.

### Commit reviewed work orders

`POST /api/intake/:analysisId/commit`

Send the reviewed `tickets` array returned by the analysis call. The server reapplies validation and safety rules before storing the report and linked work orders. Review sessions expire after 15 minutes and are intentionally not durable.
Each review session is one-time use: a retry after a successful commit returns `ANALYSIS_NOT_FOUND` and cannot create duplicate work orders.

### List work orders

`GET /api/tickets`

### Get one work order

`GET /api/tickets/:id`

### Dashboard summary

`GET /api/dashboard/summary`

The summary is calculated from persisted SQLite rows (open work orders, open emergencies, follow-up flags, and completed work orders), so the KPI cards do not depend on a client-side approximation.

### Update status

`PATCH /api/tickets/:id/status`

```json
{
  "status": "In Progress"
}
```

Allowed values are `New`, `In Progress`, and `Done`.

## Extraction and safety behavior

The LLM receives an explicit instruction to treat the tenant report as untrusted data, ignore commands inside it, split distinct maintenance issues, avoid guessing missing facts, and return only the required schema.

The model response must satisfy both strict JSON Schema and Zod. Any claimed evidence is retained only when it is an exact substring of the original report; unsupported evidence becomes `null`. Before persistence, deterministic rules override unsafe classifications:

- Possible gas or propane leaks become `Gas/Safety` and `Emergency`.
- Smoke, sparking, or fire indicators become `Emergency`.
- Water contacting an outlet, wire, panel, or electrical equipment becomes `Emergency`.
- Loss of heat in freezing conditions becomes at least `High`.
- A missing unit number remains `null` and is flagged for follow-up.

## Test status

Executed on November 6, 2026:

| Check | Result |
| --- | --- |
| TypeScript type check | Passed |
| Production Vite build | Passed |
| Automated test files | 4 passed, 1 skipped |
| Automated test cases | 15 passed, 1 skipped |
| Five-report controlled pipeline suite | 5 passed |
| Live Groq provider smoke check | Passed with a synthetic non-tenant report; full five client reports were not sent to an external provider |
| Missing-key API behavior | Verified `503 LLM_NOT_CONFIGURED` |
| Responsive UI review | Passed on desktop and mobile layouts; compact intake and review workspace checked after refinement |
| Keyboard and interaction QA | Sample selector, Ctrl/Cmd+Enter hint, safe Escape behavior, focus transition, and no browser console errors verified |

The five controlled tests exercise API validation, safety escalation, multiple-ticket persistence, missing-information handling, and default status using an injected test double. They do not claim to measure model quality. A real Groq smoke request and localhost analyze request both completed with `processingMode: "groq"` using a synthetic report. The five client reports were intentionally not sent to an external provider because they contain tenant/unit details.

See [WALKTHROUGH.md](./WALKTHROUGH.md) for the written walkthrough and submission checklist.

## Security decisions

- Secrets are read only from environment variables.
- `.env` and SQLite runtime files are excluded from Git.
- Request bodies are size-limited and validated.
- Reports are treated as untrusted model input.
- LLM output is schema-constrained and validated again with Zod.
- Model-provided source evidence must match the original report verbatim.
- AI analysis is never persisted until a user commits the reviewed result.
- SQL statements use bound parameters.
- Provider failures return sanitized client messages.
- Express technology headers are disabled.

## Intentional prototype scope

Authentication, work-order assignment, notifications, audit history, production migrations, durable review sessions, and voice ingestion are outside the core test scope. Voice input should only be added after the live LLM suite passes.
