import { useEffect, useMemo, useState } from "react";
import { getTickets, submitReport, updateTicketStatus } from "./api.js";

const sampleReports = [
  {
    label: "Water + outlet",
    text: "Hi, this is apartment 4B. There is a major water leak coming from the ceiling in the bathroom and it's dripping onto the outlet!",
  },
  {
    label: "No heat",
    text: "Hey, the heat isn't working in my place and it's freezing. Can someone come today?",
  },
  {
    label: "Two issues",
    text: "Unit 12C here. The kitchen sink is clogged, and also the hallway light outside my door has been flickering for a week.",
  },
  {
    label: "Possible gas",
    text: "Yeah hi, so um, I'm in 7A, and I don't know if it's a big deal, but there's kind of a weird smell near the stove, like maybe gas? My neighbor said it's probably nothing but I wanted to call anyway.",
  },
  {
    label: "Window repair",
    text: "This is 2D. My bedroom window won't close all the way. Not urgent, whenever you get a chance.",
  },
];

const statusOptions = ["New", "In Progress", "Done"];
const priorityOrder = { Emergency: 0, High: 1, Medium: 2, Low: 3 };

function Icon({ name, size = 20 }) {
  const paths = {
    logo: <><path d="M4 13.5 12 5l8 8.5"/><path d="M6.5 11.5V21h11v-9.5"/><path d="M9.5 21v-6h5v6"/><path d="m16.8 4.2 3 3"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    spark: <><path d="m12 3-1.4 4.1a5 5 0 0 1-3.2 3.2L3 12l4.4 1.7a5 5 0 0 1 3.2 3.2L12 21l1.4-4.1a5 5 0 0 1 3.2-3.2L21 12l-4.4-1.7a5 5 0 0 1-3.2-3.2L12 3Z"/></>,
    alert: <><path d="M10.3 3.7 2.4 17.5A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.5L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    map: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function StatCard({ label, value, detail, tone, icon }) {
  return (
    <article className={`stat-card ${tone || ""}`}>
      <div className="stat-icon"><Icon name={icon} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function TicketCard({ ticket, onStatusChange, updating }) {
  const created = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ticket.created_at));

  return (
    <article className={`ticket-card priority-${ticket.priority.toLowerCase()}`}>
      <div className="ticket-topline">
        <div className="ticket-id">WO-{String(ticket.id).padStart(4, "0")}</div>
        <span className={`priority-badge ${ticket.priority.toLowerCase()}`}>
          {ticket.priority === "Emergency" && <Icon name="alert" size={14} />}
          {ticket.priority}
        </span>
        {ticket.missing_information && (
          <span className="follow-up-badge">Needs follow-up</span>
        )}
        <time>{created}</time>
      </div>
      <div className="ticket-body">
        <div>
          <p className="ticket-type">{ticket.issue_type}</p>
          <h3>{ticket.description}</h3>
          <div className="ticket-meta">
            <span><Icon name="map" size={15} /> {ticket.unit_number || "Unit not provided"}</span>
            <span>Report #{ticket.report_id}</span>
            <span className={`mode-dot ${ticket.processing_mode}`}>{ticket.processing_mode === "openai" ? "AI extracted" : "Demo parser"}</span>
          </div>
          {ticket.missing_information && (
            <p className="missing-note">
              Missing: {ticket.missing_fields.join(", ").replaceAll("_", " ")}
            </p>
          )}
        </div>
        <label className="status-control">
          <span>Status</span>
          <select
            value={ticket.status}
            disabled={updating}
            onChange={(event) => onStatusChange(ticket.id, event.target.value)}
          >
            {statusOptions.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
      </div>
    </article>
  );
}

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");

  async function loadTickets() {
    try {
      const data = await getTickets();
      setTickets(data.tickets);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  const stats = useMemo(() => ({
    total: tickets.length,
    emergency: tickets.filter((ticket) => ticket.priority === "Emergency" && ticket.status !== "Done").length,
    progress: tickets.filter((ticket) => ticket.status === "In Progress").length,
    followUp: tickets.filter((ticket) => ticket.missing_information && ticket.status !== "Done").length,
  }), [tickets]);

  const visibleTickets = useMemo(() => tickets
    .filter((ticket) => statusFilter === "All" || ticket.status === statusFilter)
    .filter((ticket) => {
      const haystack = `${ticket.description} ${ticket.issue_type} ${ticket.unit_number || ""}`.toLowerCase();
      return haystack.includes(query.toLowerCase());
    })
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]),
  [tickets, statusFilter, query]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (report.trim().length < 10) {
      setError("Please enter a complete maintenance report.");
      return;
    }
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const result = await submitReport(report);
      setReport("");
      setNotice(`${result.tickets.length} work order${result.tickets.length > 1 ? "s" : ""} created using ${result.processingMode === "openai" ? "AI extraction" : "the demo parser"}.`);
      await loadTickets();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(id, status) {
    setUpdatingId(id);
    setError("");
    try {
      const { ticket } = await updateTicketStatus(id, status);
      setTickets((current) => current.map((item) => item.id === id ? ticket : item));
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="logo" size={24} /></div>
          <div><strong>MaintainIQ</strong><span>Property Operations</span></div>
        </div>
        <div className="system-status"><span /> Intake system online</div>
      </header>

      <main>
        <section className="hero-row">
          <div>
            <p className="eyebrow">Maintenance command center</p>
            <h1>Turn tenant reports into actionable work orders.</h1>
            <p className="hero-copy">AI-assisted intake, safety-aware prioritization, and a clear view of every open issue.</p>
          </div>
          <div className="date-chip">Live queue <span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date())}</span></div>
        </section>

        <section className="stats-grid" aria-label="Ticket summary">
          <StatCard label="Total tickets" value={stats.total} detail="All recorded work orders" icon="plus" />
          <StatCard label="Emergency" value={stats.emergency} detail="Requires immediate action" tone="danger" icon="alert" />
          <StatCard label="In progress" value={stats.progress} detail="Assigned and underway" tone="blue" icon="clock" />
          <StatCard label="Needs follow-up" value={stats.followUp} detail="Missing required details" tone="amber" icon="spark" />
        </section>

        <section className="workspace-grid">
          <aside className="intake-card">
            <div className="section-heading">
              <div className="heading-icon"><Icon name="spark" /></div>
              <div><p>New request</p><h2>AI maintenance intake</h2></div>
            </div>
            <p className="section-copy">Paste a caller transcript or type the tenant's report exactly as received.</p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="report">Tenant report</label>
              <textarea
                id="report"
                value={report}
                maxLength={2000}
                onChange={(event) => setReport(event.target.value)}
                placeholder="Example: Hi, this is apartment 4B. Water is leaking from the ceiling..."
              />
              <div className="textarea-footer"><span>Unstructured text accepted</span><span>{report.length}/2000</span></div>
              <button className="primary-button" disabled={submitting}>
                <Icon name="spark" size={18} />
                {submitting ? "Analyzing report..." : "Create work order"}
              </button>
            </form>
            <div className="sample-block">
              <p>Quick test reports</p>
              <div className="sample-list">
                {sampleReports.map((sample, index) => (
                  <button key={sample.label} type="button" onClick={() => setReport(sample.text)}>
                    <span>{index + 1}</span>{sample.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="queue-panel">
            <div className="queue-header">
              <div><p className="eyebrow">Operations queue</p><h2>Work orders</h2></div>
              <div className="queue-tools">
                <label className="search-box"><Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" /></label>
                <label className="filter-box"><Icon name="filter" size={17} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
              </div>
            </div>

            {error && <div className="message error" role="alert">{error}</div>}
            {notice && <div className="message success" role="status"><Icon name="check" size={17} />{notice}</div>}

            <div className="ticket-list">
              {loading ? (
                <div className="empty-state"><div className="loader" /><h3>Loading work orders</h3></div>
              ) : visibleTickets.length === 0 ? (
                <div className="empty-state"><div className="empty-icon"><Icon name="check" size={26} /></div><h3>No work orders found</h3><p>Submit a tenant report or adjust the filters to see tickets here.</p></div>
              ) : visibleTickets.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} updating={updatingId === ticket.id} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </section>
        </section>
      </main>
      <footer>MaintainIQ prototype <span>•</span> Safety rules verify AI-generated priorities before tickets are saved.</footer>
    </div>
  );
}

