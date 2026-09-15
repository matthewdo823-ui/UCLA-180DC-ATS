const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_MULTIPLIER_STEPS,
  validateMultiplierSteps,
  computeInterestMultiplier,
  maxInterestMultiplier,
  normalizeInterestEmail,
  extractMappedFields,
  findMissingMappedQuestions,
  isLateSubmission,
  buildCandidateMatchIndex,
  classifyAttendance,
  suggestCandidateByName,
  groupAttendedEventsByCandidate,
  applyDemonstratedInterest,
  applyDemonstratedInterestToCandidates,
} = require('../../src/utils/demonstratedInterest');
const { normalizeUniversityId } = require('../../src/utils/candidateLink');
const { buildSuggestedFieldMap, INTEREST_TITLE_HINTS, validateInterestFieldMap } = require('../../src/utils/googleForm');
const { applyScreeningEligibility } = require('../../src/utils/screeningEligibility');

test('default steps follow the 180DC matrix for 0–4 events', () => {
  const expected = [1, 1.025, 1.05, 1.075, 1.1];
  expected.forEach((multiplier, count) => {
    assert.equal(computeInterestMultiplier(count, DEFAULT_MULTIPLIER_STEPS), multiplier);
  });
});

test('counts past the last step use the last multiplier', () => {
  assert.equal(computeInterestMultiplier(7, DEFAULT_MULTIPLIER_STEPS), 1.1);
  assert.equal(computeInterestMultiplier(3, [1, 1.2]), 1.2);
});

test('custom non-linear steps are honored', () => {
  const steps = [1, 1.01, 1.1, 1.3];
  assert.equal(computeInterestMultiplier(1, steps), 1.01);
  assert.equal(computeInterestMultiplier(2, steps), 1.1);
  assert.equal(computeInterestMultiplier(3, steps), 1.3);
});

test('no attendance, bad counts, or unusable steps never change a score', () => {
  assert.equal(computeInterestMultiplier(0, DEFAULT_MULTIPLIER_STEPS), 1);
  for (const count of [-1, NaN, undefined, null]) {
    assert.equal(computeInterestMultiplier(count, DEFAULT_MULTIPLIER_STEPS), 1);
  }
  for (const steps of [[], null, undefined]) {
    assert.equal(computeInterestMultiplier(2, steps), 1);
  }
});

test('validateMultiplierSteps rejects malformed tables', () => {
  assert.equal(validateMultiplierSteps(DEFAULT_MULTIPLIER_STEPS), null);
  assert.equal(validateMultiplierSteps([1]), null);
  for (const steps of [[], null, 'x', [1, 0], [1, -1], [1, '1.1'], [1, Infinity], new Array(21).fill(1)]) {
    assert.ok(validateMultiplierSteps(steps), `expected an error for ${JSON.stringify(steps)}`);
  }
  assert.equal(maxInterestMultiplier(DEFAULT_MULTIPLIER_STEPS), 1.1);
  assert.equal(maxInterestMultiplier(null), 1.1);
});

test('lateness boundary: the close instant counts, one second after is late', () => {
  const closesAt = '2026-09-25T06:59:59Z'; // 9/24 11:59:59 PM PDT
  assert.equal(isLateSubmission('2026-09-24T23:59:59-07:00', closesAt), false);
  assert.equal(isLateSubmission('2026-09-25T00:00:00-07:00', closesAt), true);
  assert.equal(isLateSubmission('2026-09-20T12:00:00Z', closesAt), false);
});

test('UIDs and UCLA emails normalize to a comparable form', () => {
  assert.equal(normalizeUniversityId(' 123-456-789 '), '123456789');
  assert.equal(normalizeUniversityId(null), '');
  assert.equal(normalizeInterestEmail('  Joe.Bruin@G.UCLA.edu '), 'joe.bruin@ucla.edu');
  assert.equal(normalizeInterestEmail('joe@gmail.com'), 'joe@gmail.com');
});

const candidates = [
  { id: 'c1', name: 'Joe Bruin', email: 'joe@ucla.edu', university_id: '123456789' },
  { id: 'c2', name: 'Josie Bruin', email: 'josie@g.ucla.edu', university_id: null },
  { id: 'dup-a', name: 'Twice Applied', email: 'twice@ucla.edu', university_id: '555555555' },
  { id: 'dup-b', name: 'Twice Applied', email: 'twice@ucla.edu', university_id: '555555555' },
];
const index = buildCandidateMatchIndex(candidates);
const event = { closes_at: '2026-10-03T00:10:00Z' };
const onTime = '2026-10-02T20:00:00Z';

test('UID match wins even when the typed email has a typo', () => {
  const result = classifyAttendance({ submittedAt: onTime, fields: { email: 'jeo@ucla.edu', universityId: '123-456-789' } }, event, index);
  assert.deepEqual(result, { status: 'counted', candidateId: 'c1', matchMethod: 'uid' });
});

test('email match is the fallback, including the g.ucla.edu alias', () => {
  const result = classifyAttendance({ submittedAt: onTime, fields: { email: 'JOSIE@ucla.edu', universityId: '' } }, event, index);
  assert.deepEqual(result, { status: 'counted', candidateId: 'c2', matchMethod: 'email' });
});

