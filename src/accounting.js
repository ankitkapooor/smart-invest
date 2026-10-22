// Accounting normalization is independent of the forecast/research engine.
// All amounts are millions. A disclosure that cannot be found remains null. A standard
// balance-sheet line that is absent from the filing that supplies the balance sheet is
// not presented there; it is recorded as a labeled zero with that filing as evidence.
export class DataError extends Error {
  constructor(message,status=422,details=[]) {super(message);this.name='DataError';this.status=status;this.details=details;}
}
export const TAGS={
  revenue:['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueGoodsNet'],
  ebit:['OperatingIncomeLoss','Derived:PretaxIncomePlusNetInterest'],cfo:['NetCashProvidedByUsedInOperatingActivities'],
  da:['DepreciationDepletionAndAmortization','DepreciationAndAmortization','DepreciationAmortizationAndAccretionNet'],
  depreciation:['Depreciation','DepreciationDepletionAndAmortizationPropertyPlantAndEquipment'],amortization:['AmortizationOfIntangibleAssets'],
  capex:['PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireProductiveAssets','PaymentsToAcquireOtherPropertyPlantAndEquipment','PaymentsForCapitalImprovements','PaymentsToAcquireOilAndGasPropertyAndEquipment'],
  // Prefer R&D excluding acquired in-process R&D: acquisition charges are not recurring research.
  rd:['ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost','ResearchAndDevelopmentExpense','ResearchAndDevelopmentExpenseSoftwareExcludingAcquiredInProcessCost'],
  interest:['InterestExpenseNonOperating','InterestAndDebtExpense','InterestExpense','InterestExpenseDebt'],
  cash:['CashAndCashEquivalentsAtCarryingValue','CashAndCashEquivalentsAtCarryingValueIncludingDiscontinuedOperations','CashCashEquivalentsAndShortTermInvestments','Cash','CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  shortInvest:['ShortTermInvestments','MarketableSecuritiesCurrent','AvailableForSaleSecuritiesCurrent','DebtSecuritiesCurrent'],
  longInvest:['MarketableSecuritiesNoncurrent','AvailableForSaleSecuritiesNoncurrent','DebtSecuritiesNoncurrent'],
  currentAssets:['AssetsCurrent'],currentLiabilities:['LiabilitiesCurrent'],
  receivables:['AccountsReceivableNetCurrent','AccountsNotesAndOtherReceivablesNetCurrent'],
  inventory:['InventoryNet'],payables:['AccountsPayableCurrent'],
  deferredRevenue:['ContractWithCustomerLiabilityCurrent','DeferredRevenueCurrent'],
  longDebt:['LongTermDebtAndFinanceLeaseObligationsNoncurrent','LongTermDebtNoncurrent','LongTermDebtAndCapitalLeaseObligations','LongTermNotesAndLoans'],
  currentDebt:['LongTermDebtAndFinanceLeaseObligationsCurrent','LongTermDebtCurrent'],
  totalTermDebt:['LongTermDebtAndFinanceLeaseObligationsIncludingCurrentMaturities','LongTermDebt','LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'],
  shortDebt:['ShortTermBorrowings','CommercialPaper','ShortTermDebtCurrent','NotesPayableCurrent'],
  combinedCurrentDebt:['DebtCurrent','ShortTermBorrowingsAndCurrentPortionOfLongTermDebt'],
  financeLeaseCurrent:['FinanceLeaseLiabilityCurrent','CapitalLeaseObligationsCurrent'],
  financeLeaseNoncurrent:['FinanceLeaseLiabilityNoncurrent','CapitalLeaseObligationsNoncurrent'],
  shares:['CommonStockSharesOutstanding'],dilutedShares:['WeightedAverageNumberOfDilutedSharesOutstanding'],
  basicShares:['WeightedAverageNumberOfSharesOutstandingBasic'],
  assets:['Assets'],liabilitiesEquity:['LiabilitiesAndStockholdersEquity'],
  ppe:['PropertyPlantAndEquipmentNet'],goodwill:['Goodwill'],intangibles:['IntangibleAssetsNetExcludingGoodwill','FiniteLivedIntangibleAssetsNet'],
  equity:['StockholdersEquity'],preferred:['PreferredStockValue'],minority:['MinorityInterest'],
  pension:['DefinedBenefitPlanLiabilitiesNoncurrent'],sbc:['ShareBasedCompensation'],
  cashChange:['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect','CashAndCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect'],
  cfi:['NetCashProvidedByUsedInInvestingActivities'],cff:['NetCashProvidedByUsedInFinancingActivities'],fx:['EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents','EffectOfExchangeRateOnCashAndCashEquivalents','EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsIncludingDisposalGroupAndDiscontinuedOperations']
};
const forms=new Set(['10-K','10-K/A','10-Q','10-Q/A']);
// Issuers without an operating-income subtotal (e.g. integrated energy, pharma, IBM)
// report pre-tax income. EBIT = pre-tax income + interest expense − interest income,
// matched by period. It still contains other non-operating items and is labeled.
export const DERIVED_EBIT='Derived:PretaxIncomePlusNetInterest';
const PRETAX=['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'];
const INTEREST_INCOME=['InvestmentIncomeInterest','InvestmentIncomeInterestAndDividend'];
const DEBT_LIKE=/^(DebtInstrumentCarryingAmount|DebtInstrumentFaceAmount|LongTermDebt|DebtCurrent|DebtLongterm|ShortTermBorrowings|ShortTermBankLoans|OtherShortTermBorrowings|CommercialPaper|NotesPayable|SeniorNotes|ConvertibleNotesPayable|ConvertibleDebt|LongTermNotes|LinesOfCredit|LongTermLineOfCredit|OtherLongTermDebt|SecuredDebt|UnsecuredDebt|SubordinatedDebt|FinanceLeaseLiability|CapitalLeaseObligations)/;
const accessionIndex=new WeakMap();
// accession -> set of us-gaap tags with any USD fact in that filing (any period).
function tagsByAccession(facts) {
  if(accessionIndex.has(facts))return accessionIndex.get(facts);
  const index=new Map();
  for(const [tag,body] of Object.entries(facts))for(const f of body?.units?.USD||[]){if(!f.accn)continue;if(!index.has(f.accn))index.set(f.accn,new Set());index.get(f.accn).add(tag);}
  accessionIndex.set(facts,index);return index;
}
const inFiling=(facts,accession,tags)=>{const set=tagsByAccession(facts).get(accession);return !!set&&tags.some(t=>set.has(t));};
const derivedFacts=new WeakMap();
export function withDerivedFacts(facts) {
  if(!facts)return facts;
  if(derivedFacts.has(facts))return derivedFacts.get(facts);
  const direct=new Set((facts.OperatingIncomeLoss?.units?.USD||[]).filter(f=>f.start).map(f=>f.start+'|'+f.end));
  const seen=new Set(),out=[];
  const component=(tags,f)=>{
    for(const tag of tags){
      const same=(facts[tag]?.units?.USD||[]).filter(x=>x.start===f.start&&x.end===f.end&&Number.isFinite(x.val)&&x.filed<=f.filed).sort((a,b)=>(b.accn===f.accn)-(a.accn===f.accn)||b.filed.localeCompare(a.filed));
      if(same[0])return same[0].val;
    }
    // Absent from the whole filing: the line is not presented, so it contributes zero.
    return inFiling(facts,f.accn,tags)?null:0;
  };
  for(const tag of PRETAX)for(const f of facts[tag]?.units?.USD||[]) {
    const key=f.start+'|'+f.end+'|'+f.accn;
    if(!f.start||!forms.has(f.form)||!Number.isFinite(f.val)||direct.has(f.start+'|'+f.end)||seen.has(key))continue;
    const interest=component(TAGS.interest,f),income=component(INTEREST_INCOME,f);
    if(interest===null||income===null)continue;
    seen.add(key);
    out.push({...f,val:f.val+interest-income,sourceTag:tag,basis:'EBIT derived as pre-tax income + interest expense − interest income; other non-operating items remain included'});
  }
  const result=out.length?{...facts,[DERIVED_EBIT]:{units:{USD:out}}}:facts;
  derivedFacts.set(facts,result);
  return result;
}
export const durationDays=f=>(Date.parse(f.end)-Date.parse(f.start))/864e5;
function record(f,tag,cik,unit) {
  return {value:f.val/1e6,raw:f.val,unit,tag:f.sourceTag||tag,start:f.start||null,end:f.end,filed:f.filed,form:f.form,accession:f.accn,cik:f.sourceCik||cik,
    ...(f.basis?{basis:f.basis,dimension:f.dimension||null}:{}),
    url:f.sourceUrl||`https://www.sec.gov/Archives/edgar/data/${Number(f.sourceCik||cik)}/${f.accn.replaceAll('-','')}/`};
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
    // Depreciation alone establishes total D&A only when the same filing presents no
    // intangible-amortization line at all.
    if(dep&&!inFiling(facts,dep.accession,TAGS.amortization))return {value:dep.value,records:[{...dep,operation:'depreciation; no amortization line in this filing'}]};
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
export function financials(raw,submission={},asOf=new Date().toISOString().slice(0,10),options={}) {
  const facts=withDerivedFacts(raw.facts?.['us-gaap']);
  if(!facts)throw new DataError('Accounting adapter unavailable: this issuer requires IFRS/local-GAAP normalization. No US-GAAP values substituted.');
  const cik=raw.cik,quality=[],checks=[];
  const critical=(code,text)=>quality.push({code,severity:'critical',text});
  const revFacts=TAGS.revenue.flatMap(t=>facts[t]?.units?.USD||[]);
  const ends=[...new Set(revFacts.filter(f=>/^10-K/.test(f.form)&&f.start&&durationDays(f)>=330&&durationDays(f)<=380&&f.filed<=asOf).map(f=>f.end))].sort().slice(-10);
  const flows=['revenue','ebit','da','capex','cfo','interest','sbc','rd'];
  const history=ends.map(end=>{
    const row={end,year:Number(end.slice(0,4)),provenance:{}};
    for(const key of flows){const m=metric(facts,key,{end,annual:true,cik,asOf});row[key]=m.value;if(m.records.length)row.provenance[key]=m.records;}
    row.dilutedShares=metric(facts,'dilutedShares',{end,annual:true,cik,asOf,unit:'shares'}).value;
    Object.assign(row,workingCapitalAt(facts,end,cik,asOf));
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
      else if((key==='da'||key==='rd')&&annual[key]!==null&&annual.revenue>0&&base.revenue>0) {
        // Some issuers disclose D&A or R&D only annually. Scale the latest annual ratio to TTM revenue.
        base[key]=annual[key]/annual.revenue*base.revenue;base.provenance[key]=annual.provenance[key].map(r=>({...r,operation:`annual ${key==='da'?'D&A':'R&D'} / revenue × TTM revenue`}));
        quality.push({severity:'review',code:key+'-annual-ratio',text:`Interim ${key==='da'?'D&A':'R&D'} is not disclosed; TTM ${key==='da'?'D&A':'R&D'} uses the latest annual ratio to revenue.`});
      }
      else {base[key]=null;delete base.provenance[key];}
    }
  }
  const capexTag=base.provenance.capex?.[0]?.tag;
  if(base.capex!==null&&capexTag&&TAGS.capex.indexOf(capexTag)>1&&Number.isFinite(base.da)&&base.capex<.25*base.da) {
    // A narrow fallback concept (e.g. "other" equipment) cannot stand in for total capex.
    base.capex=null;delete base.provenance.capex;
    critical('capex-implausible','The only capital-expenditure concept found is below 25% of D&A and is likely a partial line. Total capex requires review.');
  }
  if(base.provenance.ebit?.some(r=>r.basis))quality.push({severity:'review',code:'ebit-derived',text:'No operating-income subtotal is reported. EBIT is derived from pre-tax income plus interest expense less interest income and still includes other non-operating items.'});
  const opt={end:base.end,cik,asOf};
  for(const key of ['cash','shortInvest','longInvest','currentAssets','currentLiabilities','longDebt','currentDebt','shortDebt','combinedCurrentDebt','totalTermDebt','financeLeaseCurrent','financeLeaseNoncurrent','shares','assets','liabilitiesEquity','ppe','goodwill','intangibles','equity','preferred','minority','pension']) {
    const m=metric(facts,key,{...opt,unit:key==='shares'?'shares':'USD'});base[key]=m.value;if(m.records.length)base.provenance[key]=m.records;
  }
  if(base.shares===null) {
    // Cover-page counts are dated after the period end; a count from another era (multi-class
    // issuers can have only an old consolidated fact) must not price today's equity.
    const near=f=>{const days=(Date.parse(f.end)-Date.parse(base.end))/864e5;return days>=-100&&days<=150;};
    const f=(raw.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares||[]).filter(f=>near(f)&&f.filed<=asOf).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed))[0];
    if(f){base.shares=f.val/1e6;base.provenance.shares=[record(f,'dei:EntityCommonStockSharesOutstanding',cik,'shares')];}
  }
  base.absenceInferred=[];
  const sheet=(base.provenance.currentAssets||base.provenance.assets)?.[0];
  if(sheet) {
    const blocked=new Set(options.noAbsence||[]);
    const presented=key=>inFiling(facts,sheet.accession,TAGS[key]);
    const captured=new Set([...TAGS.shortDebt,...TAGS.combinedCurrentDebt,...TAGS.financeLeaseCurrent,...TAGS.financeLeaseNoncurrent]);
    const anyDebt=[...(tagsByAccession(facts).get(sheet.accession)||[])].some(t=>DEBT_LIKE.test(t)&&!captured.has(t));
    const cashTag=base.provenance.cash?.[0]?.tag;
    if(cashTag==='CashCashEquivalentsAndShortTermInvestments'&&base.shortInvest===null){base.shortInvest=0;base.provenance.shortInvest=[{...base.provenance.cash[0],value:0,raw:0,operation:'included in the combined cash and short-term investments line'}];}
    if(cashTag==='CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents')quality.push({severity:'review',code:'cash-restricted',text:'Unrestricted cash is not tagged separately; the cash balance includes restricted cash.'});
    const zero=(key,why)=>{
      if(blocked.has(key))return;
      base[key]=0;base.absenceInferred.push(key);
      base.provenance[key]=[{value:0,raw:0,unit:'USD',tag:'NotPresented:'+TAGS[key][0],start:null,end:base.end,filed:sheet.filed,form:sheet.form,accession:sheet.accession,cik:sheet.cik,url:sheet.url,operation:why}];
    };
    if(base.shortInvest===null&&!presented('shortInvest'))zero('shortInvest','No current marketable-securities line in the balance-sheet filing');
    if(base.longInvest===null&&!presented('longInvest'))zero('longInvest','No noncurrent marketable-securities line in the balance-sheet filing');
    if(base.longDebt===null&&base.totalTermDebt===null&&!anyDebt)zero('longDebt','No debt line of any kind in the balance-sheet filing');
    if(base.shortDebt===null&&base.combinedCurrentDebt===null&&!presented('shortDebt')&&!presented('combinedCurrentDebt'))zero('shortDebt','No short-term borrowing line in the balance-sheet filing');
    // Skip when current maturities can be derived as total term debt less noncurrent debt.
    if(base.currentDebt===null&&base.combinedCurrentDebt===null&&!presented('currentDebt')&&!(base.longDebt!==null&&base.totalTermDebt!==null))zero('currentDebt','No current-maturities line in the balance-sheet filing');
    if(base.absenceInferred.length)quality.push({severity:'review',code:'absence-zero',text:`Not presented in the ${sheet.form} balance sheet (${sheet.accession}) and recorded as zero: ${base.absenceInferred.join(', ')}. Company-specific tags are checked against the primary filing when available.`});
  }
  if(base.shares===null) {
    const f=TAGS.basicShares.flatMap(t=>facts[t]?.units?.shares||[]).filter(f=>f.start&&f.end===base.end&&f.filed<=asOf&&durationDays(f)>=60&&durationDays(f)<=125).sort((a,b)=>b.filed.localeCompare(a.filed))[0];
    if(f){base.shares=f.val/1e6;base.provenance.shares=[{...record(f,TAGS.basicShares[0],cik,'shares'),operation:'latest-quarter weighted basic shares; no period-end count for all classes'}];quality.push({severity:'review',code:'shares-weighted',text:'No period-end share count covers every share class; latest-quarter weighted basic shares are used.'});}
  }
  for(const key of ['dilutedShares','basicShares']) {const m=metric(facts,key,{end:annual.end,annual:true,cik,asOf,unit:'shares'});base[key]=m.value;if(m.records.length)base.provenance[key]=m.records;}
  // Weighted-average shares are not period-end diluted shares. Disclose a conservative proxy only.
  base.dilutionIncrement=base.dilutedShares!==null&&base.basicShares!==null?Math.max(0,base.dilutedShares-base.basicShares):null;
  base.valuationShares=base.dilutionIncrement!==null&&base.shares!==null?base.shares+base.dilutionIncrement:base.shares;
  if(base.dilutionIncrement===null)critical('dilution','A period-end option/RSU/convertible dilution schedule is unverified. Basic shares remain an exploratory denominator.');
  else quality.push({severity:'review',code:'dilution-proxy',text:'Dilution proxy adds latest annual diluted-minus-basic weighted shares to period-end shares. Exercise-price, RSU and convertible schedules still require review.'});
  if(base.currentDebt===null&&base.combinedCurrentDebt===null&&base.longDebt!==null&&base.totalTermDebt!==null&&base.totalTermDebt>=base.longDebt) {
    base.currentDebt=base.totalTermDebt-base.longDebt;
    base.provenance.currentDebt=[...base.provenance.totalTermDebt.map(r=>({...r,operation:'add total term debt'})),...base.provenance.longDebt.map(r=>({...r,operation:'subtract noncurrent debt'}))];
  }
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
  if(base.debt===null&&base.longDebt===null&&base.currentDebt===null&&base.totalTermDebt!==null&&base.combinedCurrentDebt!==null) {
    // Only an aggregate term-debt line and a combined current-debt line are tagged. Filers
    // commonly tag the noncurrent face line with the aggregate concept; adding the current
    // line can overstate debt by at most the current maturities, which lowers, never raises, value.
    base.debt=base.totalTermDebt+base.combinedCurrentDebt+base.leaseDebt;
    quality.push({severity:'review',code:'debt-aggregate',text:'Debt = aggregate term-debt line + combined current debt. If the aggregate already includes current maturities, debt is overstated by at most the current line.'});
  }
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
  Object.assign(base,{workingCapitalComponents:workingCapitalAt(facts,base.end,cik,asOf).components});
  return {base,history,quarterly:quarterlyFinancials(raw,asOf),quality,reconciliations:checks,continuity:raw.continuity||null,accountingStandard:'US-GAAP',asOf};
}

