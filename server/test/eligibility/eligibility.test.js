const {test}=require('node:test');
const assert=require('node:assert/strict');
const {applyScreeningEligibility,screeningAccessError,screeningExclusionReason,ELIGIBLE_YEAR_FILTER}=require('../../src/utils/screeningEligibility');

test('eligibility forces zero/reject without destroying original grades',()=>{
 const reviews=[{score:88}];const c=applyScreeningEligibility({id:'a',year:'Junior',score:88,normalizedScore:88,numReviews:1,reviews,decision:{status:'advance'}});
 assert.equal(c.score,0);assert.equal(c.normalizedScore,0);assert.equal(c.decision.status,'reject');assert.equal(c.gradingRequired,false);assert.equal(c.canDecide,false);assert.equal(c.numReviews,1);assert.equal(c.reviews,reviews);
});
test('Junior, Senior, and Senior Transfer are excluded while Junior Transfer remains eligible',()=>{
 for(const year of ['Junior','Senior',' junior ','SENIOR','Senior Transfer',' senior transfer ','TRANSFER SENIOR','4th year transfer','Sr Transfer']) assert.ok(screeningExclusionReason(year));
 for(const year of ['Junior Transfer','Freshman','Sophomore',null,'']) {
  assert.equal(screeningExclusionReason(year),null);
  assert.equal(screeningAccessError({year}),null);
 }
});
test('historical reads retain stored grades and committee decisions',()=>{
 const c={year:'Senior',normalizedScore:88,decision:{status:'advance'}};
 assert.equal(applyScreeningEligibility(c,false),c);
 assert.equal(c.normalizedScore,88);
 assert.equal(c.decision.status,'advance');
});

const dbPath=require.resolve('../../src/config/supabase');
const cyclePath=require.resolve('../../src/utils/cycleContext');
const assignmentPath=require.resolve('../../src/services/assignmentService');
let assignedIds=[],queries=[];
const excluded={id:'excluded',file_url:'https://drive.google.com/open?id=excluded',candidates:{year:'Junior'}};
const eligible={id:'eligible',file_url:'https://drive.google.com/open?id=eligible',candidates:{year:'Junior Transfer'}};
const db={async rpc(name,args){return {data:name==='claim_next_review'?(args.candidate_ids[0]??null):null,error:null}},from(table){const entry={table,filters:[]};queries.push(entry);const q={select(s){entry.select=s;return q},eq(){return q},not(){return q},in(){return q},or(filter,options){entry.filters.push([filter,options]);return q},order(){return q},limit(n){entry.limit=n;return q},async maybeSingle(){return {data:table==='resumes'?{...excluded,cycle_id:'cycle'}:{id:'own-review',cycle_id:'cycle',resumes:{candidates:excluded.candidates}}}},then(resolve){const filter=entry.filters.some(([filter,options])=>filter===ELIGIBLE_YEAR_FILTER&&options?.referencedTable==='candidates')&&entry.select.includes('candidates!inner');return Promise.resolve({data:table==='resumes'?(filter?[eligible]:[excluded,eligible]):[]}).then(resolve)}};return q}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
require.cache[cyclePath]={id:cyclePath,filename:cyclePath,loaded:true,exports:{getActiveCycleId:async()=>'cycle',requireOpenResumeRound:async()=>({cycle:{id:'cycle'},round:{id:'round'}}),requireResumeGradingPhase:async()=>({cycle:{id:'cycle'},round:{id:'round'}})}};
require.cache[assignmentPath]={id:assignmentPath,filename:assignmentPath,loaded:true,exports:{fetchPendingAssignedResumeIds:async()=>assignedIds}};
const {getNextResume,getNextFrq,saveReview,saveFrqReview,patchMyReview,patchMyFrqReview}=require('../../src/controllers/resumeController');
function response(){return {code:200,status(n){this.code=n;return this},json(body){this.body=body;return this}}}
test('shared resume and FR queues filter eligibility in the database before limiting',async()=>{
 assignedIds=[];
 for(const handler of [getNextResume,getNextFrq]){queries=[];const res=response();await handler({user:{user_id:1,role:'admin'}},res);assert.equal(res.body.id,'eligible');const q=queries.find(q=>q.table==='resumes');assert.equal(q.limit,100);assert.ok(q.select.includes('candidates!inner'));assert.deepEqual(q.filters,[[ELIGIBLE_YEAR_FILTER,{referencedTable:'candidates'}]]);}
});
test('assigned resumes use the same eligibility filter',async()=>{assignedIds=['excluded','eligible'];queries=[];const res=response();await getNextResume({user:{user_id:1,role:'member'}},res);assert.equal(res.body.id,'eligible');assert.equal(queries.filter(q=>q.table==='resumes').length,1)});

test('direct grade submissions and edits reject excluded applicants before writing',async()=>{
 for(const handler of [saveReview,saveFrqReview,patchMyReview,patchMyFrqReview]) {
  queries=[];const res=response();
  await handler({user:{user_id:1,role:'admin'},params:{reviewId:'own-review'},body:{resume_id:'excluded',score:0,scores:{},decision:'pass'}},res);
  assert.equal(res.code,409);assert.match(res.body.error,/Automatically rejected/);
 }
});
