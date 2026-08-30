const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function isMissingSchemaError(error) {
  if (!error) return false;
  if (MISSING_SCHEMA_CODES.has(String(error.code || "").toUpperCase())) return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

module.exports = { isMissingSchemaError };
