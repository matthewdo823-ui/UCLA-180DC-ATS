const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const server = require('../../src/utils/roundPhases');

const CLIENT_MODULE = path.join(__dirname, '../../../client/src/constants/roundPhases.js');

// The client keeps its own copy of the phase model so pages can gate UI without
// a round trip. Anything that drifts between the two shows up as a page that
// disagrees with the API about what a round can do.
test('the client mirror agrees with the server on every shared name', async () => {
  const client = await import(CLIENT_MODULE);

  assert.deepEqual(client.ROUND_PHASES, server.ROUND_PHASES);
  assert.deepEqual([...client.PHASE_ORDER], [...server.PHASE_ORDER]);
  assert.deepEqual([...client.OPEN_PHASES], [...server.OPEN_PHASES]);
  assert.deepEqual([...client.TABLE_PHASES], [...server.TABLE_PHASES]);
  assert.deepEqual(client.PHASE_LABELS, server.PHASE_LABELS);
});

test('shared predicates return the same answer for every input, legacy values included', async () => {
  const client = await import(CLIENT_MODULE);

  const predicates = [
    'normalizeRoundPhase',
    'isSetupPhase',
    'isGradingPhase',
    'isDeliberationPhase',
    'isClosedPhase',
    'isOpenPhase',
    'canRecordGrades',
    'canRecordDecisions',
    'canManageTables',
    'canEditSetup',
    'formatRoundPhase',
    'phaseIndex',
  ];
  const inputs = [
    ...Object.values(server.ROUND_PHASES),
    'draft', 'active', ' ACTIVE ', 'archived', 'nonsense', '', null, undefined,
  ];

  for (const name of predicates) {
    assert.equal(typeof client[name], 'function', `client is missing ${name}`);
    for (const input of inputs) {
      assert.equal(
        client[name](input),
        server[name](input),
        `${name}(${JSON.stringify(input)}) disagrees between client and server`
      );
    }
  }
});

test('every phase has a label, a description, and a badge style on the client', async () => {
  const client = await import(CLIENT_MODULE);

  for (const phase of server.PHASE_ORDER) {
    assert.ok(client.PHASE_LABELS[phase], `no label for ${phase}`);
    assert.ok(client.PHASE_DESCRIPTIONS[phase], `no description for ${phase}`);
    assert.ok(client.ROUND_PHASE_STYLE[phase], `no badge style for ${phase}`);
  }
});
