function normalizeRequiredFrqNotes(notes) {
  const normalized = String(notes ?? "").trim();
  return normalized || null;
}

module.exports = {
  normalizeRequiredFrqNotes,
};
