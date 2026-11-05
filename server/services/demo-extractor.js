function findUnit(report) {
  const match = report.match(
    /\b(?:apartment|apt\.?|unit|in|this is)\s*#?\s*([0-9]{1,4}[A-Z])\b/i,
  );
  return match ? match[1].toUpperCase() : null;
}

function makeTicket({ issueType, priority, unit, description }) {
  return {
    issue_type: issueType,
    priority,
    unit_number: unit,
    description,
    missing_information: !unit,
    missing_fields: unit ? [] : ["unit_number"],
  };
}

export function demoExtract(report) {
  const text = report.toLowerCase();
  const unit = findUnit(report);
  const tickets = [];

  if (/sink/.test(text) && /(clog|block|backed up)/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Plumbing",
        priority: "Medium",
        unit,
        description: "Kitchen sink is clogged and requires maintenance.",
      }),
    );
  }

  if (/(light|bulb)/.test(text) && /(flicker|out|broken)/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Electrical",
        priority: "Medium",
        unit,
        description: "Hallway light is flickering and needs inspection.",
      }),
    );
  }

  if (tickets.length > 0) return { tickets };

  if (/gas|propane/.test(text) && /smell|odor|leak/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Gas/Safety",
        priority: "Emergency",
        unit,
        description: "Possible gas odor reported near the stove.",
      }),
    );
  } else if (/leak|water|drip|flood/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Plumbing",
        priority: /outlet|electric|socket|panel/.test(text)
          ? "Emergency"
          : "High",
        unit,
        description: /ceiling/.test(text)
          ? "Major water leak is coming from the ceiling."
          : "Water leak requires inspection and repair.",
      }),
    );
  } else if (/heat|heating|freezing|furnace/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "HVAC",
        priority: "High",
        unit,
        description: "Heating is not working and the apartment is very cold.",
      }),
    );
  } else if (/window/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Structural",
        priority: /not urgent|whenever/.test(text) ? "Low" : "Medium",
        unit,
        description: "Bedroom window will not close completely.",
      }),
    );
  } else if (/outlet|electric|light|wire|power/.test(text)) {
    tickets.push(
      makeTicket({
        issueType: "Electrical",
        priority: /spark|smoke|burn/.test(text) ? "Emergency" : "High",
        unit,
        description: "Electrical issue requires inspection.",
      }),
    );
  } else {
    tickets.push(
      makeTicket({
        issueType: "General",
        priority: "Medium",
        unit,
        description: report.slice(0, 500),
      }),
    );
  }

  return { tickets };
}

