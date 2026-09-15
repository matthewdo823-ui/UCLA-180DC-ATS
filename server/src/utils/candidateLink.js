const { extractDriveFileID } = require("./drive");

function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** UCLA UIDs are written as "123456789" or "123-456-789"; compare digits only. */
function normalizeUniversityId(value) {
  return String(value || "").replace(/\D/g, "");
}

function sameDriveFile(urlA, urlB) {
  const idA = extractDriveFileID(urlA);
  const idB = extractDriveFileID(urlB);
  return Boolean(idA && idB && idA === idB);
}

function buildCandidateLinkLookups(candidates) {
  const byId = new Map();
  const byName = new Map();

  (candidates || []).forEach((candidate) => {
    if (!candidate?.id) return;
    byId.set(candidate.id, candidate);
    const nameKey = normalizePersonName(candidate.name);
    if (!nameKey) return;
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(candidate);
  });

  return { byId, byName };
}

/**
 * Resolve a candidates row for a resumes row when candidate_id FK is missing.
 * @returns {{ candidate: object|null, source: string|null, ambiguous: boolean }}
 */
function candidateFromEmbedOrLookup(id, embedded, lookups) {
  if (!id) return null;
  if (lookups.byId.has(id)) return lookups.byId.get(id);
  if (embedded?.id === id) return embedded;
  return { id };
}

function resolveCandidateLink({ resume, embeddedCandidate, lookups }) {
  const resumeRow = resume || {};
  const embedded = embeddedCandidate || null;

  if (resumeRow.candidate_id) {
    const candidate = candidateFromEmbedOrLookup(resumeRow.candidate_id, embedded, lookups);
    if (candidate) {
      return { candidate, source: "fk", ambiguous: false };
    }
  }

  if (embedded?.id) {
    const candidate = candidateFromEmbedOrLookup(embedded.id, embedded, lookups);
    if (candidate) {
      return { candidate, source: "embed", ambiguous: false };
    }
  }

  const nameKey = normalizePersonName(resumeRow.name || embedded?.name);
  if (!nameKey) {
    return { candidate: null, source: null, ambiguous: false };
  }

  const matches = lookups.byName.get(nameKey) || [];
  if (matches.length === 1) {
    return { candidate: matches[0], source: "name", ambiguous: false };
  }

  if (matches.length > 1) {
    const resumeUrl = resumeRow.file_url;
    if (resumeUrl) {
      const byFile = matches.filter((c) => sameDriveFile(resumeUrl, c.resume_file_url));
      if (byFile.length === 1) {
        return { candidate: byFile[0], source: "name_file", ambiguous: false };
      }
    }

    const email = normalizeEmail(embedded?.email);
    if (email) {
      const byEmail = matches.filter((c) => normalizeEmail(c.email) === email);
      if (byEmail.length === 1) {
        return { candidate: byEmail[0], source: "name_email", ambiguous: false };
      }
    }

    return { candidate: null, source: "ambiguous", ambiguous: true };
  }

  return { candidate: null, source: null, ambiguous: false };
}

function pickCandidateFields(candidate) {
  if (!candidate) {
    return {
      email: "",
      phoneNumber: "",
      major: "Undeclared",
      gpa: "",
      year: "",
      pronouns: "",
      linkedin: "",
      gm: "",
      newbieTraining: "",
      headshot: "",
    };
  }

  return {
    email: candidate.email || "",
    phoneNumber: candidate.phone_number || "",
    major: candidate.major || "Undeclared",
    gpa: candidate.gpa || "",
    year: candidate.year || "",
    pronouns: candidate.pronouns || "",
    linkedin: candidate.linkedin || "",
    gm: candidate.gm || "",
    newbieTraining: candidate.newbie_training || "",
    headshot: candidate.headshot || "",
  };
}

function applyResumeCandidateLink(resume, embeddedCandidate, candidateLinkLookups) {
  const embedded = embeddedCandidate || {};
  const { candidate: linked, ambiguous } = resolveCandidateLink({
    resume,
    embeddedCandidate: embedded,
    lookups: candidateLinkLookups,
  });
  const fields = pickCandidateFields(linked || embedded);
  const candidateId = linked?.id || resume?.candidate_id || embedded?.id || null;

  return {
    candidateId,
    canDecide: Boolean(candidateId) && !ambiguous,
    linkAmbiguous: ambiguous,
    ...fields,
  };
}

module.exports = {
  normalizePersonName,
  normalizeEmail,
  normalizeUniversityId,
  buildCandidateLinkLookups,
  resolveCandidateLink,
  pickCandidateFields,
  applyResumeCandidateLink,
};
