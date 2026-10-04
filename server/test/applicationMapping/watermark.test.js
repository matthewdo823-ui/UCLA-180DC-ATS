process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_KEY ||= "test-only";

const test = require("node:test");
const assert = require("node:assert/strict");

const { advanceSyncWatermark } = require("../../src/services/formsSyncService");

function watermarkClient(result = { data: null, error: null }) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      return {
        update(values) {
          calls.push(["update", values]);
          return {
            eq(column, value) {
              calls.push(["eq", column, value]);
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  };
}

test("does not advance the form-sync watermark after a row failure", async () => {
  const client = watermarkClient();
  const originalError = console.error;
  console.error = () => {};
  try {
    const advanced = await advanceSyncWatermark(client, {
      cycleId: "cycle-1",
      syncStartedAt: "2026-10-04T08:00:00.000Z",
      errors: 2,
    });
    assert.equal(advanced, false);
    assert.deepEqual(client.calls, []);
  } finally {
    console.error = originalError;
  }
});

test("advances the form-sync watermark after a clean run", async () => {
  const client = watermarkClient();
  const advanced = await advanceSyncWatermark(client, {
    cycleId: "cycle-1",
    syncStartedAt: "2026-10-04T08:00:00.000Z",
    errors: 0,
  });

  assert.equal(advanced, true);
  assert.deepEqual(client.calls, [
    ["from", "cycles"],
    ["update", { last_form_sync_at: "2026-10-04T08:00:00.000Z" }],
    ["eq", "id", "cycle-1"],
  ]);
});

test("surfaces a failed watermark write so the run can be retried", async () => {
  const client = watermarkClient({ data: null, error: new Error("database unavailable") });
  await assert.rejects(
    advanceSyncWatermark(client, {
      cycleId: "cycle-1",
      syncStartedAt: "2026-10-04T08:00:00.000Z",
      errors: 0,
    }),
    /database unavailable/
  );
});
