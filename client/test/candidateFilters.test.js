import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleCandidateFilter } from '../src/pages/AssignmentsPage/candidateFilters.js';

for (const filter of ['unassigned', 'assigned', 'pending']) {
  test(`${filter} can be selected and unselected`, () => {
    assert.equal(toggleCandidateFilter('all', filter), filter);
    assert.equal(toggleCandidateFilter(filter, filter), 'all');
    assert.equal(toggleCandidateFilter(filter, 'all'), 'all');
  });
}
test('switching filters selects the new filter; All stays All', () => {
  assert.equal(toggleCandidateFilter('pending', 'assigned'), 'assigned');
  assert.equal(toggleCandidateFilter('all', 'all'), 'all');
});
