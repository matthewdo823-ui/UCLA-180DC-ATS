import test from 'node:test';
import assert from 'node:assert/strict';
import { sortCandidates } from '../src/pages/AssignmentsPage/candidateSort.js';

test('candidate sort uses completed reviews independently without changing the source list', () => {
  const rows = [
    { resumeId: 'a', name: 'A', reviewCount: 3, frqReviewCount: 0 },
    { resumeId: 'b', name: 'B', reviewCount: 0, frqReviewCount: 2 },
    { resumeId: 'c', name: 'C', reviewCount: 1, frqReviewCount: 1 },
  ];
  assert.deepEqual(sortCandidates(rows, 'frq').map(row => row.resumeId), ['a', 'c', 'b']);
  assert.deepEqual(sortCandidates(rows, 'resume').map(row => row.resumeId), ['b', 'c', 'a']);
  assert.deepEqual(rows.map(row => row.resumeId), ['a', 'b', 'c']);
  assert.deepEqual(sortCandidates(rows, 'default'), rows);
});
