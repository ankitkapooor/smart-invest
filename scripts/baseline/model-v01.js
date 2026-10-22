// Pure valuation mathematics. Money and shares are in millions; prices in USD.
export const MODEL_VERSION = '0.1.0';
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
  const first=hist.at(-4) || hist[0], last=hist.at(-1);
  const years=(Date.parse(last.end)-Date.parse(first.end))/(365.25*864e5);
  const cagr=years>0 && first.revenue>0 ? (last.revenue/first.revenue)**(1/years)-1 : 0;
  const margins=hist.filter(r=>Number.isFinite(r.ebit)).map(r=>r.ebit/r.revenue);
  const operatingBeta=median(data.peers.filter(p=>p.beta && p.debt!==null && p.equity>0)
    .map(p=>unlever(p.beta.beta,p.debt,p.equity,.25)));
  const own=data.beta && b.debt!==null && data.quote?.price>0 && b.shares>0
    ? unlever(data.beta.beta,b.debt,data.quote.price*b.shares,.25) : null;
  return {
    growth:clamp(cagr,-.1,.2), margin:median(margins), tax:.25,
    capex:median(hist.filter(r=>Number.isFinite(r.capex)).map(r=>r.capex/r.revenue)), da:median(hist.filter(r=>Number.isFinite(r.da)).map(r=>r.da/r.revenue)),
    nwc:b.nwc/b.revenue, terminalGrowth:.025, terminalROIC:.12,
    rf:data.rates.rf, erp:data.rates.erp, assetBeta:operatingBeta ?? own,
    betaBasis:operatingBeta!==null ? 'Median of available peer unlevered betas' : 'Company regression, unlevered; peer beta unavailable',
    stressDrop:.1, stressMargin:Math.min(...margins),
    hScores:data.hFactors.map(x=>x.score), hReviewed:false,
    minCoverage:2.5, marginOfSafety:.25, cashReserve:0, otherClaims:0,
    recapCost:.01, quoteOverride:null, peerIncluded:data.peers.map(p=>p.symbol)
  };
}

export function forecast(base, a) {
  const rows=[]; let revenue=base.revenue, nwc=base.nwc;
  for(let year=1;year<=10;year++) {
    const fade=clamp((year-5)/5,0,1);
    const growth=a.growth+(a.terminalGrowth-a.growth)*fade;
    const margin=base.ebit/base.revenue+(a.margin-base.ebit/base.revenue)*Math.min(year/5,1);
    revenue*=1+growth;
    const ebit=revenue*margin, cashTax=Math.max(ebit,0)*a.tax, nopat=ebit-cashTax;
    const da=revenue*a.da, capex=revenue*a.capex, nextNwc=revenue*a.nwc, deltaNwc=nextNwc-nwc;
    nwc=nextNwc;
    rows.push({year,growth,margin,revenue,ebit,cashTax,nopat,da,capex,nwc,deltaNwc,fcff:nopat+da-capex-deltaNwc});
  }
  return rows;
}

export function dcf(rows, wacc, g, roic, base, a, cost=0) {
  if (!Number.isFinite(wacc) || wacc<=g || roic<=g || wacc<=0) return null;
  const pvFlows=rows.reduce((s,r)=>s+r.fcff/(1+wacc)**r.year,0);
  const terminalNopat=rows.at(-1).nopat*(1+g);
  // Growth is paid for: stable reinvestment/NOPAT = g/ROIC. At g=0, maintenance capex=D&A.
  const terminalReinvestment=terminalNopat*g/roic;
  const terminalFCFF=terminalNopat-terminalReinvestment;
  const terminalValue=terminalFCFF/(wacc-g), pvTerminal=terminalValue/(1+wacc)**10;
  const ev=pvFlows+pvTerminal-cost;
  const excessCash=Math.max(0,base.cash-a.cashReserve);
  const equity=ev+excessCash-base.debt-a.otherClaims;
  return {wacc,g,pvFlows,terminalNopat,terminalReinvestment,terminalFCFF,terminalValue,pvTerminal,
    ev,equity,price:Math.max(0,equity/base.shares),terminalShare:pvTerminal/(pvFlows+pvTerminal),cost};
}

