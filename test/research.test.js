import test from 'node:test';
import assert from 'node:assert/strict';
import {financials,mergePredecessor,CONTINUITY} from '../src/accounting.js';
import {defaults,forecast,dcf,analyze} from '../public/model.js';
import {SCHEMA,H_NAMES,validateResearch,researchInput,verifyAccounting,applyResearch,startResearch,finishResearch,ResearchStore,researchKey,RESEARCH_MODEL,resolveFilingCitations,verifyGuidance} from '../src/research.js';
import worker from '../src/worker.js';

const day=new Date().toISOString().slice(0,10);
const urls=[1,2,3].map(i=>'https://www.sec.gov/Archives/edgar/data/1/00000000012600000'+i+'/filing.htm');
const data={version:'0.2.0',symbol:'TEST',name:'Test business',asOf:day,fetchedAt:new Date().toISOString(),currency:'USD',industry:'Software',
  base:{end:day,provenance:{},revenue:1000,ebit:200,da:30,capex:50,nwc:100,cash:80,cashAndEquivalents:60,shortInvest:20,longInvest:50,nonOperatingInvestments:50,shortDebt:10,currentDebt:20,longDebt:120,assets:900,debt:150,shares:50,valuationShares:52,currentAssets:380,currentLiabilities:230},
  history:[2022,2023,2024,2025].map((year,i)=>({end:`${year}-12-31`,revenue:800+i*60,ebit:160+i*12,da:24+i*2,capex:40+i*3})),
  rates:{rf:.04,erp:.05},peers:[1,2,3].map(i=>({symbol:'P'+i,beta:{beta:1.1},debt:100,equity:900,quality:[]})),
  beta:{beta:1.2},quote:{price:25,asOf:new Date().toISOString()},hFactors:H_NAMES.map(name=>({name,score:2})),
  quality:[{code:'research-pending',severity:'critical',text:'Pending research'}],sources:urls.map(url=>({name:'SEC facts',url}))};
const evidence={explanation:'A researched assumption using the issuer’s dated operating disclosures and explicit competitive expectations.',sourceIds:['s1']};
function report(){return {company:'TEST',asOf:day,modelFamily:'fcff',businessDescription:'A subscription software business with usage expansion.',modelRationale:evidence,taxRate:.25,
  sources:urls.map((url,i)=>({id:'s'+(i+1),title:'SEC filing '+i,url,publishedAt:day})),
  forecast:null,businessDrivers:[{name:'Subscriptions',description:'Reported subscription revenue; unit pricing is undisclosed.',observability:'reported',sourceIds:['s1']}],guidance:[],
  peers:[1,2,3].map(i=>({symbol:'P'+i,rationale:evidence})),
  risk:{revenueDecline:.2,stressMargin:.1,minCoverage:3,maxDebtEbitda:3,maturities2y:20,minimumCash:20,observedDebtYield:null,bondYearsToMaturity:null,bondObservationDate:null,bondRationale:evidence,stressRationale:evidence,liquidityRationale:evidence,hFactors:H_NAMES.map(name=>({name,score:2,...evidence}))},accountingEvidence:[],uncertainties:['The forward estimates are uncalibrated.']};}
