const supabase = require("../config/supabase");
const {
  ROUND_TYPES,
  getRoundByType,
  isInterviewRoundType,
} = require("./rounds");

async function getActiveCycleId(client = supabase) {
  const { data, error } = await client
    .from("app_settings")
    .select("active_cycle_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data?.active_cycle_id || null;
}

async function getActiveCycleRow() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getActiveResumeRound() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("type", "resume_screen")
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getResumeScreenRoundForCycle(cycleId) {
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("type", "resume_screen")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getActiveInterviewRound() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  if (!data || !isInterviewRoundType(data.type)) return null;
  return data;
}

async function getInterviewRoundForCycle(cycleId, roundType = ROUND_TYPES.COFFEE_CHAT) {
  if (!cycleId) return null;

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return getRoundByType(rounds, roundType);
}

async function getRoundsForCycle(cycleId) {
  if (!cycleId) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getActiveRoundForCycle(cycleId) {
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function requireActiveResumeScreening() {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const round = await getActiveResumeRound();
  if (!round) {
    return { error: "No active resume screening round", status: 503 };
  }

  return { cycle, round };
}

async function requireActiveInterviewRound() {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const round = await getActiveInterviewRound();
  if (!round) {
    return { error: "No active coffee chat or final round", status: 503 };
  }

  return { cycle, round };
}

module.exports = {
  getActiveCycleId,
  getActiveCycleRow,
  getActiveResumeRound,
  getResumeScreenRoundForCycle,
  getActiveInterviewRound,
  getInterviewRoundForCycle,
  getRoundsForCycle,
  getActiveRoundForCycle,
  requireActiveResumeScreening,
  requireActiveInterviewRound,
};
