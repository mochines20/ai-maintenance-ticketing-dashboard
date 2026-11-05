# AI-Powered Maintenance Ticketing Dashboard

A working full-stack prototype that converts unstructured tenant maintenance reports into validated work-order tickets, saves them in SQLite, and displays them in a responsive operations dashboard.

## Features

- Tenant report intake through a web form and REST API
- OpenAI Structured Outputs for schema-constrained ticket extraction
- Separate tickets for multiple issues in a single report
- Deterministic safety escalation for gas leaks, electrical hazards, and loss of heat
- Zod validation before any AI-generated data reaches the database
- SQLite persistence with timestamps and a default `New` status
- Priority badges, missing-information indicators, search, and status filters
- Status updates for `New`, `In Progress`, and `Done`
- Local demo parser so reviewers can run the complete workflow without an API key
- Automated API and safety-rule tests

## Architecture

```text
Tenant report
    |
    v
Express API -> OpenAI Structured Output -> Zod validation -> Safety rules
                                                        |
                                                        v
                                                   SQLite file
                                                        |
                                                        v
                                              React operations dashboard
```

The model is responsible for understanding natural language and splitting distinct issues. A deterministic post-processing layer then verifies urgent safety conditions. This prevents a caller's understated wording from lowering the priority of a possible gas leak or a water-and-electricity hazard.

## Technology

- React 19 and Vite
- Node.js and Express
- OpenAI Responses API
- Zod
- SQLite through `sql.js`
- Vitest and Supertest

## Local setup

### Requirements

- Node.js 20 or newer
- npm
- An OpenAI API key for live AI extraction (optional for demo mode)

### Installation

```bash
git clone https://github.com/mochines20/ai-maintenance-ticketing-dashboard.git
cd ai-maintenance-ticketing-dashboard
npm install
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env` instead of `copy`.

Add an API key to `.env` for live extraction:

```env
AI_MODE=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

Never commit `.env` or a real API key. To run without a key, keep `AI_MODE=auto`; the application will use its documented deterministic demo parser.

### Development

```bash
npm run dev
```

- Dashboard: http://localhost:5173
- API: http://localhost:3001

### Production-style local run

```bash
npm run build
npm start
```

Open http://localhost:3001.

### Tests

```bash
npm test
```

## API

### Create work orders

`POST /api/reports`

```json
{
  "report": "Unit 12C has a clogged sink and a flickering hallway light."
}
```

One report can return multiple tickets.

### List tickets

`GET /api/tickets`

### Change ticket status

`PATCH /api/tickets/:id/status`

```json
{
  "status": "In Progress"
}
```

## Sample report walkthrough

| Report | Expected handling |
| --- | --- |
| Water leak dripping onto an outlet in 4B | Plumbing ticket, `Emergency`, unit 4B |
| No heat and freezing, unit omitted | HVAC ticket, `High`, unit remains `null`, follow-up flag |
| Clogged sink and flickering hallway light in 12C | Two tickets: Plumbing and Electrical, linked to one report |
| Possible gas smell in 7A, caller says it may be nothing | Gas/Safety ticket, forced to `Emergency` |
| Window will not close in 2D and is not urgent | Structural ticket, `Low` |

### Missing information

The extractor never guesses a missing unit number. It stores `null`, sets `missing_information` to `true`, records `unit_number` in `missing_fields`, and shows a follow-up badge in the dashboard.

### Multiple issues

The structured AI response is an array of tickets. A single report is stored once, while every extracted issue becomes a separate linked work order.

### Understated urgency

AI output is not trusted by itself. Safety rules run after extraction and before persistence. Gas-related odors, smoke or sparking, and water contacting electrical equipment are escalated to `Emergency` regardless of the caller's wording.

## Security decisions

- Secrets are loaded only from environment variables.
- `.env` is excluded from Git; `.env.example` contains no real values.
- Request bodies are size-limited and validated.
- AI output must pass strict JSON schema and Zod validation.
- Reports are treated as untrusted content in the model instructions.
- SQL values use bound parameters.
- Express technology headers are disabled.

## Project scope

This is intentionally a focused prototype. Authentication, team assignments, notifications, audit logs, production migrations, and voice intake would be appropriate next steps for a production system.

