import { describe, expect, it } from "vitest";
import { applySafetyRules } from "./safety-rules.js";

const baseTicket = {
  issue_type: "General",
  priority: "Low",
  unit_number: "1A",
  description: "Maintenance issue was reported.",
  missing_information: false,
  missing_fields: [],
};

describe("applySafetyRules", () => {
  it("escalates possible gas leaks even when the caller minimizes urgency", () => {
    const [ticket] = applySafetyRules(
      "It is probably nothing, but I smell gas near the stove.",
      [baseTicket],
    );
    expect(ticket.priority).toBe("Emergency");
    expect(ticket.issue_type).toBe("Gas/Safety");
  });

  it("escalates water contacting electrical equipment", () => {
    const [ticket] = applySafetyRules(
      "Water is dripping from the ceiling onto an outlet.",
      [baseTicket],
    );
    expect(ticket.priority).toBe("Emergency");
  });

  it("marks a missing unit for follow-up without inventing one", () => {
    const [ticket] = applySafetyRules("The heat is not working and it is freezing.", [
      { ...baseTicket, unit_number: null },
    ]);
    expect(ticket.unit_number).toBeNull();
    expect(ticket.missing_information).toBe(true);
    expect(ticket.missing_fields).toContain("unit_number");
    expect(ticket.priority).toBe("High");
  });
});

