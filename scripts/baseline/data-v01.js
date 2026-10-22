import {betaRegression, MODEL_VERSION} from './model-v01.js';

const SEC='https://data.sec.gov';
const SEC_TICKERS='https://www.sec.gov/files/company_tickers.json';
const ERP_URL='https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm';
const memory=new Map(), inFlight=new Map();
let secQueue=Promise.resolve();
export class DataError extends Error {
  constructor(message,status=422,details=[]) {super(message);this.status=status;this.details=details;}
}

export async function cachedFetch(url, env={}, ttl=3600, type='json') {
  const key=url+'|'+type, saved=memory.get(key);
  if(saved && saved.expires>Date.now()) return saved.value;
  if(inFlight.has(key)) return inFlight.get(key);
  const task=(async()=>{
    const cache=globalThis.caches?.default;
    const cacheKey=new Request(url,{headers:{'Accept':type==='json'?'application/json':'text/plain'}});
    if(cache) {
      const hit=await cache.match(cacheKey);
      if(hit) {const value=type==='json'?await hit.json():await hit.text();remember(key,value,ttl);return value;}
    }
    if(new URL(url).hostname.endsWith('sec.gov')) {
      const turn=secQueue.then(()=>new Promise(r=>setTimeout(r,180)));
      secQueue=turn.catch(()=>{}); await turn;
    }
    let response;
    try {response=await fetch(url,{headers:{'User-Agent':env.SEC_USER_AGENT || 'ValueLens research (https://ankitkapoor.me)',Accept:type==='json'?'application/json':'text/html,text/plain,*/*'},signal:AbortSignal.timeout(18000)});}
    catch {throw new DataError(`Could not reach ${new URL(url).hostname}. Try again shortly.`,502);}
    if(!response.ok) throw new DataError(`${new URL(url).hostname} returned HTTP ${response.status}.`,502);
    const body=await response.text();
    let value;
    try {value=type==='json'?JSON.parse(body):body;} catch {throw new DataError(`Unexpected data from ${new URL(url).hostname}.`,502);}
    if(cache && body.length<20_000_000) await cache.put(cacheKey,new Response(body,{headers:{'Content-Type':type==='json'?'application/json':'text/plain','Cache-Control':`public,max-age=${ttl}`}})).catch(()=>{});
    remember(key,value,ttl); return value;
  })();
  inFlight.set(key,task);
  try{return await task;}finally{inFlight.delete(key);}
}
function remember(key,value,ttl) {
  // Full company-facts objects can expand far beyond their JSON size in memory.
  // Keep them in the edge response cache, not a growing isolate heap.
  if(key.includes('/companyfacts/') || (typeof value==='string' && value.length>1_000_000)) return;
  if(memory.size>40) memory.delete(memory.keys().next().value);
  memory.set(key,{value,expires:Date.now()+ttl*1000});
}

export async function searchCompanies(query,env) {
  if(!query || query.length>100) return [];
  const catalog=Object.values(await cachedFetch(SEC_TICKERS,env,86400));
  const q=query.toUpperCase().trim();
  const alias=({GOOGLE:'GOOGL',FACEBOOK:'META',BERKSHIRE:'BRK-B'})[q];
  const normalize=name=>name.toUpperCase().replace(/[,\s]+(INC\.?|CORP\.?|CORPORATION|LTD\.?)$/,'').trim();
  const rank=c=>c.ticker===q?0:c.ticker===alias?1:normalize(c.title)===q?2:c.ticker.startsWith(q)?3:c.title.toUpperCase().startsWith(q)?4:5;
  return catalog.filter(c=>c.ticker===q || c.ticker===alias || c.ticker.startsWith(q) || c.title.toUpperCase().includes(q))
    .sort((a,b)=>rank(a)-rank(b)||a.title.localeCompare(b.title)).slice(0,12)
    .map(c=>({symbol:c.ticker,name:c.title,cik:c.cik_str}));
}

