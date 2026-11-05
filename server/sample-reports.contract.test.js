import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { sampleReports } from "./sample-reports.js";

const controlledExtractions = {
  1: [
    {
      issue_type: "Plumbing",
      priority: "High",
      unit_number: "4B",
      description: "Major ceiling leak is dripping onto an electrical outlet.",
      missing_information: false,
      missing_fields: [],
    },
  ],
  2: [
    {
      issue_type: "HVAC",
      priority: "Medium",
      unit_number: null,
      description: "Heating is not working and the apartment is freezing.",
      missing_information: false,
      missing_fields: [],
    },
  ],
  3: [
    {
      issue_type: "Plumbing",
      priority: "Medium",
      unit_number: "12C",
      description: "Kitchen sink is clogged.",
      missing_information: false,
      missing_fields: [],
    },
    {
      issue_type: "Electrical",
      priority: "Medium",
      unit_number: "12C",
      description: "Hallway light is flickering.",
      missing_information: false,
      missing_fields: [],
    },
  ],
  4: [
    {
      issue_type: "General",
      priority: "Low",
      unit_number: "7A",
      description: "A possible gas odor was reported near the stove.",
      missing_information: false,
      missing_fields: [],
    },
  ],
  5: [
    {
      issue_type: "Structural",
      priority: "Low",
      unit_number: "2D",
      description: "Bedroom window will not close completely.",
      missing_information: false,
      missing_fields: [],
    },
  ],
};

describe("five client report pipeline contracts", () => {
  let database;

  beforeEach(async () => {
    database = await createDatabase();
  });

  afterEach(async () => {
    await database.close();
  });

  it.each(sampleReports)(
    "processes client report $id through validation, safety rules, and persistence",
    async ({ id, report: reportText, expected }) => {
      const app = createApp({
        database,
        extractor: async () => ({
          processingMode: "openai",
          tickets: controlledExtractions[id],
        }),
      });

      const response = await request(app)
        .post("/api/reports")
        .send({ report: reportText })
        .expect(201);

      const tickets = response.body.tickets;
      expect(tickets).toHaveLength(expected.ticketCount);
      expect(tickets.map((ticket) => ticket.priority).sort()).toEqual(
        [...expected.priorities].sort(),
      );
      expect(tickets.map((ticket) => ticket.issue_type).sort()).toEqual(
        [...expected.issueTypes].sort(),
      );
      expect(tickets.map((ticket) => ticket.unit_number).sort()).toEqual(
        [...expected.unitNumbers].sort(),
      );
      expect(tickets.some((ticket) => ticket.missing_information)).toBe(
        expected.needsFollowUp,
      );
      expect(tickets.every((ticket) => ticket.status === "New")).toBe(true);
    },
  );
});
