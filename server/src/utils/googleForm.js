const fs = require("fs");
const { GoogleAuth, JWT } = require("google-auth-library");
const { forms } = require("@googleapis/forms");
const { drive } = require("@googleapis/drive");
const { resolveFormConfigPath } = require("./formConfigPath");

const SCOPES_READ = [
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const SCOPES_BODY = ["https://www.googleapis.com/auth/forms.body.readonly"];

const CANDIDATE_COLUMNS = [
  "name",
  "email",
  "phone_number",
  "major",
  "gpa",
  "year",
  "pronouns",
  "urm",
  "linkedin",
  "gm",
  "newbie_training",
  "why_consulting",
  "why_180dc",
  "why_social_impact",
  "resume_file_url",
  "extenuating_circumstances",
  "headshot",
];

const TITLE_COLUMN_HINTS = [
  { column: "name", patterns: ["full name", "your name", "name"] },
  { column: "email", patterns: ["email address", "email", "e-mail"] },
  { column: "phone_number", patterns: ["phone number", "phone", "mobile"] },
  { column: "major", patterns: ["major", "field of study"] },
  { column: "gpa", patterns: ["gpa", "grade point"] },
  { column: "year", patterns: ["class year", "academic year", "year in school", "year"] },
  { column: "pronouns", patterns: ["pronoun"] },
  { column: "urm", patterns: ["urm", "underrepresented", "minority"] },
  { column: "linkedin", patterns: ["linkedin"] },
  { column: "gm", patterns: ["general member", "gm interest", " gm "] },
  { column: "newbie_training", patterns: ["newbie", "training program"] },
  { column: "why_consulting", patterns: ["why consulting", "consulting interest"] },
  { column: "why_180dc", patterns: ["why 180", "180dc", "why join 180"] },
  { column: "why_social_impact", patterns: ["social impact", "why social"] },
  { column: "resume_file_url", patterns: ["resume", "cv", "curriculum vitae"] },
  { column: "extenuating_circumstances", patterns: ["extenuating", "circumstance", "additional context"] },
  { column: "headshot", patterns: ["headshot", "photo", "profile picture", "picture of yourself"] },
];

function getKeyFilePath() {
  return process.env.GOOGLE_CLOUD_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

/** Workspace user who owns the form / upload folder (domain-wide delegation). */
function getDriveImpersonateUser() {
  return (
    process.env.GOOGLE_DRIVE_IMPERSONATE_USER
    || process.env.GMAIL_IMPERSONATE_USER
    || ""
  ).trim();
}

function parseGoogleFormId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }

  const match = trimmed.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function suggestColumnForTitle(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  for (const hint of TITLE_COLUMN_HINTS) {
    for (const pattern of hint.patterns) {
      const p = pattern.trim();
      if (normalized === p || normalized.includes(p)) {
        return hint.column;
      }
    }
  }
  return null;
}

function buildSuggestedFieldMap(questions) {
  const fieldMap = {};
  const usedColumns = new Set();

  for (const q of questions) {
    const column = suggestColumnForTitle(q.title);
    if (!column || usedColumns.has(column)) continue;
    fieldMap[q.questionId] = column;
    usedColumns.add(column);
  }
  return fieldMap;
}

function inferFileQuestionIds(questions, fieldMap) {
  let resumeQuestionId;
  let headshotQuestionId;

  for (const [questionId, column] of Object.entries(fieldMap || {})) {
    if (column === "resume_file_url") resumeQuestionId = questionId;
    if (column === "headshot") headshotQuestionId = questionId;
  }

  if (!resumeQuestionId) {
    const resumeQ = questions.find((q) => suggestColumnForTitle(q.title) === "resume_file_url");
    if (resumeQ) resumeQuestionId = resumeQ.questionId;
  }
  if (!headshotQuestionId) {
    const headQ = questions.find((q) => suggestColumnForTitle(q.title) === "headshot");
    if (headQ) headshotQuestionId = headQ.questionId;
  }

  return { resumeQuestionId, headshotQuestionId };
}

function validateFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== "object" || Array.isArray(fieldMap)) {
    return "fieldMap must be an object";
  }

  const entries = Object.entries(fieldMap);
  if (!entries.length) {
    return "fieldMap must include at least one question mapping";
  }

  for (const [questionId, column] of entries) {
    if (!questionId || typeof questionId !== "string") {
      return "fieldMap keys must be question ids";
    }
    if (typeof column !== "string" || !CANDIDATE_COLUMNS.includes(column)) {
      return `Invalid column "${column}" for question ${questionId}`;
    }
  }

  const hasName = entries.some(([, col]) => col === "name");
  const hasEmail = entries.some(([, col]) => col === "email");
  if (!hasName || !hasEmail) {
    return "fieldMap must map at least name and email";
  }

  return null;
}

