// Read-only production smoke test. Never invokes paid research or external financial feeds.
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const expected=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const origin='https://valuelens.ankitkapoor.me';
let lastError;
for(let attempt=0;attempt<6;attempt++){
 try{
  const suffix='?verify='+Date.now();
  const [page,build,config]=await Promise.all(['/','/build.json','/api/config'].map(path=>fetch(origin+path+suffix,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)})));
  if(!page.ok||!build.ok||!config.ok)throw Error('Production endpoint returned an unsuccessful status.');
  const [html,metadata,settings]=await Promise.all([page.text(),build.json(),config.json()]);
  if(!html.includes('ValueLens'))throw Error('Production page is not ValueLens.');
  if(metadata.commit!==expected)throw Error('Production has not activated commit '+expected.slice(0,7)+' yet.');
  if(metadata.version!==pkg.version||settings.modelVersion!==pkg.version)throw Error('Production version does not match the repository.');
  if(!settings.researchConfigured)throw Error('Production OPENAI_API_KEY secret is missing.');
  console.log(JSON.stringify({verified:true,url:origin,commit:metadata.commit,version:metadata.version,researchConfigured:true}));
  process.exit(0);
 }catch(e){lastError=e;console.log('Waiting for deployment verification ('+(attempt+1)+'/6): '+e.message);if(attempt<5)await new Promise(r=>setTimeout(r,10000));}
}
throw lastError;
