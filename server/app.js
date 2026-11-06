import path from "node:path";
import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config, projectRoot } from "./config.js";
import {
  extractionResultSchema,
  reportRequestSchema,
  statusRequestSchema,
  ticketUpdateSchema,
} from "./schemas.js";
import {
  extractReport,
  LlmConfigurationError,
  LlmProviderError,
} from "./services/extractor.js";
import { applySafetyRules } from "./services/safety-rules.js";
import { validateSourceEvidence } from "./services/source-evidence.js";
import { createPendingAnalysisStore } from "./pending-analyses.js";

export function createApp({
  database,
  extractor = extractReport,
  analysisStore = createPendingAnalysisStore(),
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      ai: {
        configured: config.aiProvider === "gemini"
          ? Boolean(config.geminiApiKey)
          : config.aiProvider === "groq"
            ? Boolean(config.groqApiKey)
            : Boolean(config.openaiApiKey),
        provider: config.aiProvider,
        model: config.aiProvider === "gemini"
          ? config.geminiModel
          : config.aiProvider === "groq"
            ? config.groqModel
            : config.openaiModel,
      },
    });
  });

  app.get("/api/tickets", (_request, response) => {
    response.json({ tickets: database.listTickets() });
  });

  app.get("/api/tickets/:id", (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return response.status(400).json({ error: "Invalid ticket id." });
    }
    const ticket = database.getTicket(id);
    if (!ticket) return response.status(404).json({ error: "Ticket not found." });
    return response.json({ ticket });
  });

  app.get("/api/dashboard/summary", (_request, response) => {
    response.json({ summary: database.getDashboardSummary() });
  });

  app.post("/api/intake/analyze", async (request, response, next) => {
    try {
      const { report } = reportRequestSchema.parse(request.body);
      const extracted = await extractor(report);
      const safeTickets = validateSourceEvidence(
        report,
        applySafetyRules(report, extracted.tickets),
      );
      const { tickets } = extractionResultSchema.parse({ tickets: safeTickets });
      const analysis = analysisStore.create({
        report,
        tickets,
        processingMode: extracted.processingMode || "unknown",
      });

      response.json({
        analysisId: analysis.id,
        createdAt: analysis.createdAt,
        stage: "review",
        originalReport: report,
        tickets,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/intake/:analysisId/commit", async (request, response, next) => {
    try {
      const analysis = analysisStore.get(request.params.analysisId);
      if (!analysis) {
        return response.status(404).json({
          error: "This review session was not found or has expired. Analyze the report again.",
          code: "ANALYSIS_NOT_FOUND",
        });
      }

      const reviewed = extractionResultSchema.parse(request.body);
      const safeTickets = validateSourceEvidence(
        analysis.report,
        applySafetyRules(analysis.report, reviewed.tickets),
      );
      const { tickets } = extractionResultSchema.parse({ tickets: safeTickets });
      const result = await database.createReportWithTickets({
        report: analysis.report,
        processingMode: analysis.processingMode,
        tickets,
      });
      analysisStore.remove(request.params.analysisId);

      response.status(201).json({
        ...result,
        processingMode: analysis.processingMode,
        stage: "created",
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/tickets/:id/status", async (request, response, next) => {
    try {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return response.status(400).json({ error: "Invalid ticket id." });
      }

      const { status } = statusRequestSchema.parse(request.body);
      const ticket = await database.updateTicketStatus(id, status);
      if (!ticket) return response.status(404).json({ error: "Ticket not found." });
      return response.json({ ticket });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/api/tickets/:id", async (request, response, next) => {
    try {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isInteger(id) || id < 1) {
        return response.status(400).json({ error: "Invalid ticket id." });
      }

      const current = database.getTicket(id);
      if (!current) return response.status(404).json({ error: "Ticket not found." });

      const update = ticketUpdateSchema.parse(request.body);
      const candidate = {
        ...current,
        ...Object.fromEntries(
          ["issue_type", "priority", "unit_number", "description"]
            .filter((field) => field in update)
            .map((field) => [field, update[field]]),
        ),
      };
      const safeTicket = applySafetyRules(current.original_text, [candidate])[0];
      const editableFields = ["issue_type", "priority", "unit_number", "description", "missing_information", "missing_fields", "safety_reason"];
      const changes = editableFields
        .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(safeTicket[field]))
        .map((field) => ({ field, previous: current[field], next: safeTicket[field] }));

      if (changes.length === 0) {
        return response.json({ ticket: current, changes: { changed_at: null, changed_fields: [] } });
      }

      const result = await database.updateTicket(id, {
        expectedUpdatedAt: update.updated_at,
        fields: safeTicket,
        changes,
      });
      if (!result) return response.status(404).json({ error: "Ticket not found." });
      if (result.conflict) {
        return response.status(409).json({
          error: "This work order changed elsewhere. Review the latest values before saving again.",
          code: "TICKET_CONFLICT",
          ticket: result.ticket,
        });
      }
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  });

  const clientDist = path.join(projectRoot, "client", "dist");
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"), (error) => {
      if (error && !response.headersSent) {
        response.status(404).json({ error: "Frontend build not found." });
      }
    });
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof LlmConfigurationError) {
      return response.status(503).json({
        error: "AI extraction is not configured. Configure the selected provider on the server and restart.",
        code: error.code,
      });
    }

    if (error instanceof LlmProviderError) {
      console.error(error.cause || error);
      if (error.status === 429) {
        return response.status(429).json({
          error: "The AI provider rate limit was reached. Wait a moment and try again.",
          code: "LLM_RATE_LIMITED",
        });
      }
      return response.status(502).json({
        error: "The AI provider could not extract this report. Please try again.",
        code: error.code,
      });
    }

    if (error instanceof ZodError) {
      return response.status(400).json({
        error: "Validation failed.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    console.error(error);
    return response.status(500).json({
      error: "The request could not be completed. Please try again.",
    });
  });

  return app;
}