export function analyze(data, a=defaults(data)) {
  const b=data.base, errors=[];
  for(const key of ['revenue','ebit','da','capex','nwc','cash','debt','shares'])
    if(!Number.isFinite(b[key])) errors.push(`Missing required financial input: ${key}.`);
  if(!(b.revenue>0 && b.shares>0) || b.debt<0 || b.cash<0) errors.push('Revenue and shares must be positive; debt and cash cannot be negative.');
  if(b.ebit<=0) errors.push('Operating losses require a separate turnaround and NOL model. This edition cannot produce a defensible going-concern value for this company.');
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
  const atWeight=weight=>{
    const debt=capital*weight, credit=solveDebt(debt,b.ebit,a.rf);
    const be=relever(a.assetBeta,weight,a.tax), ke=a.rf+be*a.erp;
    // Cap usable tax shields by positive EBIT. Section 163(j)/NOL schedules need analyst review.
    const usableTax=credit.interest>0 ? a.tax*clamp(Math.max(0,b.ebit)/credit.interest,0,1) : a.tax;
    const wacc=(1-weight)*ke+weight*credit.cost*(1-usableTax);
    const stressedCoverage=credit.interest>0 ? stressEBIT/credit.interest : null;
    const feasible=(debt===0 || (credit.consistent && credit.interest<=maxInterest && credit.coverage>=a.minCoverage)) && wacc>a.terminalGrowth;
    return {weight,debt,beta:be,ke,kd:credit.cost,spread:credit.spread,rating:credit.rating,
      interest:credit.interest,coverage:credit.coverage,stressedCoverage,wacc,feasible,consistent:credit.consistent,
      taxShieldRate:usableTax};
  };
  const current=atWeight(currentWeight);
  const sweep=Array.from({length:81},(_,i)=>atWeight(i/100));
  // Treat grid minimum as a constrained scenario, not a universal economic optimum.
  const optimal=sweep.filter(x=>x.feasible).reduce((best,x)=>!best || x.wacc<best.wacc?x:best,null);
  const valued=dcf(rows,current.wacc,a.terminalGrowth,a.terminalROIC,b,a);
  const zero=dcf(rows,current.wacc,0,a.terminalROIC,b,a);
  const adjustment=optimal ? Math.abs(optimal.debt-b.debt) : 0;
  const recapCosts=adjustment*a.recapCost;
  const optimized=optimal ? dcf(rows,optimal.wacc,a.terminalGrowth,a.terminalROIC,b,a,recapCosts) : null;
  const optimizedZero=optimal ? dcf(rows,optimal.wacc,0,a.terminalROIC,b,a,recapCosts) : null;
  // An illustrative recap executed entirely at the observed market price.
  // Fees reduce the cash available for repurchase (or increase issuance needed).
  const netRecapProceeds=optimal ? optimal.debt-b.debt-recapCosts : 0;
  const postShares=b.shares-netRecapProceeds/price;
  const postEquity=optimized ? optimized.ev+recapCosts+Math.max(0,b.cash-a.cashReserve)-optimal.debt-a.otherClaims : null;
  const postRecap=optimized && postShares>0 && postEquity>0 ? {executionPrice:price,shares:postShares,equity:postEquity,price:postEquity/postShares,
    sharesRetired:b.shares-postShares,netProceeds:netRecapProceeds} : null;
  const cases=[
    {name:'Bear',growth:a.growth-.03,margin:a.margin-.03,terminalGrowth:Math.max(0,a.terminalGrowth-.01)},
    {name:'Base',growth:a.growth,margin:a.margin,terminalGrowth:a.terminalGrowth},
    {name:'Bull',growth:a.growth+.03,margin:a.margin+.03,terminalGrowth:Math.min(a.terminalGrowth+.005,a.rf-.005,a.terminalROIC-.005)}
  ].map(c=>({...c,...dcf(forecast(b,{...a,...c}),current.wacc,c.terminalGrowth,a.terminalROIC,b,a)}));
  const sensitivity=Array.from({length:5},(_,i)=>{
    const wacc=current.wacc+(i-2)*.01;
    return {wacc,values:Array.from({length:5},(_,j)=>{
      const g=Math.max(0,a.terminalGrowth+(j-2)*.005);
      return {g,price:dcf(rows,wacc,g,a.terminalROIC,b,a)?.price ?? null};
    })};
  });
  const buyBelow=valued ? valued.price*(1-a.marginOfSafety) : null;
  const quoteAge=data.quote?.asOf ? (Date.now()-Date.parse(data.quote.asOf))/864e5 : Infinity;
  const stale=quoteAge>5 || (Date.now()-Date.parse(b.end))/864e5>200;
  const selectedUsable=data.peers.filter(p=>a.peerIncluded.includes(p.symbol)&&p.beta&&p.debt!==null&&p.equity>0).length;
  const incomplete=data.quality.some(q=>q.severity==='critical') || !current.consistent || selectedUsable<3;
  const status=!valued || stale || incomplete || a.quoteOverride!==null ? 'Review required' : price<=buyBelow ? 'Below safety threshold' : price<valued.price ? 'Below modeled value' : 'Above modeled value';
  return {errors:[],rows,current,optimal,sweep,valued,zero,optimized,optimizedZero,cases,sensitivity,h,stressEBIT,maxInterest,
    equity,capital,currentWeight,marketPrice:price,buyBelow,status,stale,incomplete,recapCosts,adjustment,postRecap,
    upside:valued?valued.price/price-1:null,version:MODEL_VERSION};
}
