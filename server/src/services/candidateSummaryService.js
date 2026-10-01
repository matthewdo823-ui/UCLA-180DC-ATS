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

// Snapshot-only: no legacy why_* fallback. An empty snapshot yields no FRQ
// blocks, so buildSummaryPrompt returns null and the caller emits the canned
// "no free responses yet" summary instead of summarizing stale why_* columns.
function getApplicationResponses(candidate = {}) {
  const responses = Array.isArray(candidate.applicationResponses) ? candidate.applicationResponses : [];
  return responses
    .filter((response) => response.gradable !== false)
    .map((response) => ({
      questionId: response.questionId,
      title: String(response.title || "Application response"),
      answer: String(response.answer || ""),
    }));
}

function formatFrqBlocks(candidate = {}) {
  return getApplicationResponses(candidate)
    .filter(({ answer }) => String(answer || "").trim())
    .map(({ title, answer }) => `${title}:\n${trimText(answer, 1200)}`)
    .join("\n\n");
}

function buildSummarySourceHash({ candidate }) {
  const payload = {
    model: getModel(),
    promptVersion: "cycle-question-responses-v1",
    source: "frqs",
    frqs: getApplicationResponses(candidate),
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

Use the exact question labels to interpret each answer. In the first sentence, summarize the candidate's motivation and fit. In the second sentence, summarize the strongest additional theme from the remaining responses. If the supplied questions do not cover one of those topics, summarize the strongest available themes instead without mentioning that information is missing.

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

  async function requestSummary(retry = false) {
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
          parts: [{ text: retry
            ? `${prompt}\n\nYour previous response did not contain exactly two complete sentences. Return only two short, complete sentences and end both with punctuation.`
            : prompt }],
        }],
        generationConfig: {
          temperature: retry ? 0.2 : 0.4,
          maxOutputTokens: 320,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      },
      {
        params: { key: apiKey },
        headers: { "Content-Type": "application/json" },
        timeout: 45000,
      }
    );

    const candidate = response.data?.candidates?.[0];
    const summary = String(
      candidate?.content?.parts?.map((part) => part.text || "").join("") || ""
    ).trim();
    return { summary, finishReason: candidate?.finishReason || "" };
  }

  let result = await requestSummary(false);
  if (result.finishReason !== "STOP" || !isCompleteTwoSentenceSummary(result.summary)) {
    result = await requestSummary(true);
  }

  if (result.finishReason !== "STOP") {
    throw new Error(`AI summary generation stopped before completion (${result.finishReason || "unknown reason"})`);
  }
  if (!isCompleteTwoSentenceSummary(result.summary)) {
    throw new Error("AI did not return exactly two complete sentences");
  }

  return {
    summary: result.summary,
    model,
    generatedAt: new Date().toISOString(),
  };
}

function isCompleteTwoSentenceSummary(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const sentenceEndings = text.match(/[.!?](?=\s|$)/g) || [];
  return sentenceEndings.length === 2 && /[.!?]$/.test(text);
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
  isCompleteTwoSentenceSummary,
  generateCandidateSummary,
  resolveCandidateSummary,
};
