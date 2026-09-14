const { test } = require('node:test');
const assert = require('node:assert/strict');
const { backfillResumeDocuments } = require('../../scripts/backfill-resume-documents');
const rows = [1,2,3,4].map(id => ({id: String(id), candidate_id: 'candidate', cycle_id: id === 4 ? 'old' : 'current', file_url: id === 2 ? null : 'https://drive.google.com/open?id=source'}));
function clientFixture() {
  const calls = [];
  return { calls, from() {
    let limit, after, cycle;
    const q = { select(){return q;}, order(){return q;}, limit(n){limit=n;return q;}, eq(k,v){cycle=v;return q;}, gt(k,v){after=v;return q;}, then(resolve) {return Promise.resolve({data:rows.filter(r=>(!cycle || r.cycle_id===cycle)&&(!after||r.id>after)).slice(0,limit)}).then(resolve);} };
    return q;
  }, async rpc(name, args) { calls.push({name,args}); return {data:args.resume_ids.length}; } };
}
test('backfill dry run paginates and filters without enqueueing',async()=>{
  const client=clientFixture(); const totals=await backfillResumeDocuments(client,{cycleId:'current',batchSize:2,log(){}});
  assert.deepEqual(totals,{scanned:3,eligible:2,queued:0,skipped:1}); assert.deepEqual(client.calls,[]);
});
test('explicit apply respects resume cursor and passes failed retry intent',async()=>{
  const client=clientFixture(); const totals=await backfillResumeDocuments(client,{allCycles:true,apply:true,retryFailed:true,after:'2',batchSize:1,log(){}});
  assert.equal(totals.queued,2); assert.deepEqual(client.calls.map(c=>c.args),[{resume_ids:['3'],retry_failed:true},{resume_ids:['4'],retry_failed:true}]);
});
test('backfill requires one explicit scope before reading',async()=>{
  for(const options of [{},{cycleId:'current',allCycles:true},{allCycles:true,batchSize:501}])await assert.rejects(backfillResumeDocuments(clientFixture(),options));
});
