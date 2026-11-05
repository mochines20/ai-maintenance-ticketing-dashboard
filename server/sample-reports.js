export const sampleReports = [
  {
    id: 1,
    report:
      "Hi, this is apartment 4B. There is a major water leak coming from the ceiling in the bathroom and it's dripping onto the outlet!",
    expected: {
      ticketCount: 1,
      priorities: ["Emergency"],
      issueTypes: ["Plumbing"],
      unitNumbers: ["4B"],
      needsFollowUp: false,
    },
  },
  {
    id: 2,
    report:
      "Hey, the heat isn't working in my place and it's freezing. Can someone come today?",
    expected: {
      ticketCount: 1,
      priorities: ["High"],
      issueTypes: ["HVAC"],
      unitNumbers: [null],
      needsFollowUp: true,
    },
  },
  {
    id: 3,
    report:
      "Unit 12C here. The kitchen sink is clogged, and also the hallway light outside my door has been flickering for a week.",
    expected: {
      ticketCount: 2,
      priorities: ["Medium", "Medium"],
      issueTypes: ["Plumbing", "Electrical"],
      unitNumbers: ["12C", "12C"],
      needsFollowUp: false,
    },
  },
  {
    id: 4,
    report:
      "Yeah hi, so um, I'm in 7A, and I don't know if it's a big deal, but there's kind of a weird smell near the stove, like maybe gas? My neighbor said it's probably nothing but I wanted to call anyway.",
    expected: {
      ticketCount: 1,
      priorities: ["Emergency"],
      issueTypes: ["Gas/Safety"],
      unitNumbers: ["7A"],
      needsFollowUp: false,
    },
  },
  {
    id: 5,
    report:
      "This is 2D. My bedroom window won't close all the way. Not urgent, whenever you get a chance.",
    expected: {
      ticketCount: 1,
      priorities: ["Low"],
      issueTypes: ["Structural"],
      unitNumbers: ["2D"],
      needsFollowUp: false,
    },
  },
];
