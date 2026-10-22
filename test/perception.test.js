import test from 'node:test';
import assert from 'node:assert/strict';
import {forecast,dcf,defaults,researchCapital,consensusGrowthPath,impliedGrowth,rdLife,longRunMargin,shareChange,capexSurge} from '../public/model.js';
import {parseConsensus} from '../src/consensus.js';

const day=new Date().toISOString().slice(0,10);
const fixture={
  sic:3571,base:{end:day,revenue:1000,ebit:200,da:30,capex:50,nwc:100,cash:80,debt:150,shares:50,rd:100,assets:900,currentLiabilities:200,currentFinancing:20},
  history:[2021,2022,2023,2024,2025].map((y,i)=>({end:`${y}-12-31`,revenue:800+i*40,ebit:160+i*8,da:24+i*2,capex:40+i*3,rd:100})),
  peers:[],beta:{beta:1.1},quote:{price:25,asOf:new Date().toISOString()},rates:{rf:.045,erp:.05},hFactors:Array.from({length:7},()=>({score:2})),quality:[]
};

test('research capital: constant R&D of 100 over a five-year life is a 300 asset with 100 amortization',()=>{
  const r=researchCapital(fixture);
  assert.equal(r.life,5);assert.ok(Math.abs(r.asset-300)<1e-9);assert.ok(Math.abs(r.amortization-100)<1e-9);assert.ok(Math.abs(r.net)<1e-9);
  assert.equal(researchCapital({...fixture,base:{...fixture.base,rd:null}}),null);
  assert.equal(rdLife(2834),10);assert.equal(rdLife(7372),3);assert.equal(rdLife(3674),5);
});
test('capitalizing R&D leaves explicit-year FCFF unchanged and keeps the FCFF identity',()=>{
  const a=defaults(fixture),on=forecast(fixture.base,a),off=forecast(fixture.base,{...a,rdCapitalize:false});
  assert.ok(a.rdCapitalize);
  for(const y of [0,1,2,3])assert.ok(Math.abs(on[y].fcff-off[y].fcff)<1e-9,'years before the stable-state fade');
  for(const row of on){assert.ok(Math.abs(row.fcff-(row.nopat-row.reinvestment))<1e-9);assert.ok(Math.abs(row.nopat-(row.nopatReported+row.netRD))<1e-9);}
  const last=on.at(-1);assert.ok(Math.abs(last.reinvestment/last.nopat-a.terminalGrowth/a.terminalROIC)<1e-12,'stable state on the adjusted basis');
});
test('an explicit five-year growth path overrides growth only',()=>{
  const a=defaults(fixture),path=[.2,.15,.1,.08,.06],rows=forecast(fixture.base,{...a,growthPath:path});
  assert.deepEqual(rows.slice(0,5).map(r=>+r.growth.toFixed(12)),path);
  assert.ok(Math.abs(rows[9].growth-a.terminalGrowth)<1e-12);
  assert.deepEqual(rows.map(r=>r.margin),forecast(fixture.base,a).map(r=>r.margin));
});
test('consensus fiscal years map to forecast years by time weighting, then converge to the anchor',()=>{
  const base={end:'2026-06-30',revenue:100};
  const c={years:[{period:'0y',end:'2026-12-31',revenue:110,growth:.1,analysts:30},{period:'+1y',end:'2027-12-31',revenue:121,growth:.1,analysts:28}]};
  const p=consensusGrowthPath(c,base,.05);
  // Year 1 ≈ half of fiscal 2026 + half of fiscal 2027; year 2 ≈ half of 2027 + half of 2028 (at 10%).
  assert.ok(Math.abs(p.path[0]-(110*.5+121*.5)/100+1)<.01);
  assert.ok(Math.abs(p.path[1]-.10)<.01);
  assert.ok(Math.abs(p.path[4]-.05)<1e-12);assert.equal(p.analysts,28);
  assert.equal(consensusGrowthPath({years:[{end:'2026-12-31',revenue:400},{end:'2027-12-31',revenue:440}]},base),null,'scale mismatch rejected');
  assert.equal(consensusGrowthPath({years:[{end:'2025-12-31',revenue:110},{end:'2026-12-31',revenue:121}]},base),null,'a first fiscal year ending before the base date is rejected');
});
test('implied growth recovers the constant growth that produced a price',()=>{
  const a={...defaults(fixture),valuationLag:0},known=.12;
  const target=dcf(forecast(fixture.base,{...a,growthPath:Array(5).fill(known)}),.09,a.terminalGrowth,a.terminalROIC,fixture.base,a).price;
  const s=impliedGrowth(fixture.base,a,.09,target);
  assert.equal(s.status,'solved');assert.ok(Math.abs(s.growth-known)<1e-6);
  assert.notEqual(impliedGrowth(fixture.base,a,.09,1e9).status,'solved');
});
test('consensus parsing keeps two fiscal years with revenue, growth and analyst counts',()=>{
  const v=(x)=>({raw:x});
  const body={quoteSummary:{result:[{earningsTrend:{trend:[
    {period:'0q',endDate:'2026-09-30',revenueEstimate:{avg:v(1e11),growth:v(.1),numberOfAnalysts:v(25)}},
    {period:'0y',endDate:'2026-09-30',revenueEstimate:{avg:v(4.776e11),low:v(4.7e11),high:v(4.9e11),growth:v(.1477),numberOfAnalysts:v(38)}},
    {period:'+1y',endDate:'2027-09-30',revenueEstimate:{avg:v(5.273e11),growth:v(.1039),numberOfAnalysts:v(40)}}]}}]}};
  const c=parseConsensus(body,'AAPL','2026-10-22T00:00:00Z');
  assert.equal(c.years.length,2);assert.equal(c.years[0].revenue,477600);assert.equal(c.years[1].analysts,40);
  assert.equal(parseConsensus({quoteSummary:{result:[{earningsTrend:{trend:[]}}]}},'X','t'),null);
});

