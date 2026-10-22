// Pure valuation mathematics. Money and shares are in millions; prices in USD.
import {buildForecast} from './forecast.js';
import {operatingForecast} from './prediction.js';
export const MODEL_VERSION = '0.5.0';
// Research evidence (LLM reports, issued vintages) is keyed separately from valuation
// arithmetic: v0.5 changed extraction and discounting, not the research contract, so
// validated 0.4.0 research remains reusable.
export const RESEARCH_COMPAT_VERSION = '0.4.0';
export const RATINGS_SOURCE = 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html';
// January 2026, large non-financial firms. Lower bounds inclusive, descending.
export const RATINGS = [
  [8.5, 'AAA', .004], [6.5, 'AA', .0055], [5.5, 'A+', .007],
  [4.25, 'A', .0078], [3, 'A−', .0089], [2.5, 'BBB', .0111],
  [2.25, 'BB+', .0138], [2, 'BB', .0184], [1.75, 'B+', .0275],
  [1.5, 'B', .0321], [1.25, 'B−', .0509], [.8, 'CCC', .0885],
  [.65, 'CC', .1261], [.2, 'C', .16], [-Infinity, 'D', .19]
].map(([min, rating, spread]) => ({min, rating, spread}));

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function median(xs) {
  const s = xs.filter(Number.isFinite).sort((a,b) => a-b);
  return s.length ? (s[Math.floor((s.length-1)/2)] + s[Math.ceil((s.length-1)/2)])/2 : null;
}
export const ratingFor = icr => RATINGS.find(r => icr >= r.min) || RATINGS.at(-1);
export function betaRegression(stock, market) {
  // Inputs: aligned, total-return monthly returns, never price levels.
  const n = stock.length;
  if (n !== market.length || n < 36 || !stock.every(Number.isFinite) || !market.every(Number.isFinite)) return null;
  const xm = market.reduce((a,b)=>a+b,0)/n, ym = stock.reduce((a,b)=>a+b,0)/n;
  const xx = market.reduce((a,x)=>a+(x-xm)**2,0);
  if (xx <= 1e-12) return null;
  const xy = market.reduce((a,x,i)=>a+(x-xm)*(stock[i]-ym),0);
  const beta = xy/xx, alpha = ym-beta*xm;
  const sse = stock.reduce((a,y,i)=>a+(y-alpha-beta*market[i])**2,0);
  const yy = stock.reduce((a,y)=>a+(y-ym)**2,0);
  return {beta, alpha, n, r2: yy ? Math.max(0, 1-sse/yy) : 0, standardError: Math.sqrt(sse/(n-2)/xx)};
}
export const unlever = (be, debt, equity, tax) => be / (1+(1-tax)*debt/equity);
// Long-run defaults, each backed by a stated test or convention (see docs/METHODOLOGY.md):
// - growthWeight/growthAnchor: years 2–5 revenue growth = 25% own 5-year CAGR + 75% × 5%.
//   SEC-archive backtest, 137 non-financial issuers, 977 five-year origins: mean |log error|
//   30% vs 40% (bias −5% vs −29%) for the former 0%-fading fallback; 29% vs 44% out of sample.
// - roicRetention/roicCap: ROIC on operating capital (excluding goodwill and acquired
//   intangibles) kept a median 70% of its excess over ~9% after eight years; ~50% ROIC fell
//   to ~35% and 100%+ to ~50%. The perpetuity uses 60% retention and a 40% cap.
// - capex keeps the latest reported ratio: it beat 3- and 5-year medians on next-five-year
//   capex intensity (mean |log error| 26% vs 28–31%, bias −0.5%), including after spikes.
// - blume: regression betas regress toward 1 (Blume 1971); adjusted = 0.67β + 0.33.
// - minPeers: a peer median needs at least three usable peers.
export const LONG_RUN={growthWeight:.25,growthAnchor:.05,growthClamp:[-.25,.6],roicRetention:.6,roicCap:.4,blume:[.67,.33],minPeers:3};
export const adjustBeta=beta=>Number.isFinite(beta)?LONG_RUN.blume[0]*beta+LONG_RUN.blume[1]:null;
export function peerAssetBeta(peers,included,tax) {
  // Market equity below $500M or debt above 5× equity signals a broken share count or a
  // distressed capital structure; neither yields a usable operating beta.
  const usable=peers.filter(p=>(!included||included.includes(p.symbol))&&p.beta&&p.debt!==null&&p.equity>=500&&p.debt<=5*p.equity&&!p.quality?.some(q=>/debt|borrowing|lease/i.test(q)));
  return usable.length>=LONG_RUN.minPeers?{beta:median(usable.map(p=>unlever(adjustBeta(p.beta.beta),p.debt,p.equity,tax))),n:usable.length}:{beta:null,n:usable.length};
}
export function ownAssetBeta(data,tax,price=data.quote?.price) {
  const b=data.base;
  return data.beta&&b.debt!==null&&price>0&&b.shares>0?unlever(adjustBeta(data.beta.beta),b.debt,price*b.shares,tax):null;
}
// Medium-term (years 2–5) revenue growth for the statistical case: shrink the issuer's own
// multi-year CAGR toward a long-run nominal anchor.
export function mediumTermGrowth(history=[]) {
  const rows=history.filter(r=>r.revenue>0);
  for(const span of [5,4,3]) {
    if(rows.length<span+1)continue;
    const first=rows.at(-1-span),last=rows.at(-1),years=(Date.parse(last.end)-Date.parse(first.end))/365.25/864e5;
    if(Math.abs(years-span)>.3)continue;
    const cagr=clamp((last.revenue/first.revenue)**(1/span)-1,...LONG_RUN.growthClamp);
    return {growth:LONG_RUN.growthWeight*cagr+(1-LONG_RUN.growthWeight)*LONG_RUN.growthAnchor,cagr,span};
  }
  return {growth:LONG_RUN.growthAnchor,cagr:null,span:0};
}
// ROIC on operating invested capital excluding goodwill and acquired intangibles: the
// return new investment earns, which is what the stable-state reinvestment rate needs.
export function bookROIC(b,tax) {
  const ic=[b.assets,b.cash,b.currentLiabilities,b.currentFinancing].every(Number.isFinite)?b.assets-b.cash-(b.nonOperatingInvestments??0)-(b.currentLiabilities-b.currentFinancing)-(b.goodwill??0)-(b.intangibles??0):null;
  if(!Number.isFinite(b.ebit)||ic===null)return null;
  return ic>0?b.ebit*(1-tax)/ic:Infinity;
}
export function defaultTerminalROIC(b,tax,costOfCapital) {
  const roic=bookROIC(b,tax);
  if(roic===null)return costOfCapital;
  const target=costOfCapital+LONG_RUN.roicRetention*(Math.min(roic,5)-costOfCapital);
  return clamp(target,costOfCapital-.03,LONG_RUN.roicCap);
}
export const relever = (bu, debtWeight, tax) => bu*(1+(1-tax)*debtWeight/(1-debtWeight));

