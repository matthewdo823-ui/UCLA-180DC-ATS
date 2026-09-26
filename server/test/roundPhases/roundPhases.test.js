const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  ROUND_PHASES,
  OPEN_PHASES,
  normalizeRoundPhase,
  isKnownRoundPhase,
  isOpenPhase,
  canRecordGrades,
  canRecordDecisions,
  canEditSetup,
  nextPhase,
  previousPhase,
  isForwardTransition,
  isBackwardTransition,
  isAllowedTransition,
  evaluateTransition,
} = require('../../src/utils/roundPhases');
const { ROUND_TYPES } = require('../../src/utils/rounds');

const resumeRound = { type: ROUND_TYPES.RESUME_SCREEN, status: ROUND_PHASES.SETUP, name: 'Resume Screen' };
const coffeeRound = { type: ROUND_TYPES.COFFEE_CHAT, status: ROUND_PHASES.SETUP, name: 'Coffee Chats' };
const finalRound = { type: ROUND_TYPES.FINAL_ROUND, status: ROUND_PHASES.SETUP, name: 'Final Round' };
const closedPrior = { name: 'Resume Screen', status: ROUND_PHASES.CLOSED };

const codes = (list) => list.map((item) => item.code);

function phaseMatrix() {
  const matrix = {};
  for (const phase of Object.values(ROUND_PHASES)) {
    matrix[phase] = {
      grades: canRecordGrades(phase),
      decisions: canRecordDecisions(phase),
      setup: canEditSetup(phase),
      open: isOpenPhase(phase),
    };
  }
  return matrix;
}


test('legacy status values map onto phases; unknown values pass through', () => {
  assert.equal(normalizeRoundPhase('draft'), ROUND_PHASES.SETUP);
  assert.equal(normalizeRoundPhase('active'), ROUND_PHASES.GRADING);
  assert.equal(normalizeRoundPhase('  ACTIVE  '), ROUND_PHASES.GRADING);
  assert.equal(normalizeRoundPhase('closed'), ROUND_PHASES.CLOSED);
  assert.equal(normalizeRoundPhase('nonsense'), 'nonsense');
  assert.equal(normalizeRoundPhase(null), '');
  assert.equal(isKnownRoundPhase('active'), true);
  assert.equal(isKnownRoundPhase('nonsense'), false);
});

test('an unrecognized phase grants no permissions', () => {
  for (const value of ['nonsense', null, undefined, '']) {
    assert.equal(canRecordGrades(value), false);
    assert.equal(canRecordDecisions(value), false);
    assert.equal(canEditSetup(value), false);
    assert.equal(isOpenPhase(value), false);
  }
});

test('grading and deliberation each unlock exactly one capability', () => {
  assert.deepEqual(
    phaseMatrix(),
    {
      setup: { grades: false, decisions: false, setup: true, open: false },
      grading: { grades: true, decisions: false, setup: false, open: true },
      deliberation: { grades: false, decisions: true, setup: false, open: true },
      closed: { grades: false, decisions: false, setup: false, open: false },
    }
  );
  // The old status === 'active' check must keep resolving to an open round.
  assert.equal(isOpenPhase('active'), true);
  assert.deepEqual([...OPEN_PHASES], [ROUND_PHASES.GRADING, ROUND_PHASES.DELIBERATION]);
});

test('forward moves are adjacent only; backward moves may skip', () => {
  assert.equal(isAllowedTransition('setup', 'grading'), true);
  assert.equal(isAllowedTransition('grading', 'deliberation'), true);
  assert.equal(isAllowedTransition('deliberation', 'closed'), true);

  // Skipping forward would bypass an entry guard.
  assert.equal(isAllowedTransition('setup', 'deliberation'), false);
  assert.equal(isAllowedTransition('grading', 'closed'), false);
  assert.equal(isAllowedTransition('setup', 'closed'), false);

  // Reopening a finished round all the way back is a real recovery path.
  assert.equal(isAllowedTransition('closed', 'setup'), true);
  assert.equal(isAllowedTransition('deliberation', 'grading'), true);

  assert.equal(isAllowedTransition('grading', 'grading'), false);
  assert.equal(isAllowedTransition('grading', 'nonsense'), false);

  assert.equal(isForwardTransition('setup', 'closed'), true);
  assert.equal(isBackwardTransition('closed', 'setup'), true);
  assert.equal(nextPhase('grading'), ROUND_PHASES.DELIBERATION);
  assert.equal(nextPhase('closed'), null);
  assert.equal(previousPhase('setup'), null);
});

test('resume screen cannot open grading without a rubric', () => {
  const blocked = evaluateTransition(resumeRound, 'grading', { rubricValid: false });
  assert.equal(blocked.ok, false);
  assert.deepEqual(codes(blocked.blockers), ['rubric_missing']);

  const allowed = evaluateTransition(resumeRound, 'grading', { rubricValid: true });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.blockers, []);
  assert.equal(allowed.requiresConfirmation, false);
});

