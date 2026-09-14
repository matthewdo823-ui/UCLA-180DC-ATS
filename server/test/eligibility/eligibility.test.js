const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyScreeningEligibility,screeningAccessError}=require('../../src/utils/screeningEligibility');

test('eligibility forces zero/reject without destroying original grades',()=>{
 const reviews=[{score:88}];const c=applyScreeningEligibility({id:'a',screeningExclusionReason:'Junior standing',score:88,normalizedScore:88,numReviews:1,reviews,decision:{status:'advance'}});
 assert.equal(c.score,0);assert.equal(c.normalizedScore,0);assert.equal(c.decision.status,'reject');assert.equal(c.gradingRequired,false);assert.equal(c.canDecide,false);assert.equal(c.numReviews,1);assert.equal(c.reviews,reviews);
});
test('eligible and historical applicants keep their existing scores/decisions',()=>{
 for(const year of ['Junior Transfer','Freshman','Sophomore','Junior','Senior',null]){
  const c={year,normalizedScore:88,screeningExclusionReason:null};assert.equal(applyScreeningEligibility(c),c);assert.equal(screeningAccessError({year,screening_exclusion_reason:null}),null);
 }
});

const dbPath=require.resolve('../../src/config/supabase');
const cyclePath=require.resolve('../../src/utils/cycleContext');
const assignmentPath=require.resolve('../../src/services/assignmentService');
let assignedIds=[],queries=[];
const excluded={id:'excluded',file_url:'https://drive.google.com/open?id=excluded',candidates:{year:'Junior',screening_exclusion_reason:'Junior'}};
const eligible={id:'eligible',file_url:'https://drive.google.com/open?id=eligible',candidates:{year:'Junior Transfer',screening_exclusion_reason:null}};
const db={from(table){const entry={table,filters:[]};queries.push(entry);const q={select(s){entry.select=s;return q},eq(){return q},not(){return q},in(){return q},is(k,v){entry.filters.push([k,v]);return q},order(){return q},limit(n){entry.limit=n;return q},then(resolve){const filter=entry.filters.some(([k,v])=>k==='candidates.screening_exclusion_reason'&&v===null)&&entry.select.includes('candidates!inner');return Promise.resolve({data:table==='resumes'?(filter?[eligible]:[excluded,eligible]):[]}).then(resolve)}};return q}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
require.cache[cyclePath]={id:cyclePath,filename:cyclePath,loaded:true,exports:{requireActiveResumeScreening:async()=>({cycle:{id:'cycle'},round:{id:'round'}})}};
require.cache[assignmentPath]={id:assignmentPath,filename:assignmentPath,loaded:true,exports:{fetchPendingAssignedResumeIds:async()=>assignedIds}};
const {getNextResume,getNextFrq}=require('../../src/controllers/resumeController');
function response(){return {code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}}}
test('shared resume and FR queues filter eligibility in the database before limiting',async()=>{
 assignedIds=[];
 for(const handler of [getNextResume,getNextFrq]){queries=[];const res=response();await handler({user:{user_id:1,role:'admin'}},res);assert.equal(res.body.id,'eligible');const q=queries.find(q=>q.table==='resumes');assert.equal(q.limit,100);assert.ok(q.select.includes('candidates!inner'));assert.deepEqual(q.filters,[['candidates.screening_exclusion_reason',null]]);}
});
test('assigned resumes use the same eligibility filter',async()=>{assignedIds=['excluded','eligible'];queries=[];const res=response();await getNextResume({user:{user_id:1,role:'member'}},res);assert.equal(res.body.id,'eligible');assert.equal(queries.filter(q=>q.table==='resumes').length,1)});
