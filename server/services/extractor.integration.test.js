import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { sampleReports } from "../sample-reports.js";
import { extractReport } from "./extractor.js";
import { applySafetyRules } from "./safety-rules.js";

const liveConfigured = process.env.RUN_LIVE_AI === "1" && (config.aiProvider === "gemini"
  ? Boolean(config.geminiApiKey)
  : Boolean(config.openaiApiKey));

describe.skipIf(!liveConfigured)(`live ${config.aiProvider} extraction`, () => {
  it("extracts all five client reports sequentially", async () => {
    for (const { report, expected } of sampleReports) {
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
    }
  }, 150_000);
});
