// Point-in-time return backtest of the valuation signal.
//
// At each origin, every archived non-financial issuer is valued with only the SEC facts filed
// by that date, that month's price (split-consistent with the filed share count), a 60-month
// beta ending at the origin, and the published risk-free rate and implied ERP for that date.
// The signal log(value / price) is compared with the forward total return in excess of SPY.
// Rank IC = Spearman correlation across issuers. No peers or LLM research are used, so this
// measures the statistical default case only.
//
// Usage: node scripts/backtest-returns.mjs [secArchive] [priceCache] [output]
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {financials} from '../src/accounting.js';
import {analyze,defaults,betaRegression,MODEL_VERSION} from '../public/model.js';

const [SEC='/private/tmp/valuelens-validation-v02',PRICES='/private/tmp/valuelens-prices',OUT='public/validation/returns.json']=process.argv.slice(2);
// Published US 10-year Treasury and implied ERP at each year start (Damodaran annual updates).
const ORIGINS=[{date:'2020-12-31',rf:.0093,erp:.0472},{date:'2021-12-31',rf:.0151,erp:.0424},{date:'2022-12-31',rf:.0388,erp:.0594},{date:'2023-12-31',rf:.0388,erp:.0460},{date:'2024-12-31',rf:.0458,erp:.0433}];
const HORIZON=36;
const month=ts=>new Date(ts*1000).toISOString().slice(0,7);
const addMonths=(m,k)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+k,1)).toISOString().slice(0,7);};
const spearman=(x,y)=>{const rank=a=>{const r=Array(a.length);a.map((v,i)=>[v,i]).sort((p,q)=>p[0]-q[0]).forEach(([,i],k)=>r[i]=k);return r;};
  const a=rank(x),b=rank(y),m=(x.length-1)/2;let c=0,va=0,vb=0;for(let i=0;i<x.length;i++){c+=(a[i]-m)*(b[i]-m);va+=(a[i]-m)**2;vb+=(b[i]-m)**2;}return c/Math.sqrt(va*vb);};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)/2)];};

