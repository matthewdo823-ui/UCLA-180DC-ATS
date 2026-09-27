const { test } = require('node:test');
const assert = require('node:assert/strict');

// Fixtures the stubbed client reads from; each test rewrites `state`.
const state = { activeCycleId: null, cycles: [], rounds: [] };

/** Matches both .eq(col, value) and .in(col, values), so status filters really filter. */
function matches(row, filters) {
  return Object.entries(filters).every(([column, matcher]) => (
    Array.isArray(matcher) ? matcher.includes(row[column]) : row[column] === matcher
  ));
}

function rowsFor(table, filters) {
  if (table === 'app_settings') return [{ active_cycle_id: state.activeCycleId }];
  if (table === 'cycles') return state.cycles.filter((row) => matches(row, filters));
  if (table === 'rounds') return state.rounds.filter((row) => matches(row, filters));
  return [];
}

const db = {
  from(table) {
    const filters = {};
    const q = {
      select() { return q; },
      eq(column, value) { filters[column] = value; return q; },
      order() { return q; },
      in(column, values) { filters[column] = values; return q; },
      async maybeSingle() { return { data: rowsFor(table, filters)[0] || null, error: null }; },
      then(resolve) { return Promise.resolve({ data: rowsFor(table, filters), error: null }).then(resolve); },
    };
    return q;
  },
};

const dbPath = require.resolve('../../src/config/supabase');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const {
  getCurrentRoundForCycle,
  requireRoundById,
  requireRoundByType,
  requireOpenResumeRound,
  requireResumeGradingPhase,
  requireOpenInterviewRound,
  requireInterviewGradingPhase,
} = require('../../src/utils/cycleContext');
const { ROUND_TYPES } = require('../../src/utils/rounds');
const { ROUND_PHASES, TABLE_PHASES } = require('../../src/utils/roundPhases');

const CYCLE = 'cycle-1';

function seed(rounds, { activeCycleId = CYCLE } = {}) {
  state.activeCycleId = activeCycleId;
  state.cycles = [{ id: CYCLE, name: 'Fall 2026' }];
  state.rounds = rounds;
}

function round(type, status, overrides = {}) {
  const order = { resume_screen: 1, coffee_chat: 2, final_round: 3 }[type];
  return {
    id: `${type}-id`,
    cycle_id: CYCLE,
    name: { resume_screen: 'Resume Screen', coffee_chat: 'Coffee Chats', final_round: 'Final Round' }[type],
    type,
    status,
    sort_order: order,
    ...overrides,
  };
}

test('a Coffee Chat round in setup resolves by type, which the open-round helpers could not do', async () => {
  seed([
    round('resume_screen', ROUND_PHASES.CLOSED),
    round('coffee_chat', ROUND_PHASES.SETUP),
    round('final_round', ROUND_PHASES.SETUP),
  ]);

  const ctx = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
  assert.equal(ctx.error, undefined);
  assert.equal(ctx.round.id, 'coffee_chat-id');
  assert.equal(ctx.cycle.id, CYCLE);
});

test('legacy draft and active rows still resolve before the migration runs', async () => {
  for (const legacy of ['draft', 'active']) {
    seed([round('resume_screen', 'closed'), round('coffee_chat', legacy)]);
    const ctx = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
    assert.equal(ctx.error, undefined, `expected ${legacy} to resolve`);
    assert.equal(ctx.round.status, legacy);
  }
});

test('a frozen or finished round is refused, naming the phase it is in', async () => {
  for (const [phase, label] of [[ROUND_PHASES.DELIBERATION, 'Deliberation'], [ROUND_PHASES.CLOSED, 'Closed']]) {
    seed([round('resume_screen', ROUND_PHASES.CLOSED), round('coffee_chat', phase)]);
    const ctx = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
    assert.equal(ctx.status, 400);
    assert.equal(ctx.error, `Coffee Chats is in ${label}. This action needs Setup or Grading.`);
    assert.equal(ctx.round, undefined);
  }
});

test('missing cycle and missing round report 503 rather than resolving to something else', async () => {
  seed([round('coffee_chat', ROUND_PHASES.SETUP)], { activeCycleId: null });
  const noCycle = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
  assert.equal(noCycle.status, 503);
  assert.equal(noCycle.error, 'No active recruiting cycle');

  seed([round('resume_screen', ROUND_PHASES.GRADING)]);
  const noRound = await requireRoundByType(ROUND_TYPES.COFFEE_CHAT, TABLE_PHASES);
  assert.equal(noRound.status, 503);
  assert.equal(noRound.error, 'This cycle has no coffee chat round');
});