export function solveDebt(debt, ebit, rf) {
  if (debt === 0) return {cost: rf+.004, spread:.004, rating:'AAA', interest:0, coverage:null, consistent:true};
  // Enumerate rating bands instead of oscillating a discontinuous fixed point.
  const candidates = RATINGS.map(r => {
    const cost=rf+r.spread, interest=debt*cost, coverage=ebit/interest;
    return {...r, cost, interest, coverage, consistent: ratingFor(coverage).rating===r.rating};
  }).filter(r=>r.consistent);
  if (candidates.length) return candidates.at(-1); // conservative if multiple fixed points
  // Rating cliffs may have no fixed point. Return a conservative bound, mark it.
  const conservative=RATINGS.map(r=>({...r,cost:rf+r.spread,interest:debt*(rf+r.spread),coverage:ebit/(debt*(rf+r.spread))}))
    .filter(r=>r.spread>=ratingFor(r.coverage).spread).at(0);
  return {...(conservative || candidates[0] || RATINGS.at(-1)), consistent:false};
}

export function defaults(data) {
  const b=data.base, hist=data.history;
  const research=data.research?.status==='validated'?data.research.report:null;
  const risk=research?.risk,tax=research?.taxRate??.25;
  const fitted=operatingForecast(data);
  const business=research?.forecast?.basis==='analyst_estimate'?research.forecast:null;
  const margins=hist.filter(r=>Number.isFinite(r.ebit)).map(r=>r.ebit/r.revenue);
  const peer=peerAssetBeta(data.peers,null,tax),operatingBeta=peer.beta,own=ownAssetBeta(data,tax);
  const costOfCapital=data.rates.rf+(operatingBeta??own??1)*data.rates.erp;
  const medium=mediumTermGrowth(hist);
  // Cash flows start after the latest filed period; value them as of the quote date.
  const lag=data.quote?.asOf&&b.end?clamp((Date.parse(data.quote.asOf)-Date.parse(b.end))/864e5/365.25,0,.75):0;
  return {
    growth:business?.years[0].growth??fitted.firstGrowth, margin:business?.terminal.margin??fitted.nearMargin, tax:research?.taxRate??.25,
    operatingForecast:fitted,valuationForecast:business,driverForecast:null,
    capex:business?.years[0].capexRatio??fitted.ratios.capex.value, da:business?.years[0].daRatio??fitted.ratios.da.value,
    nwc:business?.years[0].nwcRatio??fitted.ratios.nwc.value, terminalGrowth:business?.terminal.growth??Math.max(0,Math.min(data.rates.terminalGrowth??.025,data.rates.rf-.005)),
    mediumGrowth:business?null:medium.growth,mediumGrowthBasis:medium,
    terminalROIC:business?.terminal.roic??defaultTerminalROIC(b,tax,costOfCapital),
    valuationLag:lag,
    rf:data.rates.rf, erp:data.rates.erp, assetBeta:operatingBeta ?? own,
    betaBasis:operatingBeta!==null ? `Median of ${peer.n} peer unlevered betas (Blume-adjusted)` : `Company regression, Blume-adjusted and unlevered; ${peer.n} usable peers (minimum ${LONG_RUN.minPeers})`,
    stressDrop:risk?.revenueDecline??.1, stressMargin:risk?.stressMargin??Math.min(...margins),
    hScores:(risk?.hFactors||data.hFactors).map(x=>x.score), hReviewed:false,
    observedDebtYield:risk?.observedDebtYield??null,maxDebtEbitda:risk?.maxDebtEbitda??4,
    maturities2y:risk?.maturities2y??null,minimumCash:risk?.minimumCash??null,
    minCoverage:risk?.minCoverage??2.5, marginOfSafety:.25, cashReserve:risk?.minimumCash??0,
    otherClaims:[b.preferred,b.minority,b.pension].filter(Number.isFinite).reduce((s,n)=>s+n,0),
    recapCost:.01, quoteOverride:null, peerIncluded:data.peers.map(p=>p.symbol)
  };
}

