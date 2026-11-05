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

    const listed = await request(app).get("/api/tickets").expect(200);
    expect(listed.body.tickets).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/tickets/${created.body.tickets[0].id}/status`)
      .send({ status: "In Progress" })
      .expect(200);
    expect(updated.body.ticket.status).toBe("In Progress");
  });

  it("rejects reports that are too short", async () => {
    const response = await request(app)
      .post("/api/intake/analyze")
      .send({ report: "Leak" })
      .expect(400);
    expect(response.body.error).toBe("Validation failed.");
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

