import test from 'node:test';
import assert from 'node:assert/strict';
import {quarterlyFinancials} from '../src/accounting.js';
import {quarterlyForecast,operatingForecast,predictRevenue,consecutiveQuarters} from '../public/prediction.js';
import {reportedSegments} from '../src/segments.js';
import {verifyGuidance} from '../src/research.js';
import {ResearchStore} from '../src/research.js';
const tagMap={revenue:'Revenues',ebit:'OperatingIncomeLoss',capex:'PaymentsToAcquirePropertyPlantAndEquipment'};
function rawFixture() {
  const facts={};
  function put(key,start,end,val,filed,form='10-Q') {
    const t=tagMap[key];facts[t]??={units:{USD:[]}};facts[t].units.USD.push({start,end,val:val*1e6,filed,form,accn:'0000000001-26-000001'});
  }
  for(const [end,value,filed,form] of [['2025-03-31',100,'2025-05-01','10-Q'],['2025-06-30',250,'2025-08-01','10-Q'],['2025-09-30',450,'2025-11-01','10-Q'],['2025-12-31',700,'2026-02-01','10-K']]) {
    for(const [key,ratio] of [['revenue',1],['ebit',.2],['capex',.05]])put(key,'2025-01-01',end,value*ratio,filed,form);
  }
  put('revenue','2025-01-01','2025-03-31',999,'2099-01-01');
  return {cik:1,facts:{'us-gaap':facts},put};
}
const quarters=Array.from({length:36},(_,i)=>{
  const year=2017+Math.floor(i/4),month=(i%4+1)*3,end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10),revenue=[100,120,140,200][i%4]*1.08**Math.floor(i/4);
  return {end,revenue,ebit:revenue*.2,margin:.2};
});
test('YTD and Q4 are differenced; future revisions cannot change a historical quarter',()=>{
  const raw=rawFixture(),rows=quarterlyFinancials(raw,'2026-03-01');
  assert.deepEqual(rows.map(r=>r.revenue),[100,150,200,250]);
  assert.deepEqual(rows.map(r=>r.capex),[5,7.5,10,12.5]);
  assert.equal(rows[1].start,'2025-04-01');assert.equal(rows[3].provenance.revenue.length,2);
  assert.deepEqual(quarterlyFinancials(raw,'2025-07-01').map(r=>r.revenue),[100]);
});
test('missing intermediate YTD does not become an invented quarter; direct discrete quarter wins',()=>{
  const raw=rawFixture();raw.facts['us-gaap'].Revenues.units.USD=raw.facts['us-gaap'].Revenues.units.USD.filter(f=>f.end!=='2025-06-30');
  assert.ok(!quarterlyFinancials(raw,'2026-03-01').some(r=>r.end==='2025-09-30'));
  raw.put('revenue','2025-07-01','2025-09-30',190,'2025-11-01');
  assert.equal(quarterlyFinancials(raw,'2026-03-01').find(r=>r.end==='2025-09-30').revenue,190);
});
test('issuer-specific model selection learns sustained growth and preserves quarterly seasonality',()=>{
  const fit=quarterlyForecast(quarters,{candidate:true});assert.equal(fit.status,'fitted');assert.equal(fit.quarters.length,4);
  assert.equal(fit.fit.method,'recent-trend');assert.ok(Math.abs(fit.quarters[0].revenue/quarters.at(-4).revenue-1.08)<1e-10);
  assert.ok(fit.quarters[3].revenue>fit.quarters[0].revenue);
  assert.deepEqual(quarterlyForecast(quarters.slice(0,7)).status,'insufficient');
});
test('prequential residuals select a model using only prefix observations',()=>{
  const all=quarterlyForecast(quarters,{candidate:true});
  for(const n of [12,20,30]) {
    const prefix=quarterlyForecast(quarters.slice(0,n),{candidate:true,diagnostics:false});
    const residual=all.prequential.find(r=>r.origin===quarters[n-1].end&&r.horizon===1);
    assert.equal(residual.method,prefix.fit.method);assert.equal(residual.predicted,prefix.quarters[0].revenue);
  }
});
test('revenue intervals require enough errors and gap handling prevents calendar misalignment',()=>{
  assert.equal(quarterlyForecast(quarters.slice(0,12)).quarters[0].low,null);
  const fit=quarterlyForecast(quarters);assert.ok(fit.quarters.every(r=>r.low<=r.revenue&&r.high>=r.revenue&&r.calibrationN>=12));
  const broken=quarters.filter((r,i)=>i!==30);assert.equal(consecutiveQuarters(broken).length,5);assert.equal(quarterlyForecast(broken).status,'insufficient');
});
test('LLM numerical paths and traded prices cannot affect fitted revenue; verified guidance has separate bounds',()=>{
  const b={end:quarters.at(-1).end,revenue:quarters.slice(-4).reduce((s,r)=>s+r.revenue,0),ebit:100,capex:20,da:10,nwc:30};
  const data={base:b,quarterly:quarters,history:[{end:b.end,...b}],research:{report:{forecast:{segments:[{volumeGrowth:[99]}]}}}};
  const f=operatingForecast(data),changed=operatingForecast({...data,quote:{price:999999}});assert.equal(f.firstGrowth,changed.firstGrowth);
  const end=f.quarters[0].end,guidance={metric:'revenue',periodEnd:end,unit:'USD millions',low:100,high:120};
  const anchored=operatingForecast({...data,research:{guidance:{accepted:[guidance]}}},{useGuidance:true});
  const defaultWithGuidance=operatingForecast({...data,research:{guidance:{accepted:[guidance]}}});assert.equal(defaultWithGuidance.quarters[0].revenue,f.quarters[0].revenue);assert.equal(defaultWithGuidance.guidanceComparison.length,1);
  assert.equal(anchored.quarters[0].revenue,110);assert.equal(anchored.quarters[0].low,null);assert.equal(anchored.appliedGuidance.length,1);
});
function inline({second=60,conflict=false,axis='us-gaap:StatementBusinessSegmentsAxis'}={}) {
  return '<xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>'+['a','b'].map(m=>`<xbrli:context id="${m}"><xbrli:entity><xbrli:segment><xbrldi:explicitMember dimension="${axis}">issuer:${m}Member</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>`).join('')+`<ix:nonFraction name="us-gaap:Revenues" unitRef="USD" contextRef="a" scale="6">40</ix:nonFraction><ix:nonFraction name="us-gaap:Revenues" unitRef="USD" contextRef="b" scale="6">${second}</ix:nonFraction>`+(conflict?'<ix:nonFraction name="us-gaap:Revenues" unitRef="USD" contextRef="a" scale="6">50</ix:nonFraction>':'');
}
test('inline segment partitions require currency, scope, no conflicts and consolidated reconciliation',()=>{
  const h=[{end:'2025-12-31',revenue:100}],url='https://www.sec.gov/filing';
  const result=reportedSegments(inline(),h,url);assert.equal(result.status,'reconciled');assert.equal(result.latest.members[0].weight,.4);
  for(const html of [inline({second:50}),inline({conflict:true}),inline({axis:'us-gaap:GeographicalAreasAxis'}),inline().replace('iso4217:USD','iso4217:EUR')])assert.equal(reportedSegments(html,h,url).status,'unavailable');
});
test('guidance requires literal issuer evidence, correct fiscal quarter and exact numeric bounds',async()=>{
  const source={id:'s1',url:'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/earnings.htm',publishedAt:'2026-08-01'};
  const quote='For the third quarter of fiscal 2026, we expect revenue of $10 billion, plus or minus 2%.';
  const item={metric:'revenue',periodEnd:'2026-09-30',periodLabel:'third quarter of fiscal 2026',unit:'USD millions',low:9800,high:10200,sourceId:'s1',quotation:quote};
  const data={cik:1,asOf:'2026-08-02',base:{end:'2026-06-30'},history:[{end:'2025-12-31'}]};
  const run=(g=item,src=source,text=quote)=>verifyGuidance({sources:[src],guidance:[g]},data,async()=>text);
  assert.equal((await run()).accepted.length,1);
  for(const changes of [{low:9700},{periodEnd:'2026-12-31'},{periodLabel:'third quarter of fiscal 2027'},{unit:'EUR millions'}])assert.equal((await run({...item,...changes})).accepted.length,0);
  assert.equal((await run(item,{...source,url:source.url.replace('/1/','/2/')})).accepted.length,0);
  assert.equal((await run(item,source,'No guidance here.')).accepted.length,0);
});
test('compressed research storage survives large quarterly histories and deduplicates paid calls',async t=>{
  const m=new Map(),storage={get:async k=>m.get(k),put:async(k,v)=>m.set(k,structuredClone(v)),transaction:async fn=>fn(storage)};
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({id:'test'});});
  const store=new ResearchStore({storage},{OPENAI_API_KEY:'test-only'}),data={symbol:'TEST',base:{end:'2026-06-30'},fetchedAt:'2026-08-02',sources:[],history:[],hFactors:[],rates:{rf:.04},quarterly:[],padding:'a'.repeat(160000)};
  const request=()=>new Request('https://internal/',{method:'POST',body:JSON.stringify(data)});
  assert.equal((await store.fetch(request())).status,200);assert.equal((await store.fetch(request())).status,200);assert.equal(calls,1);
  assert.ok([...m.values()].some(v=>v?.encoding==='gzip-json'&&v.bytes.byteLength<120000));
});

