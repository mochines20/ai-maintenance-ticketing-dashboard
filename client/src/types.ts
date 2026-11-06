export type Priority = "Low" | "Medium" | "High" | "Emergency";
export type TicketStatus = "New" | "In Progress" | "Done";
export type AiProvider = "openai" | "gemini" | "groq";
export type IssueType = "Plumbing" | "Electrical" | "HVAC" | "Gas/Safety" | "Structural" | "Appliance" | "General" | "Other";

export interface SourceEvidence {
  issue_type: string | null;
  priority: string | null;
  unit_number: string | null;
  description: string | null;
}

export interface ExtractedTicket {
  issue_type: IssueType;
  priority: Priority;
  unit_number: string | null;
  description: string;
  missing_information: boolean;
  missing_fields: string[];
  safety_reason?: string | null;
  source_evidence: SourceEvidence;
}

export interface Ticket {
  id: number;
  report_id: number;
  issue_type: string;
  priority: Priority;
  unit_number: string | null;
  description: string;
  missing_information: boolean;
  missing_fields: string[];
  safety_reason: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  original_text: string;
  processing_mode: AiProvider;
}

export interface TicketUpdate {
  issue_type: IssueType;
  priority: Priority;
  unit_number: string | null;
  description: string;
  updated_at: string;
}

export interface TicketChange {
  field: string;
  previous: unknown;
  next: unknown;
}

export interface TicketUpdateResponse {
  ticket: Ticket;
  changes: {
    changed_at: string | null;
    changed_fields: TicketChange[];
  };
}

export interface TicketListResponse {
  tickets: Ticket[];
}

export interface DashboardSummary {
  openWorkOrders: number;
  openEmergencies: number;
  needsFollowUp: number;
  completedWorkOrders: number;
}

export interface CreateReportResponse {
  reportId: number;
  tickets: Ticket[];
  processingMode: AiProvider;
  stage: "created";
}

export interface AnalyzeReportResponse {
  analysisId: string;
  createdAt: string;
  stage: "review";
  originalReport: string;
  tickets: ExtractedTicket[];
}

export interface HealthResponse {
  status: "ok";
  ai: {
    configured: boolean;
    provider: AiProvider;
    model: string;
  };
}
