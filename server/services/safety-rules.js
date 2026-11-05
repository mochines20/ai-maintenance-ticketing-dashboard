const GAS_PATTERN = /\b(gas|propane)\b.*\b(smell|odor|leak)|\b(smell|odor)\b.*\b(gas|propane)\b/i;
const WATER_ELECTRIC_PATTERN = /\b(leak|water|drip|flood)\w*\b.*\b(outlet|socket|electric|wire|panel)\w*\b|\b(outlet|socket|electric|wire|panel)\w*\b.*\b(leak|water|drip|flood)\w*\b/i;
const FIRE_PATTERN = /\b(smoke|sparking|electrical fire|flames?)\b/i;
const NO_HEAT_PATTERN = /\b(no heat|heat isn'?t working|heating (?:is )?(?:not|isn'?t) working|freezing)\b/i;

function addMissingField(ticket, field) {
  return ticket.missing_fields.includes(field)
    ? ticket.missing_fields
    : [...ticket.missing_fields, field];
}

export function applySafetyRules(report, tickets) {
  return tickets.map((ticket) => {
    const combined = `${report} ${ticket.description}`;
    let next = {
      ...ticket,
      missing_fields: [...ticket.missing_fields],
    };

    if (GAS_PATTERN.test(combined)) {
      next = {
        ...next,
        issue_type: "Gas/Safety",
        priority: "Emergency",
      };
    } else if (
      WATER_ELECTRIC_PATTERN.test(combined) ||
      FIRE_PATTERN.test(combined)
    ) {
      next = { ...next, priority: "Emergency" };
    } else if (NO_HEAT_PATTERN.test(combined) && next.priority !== "Emergency") {
      next = { ...next, priority: "High" };
    }

    if (!next.unit_number) {
      next = {
        ...next,
        missing_information: true,
        missing_fields: addMissingField(next, "unit_number"),
      };
    }

    return next;
  });
}

