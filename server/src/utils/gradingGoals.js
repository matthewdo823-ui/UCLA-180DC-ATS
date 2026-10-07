const DEFAULT_GRADER_REVIEW_GOAL = 30;
const MAX_GRADER_REVIEW_GOAL = 10000;

const FIELD_CONFIG = [
  { requestKey: "resumeReviewsPerApplicant", column: "resume_reviews_per_applicant", label: "Resume reviews per applicant", max: 10000 },
  { requestKey: "frqReviewsPerApplicant", column: "frq_reviews_per_applicant", label: "FRQ reviews per applicant", max: 10000 },
  {
    requestKey: "resumeGraderGoal",
    column: "resume_grader_goal",
    label: "Resume grader goal",
    max: MAX_GRADER_REVIEW_GOAL,
  },
  {
    requestKey: "frqGraderGoal",
    column: "frq_grader_goal",
    label: "Free-response grader goal",
    max: MAX_GRADER_REVIEW_GOAL,
  },
];

function positiveInteger(value) {
  if (value === null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function legacyGoalDefaults(env = process.env) {
  const resume = positiveInteger(env.GRADER_REVIEW_GOAL) || DEFAULT_GRADER_REVIEW_GOAL;
  const frq = positiveInteger(env.FRQ_REVIEW_GOAL) || resume;
  return { resume, frq };
}

function resolveCycleGradingGoals(cycle, env = process.env) {
  const defaults = legacyGoalDefaults(env);
  return {
    resumeGraderGoal: positiveInteger(cycle?.resume_grader_goal) || defaults.resume,
    frqGraderGoal: positiveInteger(cycle?.frq_grader_goal) || defaults.frq,
    resumeReviewsPerApplicant: positiveInteger(cycle?.resume_reviews_per_applicant) || 2,
    frqReviewsPerApplicant: positiveInteger(cycle?.frq_reviews_per_applicant) || 2,
  };
}

function parseCycleGradingGoalUpdates(body = {}) {
  const updates = {};

  for (const field of FIELD_CONFIG) {
    if (!Object.prototype.hasOwnProperty.call(body, field.requestKey)) continue;

    const rawValue = body[field.requestKey];
    const value = positiveInteger(rawValue);
    if (value === null || value > field.max) {
      const range = `a whole number from 1 to ${field.max}`;
      return { error: `${field.label} must be ${range}` };
    }
    updates[field.column] = value;
  }

  return { updates };
}

module.exports = {
  DEFAULT_GRADER_REVIEW_GOAL,
  MAX_GRADER_REVIEW_GOAL,
  legacyGoalDefaults,
  resolveCycleGradingGoals,
  parseCycleGradingGoalUpdates,
};
