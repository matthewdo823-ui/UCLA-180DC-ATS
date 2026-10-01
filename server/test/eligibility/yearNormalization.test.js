const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeYear } = require('../../src/utils/dataMapper');

test('Senior Transfer intake values normalize to the rejected canonical standing', () => {
  for (const value of ['Senior Transfer', 'senior transfer', 'Transfer Senior', '4th year transfer', 'Fourth Year Transfer', 'Sr Transfer']) {
    assert.equal(normalizeYear(value), 'Senior Transfer');
  }
});

test('Junior Transfer remains distinct from regular Junior and Senior Transfer', () => {
  assert.equal(normalizeYear('Junior Transfer'), 'Junior Transfer');
  assert.equal(normalizeYear('Junior'), 'Junior');
  assert.equal(normalizeYear('Senior Transfer'), 'Senior Transfer');
});