const TAGS={
  revenue:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueGoodsNet'],
  ebit:['OperatingIncomeLoss'],
  cfo:['NetCashProvidedByUsedInOperatingActivities'],
  da:['DepreciationDepletionAndAmortization','DepreciationDepletionAndAmortizationPropertyPlantAndEquipment','DepreciationAmortizationAndAccretionNet','Depreciation','DepreciationAndAmortization'],
  capex:['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets'],
  interest:['InterestExpenseNonOperating','InterestAndDebtExpense','InterestExpense','InterestExpenseDebt'],
  cash:['CashAndCashEquivalentsAtCarryingValue'],
  shortInvest:['ShortTermInvestments','MarketableSecuritiesCurrent','AvailableForSaleSecuritiesCurrent'],
  currentAssets:['AssetsCurrent'], currentLiabilities:['LiabilitiesCurrent'],
  longDebt:['LongTermDebtNoncurrent','LongTermDebt','LongTermDebtAndFinanceLeaseObligationsNoncurrent'],
  currentDebt:['LongTermDebtCurrent','LongTermDebtAndFinanceLeaseObligationsCurrent'],
  shortDebt:['ShortTermBorrowings','CommercialPaper','ShortTermDebtCurrent'],
  shares:['CommonStockSharesOutstanding'], dilutedShares:['WeightedAverageNumberOfDilutedSharesOutstanding']
};
const forms=new Set(['10-K','10-K/A','10-Q','10-Q/A']);
function factUrl(cik,f) {return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accn.replaceAll('-','')}/`;}
function record(f,tag,cik,unit='USD') {
  return {value:unit==='shares'?f.val/1e6:f.val/1e6,raw:f.val,unit,tag,start:f.start||null,end:f.end,filed:f.filed,form:f.form,accession:f.accn,url:factUrl(cik,f)};
}
function durationDays(f) {return (Date.parse(f.end)-Date.parse(f.start))/864e5;}
export function pickFact(facts,names,{end,annual=false,start,unit='USD',cik,asOf=new Date().toISOString().slice(0,10)}={}) {
  for(const tag of names) {
    const fs=facts?.[tag]?.units?.[unit] || [];
    const matched=fs.filter(f=>forms.has(f.form) && f.filed<=asOf && f.end===end && Number.isFinite(f.val) &&
      (annual ? f.start && durationDays(f)>=330 && durationDays(f)<=380 : start ? f.start===start : !f.start));
    matched.sort((a,b)=>b.filed.localeCompare(a.filed) || b.accn.localeCompare(a.accn));
    if(matched.length) return record(matched[0],tag,cik,unit);
  }
  return null;
}
function metric(facts,key,options) {return pickFact(facts,TAGS[key],options);}

export function financials(raw,submission,asOf=new Date().toISOString().slice(0,10)) {
  const facts=raw.facts?.['us-gaap'];
  if(!facts) throw new DataError('This filer does not supply the required US-GAAP facts. IFRS and foreign filings require a separate normalization model.');
  const cik=raw.cik;
  const revenueFacts=TAGS.revenue.flatMap(tag=>facts[tag]?.units?.USD || []);
  const ends=[...new Set(revenueFacts.filter(f=>/^10-K/.test(f.form) && f.start && durationDays(f)>=330 && durationDays(f)<=380 && f.filed<=asOf).map(f=>f.end))].sort().slice(-6);
  const history=ends.map(end=>{
    const provenance={},row={end,year:Number(end.slice(0,4))};
    for(const key of ['revenue','ebit','da','capex','cfo','interest']) {
      const v=metric(facts,key,{end,annual:true,cik,asOf});
      row[key]=v?.value ?? null; if(v) provenance[key]=[v];
    }
    return {...row,provenance};
  }).filter(r=>r.revenue!==null);
  if(history.length<3) throw new DataError('At least three full fiscal years of comparable revenue are required.');
  const annual=history.at(-1);
  const q=revenueFacts.filter(f=>/^10-Q/.test(f.form) && f.start && f.end>annual.end && f.filed<=asOf && durationDays(f)>55 && durationDays(f)<310)
    .sort((a,b)=>b.end.localeCompare(a.end) || a.start.localeCompare(b.start))[0];
  const base={...annual,provenance:{...annual.provenance},basis:'Latest full fiscal year'};
  if(q) {
    base.end=q.end; base.basis='Trailing twelve months (FY + current YTD − prior YTD)';
    for(const key of ['revenue','ebit','da','capex','cfo','interest']) {
      const current=metric(facts,key,{end:q.end,start:q.start,cik,asOf});
      const priorCandidates=TAGS[key].flatMap(tag=>(facts[tag]?.units?.USD||[]).map(f=>({...f,tag})))
        .filter(f=>forms.has(f.form) && f.filed<=asOf && f.start && Math.abs((Date.parse(q.end)-Date.parse(f.end))/864e5-365)<10 && Math.abs(durationDays(f)-durationDays(q))<10)
        .sort((a,b)=>b.filed.localeCompare(a.filed));
      const prior=priorCandidates[0] ? record(priorCandidates[0],priorCandidates[0].tag,cik) : null;
      if(current && prior && annual[key]!==null) {
        base[key]=annual[key]+current.value-prior.value;
        base.provenance[key]=[...annual.provenance[key],current,prior];
      } else {base[key]=null; delete base.provenance[key];}
    }
  }
  const quality=[];
  for(const key of ['cash','shortInvest','currentAssets','currentLiabilities','longDebt','currentDebt','shortDebt','shares']) {
    const v=metric(facts,key,{end:base.end,cik,unit:key==='shares'?'shares':'USD',asOf});
    base[key]=v?.value ?? null; if(v) base.provenance[key]=[v];
  }
  // Cash-flow statements may omit a metric because a company tags it in its own namespace.
  for(const key of ['revenue','ebit','da','capex','cfo']) if(base[key]===null) quality.push({severity:'critical',text:`${key.toUpperCase()} could not be normalized for ${base.end}; no zero substituted.`});
  for(const key of ['shortInvest','currentDebt','shortDebt']) if(base[key]===null) {
    // Absence is an explicit assumption with an audit warning, never a reported zero.
    base[key]=0;
    quality.push({severity:'critical',text:`No standard ${key} tag for ${base.end}. Assumed zero in the bridge; verify the debt/investment footnote before relying on this model.`});
  }
  if(base.longDebt===null) quality.push({severity:'critical',text:'No long-term debt principal tag; enterprise-to-equity bridge unavailable.'});
  base.debt=base.longDebt===null?null:base.longDebt+base.currentDebt+base.shortDebt;
  if(base.shares===null) {
    const fs=(raw.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares||[])
      .filter(f=>f.end<=base.end && f.filed<=asOf).sort((a,b)=>b.end.localeCompare(a.end));
    if(fs[0]) {base.shares=fs[0].val/1e6; base.provenance.shares=[record(fs[0],'dei:EntityCommonStockSharesOutstanding',cik,'shares')];}
  }
  const weighted=metric(facts,'dilutedShares',{end:annual.end,annual:true,cik,unit:'shares',asOf});
  base.dilutedShares=weighted?.value ?? null;
  // Treat short-term securities as non-operating, and keep current financing out of NWC.
  base.cash=base.cash===null?null:base.cash+base.shortInvest;
  base.nwc=[base.currentAssets,base.currentLiabilities,base.cash].every(Number.isFinite)
    ? base.currentAssets-base.cash-base.currentLiabilities+base.currentDebt+base.shortDebt : null;
  quality.push({severity:'review',text:'Debt uses book principal as a market-value proxy. Operating leases remain operating expenses; finance-lease obligations and debt maturity must be reviewed.'});
  quality.push({severity:'review',text:'Working capital is a broad non-cash current-assets less non-debt current-liabilities proxy; taxes, restricted cash and financing items may need reclassification.'});
  quality.push({severity:'review',text:'Price uses reported period-end common shares, not a treasury-stock dilution schedule. Review options, RSUs, convertibles, preferred equity, minority interests and non-current investments.'});
  if((Date.parse(asOf)-Date.parse(base.end))/864e5>200) quality.push({severity:'critical',text:'Financial base is over 200 days old.'});
  return {base,history,quality};
}

export function monthlyReturns(chart,now=new Date()) {
  const result=chart?.chart?.result?.[0]; if(!result) return new Map();
  // Only dividend/split-adjusted series; never silently fall back to unadjusted closes.
  const close=result.indicators?.adjclose?.[0]?.adjclose;
  if(!close) return new Map();
  const current=now.toISOString().slice(0,7);
  const points=result.timestamp.map((t,i)=>({month:new Date(t*1000).toISOString().slice(0,7),price:close[i]}))
    .filter(p=>p.month<current && Number.isFinite(p.price) && p.price>0);
  const returns=new Map();
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];
    const [ay,am]=a.month.split('-').map(Number),[by,bm]=b.month.split('-').map(Number);
    if((by-ay)*12+bm-am===1) returns.set(b.month,b.price/a.price-1);
  }
  return returns;
}
function regression(stock,market) {
  const months=[...stock.keys()].filter(k=>market.has(k)).sort();
  const value=betaRegression(months.map(k=>stock.get(k)),months.map(k=>market.get(k)));
  return value ? {...value,from:months[0],to:months.at(-1),benchmark:'SPY adjusted monthly returns'} : null;
}
function quoteFrom(chart) {
  const m=chart?.chart?.result?.[0]?.meta;
  if(!m || !Number.isFinite(m.regularMarketPrice) || m.currency!=='USD') return null;
  return {price:m.regularMarketPrice,currency:m.currency,asOf:new Date(m.regularMarketTime*1000).toISOString(),exchange:m.exchangeName,
    source:'Yahoo Finance chart (unofficial; delayed availability)',url:`https://finance.yahoo.com/quote/${encodeURIComponent(m.symbol)}/`};
}
const chartUrl=t=>`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.replace('.','-'))}?range=5y&interval=1mo`;

