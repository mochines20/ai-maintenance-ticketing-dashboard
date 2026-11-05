const evidenceFields = ["issue_type", "priority", "unit_number", "description"];

function exactSourcePhrase(report, candidate) {
  if (!candidate) return null;
  const index = report.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase());
  if (index < 0) return null;
  return report.slice(index, index + candidate.length);
}

export function validateSourceEvidence(report, tickets) {
  return tickets.map((ticket) => ({
    ...ticket,
    source_evidence: Object.fromEntries(
      evidenceFields.map((field) => [
        field,
        exactSourcePhrase(report, ticket.source_evidence?.[field]),
      ]),
    ),
  }));
}
