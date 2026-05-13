const path = require("path");

/**
 * Absolute path to Google Form sync JSON (same rules as forms sync).
 * @see FORM_CONFIG_PATH in .env — defaults to server/form-config.json
 */
function resolveFormConfigPath() {
  if (process.env.FORM_CONFIG_PATH) {
    return path.resolve(process.env.FORM_CONFIG_PATH);
  }
  return path.join(__dirname, "..", "..", "form-config.json");
}

module.exports = { resolveFormConfigPath };