test('resolution by id checks the round belongs to the active cycle', async () => {
  seed([round('coffee_chat', ROUND_PHASES.SETUP)]);

  const ok = await requireRoundById('coffee_chat-id', TABLE_PHASES);
  assert.equal(ok.round.id, 'coffee_chat-id');

  const missing = await requireRoundById('nope', TABLE_PHASES);
  assert.equal(missing.status, 404);

  state.rounds = [round('coffee_chat', ROUND_PHASES.SETUP, { cycle_id: 'some-other-cycle' })];
  const foreign = await requireRoundById('coffee_chat-id', TABLE_PHASES);
  assert.equal(foreign.status, 400);
  assert.equal(foreign.error, 'That round belongs to a different cycle');
});

test('the current round is the open one, or the earliest still-unfinished one', async () => {
  seed([
    round('resume_screen', ROUND_PHASES.CLOSED),
    round('coffee_chat', ROUND_PHASES.DELIBERATION),
    round('final_round', ROUND_PHASES.SETUP),
  ]);
  assert.equal((await getCurrentRoundForCycle(CYCLE)).id, 'coffee_chat-id');

  // The setup window: nothing is open anywhere in the cycle.
  seed([
    round('resume_screen', ROUND_PHASES.CLOSED),
    round('coffee_chat', ROUND_PHASES.SETUP),
    round('final_round', ROUND_PHASES.SETUP),
  ]);
  assert.equal((await getCurrentRoundForCycle(CYCLE)).id, 'coffee_chat-id');

  // A later round in setup must not outrank the round actually being graded.
  seed([
    round('resume_screen', ROUND_PHASES.GRADING),
    round('coffee_chat', ROUND_PHASES.SETUP),
  ]);
  assert.equal((await getCurrentRoundForCycle(CYCLE)).id, 'resume_screen-id');

  seed([round('resume_screen', ROUND_PHASES.CLOSED), round('coffee_chat', ROUND_PHASES.CLOSED)]);
  assert.equal(await getCurrentRoundForCycle(CYCLE), null);
});

test('deliberation freezes score writes but leaves the grading reads working', async () => {
  seed([round('resume_screen', ROUND_PHASES.DELIBERATION)]);

  const read = await requireOpenResumeRound();
  assert.equal(read.error, undefined);
  assert.equal(read.round.id, 'resume_screen-id');

  const write = await requireResumeGradingPhase();
  assert.equal(write.status, 400);
  assert.equal(write.error, 'Resume Screen is in Deliberation. This action needs Grading.');
});

test('grading permits both reads and score writes', async () => {
  seed([round('resume_screen', ROUND_PHASES.GRADING)]);
  assert.equal((await requireOpenResumeRound()).round.id, 'resume_screen-id');
  assert.equal((await requireResumeGradingPhase()).round.id, 'resume_screen-id');
});

test('setup and closed rounds refuse both, naming the phase', async () => {
  for (const phase of [ROUND_PHASES.SETUP, ROUND_PHASES.CLOSED]) {
    seed([round('resume_screen', phase)]);
    assert.equal((await requireOpenResumeRound()).status, 400, phase);
    assert.equal((await requireResumeGradingPhase()).status, 400, phase);
  }
});

test('a pre-migration active round still grades, so the gates survive a deploy ahead of the migration', async () => {
  seed([round('resume_screen', 'active')]);
  assert.equal((await requireOpenResumeRound()).round.status, 'active');
  assert.equal((await requireResumeGradingPhase()).round.status, 'active');
});

test('interview gates resolve whichever of the two interview rounds is open', async () => {
  seed([
    round('resume_screen', ROUND_PHASES.CLOSED),
    round('coffee_chat', ROUND_PHASES.CLOSED),
    round('final_round', ROUND_PHASES.GRADING),
  ]);
  const ctx = await requireOpenInterviewRound();
  assert.equal(ctx.round.id, 'final_round-id');
  assert.equal((await requireInterviewGradingPhase()).round.id, 'final_round-id');

  seed([
    round('resume_screen', ROUND_PHASES.CLOSED),
    round('coffee_chat', ROUND_PHASES.DELIBERATION),
  ]);
  assert.equal((await requireOpenInterviewRound()).round.id, 'coffee_chat-id');
  const frozen = await requireInterviewGradingPhase();
  assert.equal(frozen.status, 400);
  assert.equal(frozen.error, 'Coffee Chats is in Deliberation. Grading is closed for this round.');
});

test('an open resume round is not mistaken for an interview round', async () => {
  seed([round('resume_screen', ROUND_PHASES.GRADING), round('coffee_chat', ROUND_PHASES.SETUP)]);
  const ctx = await requireOpenInterviewRound();
  assert.equal(ctx.status, 503);
  assert.equal(ctx.error, 'No coffee chat or final round is open');
});