// Human-readable candidate screens; these are starting universes, not asserted pure-play peers.
const UNIVERSES=[
  {name:'Semiconductors',sic:[3674],symbols:['NVDA','AMD','AVGO','QCOM','INTC','TXN']},
  {name:'Enterprise software',sic:[7370,7371,7372,7373,7374],symbols:['MSFT','ORCL','ADBE','CRM','INTU']},
  {name:'Devices and systems',sic:[3570,3571,3572,3576,3577,3661,3663],symbols:['AAPL','DELL','HPQ','CSCO','HPE']},
  {name:'Digital platforms',sic:[7375,7389],symbols:['GOOGL','META','PINS','RDDT','SNAP']},
  {name:'Retail',sic:[5311,5331,5399,5411,5961,5990],symbols:['AMZN','WMT','COST','TGT','KR']},
  {name:'Consumer staples',sic:[2000,2080,2082,2086,2090,2840,2844],symbols:['PG','CL','KMB','KO','PEP']},
  {name:'Restaurants',sic:[5810,5812],symbols:['MCD','SBUX','YUM','CMG','DRI']},
  {name:'Pharmaceuticals',sic:[2833,2834,2835,2836],symbols:['JNJ','MRK','PFE','LLY','ABBV']},
  {name:'Medical technology',sic:[3841,3842,3845,3851],symbols:['ABT','MDT','BSX','SYK','ISRG']},
  {name:'Automotive',sic:[3711,3714,3716],symbols:['TSLA','GM','F','RIVN','LCID']},
  {name:'Oil and gas',sic:[1311,1381,2911],symbols:['XOM','CVX','COP','EOG','OXY']},
  {name:'Utilities',sic:[4911,4931,4923,4924],symbols:['NEE','DUK','SO','AEP','EXC']},
  {name:'Industrials',sic:[3510,3530,3531,3560,3600,3721,3724,3812],symbols:['CAT','DE','HON','GE','RTX']},
  {name:'Apparel',sic:[2300,2320,3021,3140,5651,5661],symbols:['NKE','LULU','DECK','CROX','VFC']},
  {name:'Telecommunications',sic:[4812,4813,4899],symbols:['T','VZ','TMUS','CHTR','CMCSA']},
  {name:'Logistics',sic:[4210,4213,4512,4513,4522],symbols:['UPS','FDX','DAL','UAL','AAL']}
];
function candidatePeers(symbol,sic,custom) {
  if(custom?.length) return {name:'Analyst-selected candidates',symbols:custom.filter(t=>t!==symbol).slice(0,4)};
  const universe=UNIVERSES.find(g=>g.symbols.includes(symbol)) || UNIVERSES.find(g=>g.sic.includes(Number(sic)));
  return universe ? {...universe,symbols:universe.symbols.filter(t=>t!==symbol).slice(0,4)} : {name:'No mapped peer universe',symbols:[]};
}

