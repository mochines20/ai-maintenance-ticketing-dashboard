import { z } from "zod";

export const ISSUE_TYPES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Gas/Safety",
  "Structural",
  "Appliance",
  "General",
  "Other",
];

export const PRIORITIES = ["Low", "Medium", "High", "Emergency"];
export const STATUSES = ["New", "In Progress", "Done"];

export const sourceEvidenceSchema = z.object({
  issue_type: z.string().trim().min(1).max(240).nullable(),
  priority: z.string().trim().min(1).max(240).nullable(),
  unit_number: z.string().trim().min(1).max(240).nullable(),
  description: z.string().trim().min(1).max(240).nullable(),
});

export const ticketExtractionSchema = z.object({
  issue_type: z.enum(ISSUE_TYPES),
  priority: z.enum(PRIORITIES),
  unit_number: z.string().trim().min(1).max(30).nullable(),
  description: z.string().trim().min(8).max(500),
  missing_information: z.boolean(),
  missing_fields: z.array(z.string().trim().min(1).max(50)).max(10),
  safety_reason: z.string().trim().max(240).nullable().optional(),
  source_evidence: sourceEvidenceSchema,
});

export const extractionResultSchema = z.object({
  tickets: z.array(ticketExtractionSchema).min(1).max(10),
});

export const reportRequestSchema = z.object({
  report: z
    .string()
    .transform((value) => value.replaceAll("\u0000", "").trim())
    .pipe(z.string().min(10).max(2000)),
});

export const statusRequestSchema = z.object({
  status: z.enum(STATUSES),
});

export const ticketUpdateSchema = z.object({
  issue_type: z.enum(ISSUE_TYPES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  unit_number: z.string().trim().min(1).max(30).nullable().optional(),
  description: z.string().trim().min(8).max(500).optional(),
  updated_at: z.string().datetime({ offset: true }),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== "updated_at"),
  { message: "At least one editable ticket field is required." },
);

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tickets"],
  properties: {
    tickets: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "issue_type",
          "priority",
          "unit_number",
          "description",
          "missing_information",
          "missing_fields",
          "source_evidence",
        ],
        properties: {
          issue_type: { type: "string", enum: ISSUE_TYPES },
          priority: { type: "string", enum: PRIORITIES },
          unit_number: { type: ["string", "null"] },
          description: { type: "string" },
          missing_information: { type: "boolean" },
          missing_fields: {
            type: "array",
            items: { type: "string" },
          },
          source_evidence: {
            type: "object",
            additionalProperties: false,
            required: ["issue_type", "priority", "unit_number", "description"],
            properties: {
              issue_type: { type: ["string", "null"] },
              priority: { type: ["string", "null"] },
              unit_number: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
};