function cycleRowToFormConfig(row) {
  if (!row?.google_form_id) return null;
  const fieldMap = row.form_field_map && typeof row.form_field_map === "object" ? row.form_field_map : {};
  return {
    formId: row.google_form_id,
    fieldMap,
    resumeQuestionId: row.form_resume_question_id || undefined,
    headshotQuestionId: row.form_headshot_question_id || undefined,
  };
}

function loadLegacyFormConfig() {
  try {
    const configPath = resolveFormConfigPath();
    if (!fs.existsSync(configPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const formId = parsed.formId;
    if (!formId || typeof formId !== "string" || /^YOUR_/i.test(formId.trim())) {
      return null;
    }
    return {
      formId: formId.trim(),
      fieldMap: parsed.fieldMap && typeof parsed.fieldMap === "object" ? parsed.fieldMap : {},
      resumeQuestionId: typeof parsed.resumeQuestionId === "string" ? parsed.resumeQuestionId : undefined,
      headshotQuestionId: typeof parsed.headshotQuestionId === "string" ? parsed.headshotQuestionId : undefined,
    };
  } catch {
    return null;
  }
}

async function getFormsClient(scopes = SCOPES_READ) {
  const keyFile = getKeyFilePath();
  if (!keyFile) {
    throw new Error("Set GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path.");
  }
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google key file not found: ${keyFile}`);
  }

  const auth = new GoogleAuth({ keyFile, scopes });
  const authClient = await auth.getClient();
  return forms({ version: "v1", auth: authClient });
}

/** Drive client for streaming form uploads when credentials are configured. */
async function getDriveClient() {
  const keyFile = getKeyFilePath();
  if (!keyFile || !fs.existsSync(keyFile)) return null;

  const impersonate = getDriveImpersonateUser();
  if (impersonate) {
    const auth = new JWT({
      keyFile,
      scopes: SCOPES_READ,
      subject: impersonate,
    });
    return drive({ version: "v3", auth });
  }

  const auth = new GoogleAuth({ keyFile, scopes: SCOPES_READ });
  const authClient = await auth.getClient();
  return drive({ version: "v3", auth: authClient });
}

async function discoverFormQuestions(formId) {
  const forms = await getFormsClient(SCOPES_BODY);
  const res = await forms.forms.get({ formId });
  const questions = [];

  (res.data.items || []).forEach((item) => {
    const questionId = item.questionItem?.question?.questionId;
    if (!questionId) return;
    questions.push({
      questionId,
      title: (item.title || "").replace(/\s+/g, " ").trim() || "Untitled",
    });
  });

  return {
    formId,
    formTitle: res.data.info?.title || null,
    questions,
  };
}

function isGoogleFormsConfigured() {
  return Boolean(getKeyFilePath() && fs.existsSync(getKeyFilePath()));
}

module.exports = {
  CANDIDATE_COLUMNS,
  SCOPES_READ,
  getKeyFilePath,
  parseGoogleFormId,
  suggestColumnForTitle,
  buildSuggestedFieldMap,
  inferFileQuestionIds,
  validateFieldMap,
  cycleRowToFormConfig,
  loadLegacyFormConfig,
  getFormsClient,
  getDriveClient,
  getDriveImpersonateUser,
  discoverFormQuestions,
  isGoogleFormsConfigured,
};
