// Package issued, source-checked research only. Never publish API identifiers,
// credentials, saved market quotes or saved DCF prices as application defaults.
import {readFile,writeFile} from 'node:fs/promises';
import {validateResearch,RESEARCH_VERSION} from '../src/research.js';
import {RESEARCH_COMPAT_VERSION,defaults,analyze} from '../public/model.js';
import {applyResearch} from '../src/research.js';
const records={};
for(const symbol of ['AAPL','MSFT','COST','NVDA','GOOGL']){
  const job=JSON.parse(await readFile(new URL('../reports/v04-live/'+symbol+'-forecast.json',import.meta.url),'utf8'));
  const urls=[...job.researchTrace.observedUrls,...job.researchTrace.verifiedFilingDocuments.map(s=>s.url)];
  const errors=validateResearch(job.report,job.data,urls);
  const data=applyResearch(job.data,job),result=analyze(data,defaults(data));
  if(job.status!=='validated'||errors.length||result.errors.length||!result.diagnostics?.arithmetic.passed)throw Error(symbol+' failed issuance checks: '+JSON.stringify([...errors,...result.errors]));
  records[symbol]={periodEnd:job.data.base.end,modelVersion:RESEARCH_COMPAT_VERSION,researchVersion:RESEARCH_VERSION,status:job.status,model:job.model,completedAt:job.completedAt,report:job.report,accounting:job.accounting,guidance:job.guidance,researchTrace:job.researchTrace};
}
await writeFile(new URL('../src/forecast-seeds.json',import.meta.url),JSON.stringify(records,null,2)+'\n');
console.log('Packaged '+Object.keys(records).length+' checked research vintages; fresh data and quotes remain required.');
