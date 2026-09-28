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
  "first_name",
  "last_name",
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
  "university_id",
  "referral_source",
  "previously_applied",
  "professional_development",
  "consulting_connect_interest",
];

// Bare "uid" is omitted on purpose: titles match by substring, so it would hit "guide" or "fluid".
const TITLE_COLUMN_HINTS = [
  { column: "university_id", patterns: ["university id", "student id", "ucla id", "bruin id"] },
  { column: "first_name", patterns: ["first name", "given name"] },
  { column: "last_name", patterns: ["last name", "family name", "surname"] },
  { column: "name", patterns: ["full name", "your name", "name"] },
  { column: "email", patterns: ["email address", "email", "e-mail"] },
  { column: "phone_number", patterns: ["phone number", "phone", "mobile"] },
  { column: "major", patterns: ["major", "field of study"] },
  { column: "gpa", patterns: ["gpa", "grade point"] },
  { column: "year", patterns: ["class year", "academic year", "year in school", "year"] },
  { column: "pronouns", patterns: ["pronoun"] },
  { column: "urm", patterns: ["urm", "underrepresented", "minority", "identify as a part of any of these communities"] },
  { column: "linkedin", patterns: ["linkedin"] },
  { column: "gm", patterns: ["general member", "general meeting", "gm interest", " gm "] },
  { column: "newbie_training", patterns: ["newbie", "new member training", "training program"] },
  { column: "referral_source", patterns: ["how did you hear", "how you heard", "heard about"] },
  { column: "previously_applied", patterns: ["applied to 180dc in the past", "applied in the past", "previously applied"] },
  { column: "professional_development", patterns: ["upcoming internships", "professional development programs"] },
  { column: "consulting_connect_interest", patterns: ["interested in being considered", "consulting connect interest"] },
  // Written responses are selected explicitly as gradable questions. Do not guess
  // legacy why_* columns from title fragments; that caused "How did you hear about
  // 180DC?" to appear under the Why 180DC grading label.
  { column: "resume_file_url", patterns: ["resume", "cv", "curriculum vitae"] },
  { column: "extenuating_circumstances", patterns: ["extenuating", "circumstance", "additional context"] },
  { column: "headshot", patterns: ["headshot", "photo", "profile picture", "picture of yourself"] },
];

// Demonstrated Interest attendance forms only need identity fields for matching.
const INTEREST_FIELD_TARGETS = ["name", "email", "university_id"];
const INTEREST_TITLE_HINTS = TITLE_COLUMN_HINTS.filter((hint) => INTEREST_FIELD_TARGETS.includes(hint.column));

function getKeyFilePath() {
  return process.env.GOOGLE_CLOUD_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

/** Workspace user who owns the form / upload folder (domain-wide delegation). */
function getDriveImpersonateUser() {
  // Gmail and Drive delegation are separate grants. Reusing the Gmail sender
  // here made every resume request fail with unauthorized_client when that
  // account had Gmail delegation but not Drive delegation.
  return String(process.env.GOOGLE_DRIVE_IMPERSONATE_USER || "").trim();
}

// Latched, not time-windowed: the condition is a missing environment variable,
// which cannot change without a restart, so one line per process is the whole
// signal. Reset only for tests.
let warnedMissingDriveDelegation = false;

function warnMissingDriveDelegation() {
  if (warnedMissingDriveDelegation) return;
  warnedMissingDriveDelegation = true;
  console.error(
    "[googleForm] GOOGLE_DRIVE_IMPERSONATE_USER is not set, so Drive reads run as"
    + " the service account itself. Link-shared files still work; files owned by a"
    + " Workspace account (every Google Forms upload) will fail as inaccessible."
    + " Set GOOGLE_DRIVE_IMPERSONATE_USER to the account that owns the form and"
    + " grant it domain-wide delegation for " + SCOPES_READ.join(" ") + "."
    + " Note this is independent of GMAIL_IMPERSONATE_USER."
  );
}

// Share links (/forms/d/e/<publishId>/viewform) carry a publish id, not the form id the API needs.
function isGoogleFormResponderUrl(input) {
  return /\/forms\/d\/e\//.test(String(input || ""));
}

function parseGoogleFormId(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed || isGoogleFormResponderUrl(trimmed)) return null;

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes("/")) {
    return trimmed;
  }

  const match = trimmed.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/** Error to show when parseGoogleFormId(input) returns null. */
