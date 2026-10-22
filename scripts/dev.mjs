import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import worker,{ResearchStore} from '../src/worker.js';

const localVars={};
try{for(const line of (await readFile(new URL('../.dev.vars',import.meta.url),'utf8')).split('\n')){const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(m)localVars[m[1]]=m[2].trim().replace(/^([\"'])(.*)\1$/,'$2');}}catch{}
// Local-only in-memory store; deployed research uses persistent Cloudflare storage.
const values=new Map(),storage={get:async k=>values.get(k),put:async(k,v)=>{values.set(k,structuredClone(v));},transaction:async fn=>fn(storage)};
let localStore;

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const env={...localVars,...Object.fromEntries(['OPENAI_API_KEY','OPENAI_MODEL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),SEC_USER_AGENT:process.env.SEC_USER_AGENT||'ValueLens research (https://ankitkapoor.me)',ASSETS:{async fetch(request){
  const pathname=decodeURIComponent(new URL(request.url).pathname);
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)) return new Response('Not found',{status:404});
  try{return new Response(await readFile(target),{headers:{'Content-Type':types[path.extname(target)]||'application/octet-stream'}});}
  catch{return new Response('Not found',{status:404});}
}}};
localStore=new ResearchStore({storage},env);
env.RESEARCH={idFromName:n=>n,get:()=>localStore};
const server=http.createServer(async(req,res)=>{
  try{
    const chunks=[];for await(const chunk of req){chunks.push(chunk);if(chunks.reduce((s,c)=>s+c.length,0)>2048){res.writeHead(413);res.end('Request too large');return;}}
    const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
    const response=await worker.fetch(request,env,{waitUntil:p=>p.catch(console.error)});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){console.error(e);res.writeHead(500);res.end('Server error');}
});
const port=Number(process.env.PORT||8787);
server.listen(port,'127.0.0.1',()=>console.log(`ValueLens: http://localhost:${port}`));
