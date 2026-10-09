import test from 'node:test';
import assert from 'node:assert/strict';

import { invalidateAfterCoffeeChatEvaluation, qk } from '../src/lib/queryKeys.js';

test('Coffee Chat saves invalidate candidate scores and every dependent view', async () => {
  const invalidated = [];
  const queryClient = {
    invalidateQueries(options) {
      invalidated.push(options.queryKey);
      return Promise.resolve();
    },
  };

  await invalidateAfterCoffeeChatEvaluation(queryClient);

  assert.deepEqual(invalidated, [
    qk.interviewCandidates(),
    qk.scoreboardRoot(),
    qk.candidateApplicationsRoot(),
    qk.dashboardRoot(),
    qk.coffeeChatGraderScoreboard(),
    qk.assignments(),
  ]);
});

test('a caller that already reloaded candidates can invalidate only dependent views', async () => {
  const invalidated = [];
  const queryClient = {
    invalidateQueries(options) {
      invalidated.push(options.queryKey);
      return Promise.resolve();
    },
  };

  await invalidateAfterCoffeeChatEvaluation(queryClient, { includeInterviewCandidates: false });

  assert.equal(invalidated.some((queryKey) => queryKey[0] === 'interviews'), false);
  assert.equal(invalidated.some((queryKey) => queryKey[0] === 'scoreboard'), true);
  assert.equal(invalidated.some((queryKey) => queryKey[0] === 'candidate-application'), true);
});