export async function marketRates(env) {
  let rf=null,rfDate=null,rfSource=null,erp=.042,erpDate='2026-10-01',erpMethod='Dated reference: adjusted-payout implied ERP';
  let treasuryReference=.0529,notes=[];
  try {
    const html=await cachedFetch(ERP_URL,env,21600,'text');
    const plain=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').replace(/(\d)\.\s+(\d)/g,'$1.$2');
    const match=plain.match(/Implied ERP on\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s*=\s*([\d.]+)\s*%[^]*?US treasury rate of\s*([\d.]+)\s*%/i);
    if(match) {
      const date=new Date(match[1]);
      if(Number.isFinite(date.getTime()) && date<=new Date()) {erp=Number(match[2])/100;erpDate=date.toISOString().slice(0,10);treasuryReference=Number(match[3])/100;erpMethod='Damodaran implied ERP, trailing 12-month adjusted payout';}
    } else notes.push('Implied ERP parser unavailable; using the labeled October 2026 reference.');
  } catch {notes.push('Implied ERP feed unavailable; using the labeled October 2026 reference.');}
  try {
    const start=new Date(Date.now()-35*864e5).toISOString().slice(0,10);
    const csv=await cachedFetch(`https://fred.stlouisfed.org/graph/graph.csv?id=DGS10&cosd=${start}`,env,21600,'text');
    const rows=csv.trim().split('\n').map(line=>line.trim().split(','))
      .filter(([date,value])=>/^\d{4}-\d{2}-\d{2}$/.test(date) && value!=='' && value!=='.' && Number.isFinite(Number(value)));
    const last=rows.at(-1);
    if(last) {rf=Number(last[1])/100;rfDate=last[0];rfSource='US Treasury 10-year constant maturity yield via FRED DGS10';}
  } catch { /* the dated paired reference is exposed below */ }
  if(rf===null) {rf=treasuryReference;rfDate=erpDate;rfSource='Treasury reference quoted with the monthly implied ERP';notes.push('Daily Treasury feed unavailable. Risk-free rate is a monthly reference, not today’s yield.');}
  return {rf,rfDate,rfSource,rfUrl:'https://fred.stlouisfed.org/series/DGS10',erp,erpDate,erpMethod,erpUrl:ERP_URL,notes};
}

