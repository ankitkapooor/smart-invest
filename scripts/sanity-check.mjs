// Reproducible evaluation of the deployed v0.1 model; never tunes the live model.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {financials} from './baseline/data-v01.js';
import {defaults,analyze,forecast,median} from './baseline/model-v01.js';

const SYMBOLS=['AAPL','MSFT','NVDA','COST','XOM'];
const AS_OF='2026-10-21';
const output=new URL(`../reports/${AS_OF}-v01-reproduction/`,import.meta.url);
const cache='/private/tmp/valuelens-audit-2026-10-21';
await mkdir(output,{recursive:true});await mkdir(cache,{recursive:true});
const hash=createHash('sha256').update(await readFile(new URL('./baseline/model-v01.js',import.meta.url))).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url,name){
  const path=`${cache}/${name}.json`;
  try{return JSON.parse(await readFile(path,'utf8'));}catch{}
  const response=await fetch(url,{headers:{'User-Agent':'ValueLens validation (https://ankitkapoor.me)'},signal:AbortSignal.timeout(100000)});
  const value=await response.json();
  if(!response.ok)throw new Error(JSON.stringify({status:response.status,...value}));
  await writeFile(path,JSON.stringify(value));return value;
}
const catalog=Object.values(await get('https://www.sec.gov/files/company_tickers.json','catalog'));
const live=[],folds=[],exceptions=[];
const finite=Number.isFinite;
function earliestFilings(raw){
  const facts=raw.facts['us-gaap']||{},map=new Map();
  for(const tag of ['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueGoodsNet']){
    for(const fact of facts[tag]?.units?.USD||[]){
      const duration=(Date.parse(fact.end)-Date.parse(fact.start))/864e5;
      const delay=(Date.parse(fact.filed)-Date.parse(fact.end))/864e5;
      if(fact.form!=='10-K'||duration<330||duration>380||!(delay>=0&&delay<180)||fact.filed>AS_OF)continue;
      if(!map.has(fact.end)||fact.filed<map.get(fact.end))map.set(fact.end,fact.filed);
    }
  }
  return [...map].map(([end,filed])=>({end,filed})).sort((a,b)=>a.end.localeCompare(b.end));
}
function pointEstimate(data,assumptions){const r=analyze(data,assumptions);return r.valued?.price??null;}
function impliedGrowth(data,a,target){
  let lo=-.25,hi=.8,pl=pointEstimate(data,{...a,growth:lo}),ph=pointEstimate(data,{...a,growth:hi});
  if(!finite(pl)||!finite(ph)||target<pl||target>ph)return null;
  for(let i=0;i<55;i++){const mid=(lo+hi)/2,p=pointEstimate(data,{...a,growth:mid});if(p<target)lo=mid;else hi=mid;}
  return (lo+hi)/2;
}
for(const symbol of SYMBOLS){
  console.log(`Evaluating ${symbol}…`);
  const company=catalog.find(c=>c.ticker===symbol),cik=String(company.cik_str).padStart(10,'0');
  let snapshot=null;
  try{
    try{snapshot=JSON.parse(await readFile(new URL(`../reports/${AS_OF}/${symbol}-snapshot.json`,import.meta.url),'utf8'));}
    catch{snapshot=await get(`https://valuelens.ankitkapoor.me/api/company?symbol=${symbol}`,`${symbol}-live`);}
    if(snapshot.version!=='0.1.0')throw new Error('A frozen v0.1 snapshot is required; current deployed inputs cannot reproduce the old audit.');
    await writeFile(new URL(`${symbol}-snapshot.json`,output),JSON.stringify(snapshot,null,2)+'\n');
    const a=defaults(snapshot),r=analyze(snapshot,a),b=snapshot.base;
    const f=r.rows?.at(-1);
    const first=snapshot.history.at(-4)||snapshot.history[0],last=snapshot.history.at(-1);
    const rawCagr=(last.revenue/first.revenue)**(365.25*864e5/(Date.parse(last.end)-Date.parse(first.end)))-1;
    const recent={margin:b.ebit/b.revenue,capex:b.capex/b.revenue,da:b.da/b.revenue};
    const variants=r.errors.length?{}:{
      currentMargin:pointEstimate(snapshot,{...a,margin:recent.margin}),
      currentCapex:pointEstimate(snapshot,{...a,capex:recent.capex}),
      currentMarginAndCapex:pointEstimate(snapshot,{...a,margin:recent.margin,capex:recent.capex,da:recent.da}),
      uncappedHistoricalGrowth:pointEstimate(snapshot,{...a,growth:rawCagr}),
      tax21Percent:pointEstimate(snapshot,{...a,tax:.21}),
      erp5Percent:pointEstimate(snapshot,{...a,erp:.05}),
      companyOwnBeta:pointEstimate(snapshot,{...a,assetBeta:snapshot.beta?.beta/(1+(1-a.tax)*b.debt/(snapshot.quote.price*b.shares))})
    };
    let independent=null;
    if(r.valued){
      const w=r.current.wacc,g=a.terminalGrowth,roic=a.terminalROIC;
      const pv=r.rows.reduce((total,row)=>total+row.fcff*Math.pow(1+w,-row.year),0);
      const tv=f.nopat*(1+g)*(1-g/roic)/(w-g)*Math.pow(1+w,-10);
      independent=(pv+tv+Math.max(0,b.cash-a.cashReserve)-b.debt-a.otherClaims)/b.shares;
    }
    const row={symbol,name:snapshot.name,financialEnd:b.end,quote:snapshot.quote,
      modeledPrice:r.valued?.price??null,gap:r.upside??null,ocsPrice:r.optimized?.price??null,wacc:r.current?.wacc??null,
      beta:a.assetBeta,ownBeta:snapshot.beta,growth:a.growth,rawCagr,margin:a.margin,recentMargin:recent.margin,
      capexRatio:a.capex,recentCapexRatio:recent.capex,daRatio:a.da,recentDaRatio:recent.da,
      revenue:b.revenue,ebit:b.ebit,cfo:b.cfo,capex:b.capex,cash:b.cash,debt:b.debt,shares:b.shares,
      terminalShare:r.valued?.terminalShare??null,year1:r.rows?.[0],
      year10Reinvestment:f?f.capex-f.da+f.deltaNwc:null,
      terminalReinvestment:r.valued?.terminalReinvestment??null,
      equityBridgeCheck:independent===null?null:independent-r.valued.price,
      impliedGrowth:!r.errors.length?impliedGrowth(snapshot,a,snapshot.quote.price):null,
      status:r.status??'Blocked',errors:r.errors,critical:snapshot.quality.filter(q=>q.severity==='critical').map(q=>q.text),
      peers:snapshot.peers.map(p=>({symbol:p.symbol,beta:p.beta?.beta,margin:p.margin,quality:p.quality})),
      hScores:a.hScores,hEvidence:snapshot.hFactors.map(f=>({name:f.name,score:f.score,evidence:f.evidence})),rates:snapshot.rates,variants,
      sources:snapshot.sources,assumptions:a};
    live.push(row);console.log(JSON.stringify({symbol,price:row.modeledPrice,quote:row.quote?.price,status:row.status,errors:row.errors}));
  }catch(e){
    exceptions.push({symbol,stage:'live',error:e.message});
    let quote=null;
    try{
      const chart=await get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`,`${symbol}-quote`);
      const m=chart.chart.result[0].meta;
      quote={price:m.regularMarketPrice,asOf:new Date(m.regularMarketTime*1000).toISOString(),currency:m.currency,source:'Yahoo Finance chart; quote only, company analysis failed'};
    }catch{}
    live.push({symbol,status:'API failed',quote,errors:[e.message]});
  }
  const raw=await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,`${symbol}-facts`);
  const sub=await get(`https://data.sec.gov/submissions/CIK${cik}.json`,`${symbol}-submissions`);
  const filings=earliestFilings(raw),byEnd=new Map();
  function annualAt(filing){
    if(byEnd.has(filing.end))return byEnd.get(filing.end);
    const f=financials(raw,sub,filing.filed);
    byEnd.set(filing.end,f);return f;
  }
  for(let i=0;i<filings.length;i++){
    const origin=filings[i];
    if(origin.end.slice(0,4)<'2020'||origin.end.slice(0,4)>'2024')continue;
    try{
      const training=annualAt(origin),annual=training.history.find(h=>h.end===origin.end);
      if(!annual)throw new Error('Origin annual row unavailable');
      // Operating-only backtest. No current beta, market price, WACC or ERP enters the prediction.
      const stub={base:{...training.base,...annual},history:training.history,peers:[],beta:null,quote:null,
        rates:{rf:.04,erp:.05},hFactors:Array(7).fill({score:2})};
      const a=defaults(stub),rows=forecast(stub.base,a);
      const previous=training.history.at(-2),yoy=annual.revenue/previous.revenue-1;
      const trainRecords=[...training.history.flatMap(h=>Object.values(h.provenance).flat()),...Object.values(training.base.provenance).flat()];
      const latestTrainingFiling=trainRecords.map(f=>f.filed).sort().at(-1);
      if(latestTrainingFiling>origin.filed)throw new Error('Look-ahead detected');
      for(const horizon of [1,3]){
        const outcome=filings[i+horizon];if(!outcome||outcome.end>'2025-12-31')continue;
        const actuals=annualAt(outcome),actual=actuals.history.find(h=>h.end===outcome.end);
        const prior=actuals.history.filter(h=>h.end<outcome.end).at(-1);
        if(!actual)continue;
        const pred=rows[horizon-1],actualB=actuals.base;
        // FCFF comparison is a common-definition proxy, not an audited historical FCFF measure.
        let actualFCFF=null,fcffCoverage=[];
        try{
          const priorFiling=filings.find(f=>f.end===prior?.end),priorB=priorFiling?annualAt(priorFiling).base:null;
          if([actual.ebit,actual.da,actual.capex,actualB.nwc,priorB?.nwc].every(finite)){
            actualFCFF=actual.ebit-Math.max(actual.ebit,0)*a.tax+actual.da-actual.capex-(actualB.nwc-priorB.nwc);
          }
          fcffCoverage=actuals.quality.filter(q=>q.severity==='critical').map(q=>q.text);
        }catch{}
        const valid=finite(pred.revenue)&&finite(actual.revenue)&&actual.revenue>0;
        const fold={symbol,originEnd:origin.end,forecastIssued:origin.filed,latestTrainingFiling,
          targetEnd:outcome.end,outcomeFirstFiling:outcome.filed,horizon,
          liveModelWouldBlock:!finite(annual.ebit)||annual.ebit<=0,
          assumptions:{growth:a.growth,margin:a.margin,tax:a.tax,capex:a.capex,da:a.da,nwc:a.nwc,terminalGrowth:a.terminalGrowth},
          trainBase:{revenue:annual.revenue,ebit:annual.ebit,capex:annual.capex,da:annual.da,nwc:training.base.nwc},
          trainingProvenance:training.history.map(h=>({end:h.end,provenance:h.provenance})),
          revenue:{predicted:pred.revenue,actual:actual.revenue,naiveFlat:annual.revenue,naiveLastGrowth:annual.revenue*(1+yoy)**horizon,
            ape:valid?Math.abs(pred.revenue/actual.revenue-1):null,signedError:valid?pred.revenue/actual.revenue-1:null,
            flatAPE:valid?Math.abs(annual.revenue/actual.revenue-1):null,lastGrowthAPE:valid?Math.abs(annual.revenue*(1+yoy)**horizon/actual.revenue-1):null},
          ebit:{predicted:pred.ebit,actual:actual.ebit,naiveFlat:annual.ebit,
            ape:finite(pred.ebit)&&finite(actual.ebit)&&Math.abs(actual.ebit)>1?Math.abs((pred.ebit-actual.ebit)/actual.ebit):null,
            flatAPE:finite(annual.ebit)&&finite(actual.ebit)&&Math.abs(actual.ebit)>1?Math.abs((annual.ebit-actual.ebit)/actual.ebit):null},
          fcff:{predicted:pred.fcff,actualProxy:actualFCFF,quality:fcffCoverage},
          actualProvenance:actual.provenance};
        folds.push(fold);
      }
    }catch(e){exceptions.push({symbol,stage:'backtest',origin:origin.end,error:e.message});}
  }
  await sleep(250);
}

function avg(xs){const values=xs.filter(finite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function summarize(fs){return {
  count:fs.length,issuable:fs.filter(f=>!f.liveModelWouldBlock).length,
  revenueN:fs.filter(f=>finite(f.revenue.ape)).length,
  revenueMAPE:avg(fs.map(f=>f.revenue.ape)),revenueMedianAPE:median(fs.map(f=>f.revenue.ape)),revenueBias:avg(fs.map(f=>f.revenue.signedError)),
  flatRevenueMAPE:avg(fs.map(f=>f.revenue.flatAPE)),lastGrowthRevenueMAPE:avg(fs.map(f=>f.revenue.lastGrowthAPE)),
  ebitN:fs.filter(f=>finite(f.ebit.ape)).length,ebitMAPE:avg(fs.map(f=>f.ebit.ape)),flatEbitMAPE:avg(fs.map(f=>f.ebit.flatAPE)),
  bearBullRevenueCovered:fs.filter(f=>{
    const lower=f.trainBase.revenue*(1+f.assumptions.growth-.03)**f.horizon;
    const upper=f.trainBase.revenue*(1+f.assumptions.growth+.03)**f.horizon;
    return f.revenue.actual>=lower&&f.revenue.actual<=upper;
  }).length,
  fcffN:fs.filter(f=>finite(f.fcff.actualProxy)&&finite(f.fcff.predicted)).length,
  fcffWAPE:(()=>{const s=fs.filter(f=>finite(f.fcff.actualProxy)&&finite(f.fcff.predicted));return s.length?s.reduce((t,f)=>t+Math.abs(f.fcff.predicted-f.fcff.actualProxy),0)/s.reduce((t,f)=>t+Math.abs(f.fcff.actualProxy),0):null;})()
};}
const summary={allOneYear:summarize(folds.filter(f=>f.horizon===1)),allThreeYear:summarize(folds.filter(f=>f.horizon===3)),
  supportedOneYear:summarize(folds.filter(f=>f.horizon===1&&!f.liveModelWouldBlock)),supportedThreeYear:summarize(folds.filter(f=>f.horizon===3&&!f.liveModelWouldBlock)),
  byCompany:SYMBOLS.map(symbol=>({symbol,oneYear:summarize(folds.filter(f=>f.symbol===symbol&&f.horizon===1)),threeYear:summarize(folds.filter(f=>f.symbol===symbol&&f.horizon===3))}))};
const report={asOf:AS_OF,runAt:new Date().toISOString(),modelSha256:hash,modelVersion:'0.1.0',symbols:SYMBOLS,live,summary,folds,exceptions,
  limitations:['This is not a share-price/total-return forecasting backtest.','The historical test covers fiscal-year operating forecasts, not the live next-twelve-month fiscal-stub convention.',
    'The forecast is issued at the first annual filing date; part of the next fiscal year has already elapsed then. Only subsequent filings are hidden.',
    'The five companies were chosen now and are surviving mega-caps. This is a diagnostic sample with selection/survivorship bias.',
    'Origins and horizons overlap. Error observations are not independent.',
    'Historical cash-flow comparison uses a fixed-tax, broad-NWC FCFF proxy and carries normalization gaps; no audited FCF accuracy claim.',
    'Original observations available by each filing cutoff are selected from the current SEC facts archive. A fully immutable point-in-time archive is still needed.']};
await writeFile(new URL('sanity-check.json',output),JSON.stringify(report,null,2)+'\n');
const csv=[['symbol','origin_end','issued','target_end','horizon','model_revenue','actual_revenue','revenue_ape','flat_revenue_ape','last_growth_revenue_ape','model_ebit','actual_ebit','ebit_ape','would_block'],
  ...folds.map(f=>[f.symbol,f.originEnd,f.forecastIssued,f.targetEnd,f.horizon,f.revenue.predicted,f.revenue.actual,f.revenue.ape,f.revenue.flatAPE,f.revenue.lastGrowthAPE,f.ebit.predicted,f.ebit.actual,f.ebit.ape,f.liveModelWouldBlock])];
await writeFile(new URL('backtest.csv',output),csv.map(row=>row.map(x=>x??'').join(',')).join('\n')+'\n');
console.log(JSON.stringify({summary,exceptions},null,2));