function workingCapitalAt(facts,end,cik,asOf) {
  const values={},components={},opt={end,cik,asOf};
  let sheet=null;
  for(const key of ['currentAssets','currentLiabilities','cash','shortInvest','combinedCurrentDebt','currentDebt','shortDebt','financeLeaseCurrent','receivables','inventory','payables','deferredRevenue']){const m=metric(facts,key,opt);values[key]=m.value;if(key==='currentAssets')sheet=m.records[0]?.accession;}
  if(sheet) {
    if(values.shortInvest===null&&!inFiling(facts,sheet,TAGS.shortInvest))values.shortInvest=0;
    if(values.combinedCurrentDebt===null) {
      if(values.shortDebt===null&&!inFiling(facts,sheet,TAGS.shortDebt))values.shortDebt=0;
      if(values.currentDebt===null&&!inFiling(facts,sheet,TAGS.currentDebt))values.currentDebt=0;
    }
  }
  for(const key of ['receivables','inventory','payables','deferredRevenue'])components[key]=values[key];
  const financing=values.combinedCurrentDebt??(Number.isFinite(values.currentDebt)&&Number.isFinite(values.shortDebt)?values.currentDebt+values.shortDebt+(values.financeLeaseCurrent??0):null);
  const inputs=[values.currentAssets,values.currentLiabilities,values.cash,values.shortInvest,financing];
  return {nwc:inputs.every(Number.isFinite)?values.currentAssets-values.cash-values.shortInvest-values.currentLiabilities+financing:null,components};
}

