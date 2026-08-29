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

const FRQ_FIELDS = [
  ["Why consulting?", "whyConsulting"],
  ["Why 180 Degrees Consulting?", "why180dc"],
  ["Why social impact?", "whySocialImpact"],
];

function formatFrqBlocks(candidate = {}) {
  return FRQ_FIELDS
    .filter(([, key]) => String(candidate[key] || "").trim())
    .map(([label, key]) => `${label}:\n${trimText(candidate[key], 1200)}`)
    .join("\n\n");
}

function buildSummarySourceHash({ candidate }) {
  const payload = {
    model: getModel(),
    promptVersion: "two-sentence-frq-v1",
    source: "frqs",
    frqs: Object.fromEntries(
      FRQ_FIELDS.map(([, key]) => [key, candidate?.[key] || ""])
    ),
  };

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isCacheValid(cachedRow, sourceHash, nowMs = Date.now()) {
  if (!cachedRow || cachedRow.source_hash !== sourceHash) return false;
  const generatedAtMs = new Date(cachedRow.generated_at).getTime();
  if (!Number.isFinite(generatedAtMs)) return false;
  return (nowMs - generatedAtMs) < getCacheTtlMs();
}

function buildSummaryPrompt({ candidate, context }) {
  const frqBlocks = formatFrqBlocks(candidate);
  const candidateLine = `Candidate: ${candidate?.name || "Unknown"}`;
  const cycleLine = `Cycle: ${context?.cycle?.name || "Current cycle"} · ${context?.round?.name || "Resume screen"}`;

  if (frqBlocks) {
    return `You are helping UCLA 180 Degrees Consulting recruiters quickly understand a candidate before interviews or committee discussion.

Write exactly two concise sentences based ONLY on the candidate's free-response application answers below. Use plain prose with no heading or bullet list.

In the first sentence, summarize the candidate's motivation for consulting and 180 Degrees Consulting. In the second sentence, summarize their social-impact perspective and the most distinctive theme from their answers. If an answer does not provide one of these details, summarize the strongest available themes instead without mentioning that information is missing.

Be factual, neutral, specific, and concise. Do not use reviewer notes, scores, profile details, or any information not present in these answers. Do not invent details.

${candidateLine}
${cycleLine}

Free-response answers:
${frqBlocks}`;
  }

  return null;
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

  if (!prompt) {
    return {
      summary: "No summary is available yet because the candidate has not submitted free-response answers.",
      model: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      systemInstruction: {
        parts: [{
          text: "You write clear, professional recruiting briefings for a student consulting organization. Summarize only the supplied free-response answers, never add outside context, and always return exactly two concise sentences.",
        }],
      },
      contents: [{
        role: "user",
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 220,
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
