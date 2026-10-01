const RESUME_WEIGHT = 2 / 3;
const FRQ_WEIGHT = 1 / 3;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function computeWeightedCompositePercent(resumePercent, frqScore, frqMax = 4) {
  const hasResume = hasNumericValue(resumePercent);
  const hasFrq = hasNumericValue(frqScore);
  const numericFrqMax = Number(frqMax);

  if (!hasResume && !hasFrq) return null;
  if (!hasFrq) return Number(clampPercent(resumePercent).toFixed(1));

  const frqPercent = Number.isFinite(numericFrqMax) && numericFrqMax > 0
    ? clampPercent((Number(frqScore) / numericFrqMax) * 100)
    : null;
  if (frqPercent == null) return hasResume ? Number(clampPercent(resumePercent).toFixed(1)) : null;
  if (!hasResume) return Number(frqPercent.toFixed(1));

  return Number((
    clampPercent(resumePercent) * RESUME_WEIGHT
    + frqPercent * FRQ_WEIGHT
  ).toFixed(1));
}