// Discrete fiscal quarters, never mislabeled YTD flows. Q4 = FY minus nine months.
// All source records are filtered by filing date before any subtraction.
export function quarterlyFinancials(raw,asOf=new Date().toISOString().slice(0,10)) {
  const facts=withDerivedFacts(raw.facts?.['us-gaap'])||{},cik=raw.cik;
  const available=new Map();
  // A 53-week fiscal year places its extra week in one quarter: 14 weeks (98 days)
  // or a 17-week fourth quarter (119 days) for 12/12/12/16-week retailers.
  const QUARTER_MAX=125;
  const eligible=key=>{if(!available.has(key))available.set(key,(TAGS[key]||[]).flatMap(tag=>(facts[tag]?.units?.USD||[]).filter(f=>forms.has(f.form)&&f.start&&f.end<=asOf&&f.filed<=asOf&&Number.isFinite(f.val)).map(f=>({...f,tag})))
    .sort((a,b)=>b.filed.localeCompare(a.filed)||(TAGS[key].indexOf(a.tag)-TAGS[key].indexOf(b.tag))));return available.get(key);};
  const revenue=eligible('revenue');
  const ends=[...new Set(revenue.filter(f=>durationDays(f)>=60&&durationDays(f)<=380).map(f=>f.end))].sort().slice(-64);
  const rows=[];
  for(const end of ends) {
    const row={end,provenance:{}};
    for(const key of ['revenue','ebit','capex','da','cfo','interest','sbc']) {
      const fs=eligible(key),direct=fs.find(f=>f.end===end&&durationDays(f)>=60&&durationDays(f)<=QUARTER_MAX);
      let value=null,records=[];
      if(direct){value=direct.val/1e6;records=[record(direct,direct.tag,cik,'USD')];if(key==='revenue')row.start=direct.start;}
      else {
        for(const current of fs.filter(f=>f.end===end&&durationDays(f)>QUARTER_MAX&&durationDays(f)<=380)) {
          const prior=fs.find(f=>f.start===current.start&&f.end<end&&f.tag===current.tag&&(Date.parse(end)-Date.parse(f.end))/864e5>=60&&(Date.parse(end)-Date.parse(f.end))/864e5<=QUARTER_MAX);
          if(!prior)continue;
          value=(current.val-prior.val)/1e6;
          records=[{...record(current,current.tag,cik,'USD'),operation:'add cumulative'},{...record(prior,prior.tag,cik,'USD'),operation:'subtract cumulative'}];
          if(key==='revenue')row.start=new Date(Date.parse(prior.end)+864e5).toISOString().slice(0,10);
          break;
        }
      }
      row[key]=value;if(records.length)row.provenance[key]=records;
    }
    if(!(row.revenue>0)||!row.start)continue;
    row.availableAt=row.provenance.revenue.reduce((latest,r)=>r.filed>latest?r.filed:latest,'');
    Object.assign(row,workingCapitalAt(facts,end,cik,asOf));
    row.margin=Number.isFinite(row.ebit)?row.ebit/row.revenue:null;
    row.basis=row.provenance.revenue.length===1?'Reported discrete quarter':'Cumulative statements differenced into a discrete quarter';
    rows.push(row);
  }
  return rows;
}
