import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { LlmConfigurationError, LlmProviderError } from "./services/extractor.js";

describe("maintenance ticket API", () => {
  let database;
  let app;

  beforeEach(async () => {
    database = await createDatabase();
    app = createApp({
      database,
      extractor: async () => ({
        processingMode: "test",
        tickets: [
          {
            issue_type: "Plumbing",
            priority: "High",
            unit_number: "4B",
            description: "Major water leak from the bathroom ceiling.",
            missing_information: false,
            missing_fields: [],
            source_evidence: {
              issue_type: null,
              priority: null,
              unit_number: "4B",
              description: "major bathroom ceiling leak",
            },
          },
        ],
      }),
    });
  });

  afterEach(async () => {
    await database.close();
  });

  it("analyzes without persistence, commits review, lists, and updates a ticket", async () => {
    const analyzed = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "Unit 4B has a major bathroom ceiling leak." })
      .expect(200);

    const beforeCommit = await request(app).get("/api/tickets").expect(200);
    expect(beforeCommit.body.tickets).toHaveLength(0);

    const created = await request(app)
      .post(`/api/intake/${analyzed.body.analysisId}/commit`)
      .send({ tickets: analyzed.body.tickets })
      .expect(201);

    expect(created.body.tickets).toHaveLength(1);
    expect(created.body.tickets[0].status).toBe("New");

    await request(app)
      .post(`/api/intake/${analyzed.body.analysisId}/commit`)
      .send({ tickets: analyzed.body.tickets })
      .expect(404);
    expect((await request(app).get("/api/tickets")).body.tickets).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/tickets/${created.body.tickets[0].id}`)
      .expect(200);
    expect(detail.body.ticket.id).toBe(created.body.tickets[0].id);

    const summaryBeforeStatus = await request(app)
      .get("/api/dashboard/summary")
      .expect(200);
    expect(summaryBeforeStatus.body.summary).toEqual({
      openWorkOrders: 1,
      openEmergencies: 0,
      needsFollowUp: 0,
      completedWorkOrders: 0,
    });

    const listed = await request(app).get("/api/tickets").expect(200);
    expect(listed.body.tickets).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/tickets/${created.body.tickets[0].id}/status`)
      .send({ status: "In Progress" })
      .expect(200);
    expect(updated.body.ticket.status).toBe("In Progress");

    await request(app)
      .patch(`/api/tickets/${created.body.tickets[0].id}/status`)
      .send({ status: "Done" })
      .expect(200);
    const summaryAfterDone = await request(app)
      .get("/api/dashboard/summary")
      .expect(200);
    expect(summaryAfterDone.body.summary.completedWorkOrders).toBe(1);

    const reopened = await request(app)
      .patch(`/api/tickets/${created.body.tickets[0].id}/status`)
      .send({ status: "In Progress" })
      .expect(200);
    expect(reopened.body.ticket.status).toBe("In Progress");
    const summaryAfterReopen = await request(app)
      .get("/api/dashboard/summary")
      .expect(200);
    expect(summaryAfterReopen.body.summary).toMatchObject({
      openWorkOrders: 1,
      completedWorkOrders: 0,
    });
  });

  it("persists a human-reviewed correction without changing the original report", async () => {
    const analyzed = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "This is unit 2D. The bedroom window will not close all the way." })
      .expect(200);

    const reviewedTickets = analyzed.body.tickets.map((ticket) => ({
      ...ticket,
      unit_number: "3B",
    }));
    const created = await request(app)
      .post(`/api/intake/${analyzed.body.analysisId}/commit`)
      .send({ tickets: reviewedTickets })
      .expect(201);

    expect(created.body.tickets[0].unit_number).toBe("3B");

    const refreshed = await request(app)
      .get(`/api/tickets/${created.body.tickets[0].id}`)
      .expect(200);
    expect(refreshed.body.ticket.unit_number).toBe("3B");
    expect(refreshed.body.ticket.original_text).toContain("unit 2D");
  });

  it("rejects reports that are too short", async () => {
    const response = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "Leak" })
      .expect(400);
    expect(response.body.error).toBe("Validation failed.");
  });

  it("orders emergencies first and keeps FIFO order for the remaining queue", async () => {
    const ticket = (priority, description) => ({
      issue_type: priority === "Emergency" ? "Gas/Safety" : "Plumbing",
      priority,
      unit_number: null,
      description,
      missing_information: false,
      missing_fields: [],
    });

    await database.createReportWithTickets({
      report: "First request",
      processingMode: "test",
      tickets: [ticket("Medium", "First non-emergency request")],
    });
    await database.createReportWithTickets({
      report: "Second request",
      processingMode: "test",
      tickets: [ticket("Low", "Second non-emergency request")],
    });
    await database.createReportWithTickets({
      report: "Emergency request",
      processingMode: "test",
      tickets: [ticket("Emergency", "Urgent gas odor reported")],
    });

    const tickets = (await request(app).get("/api/tickets").expect(200)).body.tickets;
    expect(tickets.map((item) => item.description)).toEqual([
      "Urgent gas odor reported",
      "First non-emergency request",
      "Second non-emergency request",
    ]);
  });

  it("rejects invalid status values", async () => {
    await request(app)
      .patch("/api/tickets/1/status")
      .send({ status: "Archived" })
      .expect(400);
  });

  it("rejects a missing or expired review session", async () => {
    await request(app)
      .post("/api/intake/not-a-real-analysis/commit")
      .send({ tickets: [] })
      .expect(404);
  });

  it("returns actionable provider configuration and rate-limit errors", async () => {
    const unavailableApp = createApp({
      database,
      extractor: async () => { throw new LlmConfigurationError(); },
    });
    await request(unavailableApp)
      .post("/api/intake/analyze")
      .send({ report: "The kitchen sink is leaking in unit 4B." })
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe("LLM_NOT_CONFIGURED"));

    const rateLimitedApp = createApp({
      database,
      extractor: async () => { throw new LlmProviderError("rate limited", { status: 429 }); },
    });
    await request(rateLimitedApp)
      .post("/api/intake/analyze")
      .send({ report: "The kitchen sink is leaking in unit 4B." })
      .expect(429)
      .expect(({ body }) => expect(body.code).toBe("LLM_RATE_LIMITED"));
  });

  it("edits saved fields, recalculates follow-up, preserves identity, and records history", async () => {
    const analyzed = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "Unit 4B has a major bathroom ceiling leak." })
      .expect(200);
    const created = await request(app)
      .post(`/api/intake/${analyzed.body.analysisId}/commit`)
      .send({ tickets: analyzed.body.tickets })
      .expect(201);
    const original = created.body.tickets[0];

    const edited = await request(app)
      .patch(`/api/tickets/${original.id}`)
      .send({
        issue_type: "Structural",
        priority: "Emergency",
        unit_number: "2D",
        description: "Bedroom window needs a frame repair.",
        updated_at: original.updated_at,
      })
      .expect(200);

    expect(edited.body.ticket.id).toBe(original.id);
    expect(edited.body.ticket.report_id).toBe(original.report_id);
    expect(edited.body.ticket.created_at).toBe(original.created_at);
    expect(edited.body.ticket.status).toBe("New");
    expect(edited.body.ticket.issue_type).toBe("Structural");
    expect(edited.body.ticket.priority).toBe("Emergency");
    expect(edited.body.ticket.unit_number).toBe("2D");
    expect(edited.body.ticket.original_text).toContain("Unit 4B");
    expect(edited.body.changes.changed_fields.map((change) => change.field)).toEqual(
      expect.arrayContaining(["issue_type", "priority", "unit_number", "description"]),
    );
    expect(database.getTicketChanges(original.id)).toHaveLength(1);

    const cleared = await request(app)
      .patch(`/api/tickets/${original.id}`)
      .send({ unit_number: null, updated_at: edited.body.ticket.updated_at })
      .expect(200);
    expect(cleared.body.ticket.missing_information).toBe(true);
    expect(cleared.body.ticket.missing_fields).toEqual(["unit_number"]);

    const refilled = await request(app)
      .patch(`/api/tickets/${original.id}`)
      .send({ unit_number: "3B", updated_at: cleared.body.ticket.updated_at })
      .expect(200);
    expect(refilled.body.ticket.missing_information).toBe(false);
    expect(refilled.body.ticket.missing_fields).toEqual([]);
  });

  it("rejects invalid edits and prevents stale concurrent overwrites", async () => {
    const analyzed = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "Unit 4B has a major bathroom ceiling leak." })
      .expect(200);
    const created = await request(app)
      .post(`/api/intake/${analyzed.body.analysisId}/commit`)
      .send({ tickets: analyzed.body.tickets })
      .expect(201);
    const ticket = created.body.tickets[0];

    await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .send({ priority: "Urgent", updated_at: ticket.updated_at })
      .expect(400);

    const first = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .send({ description: "Updated description for the leak.", updated_at: ticket.updated_at })
      .expect(200);
    const stale = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .send({ description: "Stale conflicting description.", updated_at: ticket.updated_at })
      .expect(409);
    expect(stale.body.code).toBe("TICKET_CONFLICT");
    expect(first.body.ticket.description).toBe("Updated description for the leak.");
  });

  it("keeps safety emergencies from being downgraded through editing", async () => {
    await database.createReportWithTickets({
      report: "Unit 7A has a gas smell near the stove.",
      processingMode: "test",
      tickets: [{
        issue_type: "Gas/Safety",
        priority: "Emergency",
        unit_number: "7A",
        description: "Possible gas smell near stove.",
        missing_information: false,
        missing_fields: [],
        safety_reason: "Possible gas or propane leak reported.",
      }],
    });
    const ticket = (await request(app).get("/api/tickets").expect(200)).body.tickets[0];

    const response = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .send({ priority: "Low", issue_type: "General", updated_at: ticket.updated_at })
      .expect(200);
    expect(response.body.ticket.priority).toBe("Emergency");
    expect(response.body.ticket.issue_type).toBe("Gas/Safety");
  });

  it("edits one ticket without changing its sibling from the same report", async () => {
    const result = await database.createReportWithTickets({
      report: "Unit 12C has a clogged sink and flickering hallway light.",
      processingMode: "test",
      tickets: [
        { issue_type: "Plumbing", priority: "Medium", unit_number: "12C", description: "Clogged kitchen sink.", missing_information: false, missing_fields: [] },
        { issue_type: "Electrical", priority: "Low", unit_number: "12C", description: "Flickering hallway light.", missing_information: false, missing_fields: [] },
      ],
    });
    const [first, second] = result.tickets;

    const edited = await request(app)
      .patch(`/api/tickets/${first.id}`)
      .send({ description: "Clogged kitchen sink needs clearing.", updated_at: first.updated_at })
      .expect(200);
    const sibling = await request(app).get(`/api/tickets/${second.id}`).expect(200);

    expect(edited.body.ticket.report_id).toBe(second.report_id);
    expect(sibling.body.ticket.description).toBe("Flickering hallway light.");
    expect(sibling.body.ticket.priority).toBe("Low");
  });
});

