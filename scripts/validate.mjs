// Operating-forecast validation. Does not mistake price agreement for accuracy.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {financials,CONTINUITY,mergePredecessor,TAGS,durationDays} from '../src/accounting.js';
import {defaults,forecast} from './baseline/model-v02.js';
import {financials as oldFinancials} from './baseline/data-v01.js';
import {defaults as oldDefaults,forecast as oldForecast} from './baseline/model-v01.js';
const AS_OF='2026-10-21',cache='/private/tmp/valuelens-validation-v02';
const out=new URL('../reports/2026-10-21-v02/',import.meta.url);
await mkdir(cache,{recursive:true});await mkdir(out,{recursive:true});
const symbols=('AAPL MSFT NVDA COST XOM GOOGL META AMZN ORCL ADBE CRM INTU NOW IBM CSCO HPQ DELL HPE AMD AVGO QCOM INTC TXN MU AMAT LRCX KLAC ADI MCHP NXPI WMT TGT KR DG DLTR HD LOW TJX ROST BBY MCD SBUX YUM CMG DRI NKE LULU DECK CROX VFC PG CL KMB KO PEP MDLZ GIS KHC CPB HSY JNJ MRK PFE LLY ABBV BMY AMGN GILD REGN VRTX ABT MDT BSX SYK ISRG TMO DHR CVS UNH HUM CI ELV CAT DE HON GE RTX BA LMT NOC GD ETN EMR ITW MMM CVX COP EOG OXY SLB HAL VLO MPC PSX NEE DUK SO AEP EXC XEL ED SRE D TSLA GM F RIVN LCID TM STLA UPS FDX DAL UAL AAL LUV UNP CSX NSC T VZ TMUS CHTR CMCSA DIS NFLX WBD PARA PLD AMT JPM BAC WFC GS MS C AIG MET PRU ALL CB').split(' ');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,name){
  const file=`${cache}/${name}.json`;try{return JSON.parse(await readFile(file,'utf8'));}catch{}
  for(let attempt=0;attempt<3;attempt++){
    await sleep(180);
    try{const response=await fetch(url,{headers:{'User-Agent':'ValueLens validation ankitkapoor.me'},signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('HTTP '+response.status);const raw=await response.json();await writeFile(file,JSON.stringify(raw));return raw;}catch(e){if(attempt===2)throw e;await sleep(1000*(attempt+1));}
  }
}
const catalog=Object.values(await get('https://www.sec.gov/files/company_tickers.json','catalog'));
const candidates=symbols.map(symbol=>({...catalog.find(c=>c.ticker===symbol),symbol,cohort:'current-catalog'}));
// Explicit historical issuers reduce, but do not eliminate, survivorship bias.
candidates.push({symbol:'BBBY-historical',cik_str:886158,cohort:'historical-issuer'},{symbol:'SHLD-historical',cik_str:1310067,cohort:'historical-issuer'},{symbol:'WBA-historical',cik_str:1618921,cohort:'historical-issuer'});
const folds=[],coverage=[];
function filings(raw){
  const map=new Map(),f=raw.facts?.['us-gaap']||{};
  for(const tag of TAGS.revenue)for(const x of f[tag]?.units?.USD||[]){
    if(x.form!=='10-K'||!x.start||durationDays(x)<330||durationDays(x)>380||x.filed>AS_OF||x.filed<x.end||Date.parse(x.filed)-Date.parse(x.end)>180*864e5)continue;
    if(!map.has(x.end)||x.filed<map.get(x.end))map.set(x.end,x.filed);
  }
  return [...map].map(([end,filed])=>({end,filed})).sort((a,b)=>a.end.localeCompare(b.end));
}
function dummy(normalized){return {...normalized,peers:[],beta:null,quote:null,rates:{rf:.04,erp:.05},hFactors:Array(7).fill({score:2})};}
for(const [i,c] of candidates.entries()) {
  try {
    if(!c.cik_str)throw Error('Ticker absent from current catalog');
    let raw=await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(c.cik_str).padStart(10,'0')}.json`,String(c.cik_str));
    if(CONTINUITY[c.cik_str]){const link=CONTINUITY[c.cik_str],old=await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(link.predecessor).padStart(10,'0')}.json`,String(link.predecessor));raw=mergePredecessor(raw,old,link);}
    const submission=await get(`https://data.sec.gov/submissions/CIK${String(c.cik_str).padStart(10,'0')}.json`,String(c.cik_str)+'-submissions');
    const sic=Number(submission.sic);
    if(sic>=6000&&sic<6800){coverage.push({symbol:c.symbol,cik:c.cik_str,cohort:c.cohort,folds:0,error:'Specialized financial/real-estate model required',sic});continue;}
    const fs=filings(raw),stats={symbol:c.symbol,cik:c.cik_str,cohort:c.cohort,folds:0,normalizationFailures:0,unsupportedLossOrigins:0,fcffScored:0};
    for(const origin of fs.filter(f=>f.end>='2018-01-01'&&f.end<='2024-12-31')) {
      let n,old,a,oa;
      try{n=financials(raw,{},origin.filed);old=oldFinancials(raw,{},origin.filed);a=defaults(dummy(n));oa=oldDefaults(dummy(old));}catch{stats.normalizationFailures++;continue;}
      if(!(n.base.ebit>0)){stats.unsupportedLossOrigins++;continue;}
      const r=forecast(n.base,a),or=oldForecast(old.base,oa),idx=fs.findIndex(f=>f.end===origin.end);
      for(const horizon of [1,3]) {
        const target=fs[idx+horizon];if(!target||target.end>='2026-01-01')continue;
        let actual;try{actual=financials(raw,{},target.filed).history.find(x=>x.end===target.end);}catch{continue;}
        if(!actual||!Number.isFinite(actual.ebit)||!Number.isFinite(n.base.ebit))continue;
        const predicted=r[horizon-1],baseline=or[horizon-1],last=n.history.at(-1),prior=n.history.at(-2);
        const extrapolated=last.revenue*(last.revenue/prior.revenue)**horizon;
        const row={symbol:c.symbol,cohort:c.cohort,origin:origin.end,availableAt:origin.filed,target:target.end,horizon,
          split:target.end<'2023-01-01'?'calibration':'holdout',actualRevenue:actual.revenue,actualEbit:actual.ebit,
          revenue:predicted.revenue,ebit:predicted.ebit,oldRevenue:baseline.revenue,oldEbit:baseline.ebit,
          flatRevenue:last.revenue,repeatGrowthRevenue:extrapolated,
          revenueAPE:Math.abs(predicted.revenue/actual.revenue-1),oldRevenueAPE:Math.abs(baseline.revenue/actual.revenue-1),
          marginErrorPP:100*(predicted.margin-actual.ebit/actual.revenue),oldMarginErrorPP:100*(baseline.margin-actual.ebit/actual.revenue)};
        // FCFF is intentionally not scored against CFO-capex: it is a different cash flow.
        folds.push(row);stats.folds++;
      }
    }
    coverage.push(stats);
  }catch(e){coverage.push({symbol:c.symbol,cik:c.cik_str,cohort:c.cohort,error:e.message,folds:0});}
  if((i+1)%10===0)console.log(`${i+1}/${candidates.length} issuers; ${folds.length} forecasts`);
}
const mean=xs=>{xs=xs.filter(Number.isFinite);return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;};
const quantile=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil((s.length+1)*p)-1))];};
const metrics=[];
for(const horizon of [1,3]) {
  const train=folds.filter(r=>r.horizon===horizon&&r.split==='calibration');
  // Split-conformal absolute log-error score; interval learned without holdout targets.
  const q=quantile(train.map(r=>Math.abs(Math.log(r.actualRevenue/r.revenue))),.8);
  for(const split of ['calibration','holdout']){
    const rows=folds.filter(r=>r.horizon===horizon&&r.split===split);
    for(const row of rows){row.revenueLow=row.revenue*Math.exp(-q);row.revenueHigh=row.revenue*Math.exp(q);row.intervalCovered=row.actualRevenue>=row.revenueLow&&row.actualRevenue<=row.revenueHigh;}
    metrics.push({horizon,split,n:rows.length,issuers:new Set(rows.map(r=>r.symbol)).size,
      revenueMAPE:mean(rows.map(r=>r.revenueAPE)),oldRevenueMAPE:mean(rows.map(r=>r.oldRevenueAPE)),
      flatRevenueMAPE:mean(rows.map(r=>Math.abs(r.flatRevenue/r.actualRevenue-1))),repeatGrowthRevenueMAPE:mean(rows.map(r=>Math.abs(r.repeatGrowthRevenue/r.actualRevenue-1))),repeatGrowthN:rows.filter(r=>Number.isFinite(r.repeatGrowthRevenue)).length,
      marginMAEpp:mean(rows.map(r=>Math.abs(r.marginErrorPP))),oldMarginMAEpp:mean(rows.map(r=>Math.abs(r.oldMarginErrorPP))),
      nominalCoverage:.8,observedCoverage:mean(rows.map(r=>Number(r.intervalCovered))),calibrationN:train.length,logErrorQuantile:q});
  }
}
const hashes={};for(const name of ['src/accounting.js','public/model.js','public/forecast.js','scripts/validate.mjs'])hashes[name]=createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex');
const result={asOf:AS_OF,modelVersion:'0.2.0',scope:'Historical operating forecasts only; LLM disabled; no historical share-price or total-return accuracy measured.',
  limitations:['Current SEC facts retain original filing dates but are not immutable historical archives.','Forecasts align with fiscal years and are issued after year-end filing, partway into target fiscal year.','Current-catalog selection plus three historical issuers is not a survivorship-free market universe.','Calibration samples are pooled and correlated; 80% is a nominal interval target, not guaranteed future coverage.','Financial firms lack enterprise EBIT comparability; their data failures remain in coverage. No specialized-model accuracy claimed.','FCFF and stock-return backtests require reconciled actual FCFF and licensed point-in-time prices including delisting returns; not measured here.','LLM company-specific forecasts require prospective evaluation after key configuration; these results test the deterministic fallback only.'],
  candidates:candidates.length,issuersWithFolds:coverage.filter(r=>r.folds>0).length,folds:folds.length,metrics,coverage,hashes};
