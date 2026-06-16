const crypto = require("crypto");
const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_CACHE_TTL_HOURS = 48;

function isAiSummaryConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || "").trim());
}

function getModel() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function getCacheTtlMs() {
  const configured = Number(process.env.CANDIDATE_SUMMARY_CACHE_TTL_HOURS);
  const hours = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_CACHE_TTL_HOURS;
  return hours * 60 * 60 * 1000;
}

function trimText(value, maxLen = 2000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function formatReviewNotes(reviews = []) {
  return reviews
    .filter((review) => String(review.notes || "").trim())
    .map((review, index) => {
      const reviewer = review.reviewerName || review.reviewerEmail || `Reviewer ${index + 1}`;
      const scorePart = review.normalizedScore != null ? ` (${review.normalizedScore}% score)` : "";
      const decisionPart = review.decision && review.decision !== "pass" ? ` [${review.decision}]` : "";
      return `- ${reviewer}${scorePart}${decisionPart}: ${trimText(review.notes, 500)}`;
    })
    .join("\n");
}

function buildSummarySourceHash({ candidate, scoring, roundDecision }) {
  const payload = {
    model: getModel(),
    candidate: {
      whyConsulting: candidate?.whyConsulting || "",
      why180dc: candidate?.why180dc || "",
      whySocialImpact: candidate?.whySocialImpact || "",
      extenuatingCircumstances: candidate?.extenuatingCircumstances || "",
      year: candidate?.year || "",
      major: candidate?.major || "",
      gpa: candidate?.gpa || "",
      gm: candidate?.gm || "",
      newbieTraining: candidate?.newbieTraining || "",
    },
    scoring: {
      numReviews: scoring?.numReviews ?? 0,
      normalizedScore: scoring?.normalizedScore ?? null,
      aggregateScore: scoring?.aggregateScore ?? null,
      categoryScores: scoring?.categoryScores || {},
      reviews: (scoring?.reviews || [])
        .map((review) => ({
          id: review.id,
          notes: review.notes || "",
          decision: review.decision || "",
          normalizedScore: review.normalizedScore ?? null,
          score: review.score ?? null,
          scores: review.scores || {},
          submittedAt: review.submittedAt || null,
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    },
    roundDecision: roundDecision
      ? {
          decision: roundDecision.decision || "",
          notes: roundDecision.notes || "",
          updatedAt: roundDecision.updatedAt || roundDecision.updated_at || null,
        }
      : null,
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isCacheValid(cachedRow, sourceHash, nowMs = Date.now()) {
  if (!cachedRow || cachedRow.source_hash !== sourceHash) return false;
  const generatedAtMs = new Date(cachedRow.generated_at).getTime();
  if (!Number.isFinite(generatedAtMs)) return false;
  return (nowMs - generatedAtMs) < getCacheTtlMs();
}

function buildSummaryPrompt({ candidate, scoring, roundDecision, context }) {
  const essayBlocks = [
    ["Why consulting?", candidate?.whyConsulting],
    ["Why 180 Degrees Consulting?", candidate?.why180dc],
    ["Why social impact?", candidate?.whySocialImpact],
  ]
    .filter(([, text]) => String(text || "").trim())
    .map(([label, text]) => `${label}:\n${trimText(text, 1200)}`)
    .join("\n\n");

  const reviewNotes = formatReviewNotes(scoring?.reviews || []);
  const performanceLines = [];

  if (scoring?.normalizedScore != null) {
    performanceLines.push(`Resume screen normalized score: ${scoring.normalizedScore}% (${scoring.numReviews} review${scoring.numReviews === 1 ? "" : "s"})`);
  }
  if (scoring?.categoryScores && Object.keys(scoring.categoryScores).length > 0) {
    const categories = Object.entries(scoring.categoryScores)
      .filter(([, value]) => value != null)
      .map(([metric, value]) => `${metric}: ${value}/${scoring.maxPerCategory || 4} avg`)
      .join(", ");
    if (categories) performanceLines.push(`Category averages: ${categories}`);
  }

  const profileLines = [
    candidate?.year && `Year: ${candidate.year}`,
    candidate?.major && `Major: ${candidate.major}`,
    candidate?.gpa && `GPA: ${candidate.gpa}`,
    candidate?.gm && `General member interest: ${candidate.gm}`,
    candidate?.newbieTraining && `Newbie training: ${candidate.newbieTraining}`,
  ].filter(Boolean);

  const deliberationLines = [];
  if (roundDecision?.decision && roundDecision.decision !== "pending") {
    deliberationLines.push(`Committee decision: ${roundDecision.decision}`);
  }
  if (String(roundDecision?.notes || "").trim()) {
    deliberationLines.push(`Committee notes: ${trimText(roundDecision.notes, 800)}`);
  }

  const extenuating = trimText(candidate?.extenuatingCircumstances, 600);

  return `You are helping UCLA 180 Degrees Consulting recruiters quickly understand a candidate before interviews or committee discussion.

Write a concise candidate briefing (3–5 short paragraphs, plain prose, no bullet lists). Prioritize:
1. Themes and standout points from application essays and free-response answers
2. What reviewers noted in their screening notes — agreements, concerns, and unique observations
3. Brief performance context (scores only as supporting detail, not the focus)
4. Any extenuating circumstances or committee deliberation notes if present
5. A closing sentence on overall impression and what to probe in follow-up

Be factual, neutral, and specific. Do not invent details. If information is missing, say so briefly rather than speculating.

Candidate: ${candidate?.name || "Unknown"}
Cycle: ${context?.cycle?.name || "Current cycle"} · ${context?.round?.name || "Resume screen"}

Profile:
${profileLines.length ? profileLines.join("\n") : "Not provided"}

Application responses:
${essayBlocks || "No essay responses provided."}

${extenuating ? `Extenuating circumstances:\n${extenuating}\n` : ""}
Performance:
${performanceLines.length ? performanceLines.join("\n") : "No resume screen scores yet."}

Reviewer notes:
${reviewNotes || "No reviewer notes yet."}

${deliberationLines.length ? `Deliberation:\n${deliberationLines.join("\n")}` : ""}`;
}

async function generateCandidateSummary(applicationPayload) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("AI summary is not configured");
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const prompt = buildSummaryPrompt(applicationPayload);
  const model = getModel();

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      systemInstruction: {
        parts: [{
          text: "You write clear, professional recruiting briefings for a student consulting organization. Use complete sentences and short paragraphs.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700,
      },
    },
    {
      params: { key: apiKey },
      headers: { "Content-Type": "application/json" },
      timeout: 45000,
    }
  );

  const summary = String(
    response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || ""
  ).trim();

  if (!summary) {
    throw new Error("AI returned an empty summary");
  }

  return {
    summary,
    model,
    generatedAt: new Date().toISOString(),
  };
}

async function resolveCandidateSummary(supabase, {
  resumeId,
  candidateId,
  cycleId,
  roundId,
  applicationPayload,
  roundDecision,
  forceRefresh = false,
}) {
  const sourceHash = buildSummarySourceHash({
    candidate: applicationPayload.candidate,
    scoring: applicationPayload.scoring,
    roundDecision,
  });

  if (!forceRefresh) {
    const { data: cached, error: cacheError } = await supabase
      .from("candidate_summaries")
      .select("summary, source_hash, model, generated_at")
      .eq("resume_id", resumeId)
      .eq("cycle_id", cycleId)
      .eq("round_id", roundId)
      .maybeSingle();

    if (cacheError) throw cacheError;

    if (isCacheValid(cached, sourceHash)) {
      return {
        summary: cached.summary,
        model: cached.model,
        generatedAt: cached.generated_at,
        cached: true,
      };
    }
  }

  const summaryResult = await generateCandidateSummary(applicationPayload);
  const { error: upsertError } = await supabase
    .from("candidate_summaries")
    .upsert({
      resume_id: resumeId,
      candidate_id: candidateId,
      cycle_id: cycleId,
      round_id: roundId,
      summary: summaryResult.summary,
      source_hash: sourceHash,
      model: summaryResult.model,
      generated_at: summaryResult.generatedAt,
    }, { onConflict: "resume_id,cycle_id,round_id" });

  if (upsertError) throw upsertError;

  return {
    ...summaryResult,
    cached: false,
  };
}

module.exports = {
  isAiSummaryConfigured,
  buildSummaryPrompt,
  buildSummarySourceHash,
  isCacheValid,
  getCacheTtlMs,
  generateCandidateSummary,
  resolveCandidateSummary,
};
