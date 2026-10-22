import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requestJSON} from '../public/request.js';
import {withDeadline} from '../src/deadline.js';
import {loadCompany,loadPeerComparison} from '../src/data.js';

test('a never-settling response or body transfer ends at the browser deadline',async()=>{
  const never=()=>new Promise(()=>{});
  await assert.rejects(requestJSON('/company',{timeoutMs:20,fetcher:never}),/did not load within/);
  await assert.rejects(requestJSON('/company',{timeoutMs:20,fetcher:async()=>({ok:true,text:never})}),/did not load within/);
});
test('HTML service failures produce a useful retry message; cancellation is distinguishable from failure',async()=>{
  await assert.rejects(requestJSON('/company',{fetcher:async()=>new Response('<html>Cloudflare unavailable</html>',{status:503})}),/temporarily unavailable \(HTTP 503\)/);
  const controller=new AbortController(),pending=requestJSON('/company',{signal:controller.signal,fetcher:()=>new Promise(()=>{})});
  controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
  assert.deepEqual(await requestJSON('/company',{fetcher:async()=>Response.json({symbol:'TEST'})}),{symbol:'TEST'});
});
test('the server deadline returns an actionable 504 instead of waiting for a hung cache/source',async()=>{
  await assert.rejects(withDeadline(new Promise(()=>{}),10),e=>e.status===504&&/timed out/.test(e.message));
});
test('deferred company loading returns usable financials without requesting peers; a later peer failure stays isolated',async t=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/company-loading/COST.json',import.meta.url),'utf8'));
  const requested=[],ownCik='0000909832',otherCik='0000000123';
  const points=Array.from({length:62},(_,i)=>Date.UTC(2021,8+i,1)/1000);
  const chart={chart:{result:[{timestamp:points,meta:{regularMarketPrice:998.31,currency:'USD',regularMarketTime:points.at(-1),exchangeName:'NMS',symbol:'COST'},indicators:{adjclose:[{adjclose:points.map((_,i)=>100+i+Math.sin(i)*4)}]}}]}};
  t.mock.method(globalThis,'fetch',async url=>{
    const path=String(url);requested.push(path);
    if(path.includes('company_tickers'))return Response.json({0:{ticker:'COST',cik_str:909832,title:'COSTCO'},1:{ticker:'WMT',cik_str:123,title:'PEER'}});
    if(path.includes('/submissions/'))return Response.json({name:'COSTCO',sic:'5331',filings:{recent:{form:['10-K'],reportDate:['2026-08-30'],filingDate:['2026-10-07'],accessionNumber:['0000909832-26-000093'],primaryDocument:['cost-20260830.htm']}}});
    if(path.includes('companyfacts')&&path.includes(ownCik))return Response.json(fixture);
    if(path.includes(otherCik))return new Response('Unavailable',{status:503});
    if(path.includes('finance/chart/'))return Response.json(chart);
    if(path.includes('Archives/'))return new Response('There were no short-term borrowings outstanding at the end of 2026.');
    return new Response('Unavailable',{status:503});
  });
  const company=await loadCompany('COST',{},[],{includePeers:false});
  assert.equal(company.peerStatus,'pending');assert.equal(company.base.debt,7575);assert.deepEqual(company.peers,[]);
  assert.ok(!requested.some(url=>url.includes(otherCik)),'a peer must never hold up the initial company response');
  const peers=await loadPeerComparison('COST',{},['WMT']);
  assert.equal(peers.status,'loaded');assert.ok(peers.peers[0].error.includes('503'));assert.equal(company.base.debt,7575);
});
