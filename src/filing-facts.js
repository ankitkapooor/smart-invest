// Fill narrowly supported gaps from the exact primary filing. Company Facts
// omits dimensional balances, company-specific concepts and untagged statements
// of absence. A balance inferred as zero because no standard concept is presented
// is re-checked here against company-specific concepts in the same filing.
import {pickFact,TAGS} from './accounting.js';
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),m[2]]));
const text=s=>s.replace(/<[^>]*>/g,' ').replace(/&#160;|&#xA0;|&nbsp;/gi,' ').replace(/&#8211;|&#8212;|&ndash;|&mdash;/gi,'–').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function supplementFilingFacts(raw,html,filing,asOf=new Date().toISOString().slice(0,10)) {
  const facts=raw.facts?.['us-gaap'];
  if(!facts||!html||filing.date>asOf||filing.end>asOf||Number(filing.cik)!==Number(raw.cik))return {raw,notes:[]};
  const contexts=new Map(),units=new Set(),values=new Map(),notes=[];
  for(const m of html.matchAll(/<(?:xbrli:)?unit\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?unit>/gi))
    if(/^(?:iso4217:)?USD$/.test(text(m[2]))&&!/divide/i.test(m[2]))units.add(attrs(m[1]).id);
  for(const m of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const body=m[2],end=body.match(/<(?:xbrli:)?instant>([^<]+)</i)?.[1];
    const owner=body.match(/<(?:xbrli:)?identifier\b[^>]*>([^<]+)</i)?.[1];
    if(end!==filing.end||Number(owner)!==Number(raw.cik)||/typedMember/i.test(body))continue;
    const dimensions=[...body.matchAll(/<(?:xbrldi:)?explicitMember\b([^>]*)>([\s\S]*?)<\/(?:xbrldi:)?explicitMember>/gi)].map(d=>({axis:attrs(d[1]).dimension,member:text(d[2])}));
    if(dimensions.length>1)continue;
    if(dimensions.length&&dimensions[0].axis!=='us-gaap:BalanceSheetLocationAxis')continue;
    contexts.set(attrs(m[1]).id,dimensions[0]?.member||'consolidated');
  }
  for(const m of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const a=attrs(m[1]),scope=contexts.get(a.contextref),s=text(m[2]);
    if(!scope||!units.has(a.unitref)||a['xsi:nil']==='true'||!a.name?.startsWith('us-gaap:'))continue;
    if(a.format&&!/^(?:ixt[^:]*:)?num-dot-decimal$/.test(a.format))continue;
    if(!/^-?[\d,]+(?:\.\d+)?$/.test(s)||!/^-?\d+$/.test(a.scale||'0'))continue;
    const value=Number(s.replaceAll(',',''))*10**Number(a.scale||0)*(a.sign==='-'?-1:1);
    if(!Number.isFinite(value)||value<0)continue;
    const tag=a.name.slice(8),key=tag+'|'+scope,prior=values.get(key);
    // Conflicting duplicate facts make this concept unusable, not first-wins.
    values.set(key,prior!==undefined&&prior!==value?NaN:value);
  }
  const patched={...facts};
  const opt={end:filing.end,cik:raw.cik,asOf};
  const fact=key=>pickFact(patched,TAGS[key],opt);
  function add(key,value,basis,sourceTag,dimension) {
    if(!Number.isFinite(value)||fact(key))return;
    const tag=TAGS[key][0],existing=facts[tag];
    const item={val:value,end:filing.end,filed:filing.date,form:filing.form,accn:filing.accession,sourceUrl:filing.url,basis,sourceTag,dimension};
    patched[tag]={...existing,units:{...existing?.units,USD:[...existing?.units?.USD||[],item]}};
    notes.push({severity:'review',code:'filing-'+key,text:basis+' ('+filing.end+').',url:filing.url});
  }
  for(const key of ['shortDebt','combinedCurrentDebt','financeLeaseCurrent','financeLeaseNoncurrent','longInvest']) {
    if(fact(key))continue;
    for(const tag of TAGS[key]) {
      const value=values.get(tag+'|consolidated');
      if(Number.isFinite(value)){add(key,value,'Period-matched consolidated USD fact recovered from primary-filing inline XBRL',tag);break;}
    }
  }
  const total=values.get('FinanceLeaseLiability|consolidated');
  const current=values.get('FinanceLeaseLiability|us-gaap:OtherCurrentLiabilitiesMember');
  const noncurrent=values.get('FinanceLeaseLiability|us-gaap:OtherNoncurrentLiabilitiesMember');
  if([total,current,noncurrent].every(Number.isFinite)&&Math.abs(current+noncurrent-total)<=1&&(!fact('financeLeaseCurrent')||fact('financeLeaseCurrent').raw===current)&&(!fact('financeLeaseNoncurrent')||fact('financeLeaseNoncurrent').raw===noncurrent)) {
    add('financeLeaseCurrent',current,'Finance-lease current principal from the balance-sheet-location dimension; current plus noncurrent reconciles to the reported lease total','FinanceLeaseLiability','us-gaap:OtherCurrentLiabilitiesMember');
    add('financeLeaseNoncurrent',noncurrent,'Finance-lease noncurrent principal from the balance-sheet-location dimension; current plus noncurrent reconciles to the reported lease total','FinanceLeaseLiability','us-gaap:OtherNoncurrentLiabilitiesMember');
  }
  if(!pickFact(patched,TAGS.shortDebt,opt)&&!pickFact(patched,TAGS.combinedCurrentDebt,opt)) {
    // Require an unqualified statement for this fiscal year. A facility-specific
    // statement or an immaterial balance is not proof of a consolidated zero.
    const year=filing.end.slice(0,4),plain=text(html.replace(/<ix:header\b[^>]*>[\s\S]*?<\/ix:header>/gi,''));
    const absent=new RegExp('There (?:were|was) no short[–-]term borrowings outstanding at the end of '+year+'(?:[.,;]|$)','i');
    if(absent.test(plain))add('shortDebt',0,'The debt note explicitly reports no short-term borrowings outstanding at this fiscal year-end','Narrative:NoShortTermBorrowings');
    else {
      // A consolidated "Total debt" row can reconcile the residual after term
      // debt. Restrict to the exact label; "Total long-term debt" is insufficient.
      const long=fact('longDebt'),due=fact('currentDebt'),term=fact('totalTermDebt');
      const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
      const totalRow=rows.some(row=>/^Total debt\s/i.test(text(row))&&[...row.matchAll(/<ix:nonFraction\b([^>]*)>/gi)].some(m=>{const a=attrs(m[1]);return a.name==='us-gaap:LongTermDebt'&&contexts.get(a.contextref)==='consolidated';}));
      const inline=values.get('LongTermDebt|consolidated');
      if(totalRow&&long&&due&&term&&Number.isFinite(inline)&&Math.abs(inline-term.raw)<=1&&Math.abs(inline-long.raw-due.raw)<=1)
        add('shortDebt',0,'Short-term borrowing residual is zero at reporting materiality: the filing’s Total debt row reconciles exactly to current and noncurrent term debt. This is a filing-based inference requiring review','Derived:TotalDebtLessTermDebt');
    }
  }
  return {raw:{...raw,facts:{...raw.facts,'us-gaap':patched}},notes};
}

