const GAS_PATTERN = /\b(gas|propane)\b.*\b(smell|odor|leak)|\b(smell|odor)\b.*\b(gas|propane)\b/i;
const WATER_ELECTRIC_PATTERN = /\b(leak|water|drip|flood)\w*\b.*\b(outlet|socket|electric|wire|panel)\w*\b|\b(outlet|socket|electric|wire|panel)\w*\b.*\b(leak|water|drip|flood)\w*\b/i;
const FIRE_PATTERN = /\b(smoke|sparking|electrical fire|flames?)\b/i;
const NO_HEAT_PATTERN = /\b(no heat|heat isn'?t working|heating (?:is )?(?:not|isn'?t) working|freezing)\b/i;
const NEGATED_GAS_PATTERN = /\b(no|not|without|never)\s+(?:any\s+)?(?:gas|propane|smell|odor)\b/i;
const NEGATED_WATER_PATTERN = /\b(no|not|without|never)\s+(?:any\s+)?(?:water|leak|drip|flood)\w*\b/i;

export function applySafetyRules(report, tickets) {
  return tickets.map((ticket) => {
    const combined = `${report} ${ticket.description}`;
    let next = {
      ...ticket,
      missing_fields: [...ticket.missing_fields],
    };

    const gasHazard = GAS_PATTERN.test(combined) && !NEGATED_GAS_PATTERN.test(combined);
    const waterElectricalHazard = WATER_ELECTRIC_PATTERN.test(combined)
      && !NEGATED_WATER_PATTERN.test(combined);
    const fireHazard = FIRE_PATTERN.test(combined);

    if (gasHazard) {
      next = {
        ...next,
        issue_type: "Gas/Safety",
        priority: "Emergency",
        safety_reason: "Possible gas or propane leak reported.",
      };
    } else if (waterElectricalHazard) {
      next = {
        ...next,
        priority: "Emergency",
        safety_reason: "Water was reported near electrical equipment.",
      };
    } else if (fireHazard) {
      next = {
        ...next,
        priority: "Emergency",
        safety_reason: "Fire, smoke, or sparking was reported.",
      };
    } else if (NO_HEAT_PATTERN.test(combined) && next.priority !== "Emergency") {
      next = { ...next, priority: "High" };
    }

    const missingFields = next.unit_number ? [] : ["unit_number"];
    next = {
      ...next,
      missing_information: missingFields.length > 0,
      missing_fields: missingFields,
    };

    return next;
  });
}

