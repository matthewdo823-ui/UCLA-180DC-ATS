const { test } = require('node:test');
const assert = require('node:assert/strict');

const state = { cycleId: 'cycle-1', rounds: [], decisions: [], tables: [], pool: [] };

function matches(row, filters) {
  return Object.entries(filters).every(([column, matcher]) => (
    Array.isArray(matcher) ? matcher.includes(row[column]) : row[column] === matcher
  ));
}

function tableRows(table) {
  if (table === 'app_settings') return [{ id: 1, active_cycle_id: state.cycleId }];
  if (table === 'cycles') return [{ id: state.cycleId, name: 'Fall 2026' }];
  if (table === 'rounds') return state.rounds;
  if (table === 'round_decisions') return state.decisions;
  if (table === 'interview_group_assignments') return state.tables;
  return [];
}

const db = {
  from(table) {
    const filters = {};
    let gt = null;
    let payload = null;
    const rows = () => {
      let found = tableRows(table).filter((row) => matches(row, filters));
      if (gt) found = found.filter((row) => row[gt.column] > gt.value);
      return found;
    };
    const applyUpdate = () => {
      const hit = rows();
      hit.forEach((row) => Object.assign(row, payload));
      return hit;
    };
    const q = {
      select() { return q; },
      eq(column, value) { filters[column] = value; return q; },
      in(column, values) { filters[column] = values; return q; },
      gt(column, value) { gt = { column, value }; return q; },
      order() { return q; },
      limit() { return q; },
      update(next) { payload = next; return q; },
      async single() { return { data: (payload ? applyUpdate() : rows())[0] || null, error: null }; },
      async maybeSingle() { return { data: (payload ? applyUpdate() : rows())[0] || null, error: null }; },
      then(resolve) { return Promise.resolve({ data: payload ? applyUpdate() : rows(), error: null }).then(resolve); },
    };
    return q;
  },
};

const dbPath = require.resolve('../../src/config/supabase');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

// The pool needs real reviews and decisions; stub it and drive the signals directly.
const delibPath = require.resolve('../../src/services/roundDeliberationService');
require.cache[delibPath] = {
  id: delibPath,
  filename: delibPath,
  loaded: true,
  exports: { loadDeliberationPoolForRound: async () => state.pool },
};

const { transitionRoundToPhase } = require('../../src/services/roundTransitionService');
const { ROUND_PHASES } = require('../../src/utils/roundPhases');

const RUBRIC = { maxPerCategory: 4, byYear: { freshman: { label: 'F', metrics: ['a'] } } };

function round(type, status, extra = {}) {
  const order = { resume_screen: 1, coffee_chat: 2, final_round: 3 }[type];
  return {
    id: `${type}-id`,
    cycle_id: state.cycleId,
    name: { resume_screen: 'Resume Screen', coffee_chat: 'Coffee Chats', final_round: 'Final Round' }[type],
    type,
    status,
    sort_order: order,
    rubric_config: null,
    ...extra,
  };
}

function seed({ rounds, decisions = [], tables = [], pool = [] }) {
  state.rounds = rounds;
  state.decisions = decisions;
  state.tables = tables;
  state.pool = pool;
}

const candidate = (status, numReviews = 1) => ({ numReviews, decision: { status } });
const codes = (list) => (list || []).map((b) => b.code);

test('the resume screen cannot open grading until a rubric exists', async () => {
  seed({ rounds: [round('resume_screen', ROUND_PHASES.SETUP)] });
  const blocked = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading' });
  assert.equal(blocked.status, 400);
  assert.deepEqual(codes(blocked.blockers), ['rubric_missing']);
  assert.equal(state.rounds[0].status, ROUND_PHASES.SETUP, 'must not have written');

  seed({ rounds: [round('resume_screen', ROUND_PHASES.SETUP, { rubric_config: RUBRIC })] });
  const ok = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading', userId: 7 });
  assert.equal(ok.error, undefined);
  assert.equal(state.rounds[0].status, ROUND_PHASES.GRADING);
  assert.equal(state.rounds[0].status_changed_by, 7);
  assert.ok(state.rounds[0].status_changed_at, 'audit timestamp stamped');
});

test('coffee chats need a closed prior round, advances, and tables before grading', async () => {
  const base = () => [round('resume_screen', ROUND_PHASES.DELIBERATION), round('coffee_chat', ROUND_PHASES.SETUP)];

  seed({ rounds: base() });
  const notClosed = await transitionRoundToPhase({ roundId: 'coffee_chat-id', targetPhase: 'grading' });
  assert.deepEqual(codes(notClosed.blockers), ['prior_round_open', 'tables_unassigned']);

  seed({ rounds: [round('resume_screen', ROUND_PHASES.CLOSED), round('coffee_chat', ROUND_PHASES.SETUP)] });
  const noAdvances = await transitionRoundToPhase({ roundId: 'coffee_chat-id', targetPhase: 'grading' });
  assert.deepEqual(codes(noAdvances.blockers), ['prior_round_no_advances', 'tables_unassigned']);

  seed({
    rounds: [round('resume_screen', ROUND_PHASES.CLOSED), round('coffee_chat', ROUND_PHASES.SETUP)],
    decisions: [{ cycle_id: 'cycle-1', round_id: 'resume_screen-id', candidate_id: 'c1', decision: 'advance' }],
    tables: [{ round_id: 'coffee_chat-id', candidate_id: 'c1' }],
  });
  const ready = await transitionRoundToPhase({ roundId: 'coffee_chat-id', targetPhase: 'grading' });
  assert.equal(ready.error, undefined);
  assert.equal(ready.to, ROUND_PHASES.GRADING);
});