export const forecast=buildForecast;

export function dcf(rows, wacc, g, roic, base, a, cost=0) {
  if (!Number.isFinite(wacc) || wacc<=g || roic<=g || wacc<=0) return null;
  // Mid-year cash flows; year 1 starts after the latest filed period, so value at the
  // quote date by removing the elapsed lag. Terminal flows also arrive mid-year.
  const lag=a.valuationLag??0,at=year=>Math.max(0,year-.5-lag);
  const pvFlows=rows.reduce((s,r)=>s+r.fcff/(1+wacc)**at(r.year),0);
  const terminalNopat=rows.at(-1).nopat*(1+g);
  // Growth is paid for: stable reinvestment/NOPAT = g/ROIC. At g=0, maintenance capex=D&A.
  const terminalReinvestment=terminalNopat*g/roic;
  const terminalFCFF=terminalNopat-terminalReinvestment;
  const terminalValue=terminalFCFF/(wacc-g), pvTerminal=terminalValue/(1+wacc)**at(rows.at(-1).year);
  const ev=pvFlows+pvTerminal-cost;
  const excessCash=Math.max(0,base.cash-a.cashReserve);
  const equity=ev+excessCash+(base.nonOperatingInvestments??0)-base.debt-a.otherClaims;
  return {wacc,g,pvFlows,terminalNopat,terminalReinvestment,terminalFCFF,terminalValue,pvTerminal,
    ev,equity,price:Math.max(0,equity/(base.valuationShares??base.shares)),terminalShare:pvTerminal/(pvFlows+pvTerminal),cost};
}

