/**
 * Maps Google Forms API FormResponse answers to Supabase candidates + resume fields.
 * @see https://developers.google.com/forms/api/reference/rest/v1/forms.responses#FormResponse
 */

const { isGoogleDriveFileUrl } = require('./drive');
const { normalizeUniversityId } = require('./candidateLink');

const DEFAULT_TEXT = "";

const VALID_YEAR = new Set([
  "Freshman",
  "Sophomore",
  "Junior Transfer",
  "Junior",
  "Senior",
]);

const YEAR_ALIASES = new Map(
  Object.entries({
    freshman: "Freshman",
    "1st year": "Freshman",
    "first year": "Freshman",
    sophomore: "Sophomore",
    "2nd year": "Sophomore",
    "second year": "Sophomore",
    junior: "Junior",
    "3rd year": "Junior",
    "third year": "Junior",
    "junior transfer": "Junior Transfer",
    "transfer junior": "Junior Transfer",
    "3rd year transfer": "Junior Transfer",
    senior: "Senior",
    "4th year": "Senior",
    "fourth year": "Senior",
  }).map(([k, v]) => [k.toLowerCase(), v])
);

function normalizeYear(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (VALID_YEAR.has(s)) return s;
  const lower = s.toLowerCase();
  if (YEAR_ALIASES.has(lower)) return YEAR_ALIASES.get(lower);
  const collapsed = lower.replace(/\s+/g, " ");
  if (YEAR_ALIASES.has(collapsed)) return YEAR_ALIASES.get(collapsed);
  for (const v of VALID_YEAR) {
    if (v.toLowerCase() === lower) return v;
  }
  return null;
}

function driveViewUrl(fileId) {
  if (!fileId) return DEFAULT_TEXT;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * @param {import('@googleapis/forms').forms_v1.Schema$Answer} answer
 * @returns {string} Plain text / choice text (not file URLs).
 */
function extractTextFromAnswer(answer) {
  if (!answer) return DEFAULT_TEXT;

  const textAnswers = answer.textAnswers?.answers;
  if (textAnswers?.length) {
    return textAnswers.map((a) => a.value || "").filter(Boolean).join(", ");
  }

  if (answer.choiceAnswers?.answers?.length) {
    return answer.choiceAnswers.answers.map((a) => a.value || "").filter(Boolean).join(", ");
  }

  if (answer.scaleAnswer != null && answer.scaleAnswer !== "") {
    return String(answer.scaleAnswer);
  }

  if (answer.dateAnswers?.answers?.length) {
    return answer.dateAnswers.answers.map((a) => a.value || "").filter(Boolean).join(", ");
  }

  if (answer.timeAnswers?.answers?.length) {
    return answer.timeAnswers.answers.map((a) => a.value || "").filter(Boolean).join(", ");
  }

  return DEFAULT_TEXT;
}

/**
 * @param {import('@googleapis/forms').forms_v1.Schema$Answer} answer
 * @returns {string} First uploaded file as Drive view URL, or empty string.
 */
function extractFileUrlFromAnswer(answer) {
  const files = answer?.fileUploadAnswers?.answers;
  if (!files?.length) return DEFAULT_TEXT;
  const fileId = files[0].fileId;
  return driveViewUrl(fileId);
}

/**
 * @param {import('@googleapis/forms').forms_v1.Schema$Answer} answer
 * @param {string} columnName Supabase column (e.g. resume_file_url).
 */
function sanitizeResumeFileUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_TEXT;
  const trimmed = url.trim();
  return isGoogleDriveFileUrl(trimmed) ? trimmed : DEFAULT_TEXT;
}

function extractValueForColumn(answer, columnName) {
  const fileFields = new Set(["resume_file_url", "headshot"]);
  if (fileFields.has(columnName)) {
    const fileUrl = extractFileUrlFromAnswer(answer);
    if (fileUrl) {
      return columnName === 'resume_file_url' ? sanitizeResumeFileUrl(fileUrl) : fileUrl;
    }
    if (columnName === 'resume_file_url') {
      return sanitizeResumeFileUrl(extractTextFromAnswer(answer));
    }
  }
  return extractTextFromAnswer(answer);
}

const CANDIDATE_TEXT_COLUMNS = [
  "name",
  "email",
  "phone_number",
  "major",
  "gpa",
  "pronouns",
  "urm",
  "linkedin",
  "gm",
  "newbie_training",
  "resume_file_url",
  "extenuating_circumstances",
  "headshot",
  "first_name",
  "last_name",
  "referral_source",
  "previously_applied",
  "professional_development",
  "consulting_connect_interest",
];

