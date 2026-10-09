const MAX_NOTES_LENGTH = 1000;

function normalizeNotes(notes) {
  return typeof notes === "string" ? notes.slice(0, MAX_NOTES_LENGTH) : "";
}

export function buildCoffeeChatTablePayload({ roundId, candidates = [], drafts = {} }) {
  return {
    round_id: String(roundId || ""),
    evaluations: candidates.map((candidate) => {
      const draft = drafts[candidate.id] || {
        rating: candidate.evaluation?.rating || "",
        notes: candidate.evaluation?.notes || "",
      };
      return {
        candidate_id: candidate.id,
        rating: String(draft.rating || ""),
        notes: normalizeNotes(draft.notes),
      };
    }),
  };
}

function assertEvaluationMatches(expected, actual, roundId, source) {
  if (!actual) {
    throw new Error(`${source} did not return a saved evaluation for candidate ${expected.candidate_id}.`);
  }
  if (String(actual.roundId || "") !== String(roundId || "")) {
    throw new Error(`${source} returned an evaluation from a different round.`);
  }
  if (actual.rating !== expected.rating || normalizeNotes(actual.notes) !== expected.notes) {
    throw new Error(`${source} did not confirm the latest rating and notes for candidate ${expected.candidate_id}.`);
  }
}

export function verifyCoffeeChatSaveResponse(payload, response) {
  if (String(response?.roundId || "") !== payload.round_id) {
    throw new Error("The save response came from a different Coffee Chat round.");
  }
  const savedByCandidate = new Map(
    (response?.evaluations || []).map((evaluation) => [String(evaluation.candidateId || ""), evaluation])
  );
  payload.evaluations.forEach((expected) => {
    assertEvaluationMatches(expected, savedByCandidate.get(String(expected.candidate_id)), payload.round_id, "The save response");
  });
  return savedByCandidate;
}

export function verifyCoffeeChatReload(payload, candidates = []) {
  const candidateById = new Map(candidates.map((candidate) => [String(candidate.id || ""), candidate]));
  payload.evaluations.forEach((expected) => {
    const candidate = candidateById.get(String(expected.candidate_id));
    assertEvaluationMatches(expected, candidate?.evaluation, payload.round_id, "The refreshed table");
  });
}

export function draftFromEvaluation(evaluation) {
  return {
    rating: evaluation?.rating || "",
    notes: normalizeNotes(evaluation?.notes),
  };
}
