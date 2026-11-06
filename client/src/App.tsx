import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  analyzeReport,
  commitAnalysis,
  getDashboardSummary,
  getHealth,
  getTickets,
  updateTicketStatus,
} from "./api";
import type {
  AnalyzeReportResponse,
  DashboardSummary,
  ExtractedTicket,
  IssueType,
  Priority,
  Ticket,
  TicketStatus,
} from "./types";

const sampleReports = [
  { label: "Water and outlet", text: "Hi, this is apartment 4B. There is a major water leak coming from the ceiling in the bathroom and it's dripping onto the outlet!" },
  { label: "No heat", text: "Hey, the heat isn't working in my place and it's freezing. Can someone come today?" },
  { label: "Two issues", text: "Unit 12C here. The kitchen sink is clogged, and also the hallway light outside my door has been flickering for a week." },
  { label: "Possible gas", text: "Yeah hi, so um, I'm in 7A, and I don't know if it's a big deal, but there's kind of a weird smell near the stove, like maybe gas? My neighbor said it's probably nothing but I wanted to call anyway." },
  { label: "Window repair", text: "This is 2D. My bedroom window won't close all the way. Not urgent, whenever you get a chance." },
] as const;

const statusOptions: TicketStatus[] = ["New", "In Progress", "Done"];
const priorityOptions: Priority[] = ["Low", "Medium", "High", "Emergency"];
const issueOptions: IssueType[] = ["Plumbing", "Electrical", "HVAC", "Gas/Safety", "Structural", "Appliance", "General", "Other"];
const queuePageSize = 5;

