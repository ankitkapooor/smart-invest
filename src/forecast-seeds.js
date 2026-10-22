import seeds from './forecast-seeds.json' with {type:'json'};
import {RESEARCH_COMPAT_VERSION} from '../public/model.js';
import {applyResearch,validateResearch,RESEARCH_VERSION} from './research.js';

// Issued research vintages, never saved quotes or saved valuation outputs.
// Fresh financials, rates and market prices are always supplied by loadCompany.
export function attachIssuedForecast(data,now=Date.now(),records=seeds) {
  const seed=records[data.symbol],age=now-Date.parse(seed?.completedAt);
  if(!seed||seed.status!=='validated'||seed.periodEnd!==data.base.end||seed.modelVersion!==RESEARCH_COMPAT_VERSION||seed.researchVersion!==RESEARCH_VERSION||!Number.isFinite(age)||age< -300000||age>7*864e5)return data;
  const urls=[...(seed.researchTrace?.observedUrls||[]),...(seed.researchTrace?.verifiedFilingDocuments||[]).map(s=>s.url)];
  if(validateResearch(seed.report,{...data,asOf:seed.report.asOf},urls).length)return data;
  return applyResearch(data,{...seed,basis:'Issued research vintage; fresh financials and quote',key:[data.symbol,data.base.end,RESEARCH_COMPAT_VERSION,RESEARCH_VERSION,seed.model].join(':')});
}