// A conditional reverse DCF is a diagnostic, never an input to model selection.
// Solve only initial revenue growth, holding the displayed margins, investment
// ratios, discount rate, stable ROIC and ten-year fade convention fixed.
export function reverseDCF(base,a,wacc,targetPrice) {
  const bounds=[-.5,1],priceAt=growth=>{
    const rows=forecast(base,{...a,growth,...(Number.isFinite(a.mediumGrowth)?{mediumGrowth:a.mediumGrowth+growth-a.growth}:{})});
    if(rows.some(r=>!Number.isFinite(r.fcff)||r.capex<0))return null;
    const value=dcf(rows,wacc,a.terminalGrowth,a.terminalROIC,base,a)?.price;
    return Number.isFinite(value)?value:null;
  };
  if(!(targetPrice>0)||!Number.isFinite(targetPrice)||!(wacc>a.terminalGrowth)||!(a.terminalROIC>a.terminalGrowth))return {status:'unavailable'};
  const brackets=[],exact=[],prices=[];let previous=null;
  const tolerance=Math.max(1e-8,targetPrice*1e-9);
  for(let i=0;i<=60;i++) {
    const growth=bounds[0]+(bounds[1]-bounds[0])*i/60,price=priceAt(growth);
    if(price===null){previous=null;continue;}
    prices.push(price);const error=price-targetPrice;
    if(Math.abs(error)<=tolerance)exact.push(growth);
    if(previous&&previous.error*error<0&&Math.abs(previous.error)>tolerance&&Math.abs(error)>tolerance)brackets.push([previous.growth,growth]);
    previous={growth,error};
  }
  const common={bounds,targetPrice,wacc,terminalROIC:a.terminalROIC,terminalGrowth:a.terminalGrowth,
    heldFixed:'Margins, capex/D&A/NWC ratios, tax, WACC, equity bridge and ten-year growth/return fade. The initial-growth control is solved; the years 2–5 growth path (researched or statistical) shifts in parallel before the stable-state fade.'};
  if(exact.length+brackets.length!==1)return {...common,status:exact.length+brackets.length?'ambiguous':'unbracketed',priceRange:prices.length?[Math.min(...prices),Math.max(...prices)]:null};
  let growth=exact[0];
  if(brackets.length) {
    let [lo,hi]=brackets[0],errorLo=priceAt(lo)-targetPrice;
    for(let i=0;i<70;i++) {
      const mid=(lo+hi)/2,price=priceAt(mid);if(price===null)return {...common,status:'unavailable'};
      const error=price-targetPrice;
      if(Math.abs(error)<=tolerance){lo=hi=mid;break;}
      if(errorLo*error<=0)hi=mid;else{lo=mid;errorLo=error;}
    }
    growth=(lo+hi)/2;
  }
  return {...common,status:'solved',initialGrowth:growth,matchedPrice:priceAt(growth)};
}

