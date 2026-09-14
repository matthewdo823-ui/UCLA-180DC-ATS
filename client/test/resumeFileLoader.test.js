import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResumeFileLoader } from '../src/utils/resumeFileLoader.js';
const input={resumeId:'resume1',sourceUrl:'drive-source',authToken:'ats-secret'};
const stored={source:'storage',url:'https://storage.example/file?token=one',fallbackUrl:'/resume/resume1/file-content?version=v1',version:'v1',expiresAt:Date.now()+900_000};
const response=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
test('ready resumes fetch Storage directly without forwarding the ATS token',async()=>{
 const calls=[];let resolutions=0;
 const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async(url,init)=>{resolutions++;assert.equal(init.headers.Authorization,'Bearer ats-secret');return response(stored);},fetchBlob:async(url,token)=>{calls.push({url,token});return new Blob(['%PDF']);}});
 await loader.load(input);await loader.load(input);
 assert.equal(resolutions,1);assert.deepEqual(calls[0],{url:stored.url,token:undefined});
});
test('pending copies use the API-authorized Drive fallback',async()=>{
 let call;const fallback={...stored,source:'drive',url:stored.fallbackUrl,expiresAt:null};
 const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>response(fallback),fetchBlob:async(url,token)=>{call={url,token};return new Blob();}});
 await loader.load(input);assert.deepEqual(call,{url:'https://api.example'+stored.fallbackUrl,token:'ats-secret'});
});
test('expired Storage URLs are re-resolved once before downloading',async()=>{
 let resolutions=0,downloads=0;
 const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>response({...stored,url:stored.url+(++resolutions)}),fetchBlob:async(url,token)=>{assert.equal(token,undefined);if(++downloads===1)throw new Error('HTTP 403');return new Blob();}});
 await loader.load(input);assert.equal(resolutions,2);assert.equal(downloads,2);
});
test('Storage outage falls back after one refresh, keeping the API token on the API',async()=>{
 const calls=[];const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>response(stored),fetchBlob:async(url,token)=>{calls.push({url,token});if(url.startsWith('https://storage'))throw new Error('HTTP 404');return new Blob();}});
 await loader.load(input);assert.equal(calls.length,3);assert.equal(calls[2].token,'ats-secret');assert.ok(calls[2].url.startsWith('https://api.example/resume/'));
});
test('permission failures never attempt the fallback',async()=>{
 for(const status of [401,403,404]){
  const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>new Response('',{status}),fetchBlob:async()=>assert.fail('Unauthorized fallback')});
  await assert.rejects(loader.load(input),new RegExp(String(status)));
 }
});
test('changed source and logout invalidate resolved links',async()=>{
 let count=0;const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>{count++;return response(stored);},fetchBlob:async()=>new Blob()});
 await loader.load(input);await loader.load({...input,sourceUrl:'new-drive-source'});assert.equal(count,2);
 loader.clear();await loader.load(input);assert.equal(count,3);
});
test('a stale Drive fallback version re-resolves after replacement',async()=>{
 let resolutions=0;const loader=createResumeFileLoader({api:'https://api.example',fetchImpl:async()=>response(++resolutions===1?{...stored,source:'drive'}:stored),fetchBlob:async url=>{if(url.startsWith('https://api'))throw new Error('HTTP 409');return new Blob();}});
 await loader.load(input);assert.equal(resolutions,2);
});
