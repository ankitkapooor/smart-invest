// Market calibration of the two unobservable market-level inputs.
//
// The equity risk premium is not observable. A published implied ERP is backed out of an
// index under its author's cash-flow conventions (analyst growth, then perpetual growth equal
// to the risk-free rate). ValueLens forecasts company cash flows differently, so pairing a
// published ERP with ValueLens cash flows misprices the median company. This script backs out
// the ERP under ValueLens's own conventions: the premium at which the median company in a broad
// large-cap universe is valued at its market price. Terminal growth is chosen by which candidate
// best explains the cross-section of prices out of sample (calibrate on one half, test on the
// other, both directions). Price-relative by construction: a verdict means cheap or expensive
// relative to how the market currently prices risk, not an absolute market call.
//
// DIAGNOSTIC ONLY — not used by the app. On October 22, 2026 (39 companies) the fitted ERP
// was 1.2% (halves: 0.6% / 2.0%) with ±47% out-of-sample dispersion: neither credible nor
// stable, so the published implied ERP is retained. See docs/VALIDATION.md.
//
// Usage: node scripts/calibrate-market.mjs <snapshot-dir> [output.json]
// Snapshots are /api/company responses (with peers merged as the app does).
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {analyze,defaults,MODEL_VERSION} from '../public/model.js';

const [dir,out='reports/market-calibration.json']=process.argv.slice(2);
if(!dir)throw new Error('Usage: node scripts/calibrate-market.mjs <snapshot-dir> [output.json]');
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2:NaN;};
const universe=readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>JSON.parse(readFileSync(`${dir}/${f}`,'utf8'))).filter(d=>d.base&&d.quote?.price>0);

function gaps(set,erp,terminalGrowth) {
  const out=[];
  for(const d of set) {
    const data={...d,rates:{...d.rates,erp,terminalGrowth}};
    const r=analyze(data,{...defaults(data),hReviewed:true});
    if(!r.errors?.length&&r.valued?.price>0)out.push(Math.log(r.valued.price/r.marketPrice));
  }
  return out;
}
// Median log(value/price) falls as the ERP rises; bisect to zero.
function solveErp(set,g) {
  let lo=.002,hi=.12;
  for(let i=0;i<40;i++){const m=(lo+hi)/2;if(median(gaps(set,m,g))>0)lo=m;else hi=m;}
  return (lo+hi)/2;
}
const usable=universe.filter(d=>gaps([d],.04,.025).length);
if(usable.length<30)throw new Error(`Only ${usable.length} valuable companies; at least 30 are required.`);
const A=usable.filter((_,i)=>i%2===0),B=usable.filter((_,i)=>i%2===1);
const candidates=[.02,.025,.03,.035,.04,.045].filter(g=>usable.every(d=>g<d.rates.rf));
const results=candidates.map(g=>{
  const erpA=solveErp(A,g),erpB=solveErp(B,g),testB=gaps(B,erpA,g),testA=gaps(A,erpB,g);
  return {terminalGrowth:g,erpFitOnA:erpA,erpFitOnB:erpB,
    outOfSampleBias:(median(testB)+median(testA))/2,
    outOfSampleMedianAbsLogGap:(median(testB.map(Math.abs))+median(testA.map(Math.abs)))/2};
});
const best=results.reduce((b,r)=>!b||r.outOfSampleMedianAbsLogGap<b.outOfSampleMedianAbsLogGap?r:b,null);
const erp=solveErp(usable,best.terminalGrowth),final=gaps(usable,erp,best.terminalGrowth);
const asOf=usable.map(d=>d.quote.asOf).sort().at(-1).slice(0,10);
const result={
  asOf,modelVersion:MODEL_VERSION,n:usable.length,symbols:usable.map(d=>d.symbol),
  rf:median(usable.map(d=>d.rates.rf)),referenceErp:median(usable.map(d=>d.rates.erp)),
  erp,terminalGrowth:best.terminalGrowth,
  fit:{medianLogGap:median(final),medianAbsLogGap:median(final.map(Math.abs)),
    within25:final.filter(x=>Math.abs(x)<Math.log(1.25)).length/final.length,within50:final.filter(x=>Math.abs(x)<Math.log(1.5)).length/final.length},
  candidates:results,
  method:'ERP solved so the median company is valued at its price under ValueLens cash-flow conventions; terminal growth chosen by out-of-sample cross-sectional fit (alternating halves).'
};
writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(`n=${result.n} terminal g ${(best.terminalGrowth*100).toFixed(1)}% ERP ${(erp*100).toFixed(2)}% (published reference ${(result.referenceErp*100).toFixed(2)}%)`);
for(const r of results)console.log(`  g ${(r.terminalGrowth*100).toFixed(1)}%: ERP A ${(r.erpFitOnA*100).toFixed(2)}% / B ${(r.erpFitOnB*100).toFixed(2)}% | out-of-sample bias ${(r.outOfSampleBias*100).toFixed(1)}% | median |log gap| ${(r.outOfSampleMedianAbsLogGap*100).toFixed(1)}%`);
