const TEMPLATE_VARIABLES = [
  { key: "candidateName", label: "Candidate name" },
  { key: "cycleName", label: "Cycle name" },
  { key: "roundName", label: "Current round name" },
  { key: "nextRoundName", label: "Next round name" },
];

function buildDefaultAdvanceNotification({ roundType, roundName, cycleName, nextRoundName } = {}) {
  const cycle = cycleName || "180DC recruiting";
  const round = roundName || "this round";
  const next = nextRoundName || "the next stage";

  if (roundType === "interview") {
    return {
      subject: `180DC — ${cycle} update`,
      body: [
        "Hi {{candidateName}},",
        "",
        `Congratulations! Following ${round}, we are pleased to let you know you have advanced in our ${cycle} process.`,
        "",
        "Our team will follow up soon with next steps.",
        "",
        "Best,",
        "180 Degrees Consulting at UCLA",
      ].join("\n"),
    };
  }

  return {
    subject: `180DC — You've advanced to ${next}`,
    body: [
      "Hi {{candidateName}},",
      "",
      `Thank you for applying to 180 Degrees Consulting at UCLA. We're writing to let you know you've advanced past ${round} for our ${cycle} cycle.`,
      "",
      `We will reach out with details about ${next} shortly.`,
      "",
      "Best,",
      "180 Degrees Consulting at UCLA",
    ].join("\n"),
  };
}

function normalizeAdvanceNotification(raw, defaults = {}) {
  const fallback = buildDefaultAdvanceNotification(defaults);
  const subject = typeof raw?.subject === "string" ? raw.subject.trim() : "";
  const body = typeof raw?.body === "string" ? raw.body.trim() : "";
  return {
    subject: subject || fallback.subject,
    body: body || fallback.body,
  };
}

function renderNotificationTemplate(template, vars) {
  const subject = String(template?.subject || "");
  const body = String(template?.body || "");
  const replace = (text) => {
    let out = text;
    for (const { key } of TEMPLATE_VARIABLES) {
      const value = vars[key] == null ? "" : String(vars[key]);
      out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return out;
  };
  return {
    subject: replace(subject),
    body: replace(body),
  };
}

function validateAdvanceNotification(template) {
  if (!template || typeof template !== "object") {
    return "Template is required";
  }
  const subject = typeof template.subject === "string" ? template.subject.trim() : "";
  const body = typeof template.body === "string" ? template.body.trim() : "";
  if (!subject) return "Subject is required";
  if (!body) return "Body is required";
  if (subject.length > 500) return "Subject must be 500 characters or fewer";
  if (body.length > 10000) return "Body must be 10,000 characters or fewer";
  return null;
}

function buildSampleTemplateVars({ cycleName, roundName, nextRoundName } = {}) {
  return {
    candidateName: "Alex Chen",
    cycleName: cycleName || "Fall 2026 Recruiting",
    roundName: roundName || "Resume Screening",
    nextRoundName: nextRoundName || "First Round Interviews",
  };
}

module.exports = {
  TEMPLATE_VARIABLES,
  buildDefaultAdvanceNotification,
  normalizeAdvanceNotification,
  renderNotificationTemplate,
  validateAdvanceNotification,
  buildSampleTemplateVars,
};