test('company research never receives the market quote or valuation outputs',()=>{
  const input=researchInput({...data,analysis:{price:999}});assert.equal(input.quote,undefined);assert.equal(input.analysis,undefined);assert.equal(input.symbol,'TEST');
});
test('strict research contract rejects invented citations, future evidence and generic malformed paths',()=>{
  assert.deepEqual(validateResearch(report(),data,urls),[]);
  const forged=report();forged.sources[0].url='https://invented.example/';assert.ok(validateResearch(forged,data,urls).length);
  const future=report();future.sources[0].publishedAt='2099-01-01';assert.ok(validateResearch(future,data,urls).length);
  const invented=report();invented.forecast={growth:.9};assert.ok(validateResearch(invented,data,urls).some(e=>e.includes('forecast contract')));
  const h=report();h.risk.hFactors[0].sourceIds=['absent'];assert.ok(validateResearch(h,data,urls).length);
  const driver=report();driver.businessDrivers[0].sourceIds=['absent'];assert.ok(validateResearch(driver,data,urls).some(e=>e.includes('Business driver')));
  assert.equal(SCHEMA.additionalProperties,false);
});
test('legacy evidence-only research cannot change the fitted growth path and terminal growth remains funded',()=>{
  const r=applyResearch(data,{status:'validated',report:report(),accounting:{accepted:[]}}),a=defaults(r),rows=forecast(r.base,a);
  assert.equal(rows[0].revenue,forecast(data.base,defaults(data))[0].revenue);assert.equal(a.driverForecast,null);
  for(const row of rows)assert.ok(Math.abs(row.fcff-(row.nopat+row.da-row.capex-row.deltaNwc))<1e-9);
  const last=rows.at(-1),v=dcf(rows,.1,a.terminalGrowth,a.terminalROIC,r.base,a);
  assert.ok(Math.abs(last.reinvestment/last.nopat-a.terminalGrowth/a.terminalROIC)<1e-12);
  assert.ok(Math.abs(v.terminalFCFF-last.fcff*(1+a.terminalGrowth))<1e-9);
  assert.ok(Math.abs(v.equity-(v.ev+60+50-150))<1e-8); // reserve=20, not double counted
  assert.ok(Math.abs(v.price-v.equity/52)<1e-9);
  assert.equal(analyze(r,a).status,'Review required');
});
test('bond observations must be recent, USD-duration compatible and yields rather than coupons',()=>{
  const r=report();r.risk.observedDebtYield=.06;r.risk.bondYearsToMaturity=10;r.risk.bondObservationDate=day;
  assert.deepEqual(validateResearch(r,data,urls),[]);
  const a=defaults(applyResearch(data,{status:'validated',report:r,accounting:{accepted:[]}})),result=analyze(data,a);
  assert.equal(result.current.kd,.06);assert.equal(result.current.interest,150*.06);
  r.risk.bondObservationDate='2020-01-01';assert.ok(validateResearch(r,data,urls).length);
});
test('a citation alone cannot fabricate a missing accounting balance or overwrite an existing value',async()=>{
  const r=report();r.accountingEvidence=[{field:'shortDebt',period:day,value:0,unit:'USD millions',quotation:'No outstanding short-term debt at the reporting date in 2026.',sourceId:'s1'}];
  const missing=structuredClone(data);missing.base.shortDebt=null;
  const absent=await verifyAccounting(r,missing,async()=>new Response('<p>No matching evidence.</p>'));assert.equal(absent.accepted.length,0);
  const present=await verifyAccounting(r,data,async()=>{throw Error('Must not fetch an overwrite');});assert.equal(present.accepted.length,0);
});
test('missing zero balances require a literal outstanding-balance statement and full period date',async()=>{
  const r=report(),missing=structuredClone(data);missing.base.shortDebt=null;
  const date=new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  const quote='There were no outstanding short-term borrowings as of '+date+'.';
  r.accountingEvidence=[{field:'shortDebt',period:day,value:0,unit:'USD millions',quotation:quote,sourceId:'s1'}];
  const result=await verifyAccounting(r,missing,async()=>new Response('<p>'+quote+'</p>'));assert.equal(result.accepted.length,1);
  const vague='No new short-term debt was issued during '+day.slice(0,4)+'.';r.accountingEvidence[0].quotation=vague;
  const rejected=await verifyAccounting(r,missing,async()=>new Response(vague));assert.equal(rejected.accepted.length,0);
});
test('separate depreciation and intangible amortization are additive, debt aggregates are not duplicated',()=>{
  const f={};
  function put(tag,val,start=null,unit='USD'){const field=f[tag]??={units:{}};const rows=field.units[unit]??=[];rows.push({val,end:'2025-12-31',...(start?{start}:{}),filed:'2026-02-01',form:'10-K',accn:'1-26-1'});}
  for(const y of [2023,2024,2025])f.Revenues={units:{USD:[...(f.Revenues?.units.USD||[]),{val:1000,start:y+'-01-01',end:y+'-12-31',filed:(y+1)+'-02-01',form:'10-K',accn:'1-26-1'}]}};
  put('Depreciation',30,'2025-01-01');put('AmortizationOfIntangibleAssets',5,'2025-01-01');
  put('LongTermDebt',150);put('LongTermDebtCurrent',20);put('ShortTermBorrowings',10);
  const r=financials({cik:1,facts:{'us-gaap':f}},{},'2026-03-01');assert.ok(Math.abs(r.base.da-.000035)<1e-12);assert.ok(Math.abs(r.base.debt-.00016)<1e-12);assert.equal(r.base.provenance.da.length,2);
});
test('entity continuity requires a documented one-for-one identity and rejects conflicting revenue',()=>{
  const fact=(val,cik)=>({cik,facts:{'us-gaap':{Revenues:{units:{USD:[{val,end:'2025-12-31',start:'2025-01-01',filed:'2026-03-01'}]}}}}});
  const link=CONTINUITY[2115436];const merged=mergePredecessor(fact(100,2115436),fact(100,34088),link,'2026-10-21');assert.equal(merged.facts['us-gaap'].Revenues.units.USD[0].sourceCik,34088);
  assert.throws(()=>mergePredecessor(fact(2000000,2115436),fact(100,34088),link,'2026-10-21'),/conflicts/);
  assert.throws(()=>mergePredecessor(fact(100,2115436),fact(100,9),link,'2026-10-21'),/Unverified/);
});
test('Responses completion uses researched peers and preserves evidence-vs-performance distinction',async()=>{
  let tickers;const r=report();
  const job=await finishResearch({data,key:'TEST',responseId:'resp_test',status:'rejected',errors:['old validation error']},{OPENAI_API_KEY:'test-only'},
    {fetcher:async url=>{assert.ok(url.includes('include%5B%5D=web_search_call.action.sources'));return Response.json({status:'completed',model:'test',output:[{type:'web_search_call',action:{sources:urls.map(url=>({url}))}},{type:'message',content:[{type:'output_text',text:JSON.stringify(r),annotations:urls.map(url=>({type:'url_citation',url}))}]}]});},loadCompany:async(symbol,env,peers)=>{tickers=peers;return structuredClone(data);}});
  assert.equal(job.status,'validated');assert.deepEqual(job.errors,[]);assert.deepEqual(tickers,['P1','P2','P3']);assert.equal(job.data.peerScreen,'LLM-researched business comparisons');
  assert.ok(applyResearch(job.data,job).quality.some(q=>q.code==='research-unvalidated-performance'));
});
test('research budget reservations deduplicate jobs and cap new calls globally',async t=>{
  const m=new Map(),storage={get:async k=>m.get(k),put:async(k,v)=>{m.set(k,structuredClone(v));},transaction:async fn=>fn(storage)};
  let calls=0;t.mock.method(globalThis,'fetch',async(url,opt)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(opt.body);assert.equal(body.text.format.strict,true);assert.equal(body.background,true);assert.equal(body.model,'gpt-5.6-terra');assert.equal(body.reasoning.effort,'low');assert.deepEqual(body.text.format.schema.properties.company.enum,['TEST']);assert.equal(body.tool_choice,'required');assert.equal(body.max_output_tokens,12000);calls++;return Response.json({id:'resp_'+calls});});
  const store=new ResearchStore({storage},{OPENAI_API_KEY:'test-only',RESEARCH_DAILY_LIMIT:'1'});
  const request=d=>new Request('https://internal/',{method:'POST',body:JSON.stringify(d)});
  await store.fetch(request(data));await store.fetch(request(data));assert.equal(calls,1);
  const limited=await store.fetch(request({...data,symbol:'OTHER'}));assert.equal(limited.status,429);assert.equal(calls,1);
});
test('missing-key and cross-origin paths fail before any paid API call; config never exposes a secret',async()=>{
  await assert.rejects(startResearch(data,{}),/OPENAI_API_KEY/);
  const response=await worker.fetch(new Request('https://example.com/api/research',{method:'POST',headers:{Origin:'https://example.com'},body:'{"symbol":"TEST"}'}),{},{});assert.equal(response.status,503);
  const forbidden=await worker.fetch(new Request('https://example.com/api/research',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{},{});assert.equal(forbidden.status,403);
  const config=await worker.fetch(new Request('https://example.com/api/config'),{OPENAI_API_KEY:'test-secret'},{});const text=await config.text();assert.ok(!text.includes('test-secret'));assert.equal(JSON.parse(text).researchConfigured,true);
});

test('model selection separates cached research and configuration defaults to Terra',async()=>{
  assert.equal(RESEARCH_MODEL,'gpt-5.6-terra');
  assert.notEqual(researchKey(data,{OPENAI_MODEL:'gpt-5.6-terra'}),researchKey(data,{OPENAI_MODEL:'gpt-6-astra'}));
  const response=await worker.fetch(new Request('https://example.com/api/config'),{},{});const config=await response.json();assert.equal(config.researchModel,'gpt-5.6-terra');assert.equal(config.researchEffort,'low');
});
test('forecast lookup only reads the current issuer-period-version cache; it cannot create a paid job',async()=>{
  let requested;
  const env={RESEARCH:{idFromName:n=>n,get:()=>({fetch:async request=>{requested=request;return Response.json({error:'Not found'},{status:404});}})}};
  const response=await worker.fetch(new Request('https://example.com/api/forecast?symbol=TEST&period=2026-06-30'),env,{});
  const body=await response.json();assert.equal(body.status,'not_started');
  assert.equal(requested.method,'GET');assert.equal(new URL(requested.url).searchParams.get('key'),'TEST:2026-06-30:0.4.0:research-5:gpt-5.6-terra');
});
test('directory citations resolve only to indexed issuer documents with matching filed dates',async()=>{
  const folder='https://www.sec.gov/Archives/edgar/data/1/000000000126000001';
  const r={sources:[{id:'exhibit',url:folder+'/earnings.htm',publishedAt:day}]};
  const d={...data,cik:1,filingRegistry:[{accession:'0000000001-26-000001',date:day,cik:1}]};
  const fetcher=async url=>{assert.equal(url,folder+'/index.json');return Response.json({directory:{item:[{name:'earnings.htm'}]}});};
  assert.equal((await resolveFilingCitations(r,d,[folder],fetcher)).length,1);
  assert.equal((await resolveFilingCitations({sources:[{...r.sources[0],url:folder+'/invented.htm'}]},d,[folder],fetcher)).length,0);
  assert.equal((await resolveFilingCitations(r,{...d,filingRegistry:[{...d.filingRegistry[0],date:'2000-01-01'}]},[folder],fetcher)).length,0);
  assert.equal((await resolveFilingCitations(r,{...d,cik:99},[folder],fetcher)).length,0);
});