type IconName = "home" | "plus" | "search" | "alert" | "follow" | "check" | "clipboard" | "close" | "spark" | "map" | "calendar" | "building" | "chevron" | "edit";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V20h11v-9.5"/><path d="M10 20v-5h4v5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    alert: <><path d="M10.3 3.7 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    follow: <><circle cx="12" cy="12" r="8"/><path d="M12 8v4M12 16h.01"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    clipboard: <><rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3h6v2M9 10h6M9 14h6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    spark: <><path d="m12 3-1.3 4a5 5 0 0 1-3.2 3.2L3.5 12l4 1.8a5 5 0 0 1 3.2 3.2l1.3 4 1.3-4a5 5 0 0 1 3.2-3.2l4-1.8-4-1.8A5 5 0 0 1 13.3 7L12 3Z"/></>,
    map: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></>,
    building: <><path d="M5 21V4h10v17M15 9h4v12M8 8h3M8 12h3M8 16h3M3 21h18"/></>,
    chevron: <><path d="m9 6 6 6-6 6"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority-chip priority-${priority.toLowerCase()}`}>{priority === "Emergency" && <Icon name="alert" size={13} />}{priority}</span>;
}

function KpiCard({ label, value, icon, tone }: { label: string; value: number | string; icon: IconName; tone?: string }) {
  return <article className={`kpi-card ${tone || ""}`}><span className="kpi-icon"><Icon name={icon} /></span><div><strong>{value}</strong><p>{label}</p></div></article>;
}

function HighlightedReport({ report, evidence }: { report: string; evidence: string | null }) {
  if (!evidence) return <>{report}</>;
  const start = report.toLocaleLowerCase().indexOf(evidence.toLocaleLowerCase());
  if (start < 0) return <>{report}</>;
  const end = start + evidence.length;
  return <>{report.slice(0, start)}<mark>{report.slice(start, end)}</mark>{report.slice(end)}</>;
}

interface IntakeDialogProps {
  open: boolean;
  aiConfigured: boolean | null;
  onClose: () => void;
  onCreated: (tickets: Ticket[]) => void;
  onViewWorkOrders: () => void;
}

type IntakePhase = "entry" | "analyzing" | "review" | "saving" | "success";

function IntakeDialog({ open, aiConfigured, onClose, onCreated, onViewWorkOrders }: IntakeDialogProps) {
  const [phase, setPhase] = useState<IntakePhase>("entry");
  const [report, setReport] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeReportResponse | null>(null);
  const [tickets, setTickets] = useState<ExtractedTicket[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sampleChoice, setSampleChoice] = useState("");
  const [createdCount, setCreatedCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reportRef = useRef(report);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  reportRef.current = report;

  function resetAndClose(force = false) {
    if (!force && (phase === "analyzing" || phase === "saving")) return;
    if (!force && phase === "review") {
      setError("Reviewed changes are not saved yet. Create the work orders or go back to the report.");
      return;
    }
    if (!force && phase === "entry" && reportRef.current.trim()) {
      setError("Your report is still entered. Review it before closing or clear the field.");
      return;
    }
    setPhase("entry");
    setReport("");
    setAnalysis(null);
    setTickets([]);
    setActiveEvidence(null);
    setError("");
    setSampleChoice("");
    setCreatedCount(0);
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetAndClose();
    };
    window.addEventListener("keydown", handleKey);
    window.setTimeout(() => {
      if (phase === "review") reviewHeadingRef.current?.focus();
      else if (phase === "success") successHeadingRef.current?.focus();
      else textareaRef.current?.focus();
    }, 0);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, phase]);

  if (!open) return null;

  async function submitAnalysis() {
    if (phase !== "entry") return;
    if (report.trim().length < 10) {
      setError("Enter a complete maintenance report before analysis.");
      return;
    }
    if (aiConfigured === false) {
      setError("AI analysis is currently unavailable. Please contact the system administrator.");
      return;
    }
    setPhase("analyzing");
    setError("");
    try {
      const result = await analyzeReport(report);
      setAnalysis(result);
      setTickets(result.tickets);
      setPhase("review");
    } catch (analysisError) {
      setError(errorMessage(analysisError));
      setPhase("entry");
    }
  }

  function handleAnalyze(event: FormEvent) {
    event.preventDefault();
    void submitAnalysis();
  }

  function updateTicket(index: number, patch: Partial<ExtractedTicket>) {
    setTickets((current) => current.map((ticket, ticketIndex) => {
      if (ticketIndex !== index) return ticket;
      const next = { ...ticket, ...patch };
      const fields = next.unit_number
        ? next.missing_fields.filter((field) => field !== "unit_number")
        : Array.from(new Set([...next.missing_fields, "unit_number"]));
      return { ...next, missing_fields: fields, missing_information: fields.length > 0 };
    }));
  }

  function addIssue() {
    setTickets((current) => [...current, {
      issue_type: "General",
      priority: "Medium",
      unit_number: null,
      description: "Describe the additional maintenance issue.",
      missing_information: true,
      missing_fields: ["unit_number"],
      source_evidence: { issue_type: null, priority: null, unit_number: null, description: null },
    }]);
  }

  function backToReport() {
    if (phase === "saving") return;
    setPhase("entry");
    setAnalysis(null);
    setTickets([]);
    setActiveEvidence(null);
    setError("");
    setSampleChoice("");
  }

  async function handleCommit() {
    if (!analysis) return;
    setPhase("saving");
    setError("");
    try {
      const result = await commitAnalysis(analysis.analysisId, tickets);
      onCreated(result.tickets);
      setCreatedCount(result.tickets.length);
      setPhase("success");
    } catch (commitError) {
      setError(errorMessage(commitError));
      setPhase("review");
    }
  }

  const isEntry = phase === "entry" || phase === "analyzing";
  const isReview = phase === "review" || phase === "saving";

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) resetAndClose(); }}>
    <section className="intake-dialog" role="dialog" aria-modal="true" aria-labelledby="intake-title">
      <header className="intake-header">
        <div><span className="section-kicker">Contextual AI intake</span><h2 id="intake-title">{isEntry ? "New Maintenance Report" : phase === "success" ? "Work orders created" : "Review & Create"}</h2><p className="intake-subtitle">{isEntry ? "Enter the tenant's concern to generate a work order." : phase === "success" ? "Your reviewed work is now in the maintenance queue." : "Check the extracted details before creating work orders."}</p></div>
        <button className="icon-button" type="button" aria-label="Close intake" onClick={() => resetAndClose()}><Icon name="close" /></button>
      </header>

      <ol className="workflow-steps" aria-label="Intake progress">
        <li className={`${isEntry ? "active" : "complete"}`}><span>{isEntry ? "1" : <Icon name="check" size={13} />}</span>Report</li>
        <li className={`${isReview ? "active" : phase === "success" ? "complete" : ""}`}><span>{phase === "success" ? <Icon name="check" size={13} /> : "2"}</span>Review &amp; Create</li>
      </ol>

      {error && <div className="inline-message error" role="alert"><Icon name="alert" size={16} />{error}</div>}

      {phase === "success" ? <div className="intake-success"><span><Icon name="check" size={26} /></span><h3 ref={successHeadingRef} tabIndex={-1}>{createdCount} work order{createdCount === 1 ? "" : "s"} created</h3><p>The reviewed tickets are now in the attention queue and ready for status management.</p><button className="primary-action" type="button" onClick={() => { resetAndClose(true); onViewWorkOrders(); }}>View work orders <Icon name="chevron" size={16} /></button></div> : isEntry ?
      <div className="entry-stage">
        <section className="caller-panel entry-panel">
          <div className="panel-heading"><span><Icon name="clipboard" /></span><div><p>Caller report</p><small>Keep the tenant's words intact</small></div></div>
          <form onSubmit={handleAnalyze} className="report-form">
            <label htmlFor="caller-report">Caller report</label>
            <textarea ref={textareaRef} id="caller-report" value={report} maxLength={2000} onChange={(event) => { setReport(event.target.value); setSampleChoice(""); }} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); void submitAnalysis(); } }} placeholder="Paste or type the report exactly as received..." disabled={phase === "analyzing"} />
            <div className="field-meta"><span>Do not summarize before analysis</span><span>{report.length}/2000</span></div>
            {aiConfigured === false && <p className="configuration-warning"><Icon name="alert" size={14} />AI analysis is currently unavailable. Please contact the system administrator.</p>}
            {phase === "analyzing" && <p className="processing-note" role="status"><span className="button-spinner dark" />Analyzing the actual report. Your text is preserved.</p>}
            <button className="primary-action" disabled={phase === "analyzing" || aiConfigured === false}>{phase === "analyzing" ? <><span className="button-spinner" />Analyzing report</> : <><Icon name="spark" />Analyze report</>}</button>
            <label className="sample-select"><span>Try a client sample</span><select aria-label="Try a client sample report" value={sampleChoice} onChange={(event) => { const sample = sampleReports[Number(event.target.value)]; if (!sample) return; setSampleChoice(event.target.value); setReport(sample.text); setError(""); }}><option value="">Choose a sample report</option>{sampleReports.map((sample, index) => <option key={sample.label} value={index}>{sample.label}</option>)}</select></label>
            <p className="keyboard-hint"><kbd>Ctrl</kbd><span>or</span><kbd>⌘</kbd><span>+</span><kbd>Enter</kbd> to analyze</p>
          </form>
        </section>
      </div> :
      <div className="review-stage">
        <section className="caller-panel report-panel">
          <div className="panel-heading"><span><Icon name="clipboard" /></span><div><p>Original caller report</p><small>Source of truth</small></div></div>
          <div className="report-source" aria-live="polite"><p><HighlightedReport report={analysis?.originalReport || report} evidence={activeEvidence} /></p>{activeEvidence && <button type="button" onClick={() => setActiveEvidence(null)}>Clear source highlight</button>}</div>
        </section>

        <section className="extraction-panel">
          <div className="panel-heading"><span className="ai-mark"><Icon name="spark" /></span><div><h3 ref={reviewHeadingRef} tabIndex={-1}>Extracted work orders</h3><small>{tickets.length} issue{tickets.length === 1 ? "" : "s"} detected · linked to this report</small></div></div>
          <div className="review-content">
            {tickets.some((ticket) => ticket.priority === "Emergency") && <div className="emergency-banner"><Icon name="alert" /><div><strong>Immediate safety risk detected</strong><span>{tickets.find((ticket) => ticket.priority === "Emergency")?.safety_reason || "Emergency priority will be enforced again when the review is saved."}</span></div></div>}
            <div className="review-list">
              {tickets.map((ticket, index) => <article className="review-card" key={`${index}-${ticket.issue_type}`}>
                <div className="review-card-header"><div><span>Work order {index + 1}</span><PriorityBadge priority={ticket.priority} /></div>{tickets.length > 1 && <button type="button" onClick={() => setTickets((current) => current.filter((_, ticketIndex) => ticketIndex !== index))}>Remove</button>}</div>
                <div className="review-fields">
                  <label><span>Category {ticket.source_evidence.issue_type && <button type="button" onClick={() => setActiveEvidence(ticket.source_evidence.issue_type)}>Show source</button>}</span><select value={ticket.issue_type} onChange={(event) => updateTicket(index, { issue_type: event.target.value as IssueType })}>{issueOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label><span>Urgency {ticket.source_evidence.priority && <button type="button" onClick={() => setActiveEvidence(ticket.source_evidence.priority)}>Show source</button>}</span><select value={ticket.priority} onChange={(event) => updateTicket(index, { priority: event.target.value as Priority })}>{priorityOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
                  <label><span>Unit {ticket.source_evidence.unit_number && <button type="button" onClick={() => setActiveEvidence(ticket.source_evidence.unit_number)}>Show source</button>}</span><input value={ticket.unit_number || ""} onChange={(event) => updateTicket(index, { unit_number: event.target.value.trim() || null })} placeholder="Unit not provided" /></label>
                  <label className="wide-field"><span>Description {ticket.source_evidence.description && <button type="button" onClick={() => setActiveEvidence(ticket.source_evidence.description)}>Show source</button>}</span><textarea value={ticket.description} onChange={(event) => updateTicket(index, { description: event.target.value })} /></label>
                </div>
                {ticket.missing_information && <div className="followup-note"><Icon name="follow" size={15} /><strong>Needs follow-up</strong><span>{ticket.missing_fields.map((field) => field.replaceAll("_", " ")).join(", ")}</span></div>}
              </article>)}
            </div>
            <button className="add-issue-button" type="button" onClick={addIssue}><Icon name="plus" size={15} />Add missed issue</button>
          </div>
        </section>
      </div>}

      {isReview && <footer className="intake-footer"><p><Icon name="edit" size={15} />Review every field. Tickets are not in the database yet.</p><div><button className="secondary-action" type="button" onClick={backToReport} disabled={phase === "saving"}>Back to report</button><button className="primary-action" type="button" onClick={() => void handleCommit()} disabled={phase === "saving" || tickets.length === 0}>{phase === "saving" ? <><span className="button-spinner" />Saving work orders</> : <>{tickets.length === 1 ? "Create Work Order" : "Create Work Orders"}<Icon name="chevron" size={16} /></>}</button></div></footer>}
    </section>
  </div>;
}

interface TicketInspectorProps {
  ticket: Ticket | null;
  updating: boolean;
  onStatusChange: (id: number, status: TicketStatus) => Promise<void>;
}

function TicketInspector({ ticket, updating, onStatusChange }: TicketInspectorProps) {
  if (!ticket) return <aside className="inspector empty-inspector"><span><Icon name="clipboard" size={24} /></span><h3>Select a work order</h3><p>Ticket details and the original report will appear here.</p></aside>;
  return <aside className="inspector" key={ticket.id}>
    <div className="inspector-top"><div><span className="section-kicker">Ticket inspector</span><h2>WO-{String(ticket.id).padStart(4, "0")}</h2></div><PriorityBadge priority={ticket.priority} /></div>
    {ticket.missing_information && <div className="inspector-followup"><Icon name="follow" size={16} /><div><strong>Needs follow-up</strong><span>{ticket.missing_fields.map((field) => field.replaceAll("_", " ")).join(", ")}</span></div></div>}
    {ticket.safety_reason && <div className="inspector-safety"><Icon name="alert" size={16} /><div><strong>Safety escalation</strong><span>{ticket.safety_reason}</span></div></div>}
    <section className="inspector-section"><h3>{ticket.description}</h3><dl className="detail-grid"><div><dt>Category</dt><dd>{ticket.issue_type}</dd></div><div><dt>Unit</dt><dd>{ticket.unit_number || "Unit not provided"}</dd></div><div><dt>Created</dt><dd>{formatDate(ticket.created_at)}</dd></div><div><dt>Source report</dt><dd>#{ticket.report_id}</dd></div></dl></section>
    <section className="inspector-section original-report"><div className="inspector-section-title"><Icon name="clipboard" size={15} /><h3>Original report</h3></div><blockquote>{ticket.original_text}</blockquote></section>
    <section className="inspector-section status-section"><label htmlFor={`status-${ticket.id}`}>Workflow status</label><select id={`status-${ticket.id}`} value={ticket.status} disabled={updating} onChange={(event) => void onStatusChange(ticket.id, event.target.value as TicketStatus)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select><p>Priority and follow-up are managed separately from workflow status.</p></section>
  </aside>;
}

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [kpis, setKpis] = useState<DashboardSummary>({ openWorkOrders: 0, openEmergencies: 0, needsFollowUp: 0, completedWorkOrders: 0 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ticketsLoadFailed, setTicketsLoadFailed] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Open" | TicketStatus>("Open");
  const [sort, setSort] = useState<"attention" | "newest" | "unit">("attention");
  const [queuePage, setQueuePage] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [recentIds, setRecentIds] = useState<Set<number>>(new Set());
  const queueRef = useRef<HTMLElement>(null);

  async function loadTickets(preferredId?: number) {
    try {
      const [ticketData, summaryData] = await Promise.all([getTickets(), getDashboardSummary()]);
      setTickets(ticketData.tickets);
      setKpis(summaryData.summary);
      setTicketsLoadFailed(false);
      const firstActiveTicket = ticketData.tickets.find((ticket) => ticket.status !== "Done")?.id ?? null;
      setSelectedId((current) => preferredId ?? current ?? firstActiveTicket);
      setError("");
    } catch (loadError) {
      setTicketsLoadFailed(true);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTickets();
    getHealth().then((health) => setAiConfigured(health.ai.configured)).catch((healthError: unknown) => setError(errorMessage(healthError)));
  }, []);

  const visibleTickets = useMemo(() => {
    const lowerQuery = query.trim().toLocaleLowerCase();
    return tickets
      .filter((ticket) => statusFilter === "All" || (statusFilter === "Open" ? ticket.status !== "Done" : ticket.status === statusFilter))
      .filter((ticket) => !lowerQuery || `${ticket.description} ${ticket.issue_type} ${ticket.unit_number || ""} ${ticket.original_text}`.toLocaleLowerCase().includes(lowerQuery))
      .sort((a, b) => {
        if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (sort === "unit") return (a.unit_number || "ZZZ").localeCompare(b.unit_number || "ZZZ");
        const emergencyA = a.priority === "Emergency" ? 0 : 1;
        const emergencyB = b.priority === "Emergency" ? 0 : 1;
        return emergencyA - emergencyB
          || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          || a.id - b.id;
      });
  }, [tickets, query, statusFilter, sort]);

  const queuePageCount = Math.max(1, Math.ceil(visibleTickets.length / queuePageSize));
  const pageTickets = useMemo(
    () => visibleTickets.slice(queuePage * queuePageSize, (queuePage + 1) * queuePageSize),
    [visibleTickets, queuePage],
  );
  const pageStart = visibleTickets.length === 0 ? 0 : queuePage * queuePageSize + 1;
  const pageEnd = Math.min((queuePage + 1) * queuePageSize, visibleTickets.length);

  useEffect(() => {
    setQueuePage(0);
  }, [query, statusFilter, sort]);

  useEffect(() => {
    setQueuePage((current) => Math.min(current, queuePageCount - 1));
  }, [queuePageCount]);

  useEffect(() => {
    if (selectedId == null) return;
    const selectedIndex = visibleTickets.findIndex((ticket) => ticket.id === selectedId);
    if (selectedIndex >= 0) setQueuePage(Math.floor(selectedIndex / queuePageSize));
  }, [selectedId, visibleTickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) || null;

  async function handleStatusChange(id: number, status: TicketStatus) {
    setUpdatingId(id);
    setError("");
    try {
      const { ticket } = await updateTicketStatus(id, status);
      setTickets((current) => current.map((item) => item.id === id ? ticket : item));
      void loadTickets(id);
      setNotice(`WO-${String(id).padStart(4, "0")} moved to ${status}.`);
      window.setTimeout(() => setNotice(""), 2600);
    } catch (statusError) {
      setError(errorMessage(statusError));
    } finally {
      setUpdatingId(null);
    }
  }

  function handleCreated(createdTickets: Ticket[]) {
    const ids = new Set(createdTickets.map((ticket) => ticket.id));
    setRecentIds(ids);
    setNotice(`${createdTickets.length} reviewed work order${createdTickets.length === 1 ? "" : "s"} added to the queue.`);
    void loadTickets(createdTickets[0]?.id);
    window.setTimeout(() => setRecentIds(new Set()), 1800);
  }

  function handleRetry() {
    void loadTickets();
  }

  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#workspace" aria-label="Maintenance Desk workspace"><span className="brand-mark"><Icon name="building" size={19} /></span><span><strong>Maintenance Desk</strong><small>The living workspace</small></span></a>
      <nav aria-label="Primary navigation"><button type="button" className="nav-link active" onClick={() => queueRef.current?.scrollIntoView({ behavior: "smooth" })}><Icon name="home" size={16} />Workspace</button></nav>
      <div className="header-actions"><label className="global-search"><Icon name="search" size={16} /><span className="sr-only">Search work orders</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work orders" /></label><span className={`ai-status ${aiConfigured ? "ready" : ""}`} title={aiConfigured === true ? "AI extraction is ready" : aiConfigured === false ? "AI analysis is currently unavailable" : "Checking AI availability"}><i />{aiConfigured === true ? "AI ready" : aiConfigured === false ? "AI unavailable" : "Checking AI"}</span><button className="new-report-button" type="button" onClick={() => setIntakeOpen(true)}><Icon name="plus" size={16} />New report</button></div>
    </header>

    <main id="workspace" className="workspace">
      <section className="workspace-heading"><div><span className="section-kicker">Property operations</span><h1>Maintenance workspace</h1><p>Review what needs attention, understand the source, and move work forward.</p></div><button className="mobile-new-report" type="button" onClick={() => setIntakeOpen(true)}><Icon name="plus" size={16} />New report</button></section>

      <section className="kpi-grid" aria-label="Maintenance summary"><KpiCard label="Open work orders" value={ticketsLoadFailed || loading ? "—" : kpis.openWorkOrders} icon="clipboard" /><KpiCard label="Open emergencies" value={ticketsLoadFailed || loading ? "—" : kpis.openEmergencies} icon="alert" tone="risk" /><KpiCard label="Needs follow-up" value={ticketsLoadFailed || loading ? "—" : kpis.needsFollowUp} icon="follow" tone="warning" /><KpiCard label="Completed work orders" value={ticketsLoadFailed || loading ? "—" : kpis.completedWorkOrders} icon="check" tone="complete" /></section>

      {error && <div className="page-message error" role="alert"><Icon name="alert" size={16} /><span>{error}</span><button type="button" className="retry-button" onClick={handleRetry}>Retry</button></div>}
      {notice && <div className="page-message success" role="status"><Icon name="check" size={16} />{notice}</div>}

      <section className="operations-grid" ref={queueRef}>
        <section className="attention-surface">
          <header className="surface-header"><div><span className="section-kicker">Prioritized work</span><h2>Attention queue</h2><p>{visibleTickets.length === 0 ? `0 of ${tickets.length}` : `Showing ${pageStart}–${pageEnd} of ${visibleTickets.length}`} work orders · Emergency first, then oldest request</p></div><div className="queue-controls"><label><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option>All</option><option>Open</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label><label><span className="sr-only">Sort work orders</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="attention">Emergency first · FIFO</option><option value="newest">Newest first</option><option value="unit">Unit number</option></select></label></div></header>

          <div className="table-wrap">
            {loading ? <div className="queue-empty"><span className="button-spinner dark" /><h3>Loading work orders</h3></div> : ticketsLoadFailed && tickets.length === 0 ? <div className="queue-empty queue-error"><span><Icon name="alert" size={24} /></span><h3>Work orders unavailable</h3><p>We couldn't load the queue. Retry the request to try again.</p><button type="button" onClick={handleRetry}>Retry</button></div> : visibleTickets.length === 0 ? <div className="queue-empty"><span><Icon name="check" size={24} /></span><h3>{tickets.length === 0 ? "No work orders yet" : statusFilter === "Open" ? "No active work orders" : "No matching work orders"}</h3><p>{tickets.length === 0 ? "Analyze a caller report to create the first work order." : statusFilter === "Open" ? "Switch to All or Done to view completed records." : "Try a different search or status filter."}</p><button type="button" onClick={() => setIntakeOpen(true)}>Create new report</button></div> : <table className="work-order-table"><thead><tr><th>Work order</th><th>Unit</th><th>Priority</th><th>Status</th><th>Updated</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{pageTickets.map((ticket) => <tr key={ticket.id} className={`${selectedId === ticket.id ? "selected" : ""} ${recentIds.has(ticket.id) ? "new-row" : ""}`} onClick={() => setSelectedId(ticket.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(ticket.id); } }}><td><div className="order-primary"><strong>WO-{String(ticket.id).padStart(4, "0")}</strong>{ticket.missing_information && <span className="followup-dot" title="Needs follow-up"><Icon name="follow" size={13} /></span>}</div><span>{ticket.issue_type}</span><p>{ticket.description}</p></td><td>{ticket.unit_number || <span className="not-provided">Not provided</span>}</td><td><PriorityBadge priority={ticket.priority} /></td><td><span className={`status-pill status-${ticket.status.toLowerCase().replace(" ", "-")}`}>{ticket.status}</span></td><td>{formatDate(ticket.updated_at)}</td><td><Icon name="chevron" size={15} /></td></tr>)}</tbody></table>}
          </div>
           {!loading && !ticketsLoadFailed && queuePageCount > 1 && <nav className="queue-pagination" aria-label="Work order pages"><span>Showing {pageStart}–{pageEnd} of {visibleTickets.length}</span><div><button type="button" onClick={() => setQueuePage((current) => Math.max(0, current - 1))} disabled={queuePage === 0}>Previous</button><span aria-current="page">Page {queuePage + 1} of {queuePageCount}</span><button type="button" onClick={() => setQueuePage((current) => Math.min(queuePageCount - 1, current + 1))} disabled={queuePage === queuePageCount - 1}>Next</button></div></nav>}
        </section>

        <TicketInspector ticket={selectedTicket} updating={updatingId === selectedTicket?.id} onStatusChange={handleStatusChange} />
      </section>
    </main>

    <IntakeDialog open={intakeOpen} aiConfigured={aiConfigured} onClose={() => setIntakeOpen(false)} onCreated={handleCreated} onViewWorkOrders={() => queueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
  </div>;
}
