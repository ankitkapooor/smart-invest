import {QUARTERLY_CHALLENGER_ENABLED,ANNUAL_CHALLENGER_ENABLED} from './forecast-policy.js';
// Fitted, price-blind operating forecasts. No LLM-generated numeric paths enter here.
export const FORECAST_VERSION='0.3.0';
const clip=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=xs=>xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:null;
export const midpoint=xs=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;};
const quantile=(xs,p)=>{const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil((a.length+1)*p)-1)]:null;};
export const QUARTER_METHODS=['seasonal','damped-trend','recent-trend'];
export const ANNUAL_METHODS=['flat','damped-trend','recent-trend'];
export function consecutiveQuarters(rows=[]) {
  const tail=[];
  for(const r of rows.filter(r=>r.revenue>0).sort((a,b)=>a.end.localeCompare(b.end))) {
    const days=tail.length?(Date.parse(r.end)-Date.parse(tail.at(-1).end))/864e5:90;
    if(days<60||days>120)tail.length=0;
    tail.push(r);
  }
  return tail;
}
export function predictRevenue(values,horizon,method,season=1) {
  if(!values.length||values.some(v=>!(v>0)))return [];
  const rates=[];
  for(let i=Math.max(season,values.length-4);i<values.length;i++)rates.push(Math.log(values[i]/values[i-season]));
  const rate=clip(midpoint(rates)??0,-.5,.7),out=[];
  for(let h=1;h<=horizon;h++) {
    const anchor=season===4?(h<=4?values[values.length-4+h-1]:out[h-5]):(out.at(-1)??values.at(-1));
    const multiplier=method==='flat'||method==='seasonal'?0:method==='damped-trend'?.5:1;
    out.push(anchor*Math.exp(rate*multiplier));
  }
  return out;
}
function chooseRevenue(values,season) {
  const methods=season===4?QUARTER_METHODS:ANNUAL_METHODS,span=season,min=season===4?8:3;
  const scores=methods.map(method=>{
    const errors=[];
    for(let n=min;n<=values.length-span;n++) {
      const p=predictRevenue(values.slice(0,n),span,method,season),pred=p.reduce((s,v)=>s+v,0),actual=values.slice(n,n+span).reduce((s,v)=>s+v,0);
      errors.push(Math.abs(pred/actual-1));
    }
    return {method,n:errors.length,mape:mean(errors)};
  });
  const baseline=scores[0],best=scores.reduce((b,r)=>r.mape!==null&&(b.mape===null||r.mape<b.mape)?r:b,baseline);
  // Small histories and marginal CV wins do not justify replacing the benchmark.
  const selected=best.n>=4&&best.mape<baseline.mape*.95?best:baseline;
  return {method:selected.method,scores,baseline:baseline.method,n:selected.n,selection:'Rolling historical folds; challenger requires ≥4 folds and ≥5% relative improvement.'};
}
function marginValue(rows,h,method) {
  const good=rows.filter(r=>Number.isFinite(r.ebit)&&r.revenue>0);
  if(!good.length)return null;
  if(method==='last')return good.at(-1).ebit/good.at(-1).revenue;
  const span=method==='median-8'?8:4,subset=good.slice(-span);
  return midpoint(subset.map(r=>r.ebit/r.revenue));
}
function chooseMargin(rows,season) {
  const methods=['last','median-4','median-8'],min=season===4?8:3;
  const scores=methods.map(method=>{const errors=[];for(let n=min;n<=rows.length-season;n++){
    const p=marginValue(rows.slice(0,n),1,method),future=rows.slice(n,n+season);
    if(p===null||future.some(r=>!Number.isFinite(r.ebit)))continue;
    const actual=future.reduce((s,r)=>s+r.ebit,0)/future.reduce((s,r)=>s+r.revenue,0);errors.push(Math.abs(p-actual));
  }return {method,n:errors.length,mae:mean(errors)};});
  const b=scores[0],best=scores.reduce((v,r)=>r.mae!==null&&(v.mae===null||r.mae<v.mae)?r:v,b);
  return {method:best.n>=4&&best.mae<b.mae*.95?best.method:b.method,scores};
}
function futureEnds(rows,horizon) {
  const ends=rows.map(r=>r.end),out=[];
  for(let h=1;h<=horizon;h++) {
    // Fiscal dates are estimates until filed. Preserve the issuer's 52-week cadence
    // for week-based years; use month ends for calendar-quarter reporters.
    const anchor=ends[ends.length-4+h-1]??out[h-5];
    const d=new Date(anchor+'T12:00:00Z'),month=d.getUTCMonth(),day=d.getUTCDate();
    const last=new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate();
    const next=day===last?new Date(Date.UTC(d.getUTCFullYear()+1,month+1,0,12)):new Date(d.getTime()+364*864e5);
    out.push(next.toISOString().slice(0,10));
  }
  return out;
}
export function quarterlyForecast(rows,{candidate=false,diagnostics=true}={}) {
  const history=consecutiveQuarters(rows);if(history.length<8)return {status:'insufficient',quarters:[],reason:'Eight consecutive discrete quarters required.'};
  const values=history.map(r=>r.revenue),fit=chooseRevenue(values,4),marginFit=chooseMargin(history,4);
  if(!candidate&&!QUARTERLY_CHALLENGER_ENABLED){fit.method='seasonal';marginFit.method='last';fit.releaseGate='Challenger withheld; seasonal production benchmark.';}
  const pred=predictRevenue(values,4,fit.method,4),ends=futureEnds(history,4);
  const errors=[[],[],[],[]],prequential=[];
  // For each residual, model selection sees ONLY observations before its origin.
  for(let n=8;diagnostics&&n<history.length;n++) {
    const prefix=values.slice(0,n),method=(candidate||QUARTERLY_CHALLENGER_ENABLED)?chooseRevenue(prefix,4).method:'seasonal',p=predictRevenue(prefix,4,method,4);
    for(let h=1;h<=4&&n+h<=history.length;h++) {
      const actual=values[n+h-1],score=Math.abs(Math.log(actual/p[h-1]));
      errors[h-1].push(score);prequential.push({origin:history[n-1].end,horizon:h,method,predicted:p[h-1],actual,logError:score});
    }
  }
  const quarters=pred.map((revenue,i)=>{
    const scores=errors[i],q=scores.length>=12?quantile(scores,.8):null,margin=marginValue(history,i+1,marginFit.method);
    return {horizon:i+1,end:ends[i],estimatedFiscalDate:true,revenue,margin,ebit:margin===null?null:revenue*margin,
      low:q===null?null:revenue*Math.exp(-q),high:q===null?null:revenue*Math.exp(q),nominalCoverage:q===null?null:.8,calibrationN:scores.length,
      basis:fit.method,sourcePeriod:history.at(-1).end};
  });
  return {status:'fitted',quarters,fit,marginFit,historyCount:history.length,through:history.at(-1).end,prequential,
    limitations:['Revenue ranges use prequential historical errors; correlated observations and regime changes prevent guaranteed coverage.','Historical statements available today may contain restatements. Company diagnostics are not an independent holdout.','Fiscal end dates are estimates; forecasts cover the four reporting quarters after the latest filed quarter, including the reporting lag.']};
}
export function annualForecast(history,horizon=5) {
  const rows=history.filter(r=>r.revenue>0),fit=chooseRevenue(rows.map(r=>r.revenue),1),marginFit=chooseMargin(rows,1);
  if(!ANNUAL_CHALLENGER_ENABLED){fit.method='flat';marginFit.method='last';}
  return {fit,marginFit,revenue:predictRevenue(rows.map(r=>r.revenue),horizon,fit.method,1),margin:marginValue(rows,1,marginFit.method)};
}
function ratioEstimate(history,key,base) {
  const rows=history.filter(r=>Number.isFinite(r[key])&&r.revenue>0),values=rows.map(r=>r[key]/r.revenue);
  if(!values.length)return {value:Number.isFinite(base[key])?base[key]/base.revenue:null,method:'current',n:0};
  const score=span=>{const errors=[];for(let n=3;n<values.length;n++){const p=midpoint(values.slice(Math.max(0,n-span),n));errors.push(Math.abs(p-values[n]));}return mean(errors);};
  const last=score(1),median=score(3),span=values.length>=7&&median<last*.95?3:1;
  return {value:midpoint(values.slice(-span)),method:span===1?'latest reported ratio':'three-year median ratio',n:Math.max(0,values.length-3)};
}
export function operatingForecast(data,{useGuidance=false}={}) {
  const b=data.base,annual=annualForecast(data.history||[]),q=quarterlyForecast(data.quarterly||[]);
  const usable=q.status==='fitted'&&q.through===b.end;
  const quarterRows=usable?q.quarters.map(r=>({...r})):[];
  // Guidance is a separate observable anchor, not an LLM estimate. Only externally
  // verified extracts can enter, and its impact is displayed and snapshotted.
  const appliedGuidance=[],guidanceComparison=[];
  for(const g of data.research?.guidance?.accepted||[]) {
    const row=quarterRows.find(r=>Math.abs(Date.parse(r.end)-Date.parse(g.periodEnd))<=8*864e5);
    if(!row||g.metric!=='revenue'||g.unit!=='USD millions')continue;
    const previous=row.revenue;guidanceComparison.push({...g,statisticalRevenue:previous,guidanceMidpoint:(g.low+g.high)/2});
    if(!useGuidance)continue;
    row.revenue=(g.low+g.high)/2;row.ebit=row.margin===null?null:row.revenue*row.margin;
    row.low=null;row.high=null;row.nominalCoverage=null;row.basis='Verified management guidance midpoint; prospective performance unmeasured';
    appliedGuidance.push({...g,statisticalRevenue:previous,forecastRevenue:row.revenue});
  }
  const nextRevenue=usable?quarterRows.reduce((s,r)=>s+r.revenue,0):b.revenue*(annual.revenue[0]/(data.history.at(-1)?.revenue||b.revenue));
  const firstGrowth=nextRevenue/b.revenue-1;
  let nearMargin=usable&&quarterRows.every(r=>Number.isFinite(r.ebit))?quarterRows.reduce((s,r)=>s+r.ebit,0)/nextRevenue:annual.margin??b.ebit/b.revenue;
  if(!Number.isFinite(b.ebit)){nearMargin=null;for(const row of quarterRows){row.margin=null;row.ebit=null;}}
  const ratios=Object.fromEntries(['capex','da','nwc'].map(key=>[key,ratioEstimate(data.history||[],key,b)]));
  // Hold a measured near-term rate only briefly. Long-run growth is an explicit
  // scenario assumption, with competitive fade in the valuation engine.
  return {status:'fitted',version:FORECAST_VERSION,firstGrowth,nearMargin,quarterly:q,quarters:quarterRows,annual,
    ratios,appliedGuidance,guidanceComparison,segments:data.reportedSegments||null,
    basis:usable?'Quarterly model selected on issuer history'+(appliedGuidance.length?'; verified guidance anchor':''):'Annual benchmark selected on issuer history',
    accuracyStatus:'Operating model; future FCFF, intrinsic value and stock-return accuracy unproven'};
}
