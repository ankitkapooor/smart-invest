import {betaRegression, MODEL_VERSION} from '../public/model.js';
import {financials,DataError,CONTINUITY,mergePredecessor} from './accounting.js';
import {reportedSegments} from './segments.js';
import {supplementFilingFacts,customLineItems} from './filing-facts.js';
import {withDeadline} from './deadline.js';
export {financials,pickFact,DataError} from './accounting.js';

const SEC='https://data.sec.gov';
const SEC_TICKERS='https://www.sec.gov/files/company_tickers.json';
const ERP_URL='https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm';
const memory=new Map(), inFlight=new Map();
const ALIASES={GOOGLE:'GOOGL',FACEBOOK:'META',BERKSHIRE:'BRK-B',COSTCO:'COST',MICROSOFT:'MSFT'};
let secQueue=Promise.resolve();

export async function cachedFetch(url, env={}, ttl=3600, type='json') {
  const key=url+'|'+type, saved=memory.get(key);
  if(saved && saved.expires>Date.now()) return saved.value;
  if(inFlight.has(key)) return inFlight.get(key);
  const task=(async()=>{
    // Cache API operations count toward the Workers subrequest ceiling. Persist
    // only large filing/facts responses and the catalog at the edge; small
    // summaries, quotes and rates use the bounded isolate cache.
    const cache=/companyfacts|Archives\/edgar|company_tickers/.test(url)?globalThis.caches?.default:null;
    const cacheKey=new Request(url,{headers:{'Accept':type==='json'?'application/json':'text/plain'}});
    if(cache) {
      const hit=await withDeadline(cache.match(cacheKey),1000).catch(()=>null);
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
    if(cache && body.length<20_000_000) await withDeadline(cache.put(cacheKey,new Response(body,{headers:{'Content-Type':type==='json'?'application/json':'text/plain','Cache-Control':`public,max-age=${ttl}`}})),1000).catch(()=>{});
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
  const alias=ALIASES[q];
  const normalize=name=>name.toUpperCase().replace(/[,\s]+(INC\.?|CORP\.?|CORPORATION|LTD\.?)$/,'').trim();
  const rank=c=>c.ticker===q?0:c.ticker===alias?1:normalize(c.title)===q?2:c.ticker.startsWith(q)?3:c.title.toUpperCase().startsWith(q)?4:5;
  return catalog.filter(c=>c.ticker===q || c.ticker===alias || c.ticker.startsWith(q) || c.title.toUpperCase().includes(q))
    .sort((a,b)=>rank(a)-rank(b)||a.title.localeCompare(b.title)).slice(0,12)
    .map(c=>({symbol:c.ticker,name:c.title,cik:c.cik_str}));
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
  {name:'Internet and cloud platforms',sic:[],symbols:['AMZN','GOOGL','META','MSFT','ORCL']},
  {name:'Retail',sic:[5311,5331,5399,5411,5961,5990],symbols:['WMT','COST','TGT','KR','DG','BJ']},
  {name:'Consumer staples',sic:[2000,2080,2082,2086,2090,2840,2844],symbols:['PG','CL','KMB','KO','PEP']},
  {name:'Restaurants',sic:[5810,5812],symbols:['MCD','SBUX','YUM','CMG','DRI']},
  {name:'Pharmaceuticals',sic:[2833,2834,2835,2836],symbols:['JNJ','MRK','PFE','LLY','ABBV']},
  {name:'Medical technology',sic:[3841,3842,3845,3851],symbols:['ABT','MDT','BSX','SYK','ISRG']},
  {name:'Automotive',sic:[3711,3714,3716],symbols:['TSLA','GM','F','RIVN','LCID']},
  {name:'Oil and gas',sic:[1311,1381,2911],symbols:['XOM','CVX','COP','EOG','OXY']},
  {name:'Utilities',sic:[4911,4931,4923,4924],symbols:['NEE','DUK','SO','AEP','EXC']},
  {name:'Industrials',sic:[3510,3530,3531,3560,3600,3721,3724,3812],symbols:['CAT','DE','HON','GE','RTX']},
  {name:'Apparel',sic:[2300,2320,3021,3140,5651,5661],symbols:['NKE','LULU','DECK','CROX','VFC']},
  {name:'Telecommunications',sic:[4812,4813,4899],symbols:['T','VZ','TMUS']},
  {name:'Cable and media',sic:[4841,7812,4833],symbols:['CMCSA','CHTR','DIS','WBD','FOXA']},
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

export const filingUrl=(ownerCik,accession,document)=>`https://www.sec.gov/Archives/edgar/data/${Number(ownerCik)}/${accession.replaceAll('-','')}/${document}`;

export function peerQuality(peers) {
  const quality=[];
  if(peers.filter(p=>p.beta&&p.debt!==null&&p.equity>0).length<3)quality.push({severity:'critical',code:'peer-coverage',text:'Fewer than three peers with usable beta and leverage data. Add appropriate peers or review the beta fallback.'});
  if(peers.some(p=>p.quality?.some(q=>/currentDebt|shortDebt|long.term debt/i.test(q))))quality.push({severity:'critical',code:'peer-debt',text:'One or more candidate peers have unverified debt disclosures. Peer leverage remains provisional.'});
  return quality;
}
async function collectPeers(peerScreen,catalog,market,env) {
  const peers=[];
  for(const ticker of peerScreen.symbols) {
    const p=catalog.find(c=>c.ticker===ticker);if(!p)continue;
    try {
      const [pf,pc]=await withDeadline(Promise.all([
        cachedFetch(`${SEC}/api/xbrl/companyfacts/CIK${String(p.cik_str).padStart(10,'0')}.json`,env,21600),
        cachedFetch(chartUrl(ticker),env,900).catch(()=>null)
      ]),6000,'Peer data timed out; retry the comparison.');
      const px=quoteFrom(pc),f=financials(pf,{}),b=f.base,equity=px&&b.shares?px.price*b.shares:null;
      peers.push({symbol:ticker,name:p.title,end:b.end,beta:regression(monthlyReturns(pc),market),price:px?.price??null,quoteDate:px?.asOf??null,quoteUrl:px?.url,
        shares:b.shares,equity,debt:b.debt,cash:b.cash,revenue:b.revenue,ebit:b.ebit,margin:b.revenue?b.ebit/b.revenue:null,
        ev:equity!==null&&b.debt!==null&&b.cash!==null?equity+b.debt-b.cash:null,
        quality:f.quality.filter(x=>x.severity==='critical').map(x=>x.text),rationale:`${peerScreen.name} candidate screen. Review business mix, geography, margins and cyclicality before inclusion.`});
    }catch(e){peers.push({symbol:ticker,name:p.title,error:e.message,beta:null,debt:null,equity:null,quality:[e.message],rationale:peerScreen.name});}
  }
  return peers;
}
export async function loadPeerComparison(symbol,env={},customPeers=[]) {
  symbol=ALIASES[symbol.toUpperCase().trim()]||symbol.toUpperCase().trim();
  if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)||customPeers.length>4||customPeers.some(t=>!/^[A-Z0-9.\-]{1,12}$/.test(t)))throw new DataError('Enter a valid ticker and up to four peer tickers.');
  const catalog=Object.values(await cachedFetch(SEC_TICKERS,env,86400)),entry=catalog.find(c=>c.ticker===symbol);
  if(!entry)throw new DataError('No SEC ticker match.',404);
  const submission=customPeers.length?null:await cachedFetch(`${SEC}/submissions/CIK${String(entry.cik_str).padStart(10,'0')}.json`,env,21600);
  const screen=candidatePeers(symbol,submission?.sic,customPeers);
  const market=monthlyReturns(await cachedFetch(chartUrl('SPY'),env,21600).catch(()=>null));
  const peers=await collectPeers(screen,catalog,market,env);
  return {symbol,peers,peerScreen:screen.name,quality:peerQuality(peers),status:'loaded'};
}

export async function loadCompany(symbol,env={},customPeers=[],{includePeers=true}={}) {
  symbol=symbol.toUpperCase().trim();
  symbol=ALIASES[symbol]||symbol;
  if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) throw new DataError('Enter a valid US-listed ticker.');
  if(customPeers.some(t=>!/^[A-Z0-9.\-]{1,12}$/.test(t))) throw new DataError('Peer tickers must contain only letters, numbers, periods or hyphens.');
  const catalog=Object.values(await cachedFetch(SEC_TICKERS,env,86400));
  const entry=catalog.find(c=>c.ticker===symbol || c.ticker.replace('.','-')===symbol);
  if(!entry) throw new DataError('No SEC ticker match. Search by company name, or use a US-listed SEC filer. International coverage requires another filing adapter.',404);
  const cik=String(entry.cik_str).padStart(10,'0');
  const submission=await cachedFetch(`${SEC}/submissions/CIK${cik}.json`,env,21600);
  const sic=Number(submission.sic);
  const specialized=sic>=6000&&sic<6800;
  let [raw,chartResult,marketResult,rates]=await Promise.all([
    cachedFetch(`${SEC}/api/xbrl/companyfacts/CIK${cik}.json`,env,21600),
    cachedFetch(chartUrl(symbol),env,900).catch(()=>null),
    cachedFetch(chartUrl('SPY'),env,21600).catch(()=>null),marketRates(env)
  ]);
  const continuity=CONTINUITY[Number(cik)];
  if(continuity){
    const predecessor=await cachedFetch(`${SEC}/api/xbrl/companyfacts/CIK${String(continuity.predecessor).padStart(10,'0')}.json`,env,21600);
    raw=mergePredecessor(raw,predecessor,continuity);
  }
  let extracted;
  try{extracted=financials(raw,submission);}catch(e){
    if(!(e instanceof DataError))throw e;
    extracted={base:{end:submission.filings?.recent?.reportDate?.[0]||null,basis:'Unsupported normalization',provenance:{},...Object.fromEntries(['revenue','ebit','da','capex','cfo','nwc','cash','debt','shares','longInvest','shortDebt','shortInvest','currentDebt'].map(k=>[k,null]))},history:[],quality:[{severity:'critical',code:'coverage',text:e.message}],reconciliations:[]};
  }
  // Structured Company Facts drops dimensional lease splits and narrative
  // zero-borrowing disclosures. Consult the exact base-period primary filing
  // before declaring those required inputs unavailable. Historical folds still
  // use only the Company Facts snapshot; supplemental evidence is live-only.
  const leaseTotal=raw.facts?.['us-gaap']?.FinanceLeaseLiability?.units?.USD?.some(f=>f.end===extracted.base.end&&f.filed<=extracted.asOf&&f.val>0);
  if(extracted.base.debt===null||extracted.base.absenceInferred?.length||leaseTotal&&(extracted.base.financeLeaseCurrent===null||extracted.base.financeLeaseNoncurrent===null)) {
    const recent=submission.filings?.recent;
    const ix=recent?.form.findIndex((form,i)=>['10-K','10-Q'].includes(form)&&recent.reportDate[i]===extracted.base.end);
    if(ix>=0) {
      const primary={cik:Number(cik),form:recent.form[ix],end:recent.reportDate[ix],date:recent.filingDate[ix],accession:recent.accessionNumber[ix],url:filingUrl(cik,recent.accessionNumber[ix],recent.primaryDocument[ix])};
      try {
        const html=await cachedFetch(primary.url,env,86400,'text');
        const supplemented=supplementFilingFacts(raw,html,primary);
        if(supplemented.notes.length){raw=supplemented.raw;extracted=financials(raw,submission);extracted.quality.push(...supplemented.notes);}
        // A zero inferred from a missing standard concept is withdrawn when the filing
        // carries a company-specific concept for the same balance.
        const custom=customLineItems(html,primary,cik),blocked=(extracted.base.absenceInferred||[]).filter(key=>custom[key]?.length);
        if(blocked.length){
          const notes=extracted.quality.filter(q=>q.code?.startsWith('filing-'));
          extracted=financials(raw,submission,undefined,{noAbsence:blocked});extracted.quality.push(...notes);
          extracted.quality.push({severity:'critical',code:'custom-balance',text:`Company-specific concepts (${[...new Set(blocked.flatMap(k=>custom[k]))].slice(0,4).join(', ')}) carry ${blocked.join(', ')}; standard-concept absence is not treated as zero.`,url:primary.url});
        }
      } catch(e) {
        // The supplement only narrows gaps; a failed fetch leaves the Company Facts result intact.
        extracted.quality.push({severity:'critical',code:'filing-supplement-unavailable',text:'Primary-filing accounting supplement unavailable; unresolved inputs and inferred zeros are unverified.'});}
    }
  }
  if(specialized)extracted.quality.push({severity:'critical',code:'specialized-model',text:'Financial/real-estate business: specialized valuation model required. Company research is available; enterprise FCFF is withheld.'});
  raw=null;
  const market=monthlyReturns(marketResult),ownReturns=monthlyReturns(chartResult);
  const beta=regression(ownReturns,market),quote=quoteFrom(chartResult);
  const peerScreen=candidatePeers(symbol,sic,customPeers);
  const peers=includePeers?await collectPeers(peerScreen,catalog,market,env):[];
  let filings=submission.filings?.recent;
  if(continuity&&!filings?.form.includes('10-K')){const priorSub=await cachedFetch(`${SEC}/submissions/CIK${String(continuity.predecessor).padStart(10,'0')}.json`,env,21600);filings=priorSub.filings?.recent;}
  const researchFilings=[],filingRegistry=[];
  for(const [recent,owner] of [[submission.filings?.recent,Number(cik)],[filings,continuity?.predecessor||Number(cik)]]) {
    for(let i=0;i<(recent?.form.length||0);i++) {
      if(['10-K','10-Q','8-K','20-F'].includes(recent.form[i])&&!filingRegistry.some(f=>f.accession===recent.accessionNumber[i]))filingRegistry.push({accession:recent.accessionNumber[i],date:recent.filingDate[i],cik:owner});
      if(!['10-K','10-Q','20-F'].includes(recent.form[i])||researchFilings.some(f=>f.accession===recent.accessionNumber[i]))continue;
      researchFilings.push({name:'SEC '+recent.form[i],date:recent.filingDate[i],end:recent.reportDate[i],accession:recent.accessionNumber[i],url:filingUrl(owner,recent.accessionNumber[i],recent.primaryDocument[i]),kind:'Primary filing; exact URL from SEC submissions'});
    }
  }
  researchFilings.sort((a,b)=>b.date.localeCompare(a.date));researchFilings.splice(6);
  const index=filings?.form.findIndex(x=>x==='10-K');
  let filing=null,html='';
  if(index>=0) {
    filing={date:filings.filingDate[index],end:filings.reportDate[index],accession:filings.accessionNumber[index],
      url:filingUrl(filings===submission.filings?.recent?cik:continuity?.predecessor||cik,filings.accessionNumber[index],filings.primaryDocument[index])};
    try {html=await cachedFetch(filing.url,env,86400,'text');} catch {extracted.quality.push({severity:'critical',text:'10-K text unavailable. The seven h scores are placeholders pending filing review.'});}
  }
  const hFactors=filingEvidence('',filing?.url).map(f=>({...f,basis:'Pending LLM evidence review; score 2 is a visible policy placeholder, not an extracted risk judgment.'}));
  extracted.quality.push({severity:'critical',code:'research-pending',text:'Business-driver evidence, peer selection, borrowing costs and seven h judgments require validated LLM research.'});
  if(!beta) extracted.quality.push({severity:'critical',text:'Fewer than 36 aligned adjusted monthly return observations; company regression beta unavailable.'});
  if(!quote) extracted.quality.push({severity:'critical',text:'Market quote unavailable. Enter a dated quote to explore the model; comparisons remain provisional.'});
  if(quote && extracted.base.shares*quote.price<5000) extracted.quality.push({severity:'critical',text:'Market equity is below $5 billion. The large-firm synthetic-rating table needs replacement or validation for this smaller issuer.'});
  extracted.quality.push(...(includePeers?peerQuality(peers):[{severity:'critical',code:'peer-coverage',text:'Peer comparisons are loading separately. The initial scenario uses the company regression beta where available.'}]));
  if(extracted.base.ebit!==null&&extracted.base.ebit<=0) extracted.quality.push({severity:'critical',text:'Operating losses: a turnaround model with explicit loss recovery and NOLs is required. This mechanically generated forecast is exploratory.'});
  if((Date.now()-Date.parse(rates.erpDate))/864e5>65 || (Date.now()-Date.parse(rates.rfDate))/864e5>45)
    extracted.quality.push({severity:'critical',text:'Market risk inputs are stale. Update risk-free rate and ERP before making a valuation judgment.'});
  return {version:MODEL_VERSION,symbol:entry.ticker,name:submission.name||entry.title,cik,sic,industry:submission.sicDescription,
    fetchedAt:new Date().toISOString(),currency:'USD',units:'USD millions; shares in millions',
    ...extracted,reportedSegments:reportedSegments(html,extracted.history,filing?.url),quote,beta,peers,peerScreen:peerScreen.name,peerCandidates:peerScreen.symbols,peerStatus:includePeers?'loaded':'pending',rates,filing,hFactors,
    researchFilings,filingRegistry:filingRegistry.slice(0,60),research:{status:'not_started'},modelFamily:specialized?'specialized':extracted.history.length?'fcff':'unsupported',
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
