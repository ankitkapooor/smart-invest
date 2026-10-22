// Publish only deployment provenance. No environment values or credentials are exported.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw Error('A valid Git commit is required for deployment provenance.');
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const metadata={commit,version:pkg.version,builtAt:new Date().toISOString()};
await writeFile(new URL('../public/build.json',import.meta.url),JSON.stringify(metadata,null,2)+'\n');
console.log('Deployment provenance: '+commit);
