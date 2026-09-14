const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../../src/config/supabase');
const cyclePath=require.resolve('../../src/utils/cycleContext');
let calls=[],candidateCycle='cycle';
const db={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},async maybeSingle(){calls.push({table,filters});return {data:table==='resumes'?{id:'resume',cycle_id:candidateCycle,candidates:{cycle_id:candidateCycle,why_180dc:'essay'}}:table==='resume_reviews'?{id:'my-resume-review',scores:{Leadership:2},notes:'resume notes'}:{id:'my-frq-review',score:0,notes:'frq notes'}}}};return q}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
require.cache[cyclePath]={id:cyclePath,filename:cyclePath,loaded:true,exports:{requireActiveResumeScreening:async()=>({cycle:{id:'cycle'},round:{id:'round'}})}};
const {getResumeGradingContext}=require('../../src/controllers/resumeController');
function response(){return {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}}}
test('paired context keeps candidate identity and retrieves only this graders reviews',async()=>{calls=[];candidateCycle='cycle';const res=response();await getResumeGradingContext({user:{user_id:7,role:'admin'},params:{id:'resume'}},res);assert.equal(res.code,200);assert.equal(res.body.id,'resume');assert.equal(res.body.frqReview.score,0);assert.equal(res.body.resumeReview.reviewId,'my-resume-review');for(const c of calls.filter(c=>c.table.endsWith('_reviews'))){assert.ok(c.filters.some(([k,v])=>k==='graded_by'&&v===7));assert.ok(c.filters.some(([k,v])=>k==='resume_id'&&v==='resume'));assert.ok(c.filters.some(([k,v])=>k==='cycle_id'&&v==='cycle'));}});
test('missing identity is rejected before reading candidate or reviews',async()=>{calls=[];const res=response();await getResumeGradingContext({params:{id:'resume'}},res);assert.equal(res.code,401);assert.equal(calls.length,0)});
test('candidate from another cycle is rejected before reading reviews',async()=>{calls=[];candidateCycle='historical';const res=response();await getResumeGradingContext({user:{user_id:7},params:{id:'resume'}},res);assert.equal(res.code,400);assert.deepEqual(calls.map(c=>c.table),['resumes']);candidateCycle='cycle'});
