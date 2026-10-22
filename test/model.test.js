import test from 'node:test';
import assert from 'node:assert/strict';
import {betaRegression,unlever,relever,solveDebt,ratingFor,RATINGS,forecast,dcf,analyze,defaults,reverseDCF,peerAssetBeta} from '../public/model.js';
import {financials,pickFact,monthlyReturns,filingEvidence,filingUrl} from '../src/data.js';
import {quarterlyFinancials} from '../src/accounting.js';
import worker from '../src/worker.js';

const fixture={
  base:{end:new Date().toISOString().slice(0,10),revenue:1000,ebit:200,da:30,capex:50,nwc:100,cash:80,debt:150,shares:50,cfo:180},
  history:[2022,2023,2024,2025].map((year,i)=>({end:`${year}-12-31`,revenue:800+i*60,ebit:160+i*12,da:24+i*2,capex:40+i*3})),
  peers:[{symbol:'P1',beta:{beta:1.1},debt:100,equity:900},{symbol:'P2',beta:{beta:1.2},debt:200,equity:1000},{symbol:'P3',beta:{beta:1.3},debt:150,equity:950}],
  beta:{beta:1.2},quote:{price:25,asOf:new Date().toISOString()},rates:{rf:.04,erp:.05},hFactors:Array.from({length:7},()=>({score:2})),quality:[]
};

