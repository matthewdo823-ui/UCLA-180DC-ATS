const supabase = require('../config/supabase');
const { firstRel } = require('../utils/supabaseHelpers');
const { getActiveCycleId } = require('../utils/cycleContext');
const { mapApplicationCandidate } = require('../utils/applicationCandidate');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASIC = 'id, cycle_id, name, email, phone_number, major, gpa, year, pronouns, urm, linkedin, gm, newbie_training, headshot, created_at';
const RESPONSES = 'id, cycle_id, why_consulting, why_180dc, why_social_impact, extenuating_circumstances';

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
          client.from('resumes').select(`id, name, file_url, created_at, cycle_id,
            candidates (${responsesOnly ? RESPONSES : BASIC}), cycles (id, name)`)
            .eq('id', req.params.resumeId).maybeSingle(),
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
          whyConsulting: mapped.whyConsulting, why180dc: mapped.why180dc,
          whySocialImpact: mapped.whySocialImpact, extenuatingCircumstances: mapped.extenuatingCircumstances,
        } });
        // Essays, scores and history have independent requests after this shell.
        for (const key of ['whyConsulting', 'why180dc', 'whySocialImpact', 'extenuatingCircumstances']) delete mapped[key];
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