function googleFormUrlError(input) {
  return isGoogleFormResponderUrl(input)
    ? "That's the form's share link, which the Google Forms API can't read. Open the form in edit mode and paste that URL instead (docs.google.com/forms/d/.../edit)."
    : "Invalid Google Form URL or ID. Use the form edit URL (docs.google.com/forms/d/.../edit).";
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function suggestColumnForTitle(title, hints = TITLE_COLUMN_HINTS) {
  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  for (const hint of hints) {
    for (const pattern of hint.patterns) {
      const p = pattern.trim();
      const namePrompt = p === "name"
        && (normalized === "name" || normalized.startsWith("name ") || normalized.endsWith(" name"));
      if (namePrompt || (p !== "name" && normalized.includes(p))) {
        return hint.column;
      }
    }
  }
  return null;
}

function buildSuggestedFieldMap(questions, hints = TITLE_COLUMN_HINTS) {
  const fieldMap = {};
  const usedColumns = new Set();

  for (const q of questions) {
    const column = suggestColumnForTitle(q.title, hints);
    if (["resume_file_url", "headshot"].includes(column) && q.type && q.type !== "file_upload") continue;
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
    const resumeQ = questions.find((q) => (!q.type || q.type === "file_upload") && suggestColumnForTitle(q.title) === "resume_file_url");
    if (resumeQ) resumeQuestionId = resumeQ.questionId;
  }
  if (!headshotQuestionId) {
    const headQ = questions.find((q) => (!q.type || q.type === "file_upload") && suggestColumnForTitle(q.title) === "headshot");
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
  const hasSplitName = entries.some(([, col]) => col === "first_name")
    && entries.some(([, col]) => col === "last_name");
  const hasEmail = entries.some(([, col]) => col === "email");
  if ((!hasName && !hasSplitName) || !hasEmail) {
    return "fieldMap must map email and either name or both first and last name";
  }

  const targets = entries.map(([, column]) => column);
  const duplicate = targets.find((column, index) => targets.indexOf(column) !== index);
  if (duplicate) return `Only one question can map to ${duplicate}`;

  return null;
}

function validateQuestionCatalog(questionCatalog) {
  if (!Array.isArray(questionCatalog)) return "questionCatalog must be an array";
  const ids = new Set();
  for (const question of questionCatalog) {
    if (!question || typeof question.questionId !== "string" || !question.questionId.trim()) {
      return "Every question catalog entry must include a questionId";
    }
    if (ids.has(question.questionId)) return `Duplicate question id ${question.questionId}`;
    if (typeof question.title !== "string" || !question.title.trim()) {
      return `Question ${question.questionId} must include a title`;
    }
    ids.add(question.questionId);
  }
  return null;
}

function validateGradableQuestionIds(questionIds, questionCatalog = []) {
  if (!Array.isArray(questionIds)) return "gradableQuestionIds must be an array";
  const catalogIds = new Set(questionCatalog.map((question) => question.questionId));
  const seen = new Set();
  for (const rawId of questionIds) {
    if (typeof rawId !== "string" || !rawId.trim()) return "Gradable question ids must be strings";
    if (seen.has(rawId)) return `Duplicate gradable question id ${rawId}`;
    if (catalogIds.size && !catalogIds.has(rawId)) return `Gradable question ${rawId} is not in the question catalog`;
    seen.add(rawId);
  }
  return null;
}

function validateInterestFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== "object" || Array.isArray(fieldMap)) {
    return "fieldMap must be an object";
  }

  const targets = [];
  for (const [questionId, target] of Object.entries(fieldMap)) {
    if (!questionId || typeof questionId !== "string") {
      return "fieldMap keys must be question ids";
    }
    if (typeof target !== "string" || !INTEREST_FIELD_TARGETS.includes(target)) {
      return `Invalid field "${target}" for question ${questionId}`;
    }
    if (targets.includes(target)) {
      return `Only one question can map to ${target}`;
    }
    targets.push(target);
  }

  if (!targets.includes("email") && !targets.includes("university_id")) {
    return "Map at least an Email or University ID question so attendance can be matched";
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
    questionCatalog: Array.isArray(row.form_question_catalog) ? row.form_question_catalog : [],
    gradableQuestionIds: Array.isArray(row.form_gradable_question_ids) ? row.form_gradable_question_ids : [],
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
    // Pass email/key explicitly (instead of keyFile) so the JWT's `iss` claim
    // is populated at construction time. google-auth-library's JWT client sets
    // `iss` from `email` in its constructor, but only loads `email` from
    // `keyFile` lazily on first token request — with keyFile-only options,
    // `iss` is permanently locked to `undefined`, and Google rejects the
    // resulting token with "invalid_grant: Invalid issuer: null".
    const { client_email: email, private_key: key } = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    const auth = new JWT({
      email,
      key,
      scopes: SCOPES_READ,
      subject: impersonate,
    });
    return drive({ version: "v3", auth });
  }

  // No delegation subject configured. A bare service-account client still reads
  // link-shared files, which is how local dev and non-Workspace deployments
  // work, so this branch stays — but on a Workspace deployment it is an outage
  // dressed as a working client: Drive answers 401/403/404 per file and every
  // caller treats that as "this one file isn't shared" and falls through to the
  // public URL, which then returns a sign-in page for every restricted upload.
  //
  // So warn loudly enough to grep for, and exactly once: getDriveClient() is
  // called on every resume view and every worker download, and a per-request
  // line would bury the signal in the noise it is meant to cut through.
  warnMissingDriveDelegation();
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
    const question = item.questionItem.question;
    let type = "unknown";
    if (question.textQuestion) type = question.textQuestion.paragraph ? "paragraph" : "text";
    else if (question.choiceQuestion) type = "choice";
    else if (question.fileUploadQuestion) type = "file_upload";
    else if (question.scaleQuestion) type = "scale";
    else if (question.dateQuestion) type = "date";
    else if (question.timeQuestion) type = "time";

    questions.push({
      questionId,
      title: (item.title || "").replace(/\s+/g, " ").trim() || "Untitled",
      type,
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
  INTEREST_FIELD_TARGETS,
  INTEREST_TITLE_HINTS,
  SCOPES_READ,
  getKeyFilePath,
  parseGoogleFormId,
  isGoogleFormResponderUrl,
  googleFormUrlError,
  suggestColumnForTitle,
  buildSuggestedFieldMap,
  inferFileQuestionIds,
  validateFieldMap,
  validateQuestionCatalog,
  validateGradableQuestionIds,
  validateInterestFieldMap,
  cycleRowToFormConfig,
  loadLegacyFormConfig,
  getFormsClient,
  getDriveClient,
  getDriveImpersonateUser,
  discoverFormQuestions,
  isGoogleFormsConfigured,
};
