import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {quarterlyFinancials,CONTINUITY,mergePredecessor,TAGS} from '../src/accounting.js';
import {quarterlyForecast,consecutiveQuarters,predictRevenue} from '../public/prediction.js';
const protocol=JSON.parse(await readFile(new URL('./forecast-protocol.json',import.meta.url),'utf8'));
const cache='/private/tmp/valuelens-validation-v02',out=new URL('../reports/2026-10-21-v03/',import.meta.url);
await mkdir(out,{recursive:true});
const old=JSON.parse(await readFile(new URL('../reports/2026-10-21-v02/validation.json',import.meta.url),'utf8'));
const records=[],coverage=[];
for(const [i,c] of old.coverage.entries()) {
  if(!c.cik){coverage.push({...c,error:'No cached CIK'});continue;}
  try {
    const submission=JSON.parse(await readFile(`${cache}/${c.cik}-submissions.json`,'utf8')),sic=Number(submission.sic);
    if(sic>=6000&&sic<6800){coverage.push({symbol:c.symbol,error:'Specialized model required',folds:0});continue;}
    let raw=JSON.parse(await readFile(`${cache}/${c.cik}.json`,'utf8'));
    if(CONTINUITY[c.cik]){const link=CONTINUITY[c.cik];raw=mergePredecessor(raw,JSON.parse(await readFile(`${cache}/${link.predecessor}.json`,'utf8')),link,protocol.asOf);}
    const all=quarterlyFinancials(raw,protocol.asOf),stats={symbol:c.symbol,cik:c.cik,quarters:all.length,folds:0};
    // Score actuals at their first known filing, and recompute inputs at EACH
    // origin's first revenue filing. Today’s restated comparisons never fill an origin.
    const firstFiled=new Map();
    for(const tag of TAGS.revenue)for(const f of raw.facts?.['us-gaap']?.[tag]?.units?.USD||[]) {
      if(!/^10-[KQ]/.test(f.form)||f.filed>protocol.asOf||!f.start)continue;
      const delay=(Date.parse(f.filed)-Date.parse(f.end))/864e5;if(delay<0||delay>130)continue;
      if(!firstFiled.has(f.end)||f.filed<firstFiled.get(f.end))firstFiled.set(f.end,f.filed);
    }
    const actuals=new Map();
    for(const q of all) {
      const filed=firstFiled.get(q.end);if(!filed)continue;
      const a=quarterlyFinancials(raw,filed).find(r=>r.end===q.end);if(a)actuals.set(q.end,a);
    }
    for(let idx=0;idx<all.length-1;idx++) {
      const origin=all[idx],filed=firstFiled.get(origin.end);if(!filed||origin.end<'2017-01-01')continue;
      const input=consecutiveQuarters(quarterlyFinancials(raw,filed).filter(r=>r.end<=origin.end));
      if(input.length<8||input.at(-1).end!==origin.end)continue;
      const fitted=quarterlyForecast(input,{candidate:true,diagnostics:true});if(fitted.status!=='fitted')continue;
      const seasonal=predictRevenue(input.map(r=>r.revenue),4,'seasonal',4),latestMargin=input.at(-1).margin;
      for(const horizon of [1,4]) {
        const future=all.slice(idx+1,idx+horizon+1).map(q=>actuals.get(q.end));
        if(future.length!==horizon||future.some(q=>!q||firstFiled.get(q.end)<=filed)||consecutiveQuarters([origin,...future]).length!==horizon+1)continue;
        const target=future.at(-1).end,actualRevenue=future.reduce((s,q)=>s+q.revenue,0),predicted=fitted.quarters.slice(0,horizon).reduce((s,q)=>s+q.revenue,0),baseline=seasonal.slice(0,horizon).reduce((s,v)=>s+v,0);
        const actualMargin=future.every(q=>Number.isFinite(q.ebit))?future.reduce((s,q)=>s+q.ebit,0)/actualRevenue:null;
        const predictedMargin=fitted.quarters.slice(0,horizon).every(q=>Number.isFinite(q.ebit))?fitted.quarters.slice(0,horizon).reduce((s,q)=>s+q.ebit,0)/predicted:null;
        records.push({symbol:c.symbol,sic,origin:origin.end,issuedAt:filed,target,horizon,
          split:target<'2026-01-01'?'development':'evaluation-2026',actualRevenue,predicted,baseline,
          ape:Math.abs(predicted/actualRevenue-1),baselineAPE:Math.abs(baseline/actualRevenue-1),
          marginErrorPP:actualMargin===null||predictedMargin===null?null:100*Math.abs(predictedMargin-actualMargin),
          baselineMarginErrorPP:actualMargin===null||latestMargin===null?null:100*Math.abs(latestMargin-actualMargin),
          pointPredicted:fitted.quarters[horizon-1].revenue,pointActual:future.at(-1).revenue,intervalLow:fitted.quarters[horizon-1].low,intervalHigh:fitted.quarters[horizon-1].high,calibrationN:fitted.quarters[horizon-1].calibrationN,
          revenueMethod:fitted.fit.method,marginMethod:fitted.marginFit.method,trainingQuarters:input.length});stats.folds++;
      }
    }
    coverage.push(stats);
  }catch(e){coverage.push({symbol:c.symbol,cik:c.cik,error:e.message,folds:0});}
  if((i+1)%10===0)console.log(`${i+1}/${old.coverage.length}; ${records.length} quarterly cases`);
}
const mean=xs=>{xs=xs.filter(Number.isFinite);return xs.length?xs.reduce((s,n)=>s+n,0)/xs.length:null;};
const summarize=rows=>({n:rows.length,issuers:new Set(rows.map(r=>r.symbol)).size,revenueMAPE:mean(rows.map(r=>r.ape)),seasonalMAPE:mean(rows.map(r=>r.baselineAPE)),marginMAEpp:mean(rows.map(r=>r.marginErrorPP)),latestMarginMAEpp:mean(rows.map(r=>r.baselineMarginErrorPP)),marginN:rows.filter(r=>r.marginErrorPP!==null&&r.baselineMarginErrorPP!==null).length,challengerSelected:rows.filter(r=>r.revenueMethod!=='seasonal').length,intervalN:rows.filter(r=>r.intervalLow!==null).length,nominalCoverage:.8,observedPointCoverage:mean(rows.filter(r=>r.intervalLow!==null).map(r=>Number(r.pointActual>=r.intervalLow&&r.pointActual<=r.intervalHigh)))});
const metrics=[];
for(const split of ['development','evaluation-2026'])for(const horizon of [1,4])metrics.push({split,horizon,...summarize(records.filter(r=>r.split===split&&r.horizon===horizon))});
const evaluation=metrics.filter(m=>m.split==='evaluation-2026'),gatePassed=evaluation.length===2&&evaluation.every(m=>m.n>=100&&m.revenueMAPE<m.seasonalMAPE&&m.marginMAEpp<=m.latestMarginMAEpp+.1);
const bySector=[];for(const group of [...new Set(records.map(r=>Math.floor(r.sic/100)))].sort())for(const horizon of [1,4]){const rows=records.filter(r=>r.split==='evaluation-2026'&&Math.floor(r.sic/100)===group&&r.horizon===horizon);if(rows.length)bySector.push({sicGroup:group,horizon,...summarize(rows)});}
// Paired issuer-cluster bootstrap: repeated/overlapping cases stay together.
let seed=314159265;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const pairedUncertainty=[];
for(const horizon of [1,4]) {
  const rows=records.filter(r=>r.split==='evaluation-2026'&&r.horizon===horizon),issuers=[...new Set(rows.map(r=>r.symbol))],groups=issuers.map(symbol=>rows.filter(r=>r.symbol===symbol)),samples=[];
  for(let b=0;b<1000;b++){let sum=0,n=0;for(let i=0;i<issuers.length;i++){const g=groups[Math.floor(random()*groups.length)];for(const r of g){sum+=r.baselineAPE-r.ape;n++;}}samples.push(sum/n);}
  samples.sort((a,b)=>a-b);pairedUncertainty.push({horizon,method:'Paired issuer-cluster bootstrap; 1,000 resamples; percentage-error difference seasonal minus challenger',low95:samples[24],high95:samples[974],issuers:issuers.length});
}
const hashes={};for(const f of ['src/accounting.js','public/prediction.js','scripts/forecast-protocol.json','scripts/validate-quarterly.mjs'])hashes[f]=createHash('sha256').update(await readFile(new URL('../'+f,import.meta.url))).digest('hex');
const result={asOf:protocol.asOf,modelVersion:'0.3.0',protocol,scope:protocol.scope,gatePassed,productionPolicy:gatePassed?'Issuer-specific challenger enabled':'Seasonal benchmark retained; challenger not promoted',candidates:coverage.length,issuersWithFolds:coverage.filter(c=>c.folds>0).length,folds:records.length,metrics,bySector,pairedUncertainty,coverage,hashes,limitations:protocol.limitations};
await writeFile(new URL('validation.json',out),JSON.stringify({...result,records},null,2));
await writeFile(new URL('../public/validation/quarterly.json',import.meta.url),JSON.stringify(result,null,2));
const pct=x=>x===null?'n/a':(x*100).toFixed(2)+'%';
await writeFile(new URL('REPORT.md',out),`# ValueLens v0.3 quarterly evaluation\n\n${result.scope}\n\n${result.issuersWithFolds} issuers; ${result.folds} cases. Release gate: **${gatePassed?'passed':'failed'}**. ${result.productionPolicy}.\n\n| Split | Quarters aggregated | Cases | Revenue MAPE | Seasonal MAPE | Margin MAE pp | Latest margin MAE pp |\n|---|---:|---:|---:|---:|---:|---:|\n${metrics.map(m=>`| ${m.split} | ${m.horizon} | ${m.n} | ${pct(m.revenueMAPE)} | ${pct(m.seasonalMAPE)} | ${m.marginMAEpp?.toFixed(2)} | ${m.latestMarginMAEpp?.toFixed(2)} |`).join('\n')}\n\n${result.limitations.map(x=>'- '+x).join('\n')}\n\nProtocol, source hashes, issuer coverage, sector breakdown and every prediction are in validation.json. No historical LLM guesses, FCFF errors or stock-return claims enter these results. Nominal 80% marginal revenue ranges are evaluated separately for horizons 1 and 4; see observedPointCoverage and intervalN in the JSON. Paired issuer-cluster bootstrap intervals for improvement are included, without assuming individual cases are independent.\n`);
await writeFile(new URL('../public/forecast-policy.js',import.meta.url),`// Generated by the preregistered quarterly evaluation; see /validation/quarterly.json.\nexport const QUARTERLY_CHALLENGER_ENABLED=${gatePassed};\nexport const ANNUAL_CHALLENGER_ENABLED=false;\nexport const POLICY_BASIS='${gatePassed?'2026 quarterly gate passed; annual fallback retains flat revenue.':'Quarterly gate failed; seasonal benchmark retained.'}';\n`);
console.log(JSON.stringify({gatePassed,metrics,folds:records.length},null,2));
