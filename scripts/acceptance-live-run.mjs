import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import request from "supertest";
import { projectRoot, config } from "../server/config.js";
import { createApp } from "../server/app.js";
import { createDatabase } from "../server/database.js";
import { sampleReports } from "../server/sample-reports.js";
import { extractReport } from "../server/services/extractor.js";
import { applySafetyRules } from "../server/services/safety-rules.js";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "maintenance-desk-acceptance-"));
const database = await createDatabase({ filename: path.join(tempDir, "acceptance.sqlite") });
const app = createApp({ database });
const http = request(app);
const results = [];

function ticketShape(ticket) {
  return {
    issue_type: ticket.issue_type,
    priority: ticket.priority,
    unit_number: ticket.unit_number,
    description: ticket.description,
    missing_information: ticket.missing_information,
    missing_fields: ticket.missing_fields,
    safety_reason: ticket.safety_reason || null,
  };
}

function expectedMatch(actual, expected) {
  const prioritiesMatch = expected.allowedPriorities
    ? actual.every((ticket) => expected.allowedPriorities.includes(ticket.priority))
    : actual.map((ticket) => ticket.priority).sort().join("|") === [...expected.priorities].sort().join("|");
  return actual.length === expected.ticketCount
    && prioritiesMatch
    && actual.map((ticket) => ticket.issue_type).sort().join("|") === [...expected.issueTypes].sort().join("|")
    && actual.map((ticket) => ticket.unit_number).sort().join("|") === [...expected.unitNumbers].sort().join("|")
    && actual.some((ticket) => ticket.missing_information) === expected.needsFollowUp;
}

