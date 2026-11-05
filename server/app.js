import path from "node:path";
import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { projectRoot } from "./config.js";
import {
  extractionResultSchema,
  reportRequestSchema,
  statusRequestSchema,
} from "./schemas.js";
import { extractReport } from "./services/extractor.js";
import { applySafetyRules } from "./services/safety-rules.js";

export function createApp({ database, extractor = extractReport }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/api/tickets", (_request, response) => {
    response.json({ tickets: database.listTickets() });
  });

  app.post("/api/reports", async (request, response, next) => {
    try {
      const { report } = reportRequestSchema.parse(request.body);
      const extracted = await extractor(report);
      const safeTickets = applySafetyRules(report, extracted.tickets);
      const { tickets } = extractionResultSchema.parse({ tickets: safeTickets });
      const result = await database.createReportWithTickets({
        report,
        processingMode: extracted.processingMode || "unknown",
        tickets,
      });

      response.status(201).json({
        ...result,
        processingMode: extracted.processingMode || "unknown",
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

