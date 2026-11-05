import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { sampleReports } from "../sample-reports.js";
import { extractReport } from "./extractor.js";
import { applySafetyRules } from "./safety-rules.js";

describe.skipIf(!config.openaiApiKey)("live OpenAI extraction", () => {
  it.each(sampleReports)(
    "extracts client report $id",
    async ({ report, expected }) => {
      const result = await extractReport(report);
      const tickets = applySafetyRules(report, result.tickets);

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
    },
    30_000,
  );
});
