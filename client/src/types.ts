export type Priority = "Low" | "Medium" | "High" | "Emergency";
export type TicketStatus = "New" | "In Progress" | "Done";
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
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  original_text: string;
  processing_mode: "openai";
}

export interface TicketListResponse {
  tickets: Ticket[];
}

export interface CreateReportResponse {
  reportId: number;
  tickets: Ticket[];
  processingMode: "openai";
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
    provider: "openai";
    model: string;
  };
}