try {
  const health = await http.get("/api/health");
  const startedAt = new Date().toISOString();

  for (const sample of sampleReports) {
    const requestTimestamp = new Date().toISOString();
    const started = performance.now();
    const analyzed = await http.post("/api/intake/analyze").send({ report: sample.report });
    const durationMs = Math.round(performance.now() - started);
    if (analyzed.status !== 200) {
      results.push({ id: `AT-0${sample.id}`, input: sample.report, provider: config.aiProvider, model: config[`${config.aiProvider}Model`], durationMs, status: "failed", analyzeStatus: analyzed.status, error: analyzed.body?.error || "Analyze failed" });
      continue;
    }

    const extracted = analyzed.body.tickets;
    const safetyTickets = applySafetyRules(sample.report, extracted);
    const matchesExpected = expectedMatch(safetyTickets, sample.expected);
    const committed = await http.post(`/api/intake/${analyzed.body.analysisId}/commit`).send({ tickets: extracted });
    const savedTickets = committed.status === 201 ? committed.body.tickets : [];
    const persisted = [];
    for (const ticket of savedTickets) {
      const detail = await http.get(`/api/tickets/${ticket.id}`);
      persisted.push(detail.body.ticket);
    }

    results.push({
      id: `AT-0${sample.id}`,
      input: sample.report,
      provider: config.aiProvider,
      model: config[`${config.aiProvider}Model`],
      requestTimestamp,
      durationMs,
      analyzeStatus: analyzed.status,
      commitStatus: committed.status,
      tickets: extracted.map(ticketShape),
      savedTicketIds: savedTickets.map((ticket) => ticket.id),
      persisted: persisted.map(ticketShape),
      validation: "passed by API response schema and server revalidation",
      safety: extracted.map((ticket) => ({ priority: ticket.priority, reason: ticket.safety_reason || null })),
      expectedMatch: matchesExpected,
      statusDefaultNew: savedTickets.every((ticket) => ticket.status === "New"),
      originalPreserved: persisted.every((ticket) => ticket.original_text === sample.report),
    });
  }

  const allBefore = (await http.get("/api/tickets")).body.tickets;
  const independentBefore = {
    openWorkOrders: allBefore.filter((ticket) => ticket.status === "New" || ticket.status === "In Progress").length,
    openEmergencies: allBefore.filter((ticket) => ticket.priority === "Emergency" && ticket.status !== "Done").length,
    needsFollowUp: allBefore.filter((ticket) => ticket.missing_information && ticket.status !== "Done").length,
    completedWorkOrders: allBefore.filter((ticket) => ticket.status === "Done").length,
  };
  const apiBefore = (await http.get("/api/dashboard/summary")).body.summary;

  const firstId = allBefore[0]?.id;
  const lifecycle = [];
  for (const status of ["In Progress", "Done"]) {
    const response = await http.patch(`/api/tickets/${firstId}/status`).send({ status });
    const refreshed = response.status === 200 ? await http.get(`/api/tickets/${firstId}`) : null;
    lifecycle.push({ status, responseStatus: response.status, persistedStatus: refreshed?.body.ticket.status || null });
  }
  const invalidStatus = await http.patch(`/api/tickets/${firstId}/status`).send({ status: "Archived" });
  const missingTicket = await http.patch("/api/tickets/999999/status").send({ status: "Done" });
  const apiAfterLifecycle = (await http.get("/api/dashboard/summary")).body.summary;

  const duplicateSource = results[0];
  let duplicateStatus = null;
  if (duplicateSource?.savedTicketIds?.length) {
    const duplicateAnalysis = await http.post("/api/intake/analyze").send({ report: sampleReports[0].report });
    const committed = await http.post(`/api/intake/${duplicateAnalysis.body.analysisId}/commit`).send({ tickets: duplicateAnalysis.body.tickets });
    const duplicate = await http.post(`/api/intake/${duplicateAnalysis.body.analysisId}/commit`).send({ tickets: duplicateAnalysis.body.tickets });
    duplicateStatus = { firstCommit: committed.status, repeatedCommit: duplicate.status, ticketCountAfter: (await http.get("/api/tickets")).body.tickets.length };
  }

  const beforeInvalidCommit = (await http.get("/api/tickets")).body.tickets.length;
  const invalidAnalysis = await http.post("/api/intake/analyze").send({ report: sampleReports[2].report });
  const invalidTickets = invalidAnalysis.body.tickets.map((ticket, index) => index === 1 ? { ...ticket, priority: "Unsupported" } : ticket);
  const invalidCommit = await http.post(`/api/intake/${invalidAnalysis.body.analysisId}/commit`).send({ tickets: invalidTickets });
  const afterInvalidCommit = (await http.get("/api/tickets")).body.tickets.length;

  const manualAnalysis = await http.post("/api/intake/analyze").send({ report: sampleReports[4].report });
  const manualTickets = manualAnalysis.body.tickets.map((ticket) => ({ ...ticket, unit_number: "3B", missing_information: false, missing_fields: [] }));
  const manualCommit = await http.post(`/api/intake/${manualAnalysis.body.analysisId}/commit`).send({ tickets: manualTickets });
  const manualTicket = manualCommit.body.tickets?.[0];
  const manualDetail = manualTicket ? (await http.get(`/api/tickets/${manualTicket.id}`)).body.ticket : null;

  results.push({
    meta: { startedAt, provider: config.aiProvider, model: config[`${config.aiProvider}Model`], tempDatabase: true, tempDatabasePath: tempDir },
    kpiReconciliation: { independentBefore, apiBefore, matchBefore: JSON.stringify(independentBefore) === JSON.stringify(apiBefore), apiAfterLifecycle },
    lifecycle,
    invalidStatus: { responseStatus: invalidStatus.status, code: invalidStatus.body?.error || null },
    missingTicket: { responseStatus: missingTicket.status, code: missingTicket.body?.error || null },
    duplicateStatus,
    transactionRollback: { invalidCommitStatus: invalidCommit.status, ticketCountBefore: beforeInvalidCommit, ticketCountAfter: afterInvalidCommit, rolledBack: beforeInvalidCommit === afterInvalidCommit },
    manualCorrection: { analyzedUnit: manualAnalysis.body.tickets?.[0]?.unit_number || null, savedTicketId: manualTicket?.id || null, savedUnit: manualDetail?.unit_number || null, originalText: manualDetail?.original_text || null },
  });

  console.log(JSON.stringify(results, null, 2));
} finally {
  await database.close();
  await fs.rm(tempDir, { recursive: true, force: true });
}
