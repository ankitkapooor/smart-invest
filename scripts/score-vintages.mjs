// Score immutable LLM vintages once outcomes mature. No model reruns or hindsight edits.
// node scripts/score-vintages.mjs <exports.json> <outcomes.json> <output.json>
import {readFile,writeFile} from 'node:fs/promises';
const [vintagesFile,outcomesFile,outputFile]=process.argv.slice(2);
if(!vintagesFile||!outcomesFile||!outputFile){console.error('Usage: node scripts/score-vintages.mjs <exports.json> <outcomes.json> <output.json>');process.exit(1);}
const vintages=JSON.parse(await readFile(vintagesFile,'utf8')),outcomes=JSON.parse(await readFile(outcomesFile,'utf8'));
const results=[],unscored=[];
for(const v of vintages) {
  const snapshot=v.research?.forecastSnapshot||v.forecastSnapshot,analysis=snapshot?.analysis;
  if(!snapshot?.inputHash||!analysis?.rows?.length){unscored.push({symbol:v.symbol,reason:'No immutable forecast or missing core financial inputs'});continue;}
  const eligible=outcomes.filter(o=>o.symbol===v.symbol&&o.forecastHash===snapshot.inputHash);
  if(!eligible.length){unscored.push({symbol:v.symbol,reason:'No matched mature outcome; this is not a forecast failure.'});continue;}
  for(const o of eligible) {
    const row=analysis.rows[o.horizonYears-1],issued=Date.parse(snapshot.issuedAt),start=Date.parse(o.periodStart),end=Date.parse(o.periodEnd),filed=Date.parse(o.actualsFiledAt);
    const expectedEnd=issued+o.horizonYears*365.25*864e5;
    if(!row||!Number.isInteger(o.horizonYears)||!o.actualsSource||![issued,start,end,filed].every(Number.isFinite)||filed<end||filed>Date.now()||end>Date.now()||Math.abs(start-issued)>45*864e5||Math.abs(end-expectedEnd)>45*864e5){unscored.push({symbol:v.symbol,reason:'Outcome date/source does not align with the forecast issuance date'});continue;}
    const result={symbol:v.symbol,forecastHash:snapshot.inputHash,horizonYears:o.horizonYears,issuedAt:snapshot.issuedAt,actualsSource:o.actualsSource,
      revenueAPE:Number.isFinite(o.revenue)&&o.revenue>0?Math.abs(row.revenue/o.revenue-1):null,
      marginErrorPP:Number.isFinite(o.ebit)&&o.revenue>0?100*(row.margin-o.ebit/o.revenue):null,
      fcffError:Number.isFinite(o.reconciledFcff)&&o.fcffReconciliationSource?row.fcff-o.reconciledFcff:null};
    // Total returns must include dividends, splits and delisting payments. Require
    // explicit provider confirmation; never substitute disappearing ticker prices.
    const returns=o.returns;
    if(returns?.includesDividendsSplitsAndDelistings===true&&returns.source&&returns.benchmarkSource&&Math.abs(Date.parse(returns.start)-issued)<7*864e5&&Math.abs(Date.parse(returns.end)-expectedEnd)<7*864e5&&Date.parse(returns.end)<=Date.now()&&Number.isFinite(returns.stock)&&returns.stock>=-1&&Number.isFinite(returns.benchmark)&&returns.benchmark>=-1){
      result.totalReturn=returns.stock;result.benchmarkReturn=returns.benchmark;result.excessReturn=returns.stock-returns.benchmark;
      result.signal=analysis.status;result.modeledUpside=analysis.upside;result.returnSource=returns.source;
    }else result.returnStatus='Unscored: point-in-time total-return evidence is missing or misaligned.';
    results.push(result);
  }
}
const mean=xs=>{xs=xs.filter(Number.isFinite);return xs.length?xs.reduce((s,n)=>s+n,0)/xs.length:null;};
const output={createdAt:new Date().toISOString(),results,unscored,metrics:{n:results.length,revenueMAPE:mean(results.map(r=>r.revenueAPE)),marginMAEpp:mean(results.map(r=>r.marginErrorPP===null?null:Math.abs(r.marginErrorPP))),totalReturnsScored:results.filter(r=>Number.isFinite(r.totalReturn)).length},limitations:['Matched vintage scoring is not evidence of causal investment alpha.','Portfolio-level tests also require a predetermined signal/holding/rebalancing rule, transaction costs and complete universe/delisting coverage.']};
await writeFile(outputFile,JSON.stringify(output,null,2));console.log(JSON.stringify(output.metrics));