// The discount rate at which this forecast reproduces the market price. A diagnostic of
// what the price implies, never an input.
export function impliedWACC(rows,a,base,price) {
  if(!(price>0)||!rows?.length)return {status:'unavailable'};
  const at=w=>dcf(rows,w,a.terminalGrowth,a.terminalROIC,base,a)?.price;
  let lo=a.terminalGrowth+.0025,hi=.3;
  const pl=at(lo),ph=at(hi);
  if(!Number.isFinite(pl)||!Number.isFinite(ph))return {status:'unavailable'};
  if(price>pl)return {status:'below',wacc:lo};
  if(price<ph)return {status:'above',wacc:hi};
  for(let i=0;i<60;i++){const m=(lo+hi)/2;if(at(m)>price)lo=m;else hi=m;}
  return {status:'solved',wacc:(lo+hi)/2};
}
export function valuationDiagnostics(data,a,r) {
  if(!r.valued||!r.rows?.length)return null;
  const b=data.base,quarters=(data.quarterly||[]).slice(-8);
  const aligned=quarters.length===8&&quarters.at(-1).end===b.end&&quarters.every((q,i)=>q.revenue>0&&(!i||((Date.parse(q.end)-Date.parse(quarters[i-1].end))/864e5>=60&&(Date.parse(q.end)-Date.parse(quarters[i-1].end))/864e5<=120)));
  const sum=xs=>xs.reduce((s,q)=>s+q.revenue,0);
  const reportedGrowth=aligned?sum(quarters.slice(-4))/sum(quarters.slice(0,4))-1:null;
  const method=a.valuationForecast?'business-case':a.operatingForecast?(a.operatingForecast.quarters?.length?a.operatingForecast.quarterly?.fit?.method:a.operatingForecast.annual?.fit?.method):'manual';
  const flatBenchmark=!!a.operatingForecast&&['seasonal','flat'].includes(method)&&Math.abs(a.growth)<1e-9;
  let recentGrowthScenario=null;
  if(Number.isFinite(reportedGrowth)) {
    const scenario={...a,growth:reportedGrowth},rows=forecast(b,scenario);
    if(rows.every(row=>Number.isFinite(row.fcff)&&row.capex>=0))recentGrowthScenario={initialGrowth:reportedGrowth,price:dcf(rows,r.current.wacc,a.terminalGrowth,a.terminalROIC,b,scenario)?.price??null,
      basis:'Illustration only: repeat the observed trailing revenue growth in year one, then use the existing fade. Unvalidated and excluded from default selection.'};
  }
  const cfResidual=Math.max(...r.rows.map(row=>Math.abs(row.fcff-(row.nopat+row.da-row.capex-row.deltaNwc))));
  const lag=a.valuationLag??0,at=year=>Math.max(0,year-.5-lag);
  const independentEV=r.rows.reduce((s,row)=>s+row.fcff/(1+r.current.wacc)**at(row.year),0)+r.valued.terminalFCFF/(r.current.wacc-a.terminalGrowth)/(1+r.current.wacc)**at(r.rows.at(-1).year);
  const bridge=r.valued.ev+Math.max(0,b.cash-a.cashReserve)+(b.nonOperatingInvestments??0)-b.debt-a.otherClaims;
  const shareResidual=Math.abs(r.valued.price-Math.max(0,bridge/(b.valuationShares??b.shares)));
  return {method,flatBenchmark,reportedGrowth,initialGrowth:a.growth,terminalROIC:a.terminalROIC,wacc:r.current.wacc,
    terminalExcessReturn:a.terminalROIC-r.current.wacc,yearOneCapex:r.rows[0].capex,yearTenCapex:r.rows.at(-1).capex,
    yearTenCapexBeforeTransition:r.rows.at(-1).rawCapex,yearTenCapexAdjustment:r.rows.at(-1).transitionAdjustment,
    recentGrowthScenario,reverse:reverseDCF(b,a,r.current.wacc,r.marketPrice),impliedWACC:impliedWACC(r.rows,a,b,r.marketPrice),
    arithmetic:{cashFlowMaxResidual:cfResidual,discountingResidual:Math.abs(independentEV-r.valued.ev),equityBridgeResidual:Math.abs(bridge-r.valued.equity),sharePriceResidual:shareResidual,
      passed:cfResidual<1e-6&&Math.abs(independentEV-r.valued.ev)<1e-6&&Math.abs(bridge-r.valued.equity)<1e-6&&shareResidual<1e-8},
    scope:'Arithmetic checks establish internal consistency only. Near-term operating tests do not validate FCFF, ten-year assumptions or share prices.'};
}

