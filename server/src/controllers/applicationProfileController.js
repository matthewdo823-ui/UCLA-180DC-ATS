const supabase = require('../config/supabase');
const { firstRel } = require('../utils/supabaseHelpers');
const { getActiveCycleId } = require('../utils/cycleContext');
const { mapApplicationCandidate } = require('../utils/applicationCandidate');
const { isMissingSchemaError } = require('../utils/schemaCompatibility');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASIC = 'id, cycle_id, name, email, phone_number, major, gpa, year, pronouns, urm, linkedin, gm, newbie_training, referral_source, previously_applied, professional_development, consulting_connect_interest, headshot, created_at';
const BASIC_LEGACY = 'id, cycle_id, name, email, phone_number, major, gpa, year, pronouns, urm, linkedin, gm, newbie_training, headshot, created_at';
const RESPONSES = 'id, cycle_id, application_responses, extenuating_circumstances';
const RESPONSES_LEGACY = 'id, cycle_id, extenuating_circumstances';

async function fetchProfileRow(client, resumeId, responsesOnly) {
  const selectRow = candidateFields => client.from('resumes').select(`id, name, file_url, created_at, cycle_id,
    candidates (${candidateFields}), cycles (id, name)`)
    .eq('id', resumeId).maybeSingle();
  let result = await selectRow(responsesOnly ? RESPONSES : BASIC);
  if (result.error && isMissingSchemaError(result.error)) {
    // Keep profiles and legacy essays readable while code and the additive
    // question-mapping migration are briefly on opposite sides of a deploy.
    result = await selectRow(responsesOnly ? RESPONSES_LEGACY : BASIC_LEGACY);
  }
  return result;
}

function createApplicationProfileHandlers({ client = supabase } = {}) {
  function handler(responsesOnly) {
    return async (req, res) => {
      const start = performance.now();
      res.setHeader('Cache-Control', 'no-store');
      if (!UUID.test(req.params.resumeId || '') || (req.query.cycleId && !UUID.test(req.query.cycleId))) {
        return res.status(400).json({ error: 'Invalid application or cycle ID' });
      }
      try {
        const [result, cycleId] = await Promise.all([
          fetchProfileRow(client, req.params.resumeId, responsesOnly),
          req.query.cycleId || getActiveCycleId(client),
        ]);
        if (result.error) throw result.error;
        const row = result.data;
        const candidate = firstRel(row?.candidates);
        if (!cycleId || !row || row.cycle_id !== cycleId || !candidate || candidate.cycle_id !== cycleId) {
          return res.status(404).json({ error: 'Candidate application not found in this cycle' });
        }
        const mapped = mapApplicationCandidate(candidate);
        res.setHeader('Server-Timing', `profile;dur=${(performance.now() - start).toFixed(1)}`);
        if (responsesOnly) return res.json({ responses: {
          applicationResponses: mapped.applicationResponses,
          extenuatingCircumstances: mapped.extenuatingCircumstances,
        } });
        // Essays, scores and history have independent requests after this shell.
        for (const key of ['extenuatingCircumstances']) delete mapped[key];
        return res.json({ candidate: mapped,
          resume: { id: row.id, name: row.name, fileUrl: row.file_url, submittedAt: row.created_at },
          context: { cycle: firstRel(row.cycles) },
        });
      } catch (error) {
        console.error('[applicationProfile]', error.message);
        return res.status(500).json({ error: 'Could not load candidate application' });
      }
    };
  }
  return { profile: handler(false), responses: handler(true) };
}
module.exports = { createApplicationProfileHandlers, ...createApplicationProfileHandlers() };
