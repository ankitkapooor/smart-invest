// Measured forecast-error distributions for the valuation ranges.
//
// On the SEC archive, every non-financial issuer-year with enough history is used as an
// origin. For each, the model's own rules predict (1) five-year cumulative revenue growth
// (25% own five-year CAGR + 75% × 5%) and (2) the long-run operating margin (midpoint of the
// normalized latest margin and the five-year median), and the realized outcome is recorded.
// The empirical error quantiles become the scenario distributions. Calibration is checked
// out of sample: quantiles from origins up to 2015 must cover 80% of outcomes from 2016 on.
//
// Usage: node scripts/calibrate-uncertainty.mjs [secArchive]
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {TAGS,UNUSUAL} from '../src/accounting.js';

const DIR=process.argv[2]||'/private/tmp/valuelens-validation-v02';
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor((s.length-1)/2)];};
const quantile=(a,p)=>{const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,lo=Math.floor(i);return s[lo]+(s[Math.min(lo+1,s.length-1)]-s[lo])*(i-lo);};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dur=f=>(Date.parse(f.end)-Date.parse(f.start))/864e5;
function annual(facts,tags) {
  const by=new Map();
  for(const t of tags)for(const f of facts[t]?.units?.USD||[]) {
    if(!/^10-K/.test(f.form)||!Number.isFinite(f.val)||!(f.start&&dur(f)>=330&&dur(f)<=380))continue;
    const k=f.end.slice(0,7),p=by.get(k);
    if(!p||(p.t===t&&f.filed>p.filed)||tags.indexOf(t)<tags.indexOf(p.t))by.set(k,{v:f.val/1e6,t,filed:f.filed});
  }
  return by;
}
const issuers=[];
for(const f of readdirSync(DIR).filter(f=>/^\d+\.json$/.test(f))) {
  const cik=f.slice(0,-5),sub=existsSync(`${DIR}/${cik}-submissions.json`)?JSON.parse(readFileSync(`${DIR}/${cik}-submissions.json`,'utf8')):{};
  if(Number(sub.sic)>=6000&&Number(sub.sic)<6800)continue;
  const g=JSON.parse(readFileSync(`${DIR}/${f}`,'utf8')).facts?.['us-gaap'];if(!g)continue;
  const rev=annual(g,TAGS.revenue),ebit=annual(g,['OperatingIncomeLoss']);
  const groups=Object.fromEntries(Object.entries(UNUSUAL).map(([k,tags])=>[k,tags.map(t=>annual(g,[t]))]));
  const charge=k=>{const mx=list=>Math.max(0,...list.map(m=>m.get(k)?.v??0));return Math.max(mx(groups.impairment)+mx(groups.restructuring),mx(groups.combined))+mx(groups.litigation);};
  const rows=[...rev.keys()].sort().map(k=>({year:Number(k.slice(0,4)),rev:rev.get(k).v,ebit:ebit.get(k)?.v??null,unusual:charge(k)}))
    .filter((x,i,a)=>!i||x.year-a[i-1].year===1);
  issuers.push(rows);
}
// Scaling by each issuer's own volatility was tested. Margins: errors scaled by
// √(issuer five-year margin s.d. × median issuer s.d.) stay calibrated (78.7% held-out 80%
// coverage) and keep stable businesses tighter, so the model uses them. Revenue: the same
// scaling under-covered (73.5%), so revenue ranges use the unscaled errors (80.8%).
const sd=a=>{const m=a.reduce((s,x)=>s+x,0)/a.length;return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
export const GROWTH_VOL_FLOOR=.03,MARGIN_VOL_FLOOR=.005;
const growth=[],margin=[];
for(const r of issuers) {
  for(let i=5;i<r.length;i++) {
    if(i+5<r.length&&r.slice(i-5,i+6).every(x=>x.rev>0)) {
      const c5=clamp((r[i].rev/r[i-5].rev)**(1/5)-1,-.25,.6),g=.25*c5+.75*.05;
      const vol=Math.max(GROWTH_VOL_FLOOR,sd([1,2,3,4,5].map(k=>Math.log(r[i-5+k].rev/r[i-5+k-1].rev)))),error=5*Math.log(1+g)-Math.log(r[i+5].rev/r[i].rev);
      growth.push({year:r[i].year,error,vol});
    }
    if(i+5<r.length&&r.slice(i-4,i+6).every(x=>x.rev>0&&x.ebit!==null&&Math.abs(x.ebit/x.rev)<1)) {
      const avg=r.slice(i-4,i+1).reduce((s,x)=>s+x.unusual/x.rev,0)/5,spike=r[i].unusual/r[i].rev-avg>.02;
      const m=x=>spike?(x.ebit+x.unusual-avg*x.rev)/x.rev:x.ebit/x.rev;
      const pred=(m(r[i])+median(r.slice(i-4,i+1).map(m)))/2;
      const fut=r.slice(i+2,i+6),actual=fut.reduce((s,x)=>s+x.ebit,0)/fut.reduce((s,x)=>s+x.rev,0);
      const vol=Math.max(MARGIN_VOL_FLOOR,sd(r.slice(i-4,i+1).map(x=>x.ebit/x.rev)));
      margin.push({year:r[i].year,pred,actual,abs:actual-pred,rel:pred>.03?actual/pred-1:null,vol});
    }
  }
}
// Hybrid scale: each issuer's volatility shrunk halfway (geometrically) toward the median issuer
// volatility, which keeps stable businesses tighter without trusting short histories fully.
export const GROWTH_VOL_TYPICAL=median(growth.map(x=>x.vol)),MARGIN_VOL_TYPICAL=median(margin.map(x=>x.vol));
for(const x of growth)x.z=x.error/Math.sqrt(x.vol*GROWTH_VOL_TYPICAL);
for(const x of margin)x.z=x.abs/Math.sqrt(x.vol*MARGIN_VOL_TYPICAL);
// Does the margin error scale with the margin level? Median |error| by predicted-margin band.
const bands=[[-1,.05],[.05,.15],[.15,.3],[.3,1]].map(([lo,hi])=>{const b=margin.filter(x=>x.pred>=lo&&x.pred<hi);return {band:`${lo*100}–${hi*100}%`,n:b.length,medianAbsErrorPP:median(b.map(x=>Math.abs(x.abs)))*100,medianPredicted:median(b.map(x=>x.pred))*100};});
const P=[...Array(99)].map((_,i)=>(i+1)/100);
const coverage=(rows,key)=>{const train=rows.filter(x=>x.year<=2015).map(x=>x[key]).filter(Number.isFinite),test=rows.filter(x=>x.year>=2016).map(x=>x[key]).filter(Number.isFinite);
  const lo=quantile(train,.1),hi=quantile(train,.9);return {train:train.length,test:test.length,interval80:[lo,hi],testCoverage:test.filter(e=>e>=lo&&e<=hi).length/test.length};};
// Relative margin errors for margins above 3%; absolute (pp) errors are used below 3%.
const marginRel=margin.map(x=>x.rel).filter(Number.isFinite).map(x=>clamp(x,-2,2));
const result={
  generatedAt:new Date().toISOString().slice(0,10),source:'SEC archive (non-financial issuers), ValueLens forecast rules',
  growthLogError:{note:'Five-year cumulative revenue: predicted minus realized log growth.',n:growth.length,quantiles:P.map(p=>quantile(growth.map(x=>x.error),p))},
  marginRelError:{note:'Long-run operating margin (years +2…+5): realized / predicted − 1, predicted margins above 3%.',n:marginRel.length,quantiles:P.map(p=>quantile(marginRel,p))},
  marginAbsError:{note:'Same, in margin points, used for predicted margins at or below 3%.',n:margin.length,quantiles:P.map(p=>quantile(margin.map(x=>x.abs),p))},
  marginScaling:bands,
  coverage:{revenue:coverage(growth,'z'),margin:coverage(margin,'z'),revenueUnscaled:coverage(growth,'error'),marginUnscaled:coverage(margin,'abs')},
  growthZ:{note:'Five-year cumulative revenue log error divided by √(issuer annual log-growth s.d. × median issuer s.d.); issuer s.d. floored at 3%.',n:growth.length,quantiles:P.map(p=>quantile(growth.map(x=>x.z),p))},
  marginZ:{note:'Long-run margin error divided by √(issuer five-year margin s.d. × median issuer s.d.); issuer s.d. floored at 0.5 points.',n:margin.length,quantiles:P.map(p=>quantile(margin.map(x=>x.z),p))},
  discountRate:{erpStdDev:.006,note:'Year-start implied US ERP 2010–2024 (Damodaran) varied with a standard deviation of about 0.6 points; beta uses each company\'s regression standard error, Blume-scaled.'},
  terminal:{growthRange:.005,roicRetention:[.4,.8],note:'Terminal growth ±0.5 points; long-run ROIC retention 40–80% of excess (observed median ~70% after eight years).'}
};
const js=`// Generated by scripts/calibrate-uncertainty.mjs on ${result.generatedAt}. Do not edit by hand.\nexport const UNCERTAINTY=${JSON.stringify({growthZ:result.growthZ.quantiles.map(x=>+x.toFixed(4)),marginZ:result.marginZ.quantiles.map(x=>+x.toFixed(4)),growthVolFloor:GROWTH_VOL_FLOOR,marginVolFloor:MARGIN_VOL_FLOOR,growthVolTypical:+GROWTH_VOL_TYPICAL.toFixed(5),marginVolTypical:+MARGIN_VOL_TYPICAL.toFixed(5),growthLogError:result.growthLogError.quantiles.map(x=>+x.toFixed(5)),marginRelError:result.marginRelError.quantiles.map(x=>+x.toFixed(5)),marginAbsError:result.marginAbsError.quantiles.map(x=>+x.toFixed(5)),erpStdDev:result.discountRate.erpStdDev,terminalGrowthRange:result.terminal.growthRange,roicRetention:result.terminal.roicRetention,coverage:{revenue:+result.coverage.revenueUnscaled.testCoverage.toFixed(3),margin:+result.coverage.margin.testCoverage.toFixed(3)},generatedAt:result.generatedAt})};\n`;
writeFileSync('public/uncertainty.js',js);
writeFileSync('public/validation/uncertainty.json',JSON.stringify(result,null,2)+'\n');
console.log('margin error by predicted margin:',JSON.stringify(bands));
console.log(`typical volatility: revenue ${(GROWTH_VOL_TYPICAL*100).toFixed(1)}%, margin ${(MARGIN_VOL_TYPICAL*100).toFixed(1)} points`);
console.log(`hybrid-scaled: revenue 80% coverage ${(result.coverage.revenue.testCoverage*100).toFixed(1)}%, margin ${(result.coverage.margin.testCoverage*100).toFixed(1)}%`);
console.log(`unscaled revenue errors n=${growth.length}; 80% out-of-sample coverage ${(result.coverage.revenueUnscaled.testCoverage*100).toFixed(1)}% (interval ${result.coverage.revenueUnscaled.interval80.map(x=>x.toFixed(2)).join('…')} log)`);
console.log(`margin errors n=${margin.length}; 80% out-of-sample coverage ${(result.coverage.marginUnscaled.testCoverage*100).toFixed(1)}% (interval ${result.coverage.marginUnscaled.interval80.map(x=>(x*100).toFixed(1)).join('…')} points)`);
