# AI-Powered Maintenance Ticketing Dashboard

A full-stack prototype that sends unstructured tenant maintenance reports to a real LLM, validates the structured response, applies deterministic safety rules, stores work orders in SQLite, and displays them in a responsive property-operations dashboard.

## Core capabilities

- React, Vite, and TypeScript frontend
- Node.js and Express REST API
- OpenAI Responses API with strict JSON-schema Structured Outputs
- Zod validation at the request and LLM-output boundaries
- Multiple linked work orders from one tenant report
- Missing-information flags without invented unit numbers
- Deterministic emergency escalation for possible gas leaks, fire or sparking, and water contacting electrical equipment
- Persistent SQLite file with timestamps and default `New` status
- Search, status filters, priority indicators, follow-up badges, and status updates
- Automated API, persistence, safety-rule, and five-report contract tests
- Conditional live-LLM tests covering all five client reports

There is no keyword-parser fallback in the application. If `OPENAI_API_KEY` is absent, ticket creation returns a clear `503 LLM_NOT_CONFIGURED` response instead of fabricating AI results.

## Architecture

```text
React + TypeScript form
         |
         v
Express request validation
         |
         v
OpenAI Structured Outputs
         |
         v
Zod output validation
         |
         v
Deterministic safety escalation
         |
         v
SQLite persistence --> React dashboard and status updates
```

One source report is inserted into `reports`. Each extracted issue is inserted into `tickets` with the same `report_id`, which preserves the relationship between multiple tickets generated from one call.

## Requirements

- Node.js 20 or newer
- npm
- An OpenAI API key with access to the configured model

The default model is `gpt-4o-mini`, configurable through `OPENAI_MODEL`.

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
OPENAI_API_KEY=your_api_key_here
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

The live suite deliberately skips when no key exists; it never substitutes fixed outputs for a provider call.

## API

### Health and LLM readiness

`GET /api/health`

```json
{
  "status": "ok",
  "ai": {
    "configured": true,
    "provider": "openai",
    "model": "gpt-4o-mini"
  }
}
```

### Submit a tenant report

`POST /api/reports`

```json
{
  "report": "Unit 12C has a clogged kitchen sink and a flickering hallway light."
}
```

The response can contain multiple tickets linked by one `reportId`.

### List work orders

`GET /api/tickets`

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

The model response must satisfy both strict JSON Schema and Zod. Before persistence, deterministic rules override unsafe classifications:

- Possible gas or propane leaks become `Gas/Safety` and `Emergency`.
- Smoke, sparking, or fire indicators become `Emergency`.
- Water contacting an outlet, wire, panel, or electrical equipment becomes `Emergency`.
- Loss of heat in freezing conditions becomes at least `High`.
- A missing unit number remains `null` and is flagged for follow-up.

## Test status

Executed on November 5, 2026:

| Check | Result |
| --- | --- |
| TypeScript type check | Passed |
| Production Vite build | Passed |
| Automated test files | 3 passed, 1 skipped |
| Automated test cases | 11 passed, 5 skipped |
| Five-report controlled pipeline suite | 5 passed |
| Live OpenAI five-report suite | 5 skipped because no API key was available |
| Missing-key API behavior | Verified `503 LLM_NOT_CONFIGURED` |
| Responsive UI review | Passed on desktop and mobile layouts |

The five controlled tests exercise API validation, safety escalation, multiple-ticket persistence, missing-information handling, and default status using an injected test double. They do not claim to measure model quality. The separate live suite is the authoritative LLM test and must be run with a real key before submission results are recorded.

See [WALKTHROUGH.md](./WALKTHROUGH.md) for the written walkthrough and submission checklist.

## Security decisions

- Secrets are read only from environment variables.
- `.env` and SQLite runtime files are excluded from Git.
- Request bodies are size-limited and validated.
- Reports are treated as untrusted model input.
- LLM output is schema-constrained and validated again with Zod.
- SQL statements use bound parameters.
- Provider failures return sanitized client messages.
- Express technology headers are disabled.

## Intentional prototype scope

Authentication, work-order assignment, notifications, audit history, production migrations, and voice ingestion are outside the core test scope. Voice input should only be added after the live LLM suite passes.
