const supabase = require("../config/supabase");
const { isMissingSchemaError } = require("../utils/schemaCompatibility");

// Long enough to read a resume and score it; an abandoned claim frees itself.
const CLAIM_LEASE_SECONDS = 20 * 60;

function isMissingClaimFunction(error) {
  // PGRST202: PostgREST cannot find the function (migration not applied yet).
  return isMissingSchemaError(error) || String(error?.code || "").toUpperCase() === "PGRST202";
}

/**
 * Reserve the next resume from an already-filtered, already-ordered queue so
 * concurrent graders are spread across it (see sql/add_review_claims.sql).
 * Before that migration lands this degrades to the old behavior — the first
 * id — rather than blocking grading.
 *
 * @param {{ kind: "resume"|"frq", cycleId: string, graderId: number, candidateIds: string[] }} args
 * @returns {Promise<string|null>}
 */
async function claimNextReview({ kind, cycleId, graderId, candidateIds }) {
  if (!candidateIds.length) return null;
  if (!graderId) return candidateIds[0];

  const { data, error } = await supabase.rpc("claim_next_review", {
    kind_input: kind,
    cycle_id_input: cycleId,
    grader_id_input: graderId,
    candidate_ids: candidateIds,
    lease_seconds: CLAIM_LEASE_SECONDS,
  });

  if (error) {
    if (isMissingClaimFunction(error)) {
      console.error(
        "[reviewClaims] claim_next_review is missing; serving without a claim."
        + " Apply sql/add_review_claims.sql so concurrent graders are spread out."
      );
      return candidateIds[0];
    }
    throw error;
  }
  return data || null;
}

/** Drop a grader's claim once their review is saved. Best effort: claims also expire. */
async function releaseReviewClaim({ kind, cycleId, graderId, resumeId }) {
  const { error } = await supabase
    .from("review_claims")
    .delete()
    .match({ kind, cycle_id: cycleId, grader_id: graderId, resume_id: resumeId });
  if (error && !isMissingSchemaError(error)) {
    console.warn(`[reviewClaims] Could not release ${kind} claim on ${resumeId}:`, error.message || error);
  }
}

module.exports = { claimNextReview, releaseReviewClaim, CLAIM_LEASE_SECONDS };