export function analyze(data, a=defaults(data)) {
  const b=data.base, errors=[];
  if(data.modelFamily==='specialized'||data.modelFamily==='unsupported')errors.push('A specialized accounting/valuation adapter is required; company research is available in the Research tab.');
  if(data.research?.status==='validated'&&data.research.report.modelFamily!=='fcff')errors.push('The researched business requires a specialized '+data.research.report.modelFamily+' model; enterprise FCFF is withheld.');
  // Historical D&A is required for EBITDA/debt capacity. A sourced forward D&A
  // path can support FCFF without inventing an undisclosed historical balance.
  const hasHistoricalDA=Number.isFinite(b.da);
  const required=['revenue','ebit','capex','nwc','cash','debt','shares',...(!a.valuationForecast?['da']:[])];
  for(const key of required)
    if(!Number.isFinite(b[key])) errors.push(`Missing required financial input: ${key}.`);
  if(!(b.revenue>0 && b.shares>0) || b.debt<0 || b.cash<0) errors.push('Revenue and shares must be positive; debt and cash cannot be negative.');
  if(Number.isFinite(b.ebit)&&b.ebit<=0) errors.push('Operating losses require a separate turnaround and NOL model. This edition cannot produce a defensible going-concern value for this company.');
  for(const key of ['growth','margin','tax','capex','da','nwc','terminalGrowth','terminalROIC','rf','erp','assetBeta','stressDrop','stressMargin','minCoverage','marginOfSafety','cashReserve','otherClaims','recapCost'])
    if(!Number.isFinite(a[key])) errors.push(`Missing or invalid assumption: ${key}.`);
  if(a.tax<0 || a.tax>.6 || a.growth<=-1 || a.terminalGrowth<0 || a.terminalGrowth>=a.terminalROIC || a.terminalGrowth>=a.rf) errors.push('Require 0 ≤ tax ≤ 60%, growth > −100%, and 0 ≤ terminal g < both ROIC and the nominal risk-free rate.');
  if(a.rf<=0 || a.erp<=0 || a.assetBeta<=0 || a.capex<0 || a.da<0 || a.minCoverage<=0 || a.stressDrop<0 || a.stressDrop>=1 || a.cashReserve<0 || a.recapCost<0 || a.recapCost>1 || a.marginOfSafety<0 || a.marginOfSafety>=1) errors.push('Review rate, beta, reinvestment, stress, reserve, cost, and safety assumptions.');
  if(!Array.isArray(a.hScores) || a.hScores.length!==7 || a.hScores.some(x=>!Number.isFinite(x)||x<1||x>3)) errors.push('All seven h scores must be between 1 and 3.');
  const price=a.quoteOverride ?? data.quote?.price;
  if(!(price>0)) errors.push('A positive, dated market price is required for market capital weights.');
  if(errors.length) return {errors};
  const equity=price*b.shares, capital=equity+b.debt, currentWeight=b.debt/capital;
  const h=a.hScores.reduce((s,n)=>s+n,0)/7;
  const stressEBIT=b.revenue*(1-a.stressDrop)*Math.max(0,a.stressMargin);
  const maxInterest=stressEBIT/h;
  const rows=forecast(b,a);
  if(rows.some(r=>!Number.isFinite(r.fcff)||r.capex<0))return {errors:['The terminal transition implies negative capital expenditure or invalid cash flows. Review working capital, D&A, growth and stable ROIC before valuation.']};
  const currentSynthetic=solveDebt(b.debt,b.ebit,a.rf);
  const observed=a.observedDebtYield;
  const spreadAdjustment=observed?Math.max(0,observed-a.rf-currentSynthetic.spread):0;
  const atWeight=weight=>{
    const debt=capital*weight;
    let credit=solveDebt(debt,b.ebit,a.rf+spreadAdjustment);
    if(weight===currentWeight&&observed&&debt>0){const interest=debt*observed,coverage=b.ebit/interest;credit={...ratingFor(coverage),cost:observed,interest,coverage,consistent:true};}
    const be=relever(a.assetBeta,weight,a.tax), ke=a.rf+be*a.erp;
    // Cap usable tax shields by positive EBIT. Section 163(j)/NOL schedules need analyst review.
    const usableTax=credit.interest>0 ? a.tax*clamp(Math.max(0,b.ebit)/credit.interest,0,1) : a.tax;
    const cost=weight===currentWeight&&observed?observed:credit.cost;
    const wacc=(1-weight)*ke+weight*cost*(1-usableTax);
    const stressedCoverage=credit.interest>0 ? stressEBIT/credit.interest : null;
    const leverage=hasHistoricalDA?debt/(b.ebit+b.da):null;
    const liquidity=a.maturities2y===null||Math.max(0,b.cash-(a.minimumCash??0))+Math.max(0,2*rows[0].fcff)>=a.maturities2y;
    const feasible=hasHistoricalDA&&(debt===0 || (credit.consistent && credit.interest<=maxInterest && credit.coverage>=a.minCoverage && leverage<=(a.maxDebtEbitda??4) && liquidity)) && wacc>a.terminalGrowth;
    return {weight,debt,beta:be,ke,kd:cost,spread:cost-a.rf,rating:credit.rating,
      interest:credit.interest,coverage:credit.coverage,stressedCoverage,wacc,feasible,consistent:credit.consistent,
      taxShieldRate:usableTax,leverage,liquidity,observedYield:weight===currentWeight&&!!observed};
  };
  const current=atWeight(currentWeight);
  const sweep=Array.from({length:81},(_,i)=>atWeight(i/100));
  // Treat grid minimum as a constrained scenario, not a universal economic optimum.
  const optimal=sweep.filter(x=>x.feasible).reduce((best,x)=>!best || x.wacc<best.wacc?x:best,null);
  const valued=dcf(rows,current.wacc,a.terminalGrowth,a.terminalROIC,b,a);
  const zeroRows=forecast(b,{...a,terminalGrowth:0});
  const zero=dcf(zeroRows,current.wacc,0,a.terminalROIC,b,a);
  const adjustment=optimal ? Math.abs(optimal.debt-b.debt) : 0;
  const recapCosts=adjustment*a.recapCost;
  const optimized=optimal ? dcf(rows,optimal.wacc,a.terminalGrowth,a.terminalROIC,b,a,recapCosts) : null;
  const optimizedZero=optimal ? dcf(zeroRows,optimal.wacc,0,a.terminalROIC,b,a,recapCosts) : null;
  // An illustrative recap executed entirely at the observed market price.
  // Fees reduce the cash available for repurchase (or increase issuance needed).
  const netRecapProceeds=optimal ? optimal.debt-b.debt-recapCosts : 0;
  const valuationShares=b.valuationShares??b.shares;
  const postShares=valuationShares-netRecapProceeds/price;
  const postEquity=optimized ? optimized.ev+recapCosts+Math.max(0,b.cash-a.cashReserve)+(b.nonOperatingInvestments??0)-optimal.debt-a.otherClaims : null;
  const postRecap=optimized && postShares>0 && postEquity>0 ? {executionPrice:price,shares:postShares,equity:postEquity,price:postEquity/postShares,
    sharesRetired:valuationShares-postShares,netProceeds:netRecapProceeds} : null;
  const marginShock=a.valuationForecast?Math.min(.03,Math.max(.005,a.margin*.15)):.03;
  const cases=[
    {name:'Bear',growth:a.growth-.03,margin:Math.max(0,a.margin-marginShock),terminalGrowth:Math.max(0,a.terminalGrowth-.01)},
    {name:'Base',growth:a.growth,margin:a.margin,terminalGrowth:a.terminalGrowth},
    {name:'Bull',growth:a.growth+.03,margin:Math.min(.8,a.margin+marginShock),terminalGrowth:Math.min(a.terminalGrowth+.005,a.rf-.005,a.terminalROIC-.005)}
  ].map(c=>{
    const d=a.driverForecast,shift=c.growth-a.growth,marginShift=c.margin-a.margin;
    const driverForecast=d?{...d,segments:d.segments.map(s=>({...s,volumeGrowth:s.volumeGrowth.map(g=>Math.max(-.95,g+shift))})),margins:d.margins.map(m=>m+marginShift)}:null;
    const operatingForecast=a.operatingForecast?{...a.operatingForecast,nearMargin:a.operatingForecast.nearMargin+marginShift}:null;
    const mediumGrowth=Number.isFinite(a.mediumGrowth)?a.mediumGrowth+shift:a.mediumGrowth;
    return {...c,...dcf(forecast(b,{...a,...c,driverForecast,operatingForecast,mediumGrowth}),current.wacc,c.terminalGrowth,a.terminalROIC,b,a)};
  });
  const sensitivity=Array.from({length:5},(_,i)=>{
    const wacc=current.wacc+(i-2)*.01;
    return {wacc,values:Array.from({length:5},(_,j)=>{
      const g=Math.max(0,a.terminalGrowth+(j-2)*.005);
      return {g,price:dcf(forecast(b,{...a,terminalGrowth:g}),wacc,g,a.terminalROIC,b,a)?.price ?? null};
    })};
  });
  const buyBelow=valued ? valued.price*(1-a.marginOfSafety) : null;
  const quoteAge=data.quote?.asOf ? (Date.now()-Date.parse(data.quote.asOf))/864e5 : Infinity;
  const stale=quoteAge>5 || (Date.now()-Date.parse(b.end))/864e5>200;
  const selectedUsable=data.peers.filter(p=>a.peerIncluded.includes(p.symbol)&&p.beta&&p.debt!==null&&p.equity>0).length;
  const incomplete=data.quality.some(q=>q.severity==='critical') || !current.consistent || selectedUsable<3 || !a.hReviewed || (data.version&&data.research?.status!=='validated') || rows.some(r=>r.capex<0);
  const status=!valued || stale || incomplete || a.quoteOverride!==null ? 'Review required' : price<=buyBelow ? 'Below safety threshold' : price<valued.price ? 'Below modeled value' : 'Above modeled value';
  const result={errors:[],rows,current,optimal,sweep,valued,zero,optimized,optimizedZero,cases,sensitivity,h,stressEBIT,maxInterest,
    equity,capital,currentWeight,marketPrice:price,buyBelow,status,stale,incomplete,recapCosts,adjustment,postRecap,
    capitalStructureUnavailable:hasHistoricalDA?null:'Historical D&A is not fully disclosed. EBITDA and optimal capital structure are withheld; the DCF uses the explicit researched forward D&A path.',
    upside:valued?valued.price/price-1:null,version:MODEL_VERSION};
  result.diagnostics=valuationDiagnostics(data,a,result);
  return result;
}