mkdirSync(PRICES,{recursive:true});
async function prices(ticker) {
  const path=`${PRICES}/${ticker}.json`;
  if(!existsSync(path)) {
    const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.replace('.','-'))}?range=10y&interval=1mo&events=split|div`,{headers:{'User-Agent':'Mozilla/5.0'}});
    if(!r.ok)return null;writeFileSync(path,await r.text());await new Promise(s=>setTimeout(s,700));
  }
  const r=JSON.parse(readFileSync(path,'utf8')).chart?.result?.[0];if(!r?.timestamp)return null;
  const bars=new Map();
  r.timestamp.forEach((ts,i)=>{const close=r.indicators.quote[0].close[i],adj=r.indicators.adjclose?.[0]?.adjclose?.[i];if(close>0&&adj>0)bars.set(month(ts),{close,adj});});
  return {bars,splits:Object.values(r.events?.splits||{}).map(s=>({date:new Date(s.date*1000).toISOString().slice(0,10),ratio:s.numerator/s.denominator}))};
}

const issuers=readdirSync(SEC).filter(f=>/-submissions\.json$/.test(f)).map(f=>{const s=JSON.parse(readFileSync(`${SEC}/${f}`,'utf8'));return {cik:f.split('-')[0],ticker:s.tickers?.[0],sic:Number(s.sic)};})
  .filter(x=>x.ticker&&!(x.sic>=6000&&x.sic<6800));
const spy=await prices('SPY'),series=new Map();
for(const is of issuers)series.set(is.ticker,await prices(is.ticker));
const last=[...spy.bars.keys()].sort().at(-2); // last complete month
const origins=[];
for(const o of ORIGINS) {
  const om=o.date.slice(0,7),end=[addMonths(om,HORIZON),last].sort()[0],obs=[];let eligible=0;
  for(const is of issuers) {
    const px=series.get(is.ticker);if(!px?.bars.has(om)||!px.bars.has(end))continue;
    eligible++;
    let ex;try{ex=financials(JSON.parse(readFileSync(`${SEC}/${is.cik}.json`,'utf8')),{},o.date);}catch{continue;}
    const price=px.bars.get(om).close*px.splits.filter(s=>s.date>o.date).reduce((f,s)=>f*s.ratio,1);
    const rs=[],rm=[];
    for(let k=-59;k<=0;k++){const a=px.bars.get(addMonths(om,k-1)),b=px.bars.get(addMonths(om,k)),c=spy.bars.get(addMonths(om,k-1)),d=spy.bars.get(addMonths(om,k));if(a&&b&&c&&d){rs.push(b.adj/a.adj-1);rm.push(d.adj/c.adj-1);}}
    const data={...ex,symbol:is.ticker,peers:[],beta:betaRegression(rs,rm),quote:{price,asOf:o.date+'T21:00:00Z'},rates:{rf:o.rf,erp:o.erp,notes:[]},
      hFactors:Array.from({length:7},()=>({score:2})),research:{status:'not_started'},modelFamily:'fcff'};
    let r;try{r=analyze(data,{...defaults(data),hReviewed:true});}catch{continue;}
    if(r.errors?.length||!(r.valued?.price>0))continue;
    obs.push({symbol:is.ticker,signal:Math.log(r.valued.price/price),prob:r.range?.probAbovePrice??null,inRange:r.range?r.range.position==='within':null,excess:Math.log(px.bars.get(end).adj/px.bars.get(om).adj)-Math.log(spy.bars.get(end).adj/spy.bars.get(om).adj)});
  }
  const sorted=[...obs].sort((a,b)=>a.signal-b.signal),q=Math.floor(obs.length/5),mean=a=>a.reduce((s,x)=>s+x.excess,0)/a.length;
  const cheap=obs.filter(x=>x.signal>0),dear=obs.filter(x=>x.signal<=0);
  origins.push({origin:o.date,end,rf:o.rf,erp:o.erp,eligible,valued:obs.length,medianValueToPrice:Math.exp(median(obs.map(x=>x.signal)))-1,
    rankIC:spearman(obs.map(x=>x.signal),obs.map(x=>x.excess)),
    rankICProbability:(o=>o.length>9?spearman(o.map(x=>x.prob),o.map(x=>x.excess)):null)(obs.filter(x=>x.prob!==null)),
    priceWithinRange:(o=>o.length?o.filter(x=>x.inRange).length/o.length:null)(obs.filter(x=>x.inRange!==null)),quintileSpread:mean(sorted.slice(-q))-mean(sorted.slice(0,q)),
    undervaluedBeatRate:cheap.filter(x=>x.excess>0).length/cheap.length,overvaluedBeatRate:dear.filter(x=>x.excess>0).length/dear.length,nUndervalued:cheap.length,nOvervalued:dear.length});
}
const ics=origins.map(o=>o.rankIC);
const report={generatedAt:new Date().toISOString(),modelVersion:MODEL_VERSION,horizonMonths:HORIZON,issuers:issuers.length,origins,
  meanRankIC:ics.reduce((s,x)=>s+x,0)/ics.length,
  conclusion:'No demonstrated predictive power: the valuation signal did not rank forward excess returns across five origins. With about 100 issuers per origin a rank IC has a standard error near 0.1, so a small edge cannot be ruled in or out.',
  limitations:['Statistical default case only: no peers, no LLM research.','Archive issuers are current large companies (survivorship).','Overlapping three-year windows; the last two origins have shorter horizons.','Year-start Treasury and ERP inputs; unofficial Yahoo adjusted prices.']};
writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
for(const o of origins)console.log(`${o.origin}→${o.end}: valued ${o.valued}/${o.eligible} | median value/price ${(o.medianValueToPrice*100).toFixed(0)}% | rank IC ${o.rankIC.toFixed(3)} | IC of P(value ≥ price) ${o.rankICProbability?.toFixed(3)} | price within 80% range ${(o.priceWithinRange*100).toFixed(0)}% | quintile spread ${(o.quintileSpread*100).toFixed(1)}pp`);
console.log(`mean rank IC ${report.meanRankIC.toFixed(3)} → ${OUT}`);