test('unreviewed candidates hold deliberation back until an admin confirms', async () => {
  const setup = () => seed({
    rounds: [round('resume_screen', ROUND_PHASES.GRADING, { rubric_config: RUBRIC })],
    pool: [candidate('pending', 0), candidate('pending', 3)],
  });

  setup();
  const warned = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'deliberation' });
  assert.equal(warned.status, 400);
  assert.equal(warned.requiresConfirmation, true);
  assert.deepEqual(codes(warned.warnings), ['reviews_incomplete']);
  assert.equal(state.rounds[0].status, ROUND_PHASES.GRADING);

  setup();
  const confirmed = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'deliberation', confirmed: true });
  assert.equal(confirmed.error, undefined);
  assert.equal(state.rounds[0].status, ROUND_PHASES.DELIBERATION);
});

test('closing runs the committee check that the old close-round endpoint skipped', async () => {
  seed({
    rounds: [round('resume_screen', ROUND_PHASES.DELIBERATION)],
    pool: [candidate('advance'), candidate('pending'), candidate('hold')],
  });
  const blocked = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'closed' });
  assert.deepEqual(codes(blocked.blockers), ['deliberation_incomplete']);
  assert.equal(blocked.error, '2 candidate(s) still need Advance or Reject (1 pending, 1 on hold).');
  assert.equal(state.rounds[0].status, ROUND_PHASES.DELIBERATION, 'round must stay open');

  // Confirming does not buy a way past an unfinished committee.
  const forced = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'closed', confirmed: true });
  assert.equal(forced.status, 400);
  assert.equal(state.rounds[0].status, ROUND_PHASES.DELIBERATION);

  seed({
    rounds: [round('resume_screen', ROUND_PHASES.DELIBERATION)],
    pool: [candidate('advance'), candidate('reject')],
  });
  const done = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'closed' });
  assert.equal(done.error, undefined);
  assert.equal(state.rounds[0].status, ROUND_PHASES.CLOSED);
});

test('grading cannot jump straight to closed, so deliberation cannot be skipped', async () => {
  seed({ rounds: [round('resume_screen', ROUND_PHASES.GRADING)], pool: [candidate('advance')] });
  const skipped = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'closed', confirmed: true });
  assert.deepEqual(codes(skipped.blockers), ['invalid_transition']);
  assert.equal(state.rounds[0].status, ROUND_PHASES.GRADING);
});

test('a second open round is refused by name rather than by a duplicate key error', async () => {
  // The conflicting round is not this round's predecessor, so it is reported
  // on its own terms rather than as "close the prior round".
  seed({
    rounds: [
      round('resume_screen', ROUND_PHASES.SETUP, { rubric_config: RUBRIC }),
      round('final_round', ROUND_PHASES.GRADING),
    ],
  });
  const conflict = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading' });
  assert.deepEqual(codes(conflict.blockers), ['another_round_open']);
  assert.equal(conflict.error, 'Final Round is still open. Close it before opening Resume Screen.');
  assert.equal(state.rounds[0].status, ROUND_PHASES.SETUP);
});

test('an open predecessor is reported once, alongside every other setup gap', async () => {
  seed({
    rounds: [round('resume_screen', ROUND_PHASES.DELIBERATION), round('coffee_chat', ROUND_PHASES.SETUP)],
  });
  const blocked = await transitionRoundToPhase({ roundId: 'coffee_chat-id', targetPhase: 'grading' });
  // Not also 'another_round_open': that would say the same thing twice.
  assert.deepEqual(codes(blocked.blockers), ['prior_round_open', 'tables_unassigned']);
});

test('rolling deliberation back to grading keeps decisions and needs confirmation', async () => {
  const setup = () => seed({
    rounds: [round('resume_screen', ROUND_PHASES.DELIBERATION)],
    decisions: [{ cycle_id: 'cycle-1', round_id: 'resume_screen-id', candidate_id: 'c1', decision: 'advance' }],
    pool: [candidate('advance')],
  });

  setup();
  const unconfirmed = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading' });
  assert.equal(unconfirmed.requiresConfirmation, true);
  assert.equal(state.rounds[0].status, ROUND_PHASES.DELIBERATION);

  setup();
  const confirmed = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading', confirmed: true });
  assert.equal(confirmed.error, undefined);
  assert.equal(state.rounds[0].status, ROUND_PHASES.GRADING);
  assert.equal(state.decisions.length, 1, 'decisions survive the rollback');
});

test('unknown rounds and foreign-cycle rounds are rejected before any guard runs', async () => {
  seed({ rounds: [round('resume_screen', ROUND_PHASES.SETUP)] });
  assert.equal((await transitionRoundToPhase({ roundId: 'nope', targetPhase: 'grading' })).status, 404);

  seed({ rounds: [round('resume_screen', ROUND_PHASES.SETUP, { cycle_id: 'other-cycle' })] });
  const foreign = await transitionRoundToPhase({ roundId: 'resume_screen-id', targetPhase: 'grading' });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.error, 'That round belongs to a different cycle');
});
