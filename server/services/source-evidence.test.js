import { describe, expect, it } from "vitest";
import { validateSourceEvidence } from "./source-evidence.js";

describe("source evidence validation", () => {
  it("returns the exact source casing when the model evidence is present", () => {
    const report = "Caller in Unit 4B reports Water Dripping onto the outlet.";

    const [result] = validateSourceEvidence(report, [{
      source_evidence: {
        issue_type: "water dripping",
        priority: null,
        unit_number: "unit 4b",
        description: "the outlet",
      },
    }]);

    expect(result.source_evidence).toEqual({
      issue_type: "Water Dripping",
      priority: null,
      unit_number: "Unit 4B",
      description: "the outlet",
    });
  });

  it("discards model-supplied evidence that is not verbatim in the report", () => {
    const report = "The bedroom window in 2D will not close.";

    const [result] = validateSourceEvidence(report, [{
      source_evidence: {
        issue_type: "broken structural component",
        priority: "urgent",
        unit_number: "2D",
        description: "security risk",
      },
    }]);

    expect(result.source_evidence).toEqual({
      issue_type: null,
      priority: null,
      unit_number: "2D",
      description: null,
    });
  });
});
