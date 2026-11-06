import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

const schema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_text TEXT NOT NULL,
    processing_mode TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER NOT NULL,
    issue_type TEXT NOT NULL,
    priority TEXT NOT NULL,
    unit_number TEXT,
    description TEXT NOT NULL,
    missing_information INTEGER NOT NULL DEFAULT 0,
    missing_fields TEXT NOT NULL DEFAULT '[]',
    safety_reason TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
  CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

  CREATE TABLE IF NOT EXISTS ticket_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    changed_at TEXT NOT NULL,
    changed_fields TEXT NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_ticket_changes_ticket_id ON ticket_changes(ticket_id);
`;

function rowsFromStatement(database, sql, params = []) {
  const statement = database.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function normalizeTicket(row) {
  return {
    ...row,
    missing_information: Boolean(row.missing_information),
    missing_fields: JSON.parse(row.missing_fields || "[]"),
    safety_reason: row.safety_reason || null,
  };
}

export async function createDatabase({ filename = ":memory:" } = {}) {
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  let initialData;

  if (filename !== ":memory:") {
    try {
      initialData = await fs.readFile(filename);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const database = new SQL.Database(initialData);
  database.run(schema);
  const ticketColumns = rowsFromStatement(database, "PRAGMA table_info(tickets)");
  if (!ticketColumns.some((column) => column.name === "safety_reason")) {
    database.run("ALTER TABLE tickets ADD COLUMN safety_reason TEXT");
  }

  async function persist() {
    if (filename === ":memory:") return;
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, Buffer.from(database.export()));
  }

  async function createReportWithTickets({ report, processingMode, tickets }) {
    const timestamp = new Date().toISOString();
    database.run("BEGIN TRANSACTION");

    try {
      database.run(
        "INSERT INTO reports (original_text, processing_mode, created_at) VALUES (?, ?, ?)",
        [report, processingMode, timestamp],
      );
      const reportId = rowsFromStatement(
        database,
        "SELECT last_insert_rowid() AS id",
      )[0].id;

      for (const ticket of tickets) {
        database.run(
          `INSERT INTO tickets (
            report_id, issue_type, priority, unit_number, description,
            missing_information, missing_fields, safety_reason, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?)`,
          [
            reportId,
            ticket.issue_type,
            ticket.priority,
            ticket.unit_number,
            ticket.description,
            ticket.missing_information ? 1 : 0,
            JSON.stringify(ticket.missing_fields),
            ticket.safety_reason || null,
            timestamp,
            timestamp,
          ],
        );
      }

      database.run("COMMIT");
      await persist();
      const createdTickets = rowsFromStatement(
        database,
        "SELECT * FROM tickets WHERE report_id = ? ORDER BY id ASC",
        [reportId],
      ).map(normalizeTicket);

      return { reportId, tickets: createdTickets };
    } catch (error) {
      database.run("ROLLBACK");
      throw error;
    }
  }

  function listTickets() {
    return rowsFromStatement(
      database,
      `SELECT tickets.*, reports.original_text, reports.processing_mode
       FROM tickets
       JOIN reports ON reports.id = tickets.report_id
       ORDER BY
         CASE WHEN tickets.priority = 'Emergency' THEN 0 ELSE 1 END,
         tickets.created_at ASC,
         tickets.id ASC`,
    ).map(normalizeTicket);
  }

  function getTicket(id) {
    const row = rowsFromStatement(
      database,
      `SELECT tickets.*, reports.original_text, reports.processing_mode
       FROM tickets
       JOIN reports ON reports.id = tickets.report_id
       WHERE tickets.id = ?`,
      [id],
    )[0];
    return row ? normalizeTicket(row) : null;
  }

  function getDashboardSummary() {
    const row = rowsFromStatement(
      database,
      `SELECT
        COALESCE(SUM(CASE WHEN status IN ('New', 'In Progress') THEN 1 ELSE 0 END), 0) AS open_work_orders,
        COALESCE(SUM(CASE WHEN status <> 'Done' AND priority = 'Emergency' THEN 1 ELSE 0 END), 0) AS open_emergencies,
        COALESCE(SUM(CASE WHEN status <> 'Done' AND missing_information = 1 THEN 1 ELSE 0 END), 0) AS needs_follow_up,
        COALESCE(SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END), 0) AS completed_work_orders
       FROM tickets`,
    )[0];
    return {
      openWorkOrders: Number(row.open_work_orders),
      openEmergencies: Number(row.open_emergencies),
      needsFollowUp: Number(row.needs_follow_up),
      completedWorkOrders: Number(row.completed_work_orders),
    };
  }

  function getTicketChanges(id) {
    return rowsFromStatement(
      database,
      "SELECT id, ticket_id, changed_at, changed_fields FROM ticket_changes WHERE ticket_id = ? ORDER BY id ASC",
      [id],
    ).map((row) => ({
      id: Number(row.id),
      ticket_id: Number(row.ticket_id),
      changed_at: row.changed_at,
      changed_fields: JSON.parse(row.changed_fields || "[]"),
    }));
  }

  async function updateTicket(id, { expectedUpdatedAt, fields, changes }) {
    const current = getTicket(id);
    if (!current) return null;
    if (current.updated_at !== expectedUpdatedAt) {
      return { conflict: true, ticket: current };
    }

    const timestamp = new Date().toISOString();
    database.run("BEGIN TRANSACTION");
    try {
      database.run(
        `UPDATE tickets SET
          issue_type = ?,
          priority = ?,
          unit_number = ?,
          description = ?,
          missing_information = ?,
          missing_fields = ?,
          safety_reason = ?,
          updated_at = ?
         WHERE id = ? AND updated_at = ?`,
        [
          fields.issue_type,
          fields.priority,
          fields.unit_number,
          fields.description,
          fields.missing_information ? 1 : 0,
          JSON.stringify(fields.missing_fields),
          fields.safety_reason || null,
          timestamp,
          id,
          expectedUpdatedAt,
        ],
      );

      if (database.getRowsModified() === 0) {
        database.run("ROLLBACK");
        return { conflict: true, ticket: getTicket(id) };
      }

      database.run(
        "INSERT INTO ticket_changes (ticket_id, changed_at, changed_fields) VALUES (?, ?, ?)",
        [id, timestamp, JSON.stringify(changes)],
      );
      database.run("COMMIT");
      await persist();
      return { ticket: getTicket(id), changes: { changed_at: timestamp, changed_fields: changes } };
    } catch (error) {
      database.run("ROLLBACK");
      throw error;
    }
  }

  async function updateTicketStatus(id, status) {
    const timestamp = new Date().toISOString();
    database.run(
      "UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?",
      [status, timestamp, id],
    );

    if (database.getRowsModified() === 0) return null;
    await persist();
    return getTicket(id);
  }

  return {
    createReportWithTickets,
    listTickets,
    getTicket,
    getTicketChanges,
    getDashboardSummary,
    updateTicket,
    updateTicketStatus,
    async close() {
      await persist();
      database.close();
    },
  };
}