await writeFile(new URL('validation.json',out),JSON.stringify({...result,records:folds},null,2));
await mkdir(new URL('../public/validation/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/validation/latest.json',import.meta.url),JSON.stringify(result,null,2));
const pct=n=>n===null?'n/a':(n*100).toFixed(1)+'%';
await writeFile(new URL('REPORT.md',out),`# ValueLens v0.2 validation\n\n${result.scope}\n\n${result.candidates} requested issuers; ${result.issuersWithFolds} with usable folds; ${result.folds} forecasts. Calibration targets precede 2023; holdout targets are 2023–2025.\n\n| Horizon | Split | n | Revenue MAPE v0.2 | v0.1 | Flat | Repeat growth | Margin MAE pp v0.2 | v0.1 | Interval coverage |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${metrics.map(m=>`| ${m.horizon}y | ${m.split} | ${m.n} | ${pct(m.revenueMAPE)} | ${pct(m.oldRevenueMAPE)} | ${pct(m.flatRevenueMAPE)} | ${pct(m.repeatGrowthRevenueMAPE)} | ${m.marginMAEpp?.toFixed(2)} | ${m.oldMarginMAEpp?.toFixed(2)} | ${pct(m.observedCoverage)} |`).join('\n')}\n\n${result.limitations.map(x=>'- '+x).join('\n')}\n\nCoverage failures and source-code hashes are in validation.json. No evidence here establishes superior investment returns.\n`);
console.log(JSON.stringify(result.metrics,null,2));
