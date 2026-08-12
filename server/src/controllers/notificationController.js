const {
  saveAdvanceNotificationTemplate,
  sendAdvanceNotificationTest,
  sendAdvanceNotifications,
  resolveAdvanceNotificationForRound,
  fetchLatestAdvanceBatch,
  isGmailConfigured,
} = require("../services/roundNotificationService");
const { getRoundsForCycle } = require("../utils/cycleContext");
const { respondWithServerError } = require("../utils/httpErrors");
const supabase = require("../config/supabase");

async function loadRoundContext(roundId) {
  const { data: round, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw error;
  if (!round) return null;

  const { data: cycle, error: cycleError } = await supabase
    .from("cycles")
    .select("id, name")
    .eq("id", round.cycle_id)
    .maybeSingle();
  if (cycleError) throw cycleError;

  const cycleRounds = await getRoundsForCycle(round.cycle_id);
  return { round, cycle, cycleRounds };
}

exports.patchAdvanceNotification = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  const subject = typeof req.body?.subject === "string" ? req.body.subject : "";
  const body = typeof req.body?.body === "string" ? req.body.body : "";

  try {
    const result = await saveAdvanceNotificationTemplate(roundId, { subject, body });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json({ template: result.template });
  } catch (err) {
    return respondWithServerError(res, err, "patchAdvanceNotification");
  }
};

exports.sendAdvanceNotificationTest = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const result = await sendAdvanceNotificationTest({
      roundId,
      adminUser: req.user,
    });
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    return respondWithServerError(res, err, "sendAdvanceNotificationTest");
  }
};

exports.sendAdvanceNotifications = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const result = await sendAdvanceNotifications({
      roundId,
      adminUser: req.user,
    });
    if (result.error) {
      const body = { error: result.error };
      if (result.lastBatch) body.lastBatch = result.lastBatch;
      return res.status(result.status).json(body);
    }
    return res.json(result);
  } catch (err) {
    return respondWithServerError(res, err, "sendAdvanceNotifications");
  }
};

exports.getAdvanceNotificationContext = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const ctx = await loadRoundContext(roundId);
    if (!ctx) return res.status(404).json({ error: "Round not found" });

    const template = await resolveAdvanceNotificationForRound(
      ctx.round,
      ctx.cycle,
      ctx.cycleRounds
    );
    const lastBatch = await fetchLatestAdvanceBatch(roundId);

    return res.json({
      template,
      lastBatch,
      gmailConfigured: isGmailConfigured(),
      roundStatus: ctx.round.status,
    });
  } catch (err) {
    return respondWithServerError(res, err, "getAdvanceNotificationContext");
  }
};
