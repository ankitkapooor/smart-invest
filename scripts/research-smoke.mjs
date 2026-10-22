// Explicit live test: may create one paid research job, subject to the server quota.
import {mkdir,writeFile} from 'node:fs/promises';
import {analyze,defaults} from '../public/model.js';
const symbol=(process.argv[2]||'AAPL').toUpperCase();
const origin=process.env.VALUELENS_TEST_ORIGIN||'https://valuelens.ankitkapoor.me';
if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)||!['https://valuelens.ankitkapoor.me','http://localhost:8787'].includes(origin))throw Error('Unsupported test symbol or origin.');
const get=async(path,options={})=>{
  const response=await fetch(origin+path,{...options,signal:AbortSignal.timeout(120000)});
  let body;try{body=await response.json();}catch{throw Error('Non-JSON API response (HTTP '+response.status+').');}
  if(!response.ok)throw Error(body.error||'HTTP '+response.status);return body;
};
const config=await get('/api/config');
if(!config.researchConfigured)throw Error('Server key is not configured.');
if(config.researchModel!=='gpt-5.6-terra')throw Error('Live test expects the lower-cost gpt-5.6-terra model.');
console.log(JSON.stringify({origin,symbol,config}));
let job=await get('/api/research',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({symbol})});
for(let attempt=0;attempt<80&&['starting','running'].includes(job.status);attempt++){
  if(attempt%4===0)console.log(JSON.stringify({status:job.status,model:job.model,key:job.key}));
  await new Promise(resolve=>setTimeout(resolve,15000));
  job=await get('/api/research?key='+encodeURIComponent(job.key));
}
const analysis=job.analysis?analyze(job.analysis,defaults(job.analysis)):null;
const summary={testedAt:new Date().toISOString(),origin,symbol,status:job.status,model:job.model,reasoningEffort:job.reasoningEffort,
  sources:job.report?.sources?.length,businessDrivers:job.report?.businessDrivers?.map(s=>s.name),quarterlyForecasts:job.forecastSnapshot?.quarterly?.quarters?.length,guidance:job.guidance?.accepted?.length,peerSymbols:job.analysis?.peers?.map(p=>p.symbol),
  hFactors:job.report?.risk?.hFactors?.length,searchCalls:job.researchTrace?.searchCalls,
  errors:job.errors||[],valuationErrors:analysis?.errors||[],price:analysis?.valued?.price,
  vintageHash:job.forecastSnapshot?.inputHash,usage:job.usage};
const folder=new URL('../reports/v03-live/',import.meta.url);await mkdir(folder,{recursive:true});
await writeFile(new URL(symbol+'-report.json',folder),JSON.stringify(job,null,2));
await writeFile(new URL(symbol+'-summary.json',folder),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(job.status!=='validated'||job.errors?.length||!analysis||analysis.errors.length||job.forecastSnapshot?.quarterly?.quarters?.length!==4)process.exitCode=1;
