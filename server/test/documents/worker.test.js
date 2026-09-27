const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.SUPABASE_URL ||= 'http://localhost:54321';process.env.SUPABASE_SERVICE_KEY ||= 'test-only';
const {processDocument,markFailure}=require('../../src/workers/documentSyncWorker');
const {documentStoragePath}=require('../../src/utils/documentStorage');
const doc={id:'job',candidate_id:'candidate',cycle_id:'cycle',kind:'resume',source_url:'https://drive.google.com/open?id=source',source_version:'version1',claim_token:'lease1',attempts:1};
function client() {
 const updates=[];return {updates,from(){const x={};const q={update(value){x.value=value;return q;},eq(k,v){(x.filters ||= {})[k]=v;return q;},then(resolve){updates.push(x);return Promise.resolve({error:null}).then(resolve);}};return q;}};
}
test('worker uploads original bytes before publishing a guarded ready pointer',async()=>{
 const db=client();const bytes=Buffer.from('%PDF-1.4 actual bytes');let uploaded;
 await processDocument(doc,{client:db,fetchResume:async()=>({buffer:bytes,contentType:'application/pdf'}),fetchThumbnail(){assert.fail('Resume must not use thumbnail');},upload:async(path,data,type)=>{assert.equal(db.updates.length,0);uploaded={path,data,type};}});
 assert.deepEqual(uploaded,{path:'cycle/candidate/resume/version1.pdf',data:bytes,type:'application/pdf'});
 assert.equal(db.updates[0].value.sync_status,'ready');
 assert.deepEqual(db.updates[0].filters,{id:'job',source_version:'version1',claim_token:'lease1',sync_status:'active'});
});
test('failed Storage upload never publishes a ready document',async()=>{
 const db=client();await assert.rejects(processDocument(doc,{client:db,fetchResume:async()=>({buffer:Buffer.from('%PDF'),contentType:'application/pdf'}),upload:async()=>{throw new Error('Storage down');}}),/Storage down/);assert.equal(db.updates.length,0);
});
test('headshots retain thumbnail processing and use versioned paths',async()=>{
 const db=client();let size;
 await processDocument({...doc,kind:'headshot'},{client:db,fetchThumbnail:async(_,n)=>{size=n;return{buffer:Buffer.from('image'),contentType:'image/jpeg'};},fetchResume(){assert.fail();},upload:async path=>assert.equal(path,'cycle/candidate/headshot/version1.jpg')});assert.equal(size,320);
 assert.equal(documentStoragePath({cycleId:'c',candidateId:'a',kind:'resume',sourceVersion:'v',contentType:'image/jpeg'}),'c/a/resume/v.jpg');
});
test('failure retries are delayed and guarded against superseded leases',async()=>{
 const db=client();const start=Date.now();await markFailure(doc,new Error('Drive unavailable'),db);
 assert.equal(db.updates[0].value.sync_status,'pending');assert.ok(Date.parse(db.updates[0].value.next_attempt_at)>=start+59_000);assert.equal(db.updates[0].filters.claim_token,'lease1');
});
