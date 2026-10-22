// Prospective quarterly outcomes must match an immutable research vintage hash.
import {readFile,writeFile} from 'node:fs/promises';
const [vintagesFile,outcomesFile,outputFile]=process.argv.slice(2);
if(!vintagesFile||!outcomesFile||!outputFile)throw Error('Usage: node scripts/score-quarterly-vintages.mjs <exports.json> <outcomes.json> <output.json>');
const vintages=JSON.parse(await readFile(vintagesFile,'utf8')),outcomes=JSON.parse(await readFile(outcomesFile,'utf8')),results=[],unscored=[];
for(const v of vintages) {
 const s=v.research?.forecastSnapshot||v.forecastSnapshot,quarterly=s?.quarterly;
 if(!s?.inputHash||!quarterly?.quarters?.length){unscored.push({symbol:v.symbol,reason:'No immutable quarterly vintage'});continue;}
 const matches=outcomes.filter(o=>o.symbol===v.symbol&&o.forecastHash===s.inputHash);
 if(!matches.length){unscored.push({symbol:v.symbol,reason:'No matching mature outcome'});continue;}
 for(const o of matches){
  const variant=o.variant||'statistical',selected=variant==='guidance'?s.quarterlyGuidance:variant==='statistical'?quarterly:null;
  if(!selected){unscored.push({symbol:v.symbol,reason:'No immutable forecast for selected variant'});continue;}
  const h=o.horizonQuarters,row=selected.quarters[h-1],start=Date.parse(o.periodStart),end=Date.parse(o.periodEnd),filed=Date.parse(o.actualsFiledAt),issued=Date.parse(s.issuedAt);
  if(!Number.isInteger(h)||h<1||h>4||!row||!o.actualsSource||![start,end,filed,issued].every(Number.isFinite)||start!==Date.parse(selected.periodStart)||Math.abs(end-Date.parse(row.end))>8*864e5||filed<=issued||filed<end||filed>Date.now()||!(o.revenue>0)){
   unscored.push({symbol:v.symbol,reason:'Quarterly period, filing, revenue, source or maturity does not match the vintage'});continue;
  }
  const path=selected.quarters.slice(0,h),predictedRevenue=path.reduce((s,r)=>s+r.revenue,0),predictedEbit=path.every(r=>Number.isFinite(r.ebit))?path.reduce((s,r)=>s+r.ebit,0):null;
  results.push({symbol:v.symbol,forecastHash:s.inputHash,horizonQuarters:h,issuedAt:s.issuedAt,periodStart:o.periodStart,periodEnd:o.periodEnd,actualsSource:o.actualsSource,predictedRevenue,actualRevenue:o.revenue,
   revenueAPE:Math.abs(predictedRevenue/o.revenue-1),marginErrorPP:Number.isFinite(o.ebit)&&predictedEbit!==null?100*Math.abs(predictedEbit/predictedRevenue-o.ebit/o.revenue):null,
   variant,guidanceApplied:selected.guidanceApplied});
 }
}
const mean=xs=>{xs=xs.filter(Number.isFinite);return xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:null;};
const metrics=[1,2,3,4].map(h=>{const rows=results.filter(r=>r.horizonQuarters===h);return {horizonQuarters:h,n:rows.length,revenueMAPE:mean(rows.map(r=>r.revenueAPE)),marginMAEpp:mean(rows.map(r=>r.marginErrorPP))};});
const report={createdAt:new Date().toISOString(),scope:'Prospective aggregate operating forecasts only; no share-price, FCFF or investment-return accuracy claim',results,unscored,metrics};
await writeFile(outputFile,JSON.stringify(report,null,2));console.log(JSON.stringify(metrics));