test('coffee chat needs a closed prior round, advances, and tables', () => {
  const nothingReady = evaluateTransition(coffeeRound, 'grading', {
    priorRound: { name: 'Resume Screen', status: 'deliberation' },
    priorAdvanceCount: 0,
    tableAssignmentCount: 0,
  });
  assert.equal(nothingReady.ok, false);
  // No advance count is reported while the prior round can still change it.
  assert.deepEqual(codes(nothingReady.blockers), ['prior_round_open', 'tables_unassigned']);
  assert.match(nothingReady.blockers[0].message, /Close Resume Screen/);

  const noAdvances = evaluateTransition(coffeeRound, 'grading', {
    priorRound: closedPrior,
    priorAdvanceCount: 0,
    tableAssignmentCount: 4,
  });
  assert.deepEqual(codes(noAdvances.blockers), ['prior_round_no_advances']);

  const noTables = evaluateTransition(coffeeRound, 'grading', {
    priorRound: closedPrior,
    priorAdvanceCount: 30,
    tableAssignmentCount: 0,
  });
  assert.deepEqual(codes(noTables.blockers), ['tables_unassigned']);

  const ready = evaluateTransition(coffeeRound, 'grading', {
    priorRound: closedPrior,
    priorAdvanceCount: 30,
    tableAssignmentCount: 30,
  });
  assert.equal(ready.ok, true);
});

test('final round needs a populated prior round but no tables', () => {
  const ready = evaluateTransition(finalRound, 'grading', {
    priorRound: { name: 'Coffee Chats', status: ROUND_PHASES.CLOSED },
    priorAdvanceCount: 12,
    tableAssignmentCount: 0,
  });
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.blockers, []);
});

test('unreviewed candidates warn rather than block, and confirm clears them', () => {
  const grading = { ...resumeRound, status: ROUND_PHASES.GRADING };

  const warned = evaluateTransition(grading, 'deliberation', { awaitingReviews: 8 });
  assert.equal(warned.ok, false);
  assert.equal(warned.requiresConfirmation, true);
  assert.deepEqual(warned.blockers, []);
  assert.deepEqual(codes(warned.warnings), ['reviews_incomplete']);
  assert.equal(warned.warnings[0].count, 8);

  const confirmed = evaluateTransition(grading, 'deliberation', { awaitingReviews: 8, confirmed: true });
  assert.equal(confirmed.ok, true);

  const clean = evaluateTransition(grading, 'deliberation', { awaitingReviews: 0 });
  assert.equal(clean.ok, true);
  assert.equal(clean.requiresConfirmation, false);
});

test('closing requires every candidate advanced or rejected', () => {
  const deliberating = { ...resumeRound, status: ROUND_PHASES.DELIBERATION };

  const blocked = evaluateTransition(deliberating, 'closed', {
    deliberation: { incompleteCount: 5, pendingCount: 3, holdCount: 2 },
  });
  assert.equal(blocked.ok, false);
  assert.deepEqual(codes(blocked.blockers), ['deliberation_incomplete']);
  assert.equal(
    blocked.blockers[0].message,
    '5 candidate(s) still need Advance or Reject (3 pending, 2 on hold).'
  );

  // Not overridable: confirming does not get you past an unfinished committee.
  const stillBlocked = evaluateTransition(deliberating, 'closed', {
    deliberation: { incompleteCount: 5, pendingCount: 5, holdCount: 0 },
    confirmed: true,
  });
  assert.equal(stillBlocked.ok, false);

  const done = evaluateTransition(deliberating, 'closed', {
    deliberation: { incompleteCount: 0, pendingCount: 0, holdCount: 0 },
  });
  assert.equal(done.ok, true);
});

test('rolling back skips entry guards but demands confirmation', () => {
  const deliberating = { ...coffeeRound, status: ROUND_PHASES.DELIBERATION };

  // Rolling back into grading must not re-run the setup guards it never left.
  const unconfirmed = evaluateTransition(deliberating, 'grading', {});
  assert.equal(unconfirmed.ok, false);
  assert.equal(unconfirmed.requiresConfirmation, true);
  assert.deepEqual(unconfirmed.blockers, []);

  const confirmed = evaluateTransition(deliberating, 'grading', { confirmed: true });
  assert.equal(confirmed.ok, true);

  const reopened = evaluateTransition({ ...coffeeRound, status: ROUND_PHASES.CLOSED }, 'setup', { confirmed: true });
  assert.equal(reopened.ok, true);
});

test('malformed transitions are rejected with a reason', () => {
  const same = evaluateTransition({ ...resumeRound, status: ROUND_PHASES.GRADING }, 'grading', {});
  assert.deepEqual(codes(same.blockers), ['invalid_transition']);
  assert.match(same.blockers[0].message, /already in Grading/);

  const skipped = evaluateTransition(resumeRound, 'closed', { confirmed: true });
  assert.deepEqual(codes(skipped.blockers), ['invalid_transition']);
  assert.match(skipped.blockers[0].message, /Setup straight to Closed/);

  const bogus = evaluateTransition(resumeRound, 'archived', {});
  assert.deepEqual(codes(bogus.blockers), ['unknown_phase']);
});
