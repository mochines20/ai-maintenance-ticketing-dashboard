import type {
  AnalyzeReportResponse,
  CreateReportResponse,
  DashboardSummary,
  ExtractedTicket,
  HealthResponse,
  Ticket,
  TicketListResponse,
  TicketStatus,
  TicketUpdate,
  TicketUpdateResponse,
} from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export function getTickets(): Promise<TicketListResponse> {
  return request<TicketListResponse>("/api/tickets");
}

export function getDashboardSummary(): Promise<{ summary: DashboardSummary }> {
  return request<{ summary: DashboardSummary }>("/api/dashboard/summary");
}

export function analyzeReport(report: string): Promise<AnalyzeReportResponse> {
  return request<AnalyzeReportResponse>("/api/intake/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report }),
  });
}

export function commitAnalysis(
  analysisId: string,
  tickets: ExtractedTicket[],
): Promise<CreateReportResponse> {
  return request<CreateReportResponse>(`/api/intake/${analysisId}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tickets }),
  });
}

export function updateTicketStatus(
  id: number,
  status: TicketStatus,
): Promise<{ ticket: Ticket }> {
  return request<{ ticket: Ticket }>(`/api/tickets/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function updateTicket(
  id: number,
  update: TicketUpdate,
): Promise<TicketUpdateResponse> {
  return request<TicketUpdateResponse>(`/api/tickets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}