test('long-run margin is the midpoint of TTM and five-year median margins; one weak quarter does not persist',()=>{
  const hist=[.30,.32,.31,.33,.34].map((m,i)=>({end:`${2021+i}-12-31`,revenue:100,ebit:100*m}));
  assert.ok(Math.abs(longRunMargin({ebit:20,revenue:100},hist)-(.2+.32)/2)<1e-12);
  assert.equal(longRunMargin({ebit:20,revenue:100},hist.slice(0,2)),.2,'too little history keeps TTM');
  const a={...defaults(fixture),operatingForecast:{...defaults(fixture).operatingForecast,nearMargin:.1},margin:.3},rows=forecast(fixture.base,a);
  assert.equal(rows[0].margin,.1);assert.ok(rows.slice(1).every(r=>r.margin===.3),'measured margin in year 1 only');
});
test('consensus EPS growth implies margins net of buybacks, bounded and then held',()=>{
  const base={end:'2026-06-30',revenue:100};
  const c={years:[{end:'2026-12-31',revenue:110,growth:.10,epsGrowth:.20,analysts:30},{end:'2027-12-31',revenue:121,growth:.10,epsGrowth:.10,analysts:28}]};
  const p=consensusGrowthPath(c,base,.05,{baselineMargin:.2,shares:-.02});
  const m0=.2*(1.2*.98)/1.1,m1=m0*(1.1*.98)/1.1;
  assert.ok(Math.abs(p.marginPath[1]-m1)<1e-12,'year 2 sits wholly in fiscal years at the year-2 consensus margin');
  assert.ok(p.marginPath[0]<=Math.max(m0,m1)&&p.marginPath[0]>=Math.min(m0,m1),'year 1 blends the two fiscal years');assert.equal(p.marginPath[4],p.marginPath[1]);
  const wild=consensusGrowthPath({years:[{...c.years[0],epsGrowth:5},c.years[1]]},base,.05,{baselineMargin:.2});
  assert.ok(Math.max(...wild.marginPath)<=.32+1e-12,'bounded at 1.6× the measured margin');
  assert.equal(consensusGrowthPath({years:c.years.map(({epsGrowth,...y})=>y)},base,.05,{baselineMargin:.2}).marginPath,null);
  assert.ok(Math.abs(shareChange([{dilutedShares:110},{dilutedShares:105},{dilutedShares:100}])-((100/110)**.5-1))<1e-12);
});

test('a capex surge of 2× or more fades from 80% retained in year 1 to the five-year median by year 5',()=>{
  const hist=[.05,.10,.17,.13,.37,.8].map((r,i)=>({end:`${2021+i}-05-31`,revenue:100,capex:100*r}));
  const s=capexSurge(hist,.826);
  assert.ok(Math.abs(s.normal-.13)<1e-12);assert.ok(s.multiple>6);
  assert.ok(Math.abs(s.path[0]-(.13+.8*(.826-.13)))<1e-12);assert.ok(Math.abs(s.path[4]-.13)<1e-12);
  assert.equal(capexSurge(hist,.2),null,'below 2× the latest ratio is kept');
  const a={...defaults(fixture),capexPath:s.path},rows=forecast(fixture.base,a);
  assert.ok(Math.abs(rows[0].rawCapex-rows[0].revenue*s.path[0])<1e-9);assert.ok(Math.abs(rows[4].rawCapex-rows[4].revenue*s.normal)<1e-9);
});
test('search folds punctuation, falls back to words, and explains private companies',async()=>{
  const {matchCompanies,privateCompanyHint}=await import('../src/data.js');
  const catalog=[{ticker:'ADBE',title:'ADOBE INC.',cik_str:1},{ticker:'KO',title:'COCA COLA CO',cik_str:2},{ticker:'COKE',title:'Coca-Cola Consolidated, Inc.',cik_str:3},{ticker:'ORCL',title:'ORACLE CORP',cik_str:4}];
  assert.deepEqual(matchCompanies(catalog,'Adobe Systems').map(c=>c.symbol),['ADBE']);
  assert.ok(matchCompanies(catalog,'coca-cola').some(c=>c.symbol==='KO'));
  assert.deepEqual(matchCompanies(catalog,'orcl').map(c=>c.symbol),['ORCL']);
  assert.deepEqual(matchCompanies(catalog,'OpenAI'),[]);
  assert.match(privateCompanyHint('OpenAI'),/privately held/);assert.match(privateCompanyHint('space x'),/SpaceX/);
  assert.equal(privateCompanyHint('Oracle'),null);
});