test('OLS beta recovers a known slope and exposes precision',()=>{
  const x=Array.from({length:60},(_,i)=>Math.sin(i)*.05),y=x.map(v=>.003+1.6*v),r=betaRegression(y,x);
  assert.ok(Math.abs(r.beta-1.6)<1e-12);assert.ok(Math.abs(r.alpha-.003)<1e-12);assert.ok(r.r2>.999999);assert.ok(r.standardError<1e-10);
  assert.equal(betaRegression(y.slice(0,20),x.slice(0,20)),null);assert.equal(betaRegression(y,Array(60).fill(.1)),null);
});
test('unlever and relever invert using gross debt and the same tax convention',()=>{
  const beta=unlever(1.4,200,800,.25);assert.ok(Math.abs(relever(beta,.2,.25)-1.4)<1e-12);
});
test('rating interval edges use the intended lower bounds',()=>{
  assert.equal(ratingFor(8.5).rating,'AAA');assert.equal(ratingFor(8.4999).rating,'AA');assert.equal(ratingFor(.2).rating,'C');assert.equal(ratingFor(-1).rating,'D');
});
test('synthetic debt solves its rating, rate and coverage simultaneously across a debt sweep',()=>{
  for(let d=1;d<10000;d+=7){const r=solveDebt(d,250,.04);assert.ok(Number.isFinite(r.cost));assert.ok(Math.abs(r.interest-d*r.cost)<1e-8);if(r.consistent)assert.equal(ratingFor(r.coverage).rating,r.rating);}
  const debtFree=solveDebt(0,200,.04);assert.equal(debtFree.coverage,null);assert.equal(debtFree.interest,0);
});
test('FCFF accounts for tax, capex and working capital, with SBC left in EBIT',()=>{
  const a={...defaults(fixture),growth:.1,margin:.2,da:.03,capex:.05,nwc:.1,tax:.25};
  const row=forecast(fixture.base,a)[0];
  assert.ok(Math.abs(row.revenue-1100)<1e-9);assert.ok(Math.abs(row.fcff-(220*.75+33-55-10))<1e-9);
});
test('growth consumes reinvestment and g=0 has maintenance capex, not zero capex',()=>{
  const a=defaults(fixture),rows=forecast(fixture.base,a),v=dcf(rows,.1,.03,.12,fixture.base,a),zero=dcf(rows,.1,0,.12,fixture.base,a);
  assert.ok(Math.abs(v.terminalReinvestment/v.terminalNopat-.25)<1e-12);
  assert.equal(zero.terminalReinvestment,0);assert.equal(zero.terminalFCFF,zero.terminalNopat);
  assert.ok(Math.abs(zero.terminalValue-zero.terminalNopat/.1)<1e-8);
  assert.equal(dcf(rows,.03,.03,.12,fixture.base,a),null);assert.equal(dcf(rows,.1,.12,.12,fixture.base,a),null);
});
test('a level perpetuity reconciles explicit cash flows plus terminal value to NOPAT divided by WACC',()=>{
  const b={...fixture.base,nwc:0},a={...defaults(fixture),growth:0,mediumGrowth:0,margin:.2,tax:.25,capex:.03,da:.03,nwc:0,terminalGrowth:0,terminalROIC:.1,valuationLag:0};
  const rows=forecast(b,a),v=dcf(rows,.1,0,.1,b,a);
  assert.ok(rows.every(row=>Math.abs(row.fcff-150)<1e-10));
  assert.ok(Math.abs(v.ev-1500*1.1**.5)<1e-9,'mid-year flows: the infinite annuity of 150 at 10% is worth 1500 × 1.1^0.5');
  const later=dcf(rows,.1,0,.1,b,{...a,valuationLag:.25});
  assert.ok(Math.abs(later.ev-1500*1.1**.75)<1e-9,'a quarter elapsed since the filing brings every flow a quarter closer');
});
test('terminal ROIC equal to WACC cancels the reinvestment-adjusted growth premium for a fixed terminal NOPAT',()=>{
  const a=defaults(fixture),rows=forecast(fixture.base,a),v=dcf(rows,.1,.025,.1,fixture.base,a);
  assert.ok(Math.abs(v.terminalValue-v.terminalNopat/.1)<1e-9);
});
test('reverse DCF recovers a known growth assumption with debt, reserve, nonoperating assets and other claims',()=>{
  const base={...fixture.base,nonOperatingInvestments:20,valuationShares:53},a={...defaults(fixture),cashReserve:15,otherClaims:25},before=structuredClone(a),known=.12345;
  const target=dcf(forecast(base,{...a,growth:known,mediumGrowth:a.mediumGrowth+known-a.growth}),.1,a.terminalGrowth,a.terminalROIC,base,a).price;
  const solved=reverseDCF(base,a,.1,target);
  assert.equal(solved.status,'solved');assert.ok(Math.abs(solved.initialGrowth-known)<1e-7);assert.ok(Math.abs(solved.matchedPrice-target)<target*1e-8);
  assert.deepEqual(a,before,'a reverse solve cannot rewrite the active forecast assumptions');
  assert.equal(reverseDCF(base,a,.1,1e12).status,'unbracketed');assert.equal(reverseDCF(base,a,.01,target).status,'unavailable');
});
test('the assumption audit exposes a flat benchmark despite positive trailing growth and retains price-blind cash flows',()=>{
  const d=structuredClone(fixture);
  d.quarterly=Array.from({length:8},(_,i)=>({end:new Date(Date.UTC(2024+Math.floor(i/4),(i%4+1)*3,0)).toISOString().slice(0,10),revenue:100*(i<4?1:1.1),ebit:20*(i<4?1:1.1)}));
  d.base.end=d.quarterly.at(-1).end;d.base.revenue=440;d.base.ebit=88;
  const a=defaults(d),r=analyze(d,a),other=analyze({...d,quote:{...d.quote,price:100}},a);
  assert.equal(r.diagnostics.flatBenchmark,true);assert.ok(Math.abs(r.diagnostics.initialGrowth)<1e-10);assert.ok(Math.abs(r.diagnostics.reportedGrowth-.1)<1e-10);
  assert.equal(r.diagnostics.arithmetic.passed,true);assert.ok(r.diagnostics.recentGrowthScenario.price>r.valued.price);
  assert.deepEqual(r.rows,other.rows,'quote changes can alter financing weights and reverse diagnostics, never the operating forecast');
  d.quarterly.splice(3,1);assert.equal(analyze(d,a).diagnostics.reportedGrowth,null);
});
test('enterprise-to-equity bridge does not subtract target debt from existing holders twice',()=>{
  const a=defaults(fixture),r=analyze(fixture,a);
  assert.deepEqual(r.errors,[]);assert.ok(r.optimal.feasible);
  assert.ok(Math.abs(r.valued.equity-(r.valued.ev+80-150))<1e-8);
  assert.ok(Math.abs(r.optimized.equity-(r.optimized.ev+80-150))<1e-8);
  assert.equal(r.optimized.cost,Math.abs(r.optimal.debt-150)*a.recapCost);
});
test('every constrained optimum passes normal and h stressed coverage',()=>{
  for(const h of [1,1.5,2,2.5,3]){const a={...defaults(fixture),hScores:Array(7).fill(h)},r=analyze(fixture,a),o=r.optimal;assert.ok(o);if(o.debt>0){assert.ok(o.coverage>=a.minCoverage);assert.ok(o.stressedCoverage>=h);assert.ok(o.interest<=r.maxInterest);}}
});
test('missing inputs and unsupported loss situations block rather than become zero',()=>{
  const missing=structuredClone(fixture);missing.base.da=null;assert.ok(analyze(missing).errors.some(x=>x.includes('da')));
  const loss=structuredClone(fixture);loss.base.ebit=-20;assert.ok(analyze(loss).errors.some(x=>x.includes('turnaround')));
  const a=defaults(fixture);a.assetBeta=null;assert.ok(analyze(fixture,a).errors.length);
  a.assetBeta=1;a.hScores[3]=null;assert.ok(analyze(fixture,a).errors.length);
});
test('manual and stale quotes suppress a valuation signal',()=>{
  const a={...defaults(fixture),quoteOverride:10};assert.equal(analyze(fixture,a).status,'Review required');
  const old=structuredClone(fixture);old.quote.asOf='2020-01-01';assert.equal(analyze(old).status,'Review required');
});
test('cash reserve and other claims lower equity exactly once',()=>{
  const a=defaults(fixture),r=analyze(fixture,a),changed=analyze(fixture,{...a,cashReserve:30,otherClaims:20});
  assert.ok(Math.abs(r.valued.equity-changed.valued.equity-50)<1e-8);
});
test('post-recap shares reconcile debt proceeds, fees and the assumed execution price',()=>{
  const r=analyze(fixture),post=r.postRecap;
  assert.ok(post);assert.ok(Math.abs(post.sharesRetired*post.executionPrice-(r.optimal.debt-fixture.base.debt-r.recapCosts))<1e-8);
  assert.ok(Math.abs(post.equity-(r.optimized.ev+r.recapCosts+fixture.base.cash-r.optimal.debt))<1e-8);
  assert.ok(Math.abs(post.price*post.shares-post.equity)<1e-8);
});

