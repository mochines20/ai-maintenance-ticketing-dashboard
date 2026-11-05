import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

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
});