function buildApplicationResponses(answers, config) {
  const gradableIds = new Set(config.gradableQuestionIds || []);
  const catalog = Array.isArray(config.questionCatalog) ? config.questionCatalog : [];
  return catalog
    .filter((question) => question.type === "paragraph" || gradableIds.has(question.questionId))
    .map((question) => ({
      questionId: question.questionId,
      title: String(question.title || "Untitled question").trim(),
      answer: extractTextFromAnswer(answers[question.questionId]),
      gradable: gradableIds.has(question.questionId),
    }));
}

/**
 * @typedef {Object} FormSyncConfig
 * @property {string} formId
 * @property {Record<string, string>} fieldMap questionItemId -> candidates column name
 * @property {string} [resumeQuestionId]
 * @property {string} [headshotQuestionId]
 * @property {Array<{questionId: string, title: string, type?: string}>} [questionCatalog]
 * @property {string[]} [gradableQuestionIds]
 */

/**
 * @param {import('@googleapis/forms').forms_v1.Schema$FormResponse} response
 * @param {FormSyncConfig} config
 * @returns {{ google_form_response_id: string, candidateRow: Record<string, unknown>, resumeDerived: { name: string, file_url: string } } | null}
 */
function mapFormResponseToCandidate(response, config) {
  const google_form_response_id = response.responseId;
  if (!google_form_response_id) return null;

  const answers = response.answers || {};
  const fieldMap = config.fieldMap || {};

  /** @type {Record<string, string>} */
  const columnValues = {};

  for (const [questionId, rawColumn] of Object.entries(fieldMap)) {
    if (typeof rawColumn !== "string") continue;
    const columnName = rawColumn;
    const allowed = CANDIDATE_TEXT_COLUMNS.includes(columnName) || columnName === "year" || columnName === "university_id";
    if (!allowed) continue;
    const answer = answers[questionId];
    if (columnName === "year") {
      const raw = extractTextFromAnswer(answer);
      columnValues.year = normalizeYear(raw);
    } else if (columnName === "university_id") {
      columnValues.university_id = normalizeUniversityId(extractTextFromAnswer(answer)) || null;
    } else {
      columnValues[columnName] = extractValueForColumn(answer, columnName);
    }
  }

  const resumeQ = config.resumeQuestionId;
  if (resumeQ && answers[resumeQ]) {
    const resumeUrl = extractFileUrlFromAnswer(answers[resumeQ]) || columnValues.resume_file_url || "";
    columnValues.resume_file_url = sanitizeResumeFileUrl(resumeUrl);
  } else if (columnValues.resume_file_url) {
    columnValues.resume_file_url = sanitizeResumeFileUrl(columnValues.resume_file_url);
  }

  const headQ = config.headshotQuestionId;
  if (headQ && answers[headQ]) {
    columnValues.headshot = extractFileUrlFromAnswer(answers[headQ]) || columnValues.headshot || "";
  }

  const combinedName = [columnValues.first_name, columnValues.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const candidateRow = {
    google_form_response_id,
    name: combinedName || columnValues.name || DEFAULT_TEXT,
    first_name: columnValues.first_name ?? DEFAULT_TEXT,
    last_name: columnValues.last_name ?? DEFAULT_TEXT,
    email: columnValues.email ?? DEFAULT_TEXT,
    phone_number: columnValues.phone_number ?? DEFAULT_TEXT,
    major: columnValues.major ?? DEFAULT_TEXT,
    gpa: columnValues.gpa ?? DEFAULT_TEXT,
    year: columnValues.year ?? null,
    pronouns: columnValues.pronouns ?? DEFAULT_TEXT,
    urm: columnValues.urm ?? DEFAULT_TEXT,
    linkedin: columnValues.linkedin ?? DEFAULT_TEXT,
    gm: columnValues.gm ?? DEFAULT_TEXT,
    newbie_training: columnValues.newbie_training ?? DEFAULT_TEXT,
    resume_file_url: columnValues.resume_file_url ?? DEFAULT_TEXT,
    extenuating_circumstances: columnValues.extenuating_circumstances ?? DEFAULT_TEXT,
    headshot: columnValues.headshot ?? DEFAULT_TEXT,
    referral_source: columnValues.referral_source ?? DEFAULT_TEXT,
    previously_applied: columnValues.previously_applied ?? DEFAULT_TEXT,
    professional_development: columnValues.professional_development ?? DEFAULT_TEXT,
    consulting_connect_interest: columnValues.consulting_connect_interest ?? DEFAULT_TEXT,
    application_responses: buildApplicationResponses(answers, config),
  };
  // Only written when mapped, so cycles that don't map a UID question never touch the column.
  if ("university_id" in columnValues) candidateRow.university_id = columnValues.university_id;

  const resumeDerived = {
    name: candidateRow.name || "Unknown",
    file_url: candidateRow.resume_file_url || DEFAULT_TEXT,
  };

  return { google_form_response_id, candidateRow, resumeDerived };
}

module.exports = {
  mapFormResponseToCandidate,
  normalizeYear,
  extractTextFromAnswer,
  extractFileUrlFromAnswer,
};
