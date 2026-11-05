export type Priority = "Low" | "Medium" | "High" | "Emergency";
export type TicketStatus = "New" | "In Progress" | "Done";

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
}

export interface HealthResponse {
  status: "ok";
  ai: {
    configured: boolean;
    provider: "openai";
    model: string;
  };
}
