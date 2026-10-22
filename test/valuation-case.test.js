import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateValuationCase} from '../public/valuation-case.js';
import {attachIssuedForecast} from '../src/forecast-seeds.js';
import {validateResearch,applyResearch,researchInput} from '../src/research.js';
import {defaults,forecast,analyze} from '../public/model.js';
import {requestJSON} from '../public/request.js';

const load=async symbol=>JSON.parse(await readFile(new URL('../reports/v04-live/'+symbol+'-forecast.json',import.meta.url),'utf8'));
test('issued business cases bind the issuer, reporting period, source trace and freshness',async()=>{
  const j=await load('AAPL'),now=Date.parse(j.completedAt),d=j.data;
  assert.ok(attachIssuedForecast(d,now).research?.report.forecast);
  const fresh={...d,quote:{...d.quote,price:123.45},rates:{...d.rates,rf:.045}};
  assert.equal(attachIssuedForecast(fresh,now).quote.price,123.45);
  assert.equal(attachIssuedForecast(fresh,now).rates.rf,.045);
  for(const change of [{symbol:'WRONG'},{base:{...d.base,end:'2000-01-01'}}])assert.equal(attachIssuedForecast({...d,...change},now).research,d.research);
  assert.equal(attachIssuedForecast(d,now+8*864e5).research,d.research);
  const record={...j,modelVersion:d.version,researchVersion:'research-5',periodEnd:d.base.end,researchTrace:{}};
  record.report=structuredClone(j.report);record.report.forecast.growthRationale.sourceIds=['invented'];
  assert.equal(attachIssuedForecast(d,now,{AAPL:record}).research,d.research);
});
test('malformed paths, missing economic evidence, and impossible stable states are rejected',async()=>{
  const j=await load('COST'),c=j.report.forecast,sources=new Map(j.report.sources.map(s=>[s.id,s]));
  assert.deepEqual(validateValuationCase(c,j.data,sources),[]);
  for(const patch of [{years:'12345'},{years:Array(5).fill(null)},{terminal:{...c.terminal,roic:c.terminal.growth}},{growthRationale:{explanation:'No basis',sourceIds:4}}])assert.ok(validateValuationCase({...c,...patch},j.data,sources).length);
  assert.ok(validateResearch({...j.report,forecast:null},j.data,j.researchTrace.observedUrls).some(e=>e.includes('required')));
});
test('live company cases drive years 1–5, fund terminal growth and reconcile enterprise to equity',async()=>{
  for(const symbol of ['AAPL','COST','MSFT','NVDA','GOOGL']){
    const j=await load(symbol),d=applyResearch(j.data,j),a=defaults(d),r=analyze(d,a),c=j.report.forecast;
    assert.deepEqual(r.errors,[],symbol);
    if(symbol==='GOOGL'){assert.equal(d.base.da,null);assert.equal(r.optimal,null);assert.equal(r.current.leverage,null);assert.ok(r.capitalStructureUnavailable);assert.ok(r.sweep.every(x=>!x.feasible));assert.ok(analyze(d,{...a,valuationForecast:null}).errors.some(e=>e.includes('da')));}assert.equal(r.diagnostics.method,'business-case');assert.ok(r.diagnostics.arithmetic.passed);
    for(let i=0;i<5;i++){assert.equal(r.rows[i].growth,c.years[i].growth);assert.ok(Math.abs(r.rows[i].margin-c.years[i].margin)<1e-12);assert.ok(Math.abs(r.rows[i].capex/r.rows[i].revenue-c.years[i].capexRatio)<1e-12);}
    for(const y of r.rows){assert.ok(y.capex>=0);assert.ok(Math.abs(y.fcff-y.nopat-y.da+y.capex+y.deltaNwc)<1e-6);}
    assert.ok(Math.abs(r.rows.at(-1).reinvestment/r.rows.at(-1).nopat-a.terminalGrowth/a.terminalROIC)<1e-12);
    assert.equal(r.rows.at(-1).margin,c.terminal.margin);assert.equal(r.rows.at(-1).growth,c.terminal.growth);
    assert.ok(Math.abs(r.valued.terminalFCFF-r.rows.at(-1).fcff*(1+a.terminalGrowth))<1e-6);
    const shocked=forecast(d.base,{...a,growth:a.growth+.01,margin:a.margin+.01});
    for(let i=0;i<5;i++){assert.ok(Math.abs(shocked[i].growth-r.rows[i].growth-.01)<1e-12);assert.ok(Math.abs(shocked[i].margin-r.rows[i].margin-.01)<1e-12);}
    assert.ok(r.cases[0].price<r.cases[1].price&&r.cases[1].price<r.cases[2].price);
    const changed={...d,quote:{...d.quote,price:d.quote.price*2}},other=defaults(changed);
    assert.deepEqual(forecast(d.base,a),forecast(changed.base,other),'quotes cannot change operating forecasts');
    assert.deepEqual(researchInput(d),researchInput(changed),'the LLM cannot see the market price');
    if(symbol==='COST')assert.ok(Math.abs(r.cases[0].margin-a.margin)<.01,'low-margin retail must not get a generic 3 percentage point margin shock');
  }
});
test('research POST has the same response and transfer deadline as read requests',async()=>{
  const result=await requestJSON('/research',{method:'POST',body:{symbol:'TEST'},fetcher:async(url,options)=>{
    assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'application/json');assert.equal(JSON.parse(options.body).symbol,'TEST');return Response.json({status:'running'});
  }});assert.equal(result.status,'running');
});
