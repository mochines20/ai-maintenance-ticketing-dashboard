import type {
  CreateReportResponse,
  HealthResponse,
  Ticket,
  TicketListResponse,
  TicketStatus,
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

export function submitReport(report: string): Promise<CreateReportResponse> {
  return request<CreateReportResponse>("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report }),
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