const FACTORS=[
  ['Demand drop','customer|demand|subscription','cancel|switch|reputation|confidence','Customer dependence and continuity of service'],
  ['Competitive attack','competit|pricing pressure','intense|aggressive|price competition','Competitive responses when financing is constrained'],
  ['Loss of suppliers','supplier|supply chain|manufactur','single.source|limited.source|sole.source|concentration','Supplier concentration and replaceability'],
  ['Loss of employees','employee|personnel|talent','retain|key personnel|highly skilled','Dependence on specialized employees'],
  ['Asset fire sales','asset|facilit|equipment','specialized|impairment|illiquid','Asset specificity and liquidation discounts'],
  ['Loss of dealers','distribut|reseller|dealer|channel','depend|concentrat|relationship','Distribution and dealer relationships'],
  ['Loss of capital markets','capital|liquidity|financing','access|refinanc|funding|covenant','Need for external funding under stress']
];
export function filingEvidence(html,url) {
  const plain=html.replace(/<script\b[^>]*>[^]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[^]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;/g,"'").replace(/\s+/g,' ');
  // Restrict evidence to Risk Factors; ignore the table-of-contents occurrence.
  const starts=[...plain.matchAll(/Item\s*1A[.\s:—-]+Risk Factors/gi)].map(m=>m.index);
  let risk='';
  for(const start of starts) {
    const section=plain.slice(start+25);
    const end=section.search(/Item\s*1B[.\s:—-]+/i);
    const candidate=end>=0?section.slice(0,end):section.slice(0,160000);
    if(candidate.length>risk.length) risk=candidate;
  }
  return FACTORS.map(([name,topic,strong,description])=>{
    const topicRe=new RegExp(topic,'i'),strongRe=new RegExp(strong,'i');
    const sentences=risk.split(/(?<=[.!?])\s+/).filter(s=>s.length>70 && s.length<1800 && topicRe.test(s));
    const sentence=sentences.find(s=>strongRe.test(s)) || sentences[0];
    // Retain a brief matched phrase, rather than reproducing source paragraphs.
    const phrase=sentence ? (sentence.match(strongRe)?.[0] || sentence.match(topicRe)?.[0] || '').split(/\s+/).slice(0,3).join(' ') : null;
    return {name,description,score:sentence?(strongRe.test(sentence)?2.5:2):2,
      evidence:phrase,url:sentence?url:null,
      basis:sentence?'Rule-based draft from 10-K Risk Factors; analyst review required':'No usable excerpt; neutral placeholder, evidence missing'};
  });
}