function factsFixture(){
  const f={};
  const tags={RevenueFromContractWithCustomerExcludingAssessedTax:[800,900,1000],OperatingIncomeLoss:[160,180,200],DepreciationDepletionAndAmortization:[24,27,30],PaymentsToAcquirePropertyPlantAndEquipment:[40,45,50],NetCashProvidedByUsedInOperatingActivities:[150,170,190]};
  for(const [tag,values] of Object.entries(tags))f[tag]={units:{USD:values.map((val,i)=>({val,start:`${2023+i}-01-01`,end:`${2023+i}-12-31`,filed:`${2024+i}-02-15`,form:'10-K',accn:'0000000001-26-000001'}))}};
  for(const [tag,val] of Object.entries({CashAndCashEquivalentsAtCarryingValue:100,ShortTermInvestments:20,AssetsCurrent:400,LiabilitiesCurrent:200,LongTermDebtNoncurrent:150,LongTermDebtCurrent:20,ShortTermBorrowings:10}))f[tag]={units:{USD:[{val,end:'2025-12-31',filed:'2026-02-15',form:'10-K',accn:'0000000001-26-000001'}]}};
  f.CommonStockSharesOutstanding={units:{shares:[{val:50,end:'2025-12-31',filed:'2026-02-15',form:'10-K',accn:'0000000001-26-000001'}]}};
  return {cik:1,facts:{'us-gaap':f}};
}
test('annual selection excludes quarterly duplicates and future filings',()=>{
  const raw=factsFixture(),facts=raw.facts['us-gaap'];
  facts.OperatingIncomeLoss.units.USD.push({val:999,start:'2025-10-01',end:'2025-12-31',filed:'2026-03-01',form:'10-Q',accn:'x'});
  facts.OperatingIncomeLoss.units.USD.push({val:888,start:'2025-01-01',end:'2025-12-31',filed:'2030-01-01',form:'10-K',accn:'x'});
  assert.equal(pickFact(facts,['OperatingIncomeLoss'],{end:'2025-12-31',annual:true,cik:1,asOf:'2026-10-21'}).value,.0002);
  const r=financials(raw,{},'2026-10-21');assert.equal(r.history.length,3);assert.ok(Math.abs(r.base.debt-.00018)<1e-12);assert.ok(Math.abs(r.base.nwc-.00011)<1e-12);
});
test('TTM sums annual plus YTD less comparable YTD, aligned by period not fiscal metadata',()=>{
  const raw=factsFixture(),facts=raw.facts['us-gaap'];
  for(const tag of ['RevenueFromContractWithCustomerExcludingAssessedTax','OperatingIncomeLoss','DepreciationDepletionAndAmortization','PaymentsToAcquirePropertyPlantAndEquipment','NetCashProvidedByUsedInOperatingActivities']){
    facts[tag].units.USD.push({val:600,start:'2026-01-01',end:'2026-06-30',filed:'2026-08-01',form:'10-Q',accn:'current'});
    facts[tag].units.USD.push({val:500,start:'2025-01-01',end:'2025-06-30',filed:'2026-08-01',form:'10-Q',accn:'current'});
  }
  const r=financials(raw,{},'2026-10-21');assert.ok(Math.abs(r.base.revenue-.0011)<1e-12);assert.equal(r.base.end,'2026-06-30');assert.equal(r.base.provenance.revenue.length,3);
  assert.equal(r.base.longDebt,null); // annual balance never silently fills a quarterly instant
});
test('a borrowing line absent from the balance-sheet filing is a labeled zero; a blocked inference leaves the bridge unresolved',()=>{
  const raw=factsFixture();delete raw.facts['us-gaap'].ShortTermBorrowings;
  const r=financials(raw,{},'2026-10-21');
  assert.equal(r.base.shortDebt,0);assert.ok(Math.abs(r.base.debt-.00017)<1e-12);assert.match(r.base.provenance.shortDebt[0].tag,/^NotPresented:/);
  assert.ok(r.quality.some(q=>q.code==='absence-zero'&&q.severity==='review'));
  const blocked=financials(raw,{},'2026-10-21',{noAbsence:['shortDebt']});
  assert.equal(blocked.base.shortDebt,null);assert.equal(blocked.base.debt,null);assert.ok(blocked.quality.some(q=>q.severity==='critical'&&q.code==='missing-shortDebt'));
  const presentedElsewhere=factsFixture();Object.assign(presentedElsewhere.facts['us-gaap'].ShortTermBorrowings.units.USD[0],{accn:'another-filing',end:'2024-12-31'});
  assert.equal(financials(presentedElsewhere,{},'2026-10-21').base.shortDebt,0,'a concept used only by another filing is not presented on this balance sheet');
});
test('issuers without an operating-income subtotal get EBIT from pre-tax income plus net interest, labeled',()=>{
  const build=(withIncome,shiftInterest)=>{
    const raw=factsFixture(),f=raw.facts['us-gaap'],ebit=f.OperatingIncomeLoss;delete f.OperatingIncomeLoss;
    const flow=values=>({units:{USD:values.map((val,i)=>({...ebit.units.USD[i],val}))}});
    f.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest=flow([150,170,190]);
    f.InterestExpense=flow([12,14,16]);if(withIncome)f.InvestmentIncomeInterest=flow([2,4,6]);
    if(shiftInterest)f.InterestExpense.units.USD[2].start='2025-02-01';
    return raw;
  };
  const r=financials(build(true,false),{},'2026-10-21');
  assert.deepEqual(r.history.map(h=>Math.round(h.ebit*1e6)),[160,180,200]);
  assert.equal(r.base.provenance.ebit[0].tag,'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest');
  assert.ok(r.quality.some(q=>q.code==='ebit-derived'));
  assert.equal(financials(build(false,true),{},'2026-10-21').history.at(-1).ebit,null,'an interest line presented in the filing for another period cannot be assumed zero');
});
test('depreciation alone is total D&A only when the filing presents no amortization line',()=>{
  const build=amortization=>{
    const raw=factsFixture(),f=raw.facts['us-gaap'];f.Depreciation=f.DepreciationDepletionAndAmortization;delete f.DepreciationDepletionAndAmortization;
    if(amortization)f.AmortizationOfIntangibleAssets={units:{USD:[{val:1,start:'2024-01-01',end:'2024-12-31',filed:'2026-02-15',form:'10-K',accn:'0000000001-26-000001'}]}};
    return raw;
  };
  assert.ok(Math.abs(financials(build(false),{},'2026-10-21').base.da-.00003)<1e-12);
  assert.equal(financials(build(true),{},'2026-10-21').base.da,null,'an amortization line presented for another period means D&A is incomplete');
});
test('a cover-page share count from another era is not used; latest-quarter weighted shares are',()=>{
  const raw=factsFixture(),f=raw.facts['us-gaap'];delete f.CommonStockSharesOutstanding;
  raw.facts.dei={EntityCommonStockSharesOutstanding:{units:{shares:[{val:20,end:'2009-12-31',filed:'2010-02-23',form:'10-K',accn:'old'}]}}};
  f.WeightedAverageNumberOfSharesOutstandingBasic={units:{shares:[{val:37,start:'2025-10-01',end:'2025-12-31',filed:'2026-02-15',form:'10-K',accn:'0000000001-26-000001'}]}};
  const r=financials(raw,{},'2026-10-21');
  assert.ok(Math.abs(r.base.shares-.000037)<1e-12);assert.ok(r.quality.some(q=>q.code==='shares-weighted'));
  raw.facts.dei.EntityCommonStockSharesOutstanding.units.shares.push({val:40,end:'2026-02-01',filed:'2026-02-15',form:'10-K',accn:'0000000001-26-000001'});
  assert.ok(Math.abs(financials(raw,{},'2026-10-21').base.shares-.00004)<1e-12,'a cover-page count dated after the period end is the preferred fallback');
});
test('peer medians exclude broken share counts and distressed leverage, and need three peers',()=>{
  const peers=[{symbol:'A',beta:{beta:1},debt:100,equity:1000},{symbol:'B',beta:{beta:1.2},debt:100,equity:1000},{symbol:'C',beta:{beta:.8},debt:6606,equity:.0001},{symbol:'D',beta:{beta:.7},debt:94000,equity:15000}];
  assert.equal(peerAssetBeta(peers,null,.25).beta,null,'only two credible peers');
  assert.equal(peerAssetBeta([...peers,{symbol:'E',beta:{beta:1.1},debt:0,equity:2000}],null,.25).n,3);
});
test('a 17-week fourth quarter in a 53-week year is differenced, not dropped',()=>{
  const raw={cik:1,facts:{'us-gaap':{Revenues:{units:{USD:[
    {val:300,start:'2022-08-29',end:'2023-05-07',filed:'2023-06-01',form:'10-Q',accn:'q3'},
    {val:520,start:'2022-08-29',end:'2023-09-03',filed:'2023-10-10',form:'10-K',accn:'k'}]}}}}};
  const q=quarterlyFinancials(raw,'2026-10-21');
  assert.equal(q.length,1);assert.equal(q[0].end,'2023-09-03');assert.ok(Math.abs(q[0].revenue-.00022)<1e-12);
});
test('return normalization drops partial months and never uses unadjusted closes',()=>{
  const timestamps=['2026-01-01','2026-02-01','2026-03-01','2026-04-01'].map(s=>Date.parse(s)/1000);
  const chart={chart:{result:[{timestamp:timestamps,indicators:{adjclose:[{adjclose:[100,110,121,200]}],quote:[{close:[200,300,400,500]}]}}]}};
  const r=monthlyReturns(chart,new Date('2026-04-20'));assert.equal(r.size,2);assert.ok(Math.abs(r.get('2026-03')-.1)<1e-12);
  delete chart.chart.result[0].indicators.adjclose;assert.equal(monthlyReturns(chart).size,0);
});
test('h evidence is bounded and missing evidence is visibly provisional',()=>{
  const empty=filingEvidence('','https://example.com');assert.equal(empty.length,7);assert.ok(empty.every(x=>x.evidence===null&&x.score===2));
  const text='Item 1A. Risk Factors '+'Our specialized suppliers can cease providing single-source components during a material disruption. '.repeat(10)+'Item 1B. Other';
  const values=filingEvidence(text,'https://example.com');assert.ok(values[2].evidence);assert.ok(values.reduce((n,v)=>n+(v.evidence?.split(/\s+/).length||0),0)<=21);
});
test('API rejects unsupported methods and invalid tickers before network access',async()=>{
  const r=await worker.fetch(new Request('https://example.com/api/company',{method:'POST'}),{},{});assert.equal(r.status,405);
  const bad=await worker.fetch(new Request('https://example.com/api/company?symbol=%3Cscript%3E'),{},{});assert.equal(bad.status,422);
});

test('SEC document paths use the issuer CIK even when a filing agent submits the accession',()=>{
  assert.equal(filingUrl(789019,'0001193125-26-323660','msft-20260630.htm'),'https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm');
});
