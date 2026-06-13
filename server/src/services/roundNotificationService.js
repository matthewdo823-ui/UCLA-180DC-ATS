const supabase = require("../config/supabase");
const { getRoundsForCycle } = require("../utils/cycleContext");
const { isGmailConfigured, sendPlainTextEmail } = require("./emailService");
const {
  normalizeAdvanceNotification,
  renderNotificationTemplate,
  validateAdvanceNotification,
  buildSampleTemplateVars,
} = require("../utils/notificationTemplate");
const {
  assertDeliberationCompleteForRound,
  loadDeliberationPoolForRound,
  resolveDeliberationRounds,
} = require("./roundDeliberationService");
const { normalizeRoundDecision } = require("../utils/roundDecisions");
const { getUserName } = require("../utils/userDisplay");

const SEND_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRoundRow(roundId) {
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchCycleRow(cycleId) {
  const { data, error } = await supabase
    .from("cycles")
    .select("id, name")
    .eq("id", cycleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function resolveNextRoundName(cycleRounds, round) {
  const next = (cycleRounds || [])
    .filter((r) => r.sort_order > round.sort_order)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  return next?.name || null;
}

async function resolveAdvanceNotificationForRound(round, cycle, cycleRounds) {
  const nextRoundName = resolveNextRoundName(cycleRounds, round);
  const defaults = {
    roundType: round.type,
    roundName: round.name,
    cycleName: cycle?.name,
    nextRoundName,
  };
  return normalizeAdvanceNotification(round.advance_notification, defaults);
}

async function getAdvancedCandidatesWithEmail(roundId) {
  const round = await fetchRoundRow(roundId);
  if (!round) return { error: "Round not found", status: 404 };

  const cycle = await fetchCycleRow(round.cycle_id);
  const cycleRounds = await getRoundsForCycle(round.cycle_id);
  const { resumeRound } = resolveDeliberationRounds(cycleRounds);
  if (!resumeRound) {
    return { error: "No resume screening round for this cycle", status: 400 };
  }

  const pool = await loadDeliberationPoolForRound(round.cycle_id, round, resumeRound);

  const { data: candidates, error: candError } = await supabase
    .from("candidates")
    .select("id, name, email")
    .eq("cycle_id", round.cycle_id);

  if (candError) throw candError;

  const emailByCandidateId = {};
  (candidates || []).forEach((c) => {
    emailByCandidateId[c.id] = String(c.email || "").trim();
  });

  const advanced = (pool || [])
    .filter((row) => normalizeRoundDecision(row.decision?.status || row.decision) === "advance")
    .map((row) => ({
      candidateId: row.candidateId,
      name: row.name,
      email: emailByCandidateId[row.candidateId] || "",
    }))
    .filter((row) => row.candidateId);

  return { round, cycle, cycleRounds, advanced };
}

async function fetchLatestAdvanceBatch(roundId) {
  const { data, error } = await supabase
    .from("round_notification_batches")
    .select("id, sent_at, recipient_count, failed_count, is_test, sent_by")
    .eq("round_id", roundId)
    .eq("notification_type", "advance")
    .eq("is_test", false)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  let sentByName = null;
  let sentByEmail = null;
  if (data.sent_by) {
    const { data: sender, error: senderError } = await supabase
      .from("users")
      .select("email, first_name, last_name")
      .eq("user_id", data.sent_by)
      .maybeSingle();
    if (!senderError && sender) {
      sentByName = getUserName(sender);
      sentByEmail = sender.email || null;
    }
  }

  return {
    id: data.id,
    sentAt: data.sent_at,
    recipientCount: data.recipient_count,
    failedCount: data.failed_count,
    sentByName,
    sentByEmail,
  };
}

async function saveAdvanceNotificationTemplate(roundId, template) {
  const validationError = validateAdvanceNotification(template);
  if (validationError) {
    return { error: validationError, status: 400 };
  }

  const payload = {
    subject: template.subject.trim(),
    body: template.body.trim(),
  };

  const { data, error } = await supabase
    .from("rounds")
    .update({ advance_notification: payload })
    .eq("id", roundId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { error: "Round not found", status: 404 };

  const cycle = await fetchCycleRow(data.cycle_id);
  const cycleRounds = await getRoundsForCycle(data.cycle_id);
  const resolved = await resolveAdvanceNotificationForRound(data, cycle, cycleRounds);

  return { template: resolved, round: data };
}

async function sendAdvanceNotificationTest({ roundId, adminUser }) {
  if (!isGmailConfigured()) {
    return { error: "Gmail is not configured on the server", status: 503 };
  }

  const adminEmail = String(adminUser?.email || "").trim();
  if (!adminEmail) {
    return { error: "Your account has no email address for test delivery", status: 400 };
  }

  const loaded = await getAdvancedCandidatesWithEmail(roundId);
  if (loaded.error) return loaded;

  const { round, cycle, cycleRounds } = loaded;
  const template = await resolveAdvanceNotificationForRound(round, cycle, cycleRounds);
  const sampleVars = buildSampleTemplateVars({
    cycleName: cycle?.name,
    roundName: round.name,
    nextRoundName: resolveNextRoundName(cycleRounds, round),
  });
  const rendered = renderNotificationTemplate(template, sampleVars);

  await sendPlainTextEmail({
    to: adminEmail,
    subject: `[TEST] ${rendered.subject}`,
    body: rendered.body,
  });

  const { data: batch, error: batchError } = await supabase
    .from("round_notification_batches")
    .insert({
      cycle_id: round.cycle_id,
      round_id: round.id,
      notification_type: "advance",
      is_test: true,
      sent_by: adminUser.user_id,
      recipient_count: 1,
      failed_count: 0,
      subject_snapshot: rendered.subject,
      body_snapshot: rendered.body,
    })
    .select("id, sent_at")
    .single();

  if (batchError) throw batchError;

  await supabase.from("round_notification_recipients").insert({
    batch_id: batch.id,
    candidate_id: null,
    email: adminEmail,
    status: "sent",
  });

  return {
    sentTo: adminEmail,
    subject: `[TEST] ${rendered.subject}`,
    sentAt: batch.sent_at,
  };
}

async function sendAdvanceNotifications({ roundId, adminUser, allowResend = false }) {
  if (!isGmailConfigured()) {
    return { error: "Gmail is not configured on the server", status: 503 };
  }

  const round = await fetchRoundRow(roundId);
  if (!round) return { error: "Round not found", status: 404 };
  if (round.status !== "closed") {
    return { error: "Round must be closed before emailing candidates", status: 400 };
  }

  const deliberationError = await assertDeliberationCompleteForRound(round.cycle_id, roundId);
  if (deliberationError) {
    return {
      error: deliberationError.error,
      status: deliberationError.status,
    };
  }

  if (!allowResend) {
    const existing = await fetchLatestAdvanceBatch(roundId);
    if (existing) {
      return {
        error: "Advance emails were already sent for this round. Pass allowResend to send again.",
        status: 409,
        lastBatch: existing,
      };
    }
  }

  const loaded = await getAdvancedCandidatesWithEmail(roundId);
  if (loaded.error) return loaded;

  const { cycle, cycleRounds, advanced } = loaded;
  const template = await resolveAdvanceNotificationForRound(round, cycle, cycleRounds);
  const nextRoundName = resolveNextRoundName(cycleRounds, round);

  const withEmail = advanced.filter((c) => c.email);
  const missingEmail = advanced.filter((c) => !c.email);

  if (!withEmail.length) {
    return { error: "No advanced candidates with email addresses to notify", status: 400 };
  }

  const { data: batch, error: batchError } = await supabase
    .from("round_notification_batches")
    .insert({
      cycle_id: round.cycle_id,
      round_id: round.id,
      notification_type: "advance",
      is_test: false,
      sent_by: adminUser.user_id,
      recipient_count: 0,
      failed_count: 0,
      subject_snapshot: template.subject,
      body_snapshot: template.body,
    })
    .select("id, sent_at")
    .single();

  if (batchError) throw batchError;

  let sent = 0;
  let failed = 0;
  const failures = [];
  const recipientRows = [];

  for (const candidate of withEmail) {
    const rendered = renderNotificationTemplate(template, {
      candidateName: candidate.name || "there",
      cycleName: cycle?.name || "",
      roundName: round.name || "",
      nextRoundName: nextRoundName || "",
    });

    try {
      await sendPlainTextEmail({
        to: candidate.email,
        subject: rendered.subject,
        body: rendered.body,
      });
      sent += 1;
      recipientRows.push({
        batch_id: batch.id,
        candidate_id: candidate.candidateId,
        email: candidate.email,
        status: "sent",
      });
    } catch (err) {
      failed += 1;
      failures.push({ email: candidate.email, error: err.message || "Send failed" });
      recipientRows.push({
        batch_id: batch.id,
        candidate_id: candidate.candidateId,
        email: candidate.email,
        status: "failed",
        error: err.message || "Send failed",
      });
    }

    await sleep(SEND_DELAY_MS);
  }

  for (const candidate of missingEmail) {
    recipientRows.push({
      batch_id: batch.id,
      candidate_id: candidate.candidateId,
      email: "",
      status: "skipped",
      error: "No email on file",
    });
  }

  if (recipientRows.length) {
    const { error: recipientError } = await supabase
      .from("round_notification_recipients")
      .insert(recipientRows);
    if (recipientError) throw recipientError;
  }

  const { error: updateBatchError } = await supabase
    .from("round_notification_batches")
    .update({
      recipient_count: sent,
      failed_count: failed + missingEmail.length,
    })
    .eq("id", batch.id);

  if (updateBatchError) throw updateBatchError;

  return {
    sent,
    failed,
    skipped: missingEmail.length,
    failures,
    sentAt: batch.sent_at,
    batchId: batch.id,
  };
}

module.exports = {
  isGmailConfigured,
  resolveAdvanceNotificationForRound,
  fetchLatestAdvanceBatch,
  saveAdvanceNotificationTemplate,
  sendAdvanceNotificationTest,
  sendAdvanceNotifications,
  buildSampleTemplateVars,
};