test('missing current operating income cannot become a zero margin forecast',()=>{
 const f=operatingForecast({base:{end:quarters.at(-1).end,revenue:600,ebit:null,capex:30,da:10,nwc:null},history:[{end:'2024-12-31',revenue:600,ebit:null}],quarterly:quarters});
 assert.equal(f.nearMargin,null);assert.ok(f.quarters.every(r=>r.margin===null&&r.ebit===null));assert.equal(f.ratios.nwc.value,null);
});
test('recognized consolidation marker is allowed, arbitrary second dimensions are not',()=>{
 const h=[{end:'2025-12-31',revenue:100}],marker='<xbrldi:explicitMember dimension="srt:ConsolidationItemsAxis">us-gaap:OperatingSegmentsMember</xbrldi:explicitMember>';
 const html=inline().replaceAll('</xbrli:segment>',marker+'</xbrli:segment>');
 assert.equal(reportedSegments(html,h,'fixture').status,'reconciled');
 assert.equal(reportedSegments(html.replaceAll('srt:ConsolidationItemsAxis','us-gaap:GeographicalAreasAxis'),h,'fixture').status,'unavailable');
});

test('Nvidia-style SEC guidance accepts exact encoded source text and rejects stitched headings',async()=>{
 const source={id:'S4',url:'https://www.sec.gov/Archives/edgar/data/1045810/000104581026000073/q2fy27cfocommentary.htm',publishedAt:'2026-08-26'};
 const encoded='Outlook for the third quarter of fiscal 2027 is as follows&#58; &#8226; Revenue is expected to be $108.0 billion, plus or minus 2%.';
 const exact='Outlook for the third quarter of fiscal 2027 is as follows: • Revenue is expected to be $108.0 billion, plus or minus 2%.';
 const item={metric:'revenue',periodEnd:'2026-10-25',periodLabel:'third quarter of fiscal 2027',unit:'USD millions',low:105840,high:110160,sourceId:'S4',quotation:exact};
 const data={cik:1045810,asOf:'2026-10-21',base:{end:'2026-07-26'},history:[{end:'2026-01-25'}]};
 assert.equal((await verifyGuidance({sources:[source],guidance:[item]},data,async()=>encoded)).accepted.length,1);
 const stitched={...item,periodLabel:'Third Quarter Fiscal 2027',quotation:'Third Quarter Fiscal 2027: Revenue is expected to be $108.0 billion, plus or minus 2%.'};
 assert.equal((await verifyGuidance({sources:[source],guidance:[stitched]},data,async()=>encoded)).accepted.length,0);
});
