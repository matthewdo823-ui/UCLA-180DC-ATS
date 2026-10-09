import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCoffeeChatTablePayload,
  verifyCoffeeChatReload,
  verifyCoffeeChatSaveResponse,
} from '../src/pages/InterviewManagementPage/coffeeChatPersistence.js';

const roundId = 'round-coffee';
const candidates = [
  { id: 'candidate-1', evaluation: { rating: null, notes: '', roundId } },
  { id: 'candidate-2', evaluation: { rating: 'no', notes: 'Old', roundId } },
];
const drafts = {
  'candidate-1': { rating: 'strong_yes', notes: 'Excellent conversation' },
  'candidate-2': { rating: 'yes', notes: 'Updated note' },
};

test('builds an immutable table payload containing every note', () => {
  const payload = buildCoffeeChatTablePayload({ roundId, candidates, drafts });
  drafts['candidate-1'].notes = 'Changed after submit';

  assert.deepEqual(payload, {
    round_id: roundId,
    evaluations: [
      { candidate_id: 'candidate-1', rating: 'strong_yes', notes: 'Excellent conversation' },
      { candidate_id: 'candidate-2', rating: 'yes', notes: 'Updated note' },
    ],
  });
});

test('accepts only save responses that confirm the submitted notes and round', () => {
  const payload = buildCoffeeChatTablePayload({ roundId, candidates, drafts });
  const response = {
    roundId,
    evaluations: payload.evaluations.map((evaluation) => ({
      candidateId: evaluation.candidate_id,
      roundId,
      rating: evaluation.rating,
      notes: evaluation.notes,
    })),
  };

  assert.doesNotThrow(() => verifyCoffeeChatSaveResponse(payload, response));
  response.evaluations[0].notes = '';
  assert.throws(() => verifyCoffeeChatSaveResponse(payload, response), /did not confirm the latest rating and notes/);
});

test('requires the follow-up GET to return the submitted notes', () => {
  const payload = buildCoffeeChatTablePayload({ roundId, candidates, drafts });
  const reloaded = payload.evaluations.map((evaluation) => ({
    id: evaluation.candidate_id,
    evaluation: {
      candidateId: evaluation.candidate_id,
      roundId,
      rating: evaluation.rating,
      notes: evaluation.notes,
    },
  }));

  assert.doesNotThrow(() => verifyCoffeeChatReload(payload, reloaded));
  reloaded[1].evaluation.notes = 'Stale note';
  assert.throws(() => verifyCoffeeChatReload(payload, reloaded), /refreshed table did not confirm/);
});
