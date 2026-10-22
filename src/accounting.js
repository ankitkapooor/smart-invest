// Accounting normalization is independent of the forecast/research engine.
// All amounts are millions. Missing disclosures remain null, never a reported zero.
export class DataError extends Error {
  constructor(message,status=422,details=[]) {super(message);this.name='DataError';this.status=status;this.details=details;}
}
export const TAGS={
  revenue:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueGoodsNet'],
  ebit:['OperatingIncomeLoss'],cfo:['NetCashProvidedByUsedInOperatingActivities'],
  da:['DepreciationDepletionAndAmortization','DepreciationAndAmortization','DepreciationAmortizationAndAccretionNet'],
  depreciation:['Depreciation','DepreciationDepletionAndAmortizationPropertyPlantAndEquipment'],amortization:['AmortizationOfIntangibleAssets'],
  capex:['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets'],
  interest:['InterestExpenseNonOperating','InterestAndDebtExpense','InterestExpense','InterestExpenseDebt'],
  cash:['CashAndCashEquivalentsAtCarryingValue'],
  shortInvest:['ShortTermInvestments','MarketableSecuritiesCurrent','AvailableForSaleSecuritiesCurrent','DebtSecuritiesCurrent'],
  longInvest:['MarketableSecuritiesNoncurrent','AvailableForSaleSecuritiesNoncurrent','DebtSecuritiesNoncurrent'],
  currentAssets:['AssetsCurrent'],currentLiabilities:['LiabilitiesCurrent'],
  longDebt:['LongTermDebtAndFinanceLeaseObligationsNoncurrent','LongTermDebtNoncurrent','LongTermDebtAndCapitalLeaseObligations'],
  currentDebt:['LongTermDebtAndFinanceLeaseObligationsCurrent','LongTermDebtCurrent'],
  totalTermDebt:['LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities','LongTermDebt'],
  shortDebt:['ShortTermBorrowings','CommercialPaper','ShortTermDebtCurrent'],
  combinedCurrentDebt:['DebtCurrent','ShortTermBorrowingsAndCurrentPortionOfLongTermDebt'],
  financeLeaseCurrent:['FinanceLeaseLiabilityCurrent','CapitalLeaseObligationsCurrent'],
  financeLeaseNoncurrent:['FinanceLeaseLiabilityNoncurrent','CapitalLeaseObligationsNoncurrent'],
  shares:['CommonStockSharesOutstanding'],dilutedShares:['WeightedAverageNumberOfDilutedSharesOutstanding'],
  basicShares:['WeightedAverageNumberOfSharesOutstandingBasic'],
  assets:['Assets'],liabilitiesEquity:['LiabilitiesAndStockholdersEquity'],
  ppe:['PropertyPlantAndEquipmentNet'],goodwill:['Goodwill'],intangibles:['FiniteLivedIntangibleAssetsNet'],
  equity:['StockholdersEquity'],preferred:['PreferredStockValue'],minority:['MinorityInterest'],
  pension:['DefinedBenefitPlanLiabilitiesNoncurrent'],sbc:['ShareBasedCompensation'],
  cashChange:['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect','CashAndCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],
  cfi:['NetCashProvidedByUsedInInvestingActivities'],cff:['NetCashProvidedByUsedInFinancingActivities'],fx:['EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents','EffectOfExchangeRateOnCashAndCashEquivalents','EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations']
};
const forms=new Set(['10-K','10-K/A','10-Q','10-Q/A']);
export const durationDays=f=>(Date.parse(f.end)-Date.parse(f.start))/864e5;
function record(f,tag,cik,unit) {
  return {value:f.val/1e6,raw:f.val,unit,tag,start:f.start||null,end:f.end,filed:f.filed,form:f.form,accession:f.accn,cik:f.sourceCik||cik,
    url:`https://www.sec.gov/Archives/edgar/data/${Number(f.sourceCik||cik)}/${f.accn.replaceAll('-','')}/`};
}
export function pickFact(facts,names,{end,annual=false,start,unit='USD',cik,asOf=new Date().toISOString().slice(0,10)}={}) {
  for(const tag of names) {
    const fs=(facts?.[tag]?.units?.[unit]||[]).filter(f=>forms.has(f.form)&&f.filed<=asOf&&f.end===end&&Number.isFinite(f.val)&&
      (annual?f.start&&durationDays(f)>=330&&durationDays(f)<=380:start?f.start===start:!f.start));
    fs.sort((a,b)=>b.filed.localeCompare(a.filed)||b.accn.localeCompare(a.accn));
    if(fs[0])return record(fs[0],tag,cik,unit);
  }
  return null;
}
function metric(facts,key,opt) {
  const direct=pickFact(facts,TAGS[key],opt);
  if(direct)return {value:direct.value,records:[direct]};
  if(key==='da') {
    const dep=pickFact(facts,TAGS.depreciation,opt),amort=pickFact(facts,TAGS.amortization,opt);
    if(dep&&amort)return {value:dep.value+amort.value,records:[dep,amort]};
    // Depreciation alone does not establish total D&A. Resolve the amortization footnote.
  }
  return {value:null,records:[]};
}
export const CONTINUITY={
  2115436:{predecessor:34088,effective:'2026-07-01',exchangeRatio:1,
    source:'https://www.sec.gov/Archives/edgar/data/2115436/000003408826000093/R9.htm',
    basis:'ExxonMobil holding-company reorganization: consolidated reporting basis unchanged; one-for-one exchange.'}
};
export function mergePredecessor(successor,predecessor,link,asOf=new Date().toISOString().slice(0,10)) {
  if(!link||Number(predecessor.cik)!==link.predecessor||asOf<link.effective||link.exchangeRatio!==1)
    throw new DataError('Unverified entity continuity. Financial histories were not joined.');
  const merged={...successor,facts:{},continuity:{...link,successor:Number(successor.cik)}};
  for(const ns of new Set([...Object.keys(predecessor.facts||{}),...Object.keys(successor.facts||{})])) {
    merged.facts[ns]={};
    for(const tag of new Set([...Object.keys(predecessor.facts?.[ns]||{}),...Object.keys(successor.facts?.[ns]||{})])) {
      const old=predecessor.facts?.[ns]?.[tag],next=successor.facts?.[ns]?.[tag];
      const units={};
      for(const unit of new Set([...Object.keys(old?.units||{}),...Object.keys(next?.units||{})])) {
        const prior=(old?.units?.[unit]||[]).filter(f=>f.end<link.effective&&f.filed<=asOf).map(f=>({...f,sourceCik:predecessor.cik}));
        const current=(next?.units?.[unit]||[]).filter(f=>f.filed<=asOf).map(f=>({...f,sourceCik:successor.cik}));
        if(TAGS.revenue.includes(tag)) for(const n of current) {
          const p=prior.find(p=>p.end===n.end&&p.start===n.start&&p.filed<=asOf);
          if(p&&Math.abs(n.val-p.val)>Math.max(1e6,Math.abs(p.val)*.001))throw new DataError('Predecessor/successor revenue conflicts; manual continuity review required.');
        }
        units[unit]=[...prior,...current];
      }
      merged.facts[ns][tag]={...(next||old),units};
    }
  }
  return merged;
}
export function financials(raw,submission={},asOf=new Date().toISOString().slice(0,10)) {
  const facts=raw.facts?.['us-gaap'];
  if(!facts)throw new DataError('Accounting adapter unavailable: this issuer requires IFRS/local-GAAP normalization. No US-GAAP values substituted.');
  const cik=raw.cik,quality=[],checks=[];
  const critical=(code,text)=>quality.push({code,severity:'critical',text});
  const revFacts=TAGS.revenue.flatMap(t=>facts[t]?.units?.USD||[]);
  const ends=[...new Set(revFacts.filter(f=>/^10-K/.test(f.form)&&f.start&&durationDays(f)>=330&&durationDays(f)<=380&&f.filed<=asOf).map(f=>f.end))].sort().slice(-10);
  const flows=['revenue','ebit','da','capex','cfo','interest','sbc'];
  const history=ends.map(end=>{
    const row={end,year:Number(end.slice(0,4)),provenance:{}};
    for(const key of flows){const m=metric(facts,key,{end,annual:true,cik,asOf});row[key]=m.value;if(m.records.length)row.provenance[key]=m.records;}
    return row;
  }).filter(r=>r.revenue!==null);
  if(history.length<3)throw new DataError('At least three full comparable fiscal years are required. Fiscal stubs are excluded; verify predecessor/successor identity.');
  const annual=history.at(-1),base={...annual,provenance:{...annual.provenance},basis:'Latest full fiscal year'};
  const q=revFacts.filter(f=>/^10-Q/.test(f.form)&&f.start&&f.end>annual.end&&f.filed<=asOf&&durationDays(f)>55&&durationDays(f)<310)
    .sort((a,b)=>b.end.localeCompare(a.end)||a.start.localeCompare(b.start))[0];
  if(q) {
    base.end=q.end;base.basis='Trailing twelve months (FY + current YTD − comparable prior YTD)';
    for(const key of flows) {
      const current=metric(facts,key,{end:q.end,start:q.start,cik,asOf});
      const candidates=revFacts.filter(f=>forms.has(f.form)&&f.filed<=asOf&&f.start&&Math.abs((Date.parse(q.end)-Date.parse(f.end))/864e5-365)<10&&Math.abs(durationDays(f)-durationDays(q))<10).sort((a,b)=>b.filed.localeCompare(a.filed));
      const p=candidates[0],prior=p?metric(facts,key,{end:p.end,start:p.start,cik,asOf}):{value:null};
      if(current.value!==null&&prior.value!==null&&annual[key]!==null){base[key]=annual[key]+current.value-prior.value;base.provenance[key]=[...annual.provenance[key].map(r=>({...r,operation:'add FY'})),...current.records.map(r=>({...r,operation:'add YTD'})),...prior.records.map(r=>({...r,operation:'subtract prior YTD'}))];}
      else {base[key]=null;delete base.provenance[key];}
    }
  }
  const opt={end:base.end,cik,asOf};
  for(const key of ['cash','shortInvest','longInvest','currentAssets','currentLiabilities','longDebt','currentDebt','shortDebt','combinedCurrentDebt','totalTermDebt','financeLeaseCurrent','financeLeaseNoncurrent','shares','assets','liabilitiesEquity','ppe','equity','preferred','minority','pension']) {
    const m=metric(facts,key,{...opt,unit:key==='shares'?'shares':'USD'});base[key]=m.value;if(m.records.length)base.provenance[key]=m.records;
  }
  if(base.shares===null) {
    const f=(raw.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares||[]).filter(f=>f.end<=base.end&&f.filed<=asOf).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed))[0];
    if(f){base.shares=f.val/1e6;base.provenance.shares=[record(f,'dei:EntityCommonStockSharesOutstanding',cik,'shares')];}
  }
  for(const key of ['dilutedShares','basicShares']) {const m=metric(facts,key,{end:annual.end,annual:true,cik,asOf,unit:'shares'});base[key]=m.value;if(m.records.length)base.provenance[key]=m.records;}
  // Weighted-average shares are not period-end diluted shares. Disclose a conservative proxy only.
  base.dilutionIncrement=base.dilutedShares!==null&&base.basicShares!==null?Math.max(0,base.dilutedShares-base.basicShares):null;
  base.valuationShares=base.dilutionIncrement!==null&&base.shares!==null?base.shares+base.dilutionIncrement:base.shares;
  if(base.dilutionIncrement===null)critical('dilution','A period-end option/RSU/convertible dilution schedule is unverified. Basic shares remain an exploratory denominator.');
  else quality.push({severity:'review',code:'dilution-proxy',text:'Dilution proxy adds latest annual diluted-minus-basic weighted shares to period-end shares. Exercise-price, RSU and convertible schedules still require review.'});
  let term=null;
  if(base.longDebt!==null&&base.currentDebt!==null)term=base.longDebt+base.currentDebt;
  else if(base.totalTermDebt!==null){term=base.totalTermDebt;quality.push({severity:'review',text:'Reported aggregate term debt used once; current maturities are not added a second time.'});}
  base.leaseDebt=0;
  for(const key of ['financeLeaseCurrent','financeLeaseNoncurrent']) {
    const corresponding=key.endsWith('Noncurrent')?'longDebt':'currentDebt';
    const includesLease=base.provenance[corresponding]?.some(f=>/FinanceLease/.test(f.tag));
    if(base[key]!==null&&!includesLease&&!base.provenance[corresponding]?.some(f=>/CapitalLease/.test(f.tag)))base.leaseDebt+=base[key];
  }
  // If totalTermDebt already includes leases, component leases must not be added again.
  if((base.longDebt===null||base.currentDebt===null)&&base.provenance.totalTermDebt?.some(f=>/FinanceLease/.test(f.tag)))base.leaseDebt=0;
  base.currentFinancing=base.combinedCurrentDebt!==null?base.combinedCurrentDebt:base.currentDebt!==null&&base.shortDebt!==null?base.currentDebt+base.shortDebt+(base.financeLeaseCurrent??0):null;
  base.debt=base.longDebt!==null&&base.combinedCurrentDebt!==null?base.longDebt+base.combinedCurrentDebt+(base.provenance.longDebt?.some(f=>/FinanceLease|CapitalLease/.test(f.tag))?0:base.financeLeaseNoncurrent??0):term!==null&&base.shortDebt!==null?term+base.shortDebt+base.leaseDebt:null;
  if(base.shortDebt===null&&base.combinedCurrentDebt===null)critical('missing-shortDebt',`Short-term borrowing disclosure missing for ${base.end}. No zero substituted; bridge and peer leverage are blocked.`);
  if(base.debt===null&&base.longDebt===null)critical('missing-termDebt','Term-debt principal cannot be reconciled. No fair value, maturity schedule or borrowing capacity substituted.');
  if(base.shortInvest===null)critical('missing-shortInvest','Current securities disclosure is missing. No zero substituted into operating working capital.');
  base.cashAndEquivalents=base.cash;
  base.currentLiquid=base.cash!==null&&base.shortInvest!==null?base.cash+base.shortInvest:null;
  base.cash=base.currentLiquid;
  // Noncurrent marketable securities are nonoperating assets, not working capital.
  base.nonOperatingInvestments=base.longInvest;
  if(base.longInvest===null)critical('missing-longInvest','Noncurrent marketable-security balance is unverified; addback is withheld pending evidence of value or absence.');
  base.nwc=[base.currentAssets,base.currentLiabilities,base.currentLiquid,base.currentFinancing].every(Number.isFinite)
    ?base.currentAssets-base.currentLiquid-base.currentLiabilities+base.currentFinancing:null;
  for(const key of ['revenue','ebit','da','capex','cfo','nwc','cash','shares'])if(base[key]===null)critical('missing-'+key,`${key.toUpperCase()} cannot be normalized for ${base.end}. Custom tags or omitted disclosures require evidence.`);
  if(base.assets!==null&&base.liabilitiesEquity!==null) {
    const difference=base.assets-base.liabilitiesEquity,passed=Math.abs(difference)<=Math.max(1,base.assets*.001);
    checks.push({name:'Assets = liabilities + equity',passed,difference,period:base.end});if(!passed)critical('balance-identity','Balance-sheet identity failed; possible duplicate scopes or incompatible periods.');
  } else critical('balance-identity-missing','Balance-sheet identity could not be checked against reported totals.');
  const cf={};for(const key of ['cfo','cfi','cff','fx','cashChange'])cf[key]=metric(facts,key,{end:annual.end,annual:true,cik,asOf}).value;
  if(Object.values(cf).every(Number.isFinite)) {
    const difference=cf.cfo+cf.cfi+cf.cff+cf.fx-cf.cashChange,passed=Math.abs(difference)<=Math.max(1,Math.abs(cf.cfo)*.001);
    checks.push({name:'Cash-flow sections + FX = change in cash',passed,difference,period:annual.end});if(!passed)critical('cash-identity','Cash-flow statement reconciliation failed.');
  } else quality.push({severity:'review',code:'cash-identity-missing',text:'Complete cash-flow/FX reconciliation unavailable; no omitted FX amount assumed zero.'});
  quality.push({severity:'review',text:'Operating leases remain operating expenses. Debt uses carrying principal; lease interest, pensions, minority/preferred claims and restricted securities require a reconciled footnote review.'});
  if((Date.parse(asOf)-Date.parse(base.end))/864e5>200)critical('stale-financials','Financial base is over 200 days old.');
  return {base,history,quality,reconciliations:checks,continuity:raw.continuity||null,accountingStandard:'US-GAAP',asOf};
}