// Company-specific (non us-gaap) balance-sheet concepts that could carry a balance
// that Company Facts omits. Any positive period-matched consolidated amount blocks
// the corresponding zero inference.
const CUSTOM={
  debt:{keys:['longDebt','currentDebt','shortDebt'],name:/(Debt|Borrowing|NotesPayable|CommercialPaper|SeniorNotes|LoansPayable)/i},
  investments:{keys:['shortInvest','longInvest'],name:/(ShortTermInvestment|MarketableSecurit|AvailableForSaleSecurit)/i}
};
const NOT_BALANCE=/(Securit(?!y?ies?Current|iesNoncurrent)|Receivable|Issuance|Discount|Premium|FairValue|Interest|Maturit|Proceeds|Repayment|Covenant|Capacity|Available(?!ForSale)|Facility|Weighted|Rate|Term(?:s)?$|Gain|Loss|Expense|Income)/i;
export function customLineItems(html,filing,cik) {
  const contexts=new Set(),found={};
  if(!html)return found;
  for(const m of html.matchAll(/<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi)) {
    const body=m[2],end=body.match(/<(?:xbrli:)?instant>([^<]+)</i)?.[1],owner=body.match(/<(?:xbrli:)?identifier\b[^>]*>([^<]+)</i)?.[1];
    if(end===filing.end&&Number(owner)===Number(cik)&&!/explicitMember|typedMember/i.test(body))contexts.add(attrs(m[1]).id);
  }
  for(const m of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/gi)) {
    const a=attrs(m[1]),name=a.name||'',local=name.split(':')[1]||'',value=Number(text(m[2]).replaceAll(',',''));
    if(!contexts.has(a.contextref)||/^(us-gaap|dei|srt|ifrs-full):/.test(name)||a['xsi:nil']==='true'||!(value>0))continue;
    for(const [group,{keys,name:pattern}] of Object.entries(CUSTOM)) {
      // Securities footnotes (maturity buckets, cost basis, fair-value tables) and disposal
      // groups are not the balance-sheet line; debt matches stay broad because a false zero
      // overstates value.
      const excluded=group==='investments'?/(Receivable|Proceeds|Gain|Loss|Income|Purchase|Sale(?!Securit)|Disposal|Discontinued|Maturit|AmortizedCost|CostBasis|FairValue|Unrealized|Allowance|Disclosure)/i:NOT_BALANCE;
      if(pattern.test(local)&&!excluded.test(local))for(const key of keys)(found[key]??=[]).push(name);
    }
  }
  return found;
}