test('unknown or ambiguous people go to the review queue', () => {
  const unknown = classifyAttendance({ submittedAt: onTime, fields: { email: 'nobody@ucla.edu', universityId: '999' } }, event, index);
  assert.deepEqual(unknown, { status: 'unmatched', candidateId: null, matchMethod: null });
  const dup = classifyAttendance({ submittedAt: onTime, fields: { email: 'twice@ucla.edu', universityId: '555555555' } }, event, index);
  assert.equal(dup.status, 'unmatched');
});

test('late submissions are held for review but keep their match', () => {
  const result = classifyAttendance({ submittedAt: '2026-10-03T00:10:01Z', fields: { universityId: '123456789' } }, event, index);
  assert.deepEqual(result, { status: 'late', candidateId: 'c1', matchMethod: 'uid' });
});

test('name matches are only suggestions', () => {
  assert.equal(suggestCandidateByName('  joe   BRUIN ', index)?.id, 'c1');
  assert.equal(suggestCandidateByName('Twice Applied', index), null);
});

test('mapped fields are re-derived from stored answers after a remap', () => {
  const answers = { q1: 'Joe Bruin', q2: 'joe@ucla.edu', q3: '123456789', q9: 'Economics' };
  assert.deepEqual(extractMappedFields(answers, { q1: 'name', q2: 'email', q3: 'university_id' }), { name: 'Joe Bruin', email: 'joe@ucla.edu', universityId: '123456789' });
  assert.deepEqual(extractMappedFields(answers, { q1: 'name', q9: 'email' }), { name: 'Joe Bruin', email: 'Economics', universityId: null });
});

test('drift detection reports mapped questions missing from the live form', () => {
  const fieldMap = { q1: 'name', q2: 'email', q3: 'university_id' };
  const questions = [{ questionId: 'q1', title: 'Name (edited wording)' }, { questionId: 'q3', title: 'University ID' }];
  assert.deepEqual(findMissingMappedQuestions(fieldMap, questions), [{ questionId: 'q2', target: 'email' }]);
  assert.deepEqual(findMissingMappedQuestions(fieldMap, [...questions, { questionId: 'q2', title: 'Email' }]), []);
});

test('attendance forms get Name/Email/UID suggestions from their question titles', () => {
  const questions = [
    { questionId: 'a', title: 'Name: First & Last' },
    { questionId: 'b', title: 'Email' },
    { questionId: 'c', title: 'University ID' },
    { questionId: 'd', title: 'Major' },
    { questionId: 'e', title: 'Year' },
    { questionId: 'f', title: 'Are you a transfer student?' },
  ];
  const map = buildSuggestedFieldMap(questions, INTEREST_TITLE_HINTS);
  assert.deepEqual(map, { a: 'name', b: 'email', c: 'university_id' });
  assert.equal(validateInterestFieldMap(map), null);
  assert.ok(validateInterestFieldMap({ a: 'name' }));
  assert.ok(validateInterestFieldMap({ a: 'major' }));
});

test('each event counts once per candidate, however many times they submitted', () => {
  const grouped = groupAttendedEventsByCandidate([
    { candidate_id: 'c1', event_id: 'chats', event_name: 'Chats w/ 180DC' },
    { candidate_id: 'c1', event_id: 'chats', event_name: 'Chats w/ 180DC' },
    { candidate_id: 'c1', event_id: 'mixer', event_name: '180 ShareTea Mixer' },
    { candidate_id: 'c2', event_id: 'mixer', event_name: '180 ShareTea Mixer' },
  ]);
  assert.equal(grouped.get('c1').length, 2);
  assert.equal(grouped.get('c2').length, 1);
});

test('the multiplier lifts the composite and may exceed 100%', () => {
  const four = [1, 2, 3, 4].map((n) => ({ id: `e${n}`, name: `Event ${n}` }));
  const perfect = applyDemonstratedInterest({ normalizedScore: 100, score: 100 }, four, DEFAULT_MULTIPLIER_STEPS);
  assert.equal(perfect.normalizedScore, 110);
  assert.equal(perfect.score, 110);
  assert.equal(perfect.baseNormalizedScore, 100);
  const two = applyDemonstratedInterest({ normalizedScore: 82 }, four.slice(0, 2), DEFAULT_MULTIPLIER_STEPS);
  assert.equal(two.normalizedScore, 86.1);
  assert.equal(two.interestMultiplier, 1.05);
});

test('ungraded candidates stay ungraded and ineligible candidates stay at zero', () => {
  const pending = applyDemonstratedInterest({ normalizedScore: null, score: null }, [{ id: 'e1' }], DEFAULT_MULTIPLIER_STEPS);
  assert.equal(pending.normalizedScore, null);
  assert.equal(pending.baseNormalizedScore, null);
  const [senior] = applyDemonstratedInterestToCandidates(
    [{ candidateId: 'c1', year: 'Senior', normalizedScore: 90 }],
    new Map([['c1', [{ id: 'e1' }, { id: 'e2' }]]]),
    DEFAULT_MULTIPLIER_STEPS
  );
  assert.equal(senior.normalizedScore, 94.5);
  assert.equal(applyScreeningEligibility(senior).normalizedScore, 0);
});
