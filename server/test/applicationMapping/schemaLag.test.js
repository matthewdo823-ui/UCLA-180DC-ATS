process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_KEY ||= "test-only";

const test = require("node:test");
const assert = require("node:assert/strict");

const { upsertCandidatesAndResumesBatch } = require("../../src/services/formsSyncService");

const MISSING_COLUMN = {
  code: "PGRST204",
  message: "Could not find the 'application_responses' column of 'candidates' in the schema cache",
};

const MAPPING_COLUMNS = [
  "first_name", "last_name", "referral_source", "previously_applied",
  "professional_development", "consulting_connect_interest", "application_responses",
];

/**
 * Stands in for a production database that has the code's schema minus
 * migration 32 — it rejects any write mentioning a mapping column, exactly as
 * PostgREST does, rather than silently ignoring it.
 */
function legacyDatabase({ attempts }) {
  return {
    from(table) {
      const builder = {
        _rows: null,
        upsert(rows) { builder._rows = rows; return builder; },
        select() {
          if (table !== "candidates") return Promise.resolve({ data: [], error: null });
          attempts.push(builder._rows);
          const offending = builder._rows.some(
            row => MAPPING_COLUMNS.some(column => column in row)
          );
          if (offending) return Promise.resolve({ data: null, error: MISSING_COLUMN });
          return Promise.resolve({
            data: builder._rows.map((row, i) => ({
              id: `candidate-${i}`, google_form_response_id: row.google_form_response_id,
            })),
            error: null,
          });
        },
        eq() { return builder; },
        in() { return Promise.resolve({ data: [], error: null }); },
        is() { return builder; },
        ilike() { return builder; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        update() { return Promise.resolve({ data: null, error: null }); },
        insert() { return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
  };
}

test("a submission is still recorded when the mapping migration has not run", async () => {
  const attempts = [];
  const client = legacyDatabase({ attempts });
  const candidateRow = {
    google_form_response_id: "response-1",
    name: "Joe Bruin",
    email: "joe@example.com",
    headshot: "",
    first_name: "Joe",
    last_name: "Bruin",
    referral_source: "A friend",
    previously_applied: "No",
    professional_development: "",
    consulting_connect_interest: "",
    application_responses: [{ questionId: "q1", title: "Why consulting?", answer: "Impact." }],
  };

  await upsertCandidatesAndResumesBatch(
    client, [{ candidateRow, resumeDerived: { name: "Joe Bruin", file_url: "" } }], "cycle-1", []
  );

  assert.equal(attempts.length, 2, "the full shape is tried first, then the legacy shape");
  const [[firstRow], [retriedRow]] = attempts;
  assert.ok("application_responses" in firstRow, "first attempt keeps the new columns");
  for (const column of MAPPING_COLUMNS) {
    assert.ok(!(column in retriedRow), `retry drops ${column}`);
  }
  // The submission itself — identity and legacy columns — must survive.
  assert.equal(retriedRow.google_form_response_id, "response-1");
  assert.equal(retriedRow.name, "Joe Bruin");
  assert.equal(retriedRow.email, "joe@example.com");
});
