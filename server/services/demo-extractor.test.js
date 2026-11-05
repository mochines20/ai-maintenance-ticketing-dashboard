import { describe, expect, it } from "vitest";
import { demoExtract } from "./demo-extractor.js";

describe("demoExtract", () => {
  it("recognizes a unit introduced as 'This is 2D'", () => {
    const result = demoExtract(
      "This is 2D. My bedroom window won't close all the way. Not urgent, whenever you get a chance.",
    );

    expect(result.tickets[0]).toMatchObject({
      issue_type: "Structural",
      priority: "Low",
      unit_number: "2D",
      missing_information: false,
    });
  });

  it("splits a plumbing and electrical report into two tickets", () => {
    const result = demoExtract(
      "Unit 12C here. The kitchen sink is clogged, and the hallway light is flickering.",
    );

    expect(result.tickets).toHaveLength(2);
    expect(result.tickets.map((ticket) => ticket.issue_type)).toEqual([
      "Plumbing",
      "Electrical",
    ]);
  });
});