export async function loadCompany(symbol,env={},customPeers=[]) {
  symbol=symbol.toUpperCase().trim();
  if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) throw new DataError('Enter a valid US-listed ticker.');
  if(customPeers.some(t=>!/^[A-Z0-9.\-]{1,12}$/.test(t))) throw new DataError('Peer tickers must contain only letters, numbers, periods or hyphens.');
  const catalog=Object.values(await cachedFetch(SEC_TICKERS,env,86400));
  const entry=catalog.find(c=>c.ticker===symbol || c.ticker.replace('.','-')===symbol);
  if(!entry) throw new DataError('No SEC ticker match. Search by company name, or use a US-listed SEC filer. International coverage requires another filing adapter.',404);
  const cik=String(entry.cik_str).padStart(10,'0');
  const submission=await cachedFetch(`${SEC}/submissions/CIK${cik}.json`,env,21600);
  const sic=Number(submission.sic);
  if(sic>=6000 && sic<6800) throw new DataError('This is a financial, insurance, investment or real-estate business. Use an excess-return/dividend/FFO model; a generic enterprise FCFF and debt optimum would be misleading.',422,[submission.sicDescription]);
  let [raw,chartResult,marketResult,rates]=await Promise.all([
    cachedFetch(`${SEC}/api/xbrl/companyfacts/CIK${cik}.json`,env,21600),
    cachedFetch(chartUrl(symbol),env,900).catch(()=>null),
    cachedFetch(chartUrl('SPY'),env,21600).catch(()=>null),marketRates(env)
  ]);
  const extracted=financials(raw,submission);
  raw=null;
  const market=monthlyReturns(marketResult),ownReturns=monthlyReturns(chartResult);
  const beta=regression(ownReturns,market),quote=quoteFrom(chartResult);
  const peerScreen=candidatePeers(symbol,sic,customPeers);
  const peers=[];
  // Sequential peers keep SEC calls and request fan-out bounded; upstream responses are cached.
  for(const ticker of peerScreen.symbols) {
    const p=catalog.find(c=>c.ticker===ticker); if(!p) continue;
    try {
      const [pf,pc]=await Promise.all([
        cachedFetch(`${SEC}/api/xbrl/companyfacts/CIK${String(p.cik_str).padStart(10,'0')}.json`,env,21600),
        cachedFetch(chartUrl(ticker),env,900).catch(()=>null)
      ]);
      const px=quoteFrom(pc),f=financials(pf,{}),b=f.base;
      const equity=px && b.shares ? px.price*b.shares : null;
      const pb=regression(monthlyReturns(pc),market);
      peers.push({symbol:ticker,name:p.title,end:b.end,beta:pb,price:px?.price ?? null,quoteDate:px?.asOf ?? null,quoteUrl:px?.url,
        shares:b.shares,equity,debt:b.debt,cash:b.cash,revenue:b.revenue,ebit:b.ebit,margin:b.revenue?b.ebit/b.revenue:null,
        ev:equity!==null && b.debt!==null && b.cash!==null ? equity+b.debt-b.cash : null,
        quality:f.quality.filter(x=>x.severity==='critical').map(x=>x.text),
        rationale:`${peerScreen.name} candidate screen. Review business mix, geography, margins and cyclicality before inclusion.`});
    } catch(e) {peers.push({symbol:ticker,name:p.title,error:e.message,beta:null,debt:null,equity:null,quality:[e.message],rationale:peerScreen.name});}
  }
  const filings=submission.filings?.recent;
  const index=filings?.form.findIndex(x=>x==='10-K');
  let filing=null,html='';
  if(index>=0) {
    filing={date:filings.filingDate[index],end:filings.reportDate[index],accession:filings.accessionNumber[index],
      url:`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${filings.accessionNumber[index].replaceAll('-','')}/${filings.primaryDocument[index]}`};
    try {html=await cachedFetch(filing.url,env,86400,'text');} catch {extracted.quality.push({severity:'critical',text:'10-K text unavailable. The seven h scores are placeholders pending filing review.'});}
  }
  const hFactors=filingEvidence(html,filing?.url);
  if(!beta) extracted.quality.push({severity:'critical',text:'Fewer than 36 aligned adjusted monthly return observations; company regression beta unavailable.'});
  if(!quote) extracted.quality.push({severity:'critical',text:'Market quote unavailable. Enter a dated quote to explore the model; comparisons remain provisional.'});
  if(quote && extracted.base.shares*quote.price<5000) extracted.quality.push({severity:'critical',text:'Market equity is below $5 billion. The large-firm synthetic-rating table needs replacement or validation for this smaller issuer.'});
  if(peers.filter(p=>p.beta && p.debt!==null && p.equity>0).length<3) extracted.quality.push({severity:'critical',text:'Fewer than three peers with usable beta and leverage data. Add appropriate peers or review the beta fallback.'});
  if(peers.some(p=>p.quality?.some(q=>/currentDebt|shortDebt|long.term debt/i.test(q)))) extracted.quality.push({severity:'critical',text:'One or more candidate peers have unverified missing debt tags. The bottom-up beta and valuation remain provisional until peer debt is reviewed.'});
  if(extracted.base.ebit<=0) extracted.quality.push({severity:'critical',text:'Operating losses: a turnaround model with explicit loss recovery and NOLs is required. This mechanically generated forecast is exploratory.'});
  if((Date.now()-Date.parse(rates.erpDate))/864e5>65 || (Date.now()-Date.parse(rates.rfDate))/864e5>45)
    extracted.quality.push({severity:'critical',text:'Market risk inputs are stale. Update risk-free rate and ERP before making a valuation judgment.'});
  return {version:MODEL_VERSION,symbol:entry.ticker,name:submission.name||entry.title,cik,sic,industry:submission.sicDescription,
    fetchedAt:new Date().toISOString(),currency:'USD',units:'USD millions; shares in millions',
    ...extracted,quote,beta,peers,peerScreen:peerScreen.name,rates,filing,hFactors,
    sources:[
      {name:'SEC company facts',url:`${SEC}/api/xbrl/companyfacts/CIK${cik}.json`,kind:'Structured financial statements'},
      {name:'SEC submissions',url:`${SEC}/submissions/CIK${cik}.json`,kind:'Filing dates and industry'},
      ...(filing?[{name:'Latest 10-K',url:filing.url,kind:`Filed ${filing.date}`}]:[]),
      {name:'Yahoo Finance',url:`https://finance.yahoo.com/quote/${symbol}/`,kind:'Unofficial quote and adjusted monthly prices; not a licensed exchange feed'},
      {name:'10-year Treasury',url:rates.rfUrl,kind:`${rates.rfSource}, ${rates.rfDate}`},
      {name:'Implied equity risk premium',url:ERP_URL,kind:`${rates.erpMethod}, ${rates.erpDate}`},
      {name:'Synthetic rating spreads',url:'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html',kind:'Large non-financial firms, January 2026'}
    ]};
}
