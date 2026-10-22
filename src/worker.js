import {searchCompanies,privateCompanyHint,loadCompany,loadPeerComparison,DataError} from './data.js';
import {withDeadline} from './deadline.js';
import {MODEL_VERSION,RESEARCH_COMPAT_VERSION} from '../public/model.js';
import {attachIssuedForecast} from './forecast-seeds.js';
import {RESEARCH_MODEL,RESEARCH_EFFORT,RESEARCH_VERSION} from './research.js';
export {ResearchStore} from './research.js';

const buckets=new Map();
function rateLimited(ip,limit) {
  // Best-effort isolate limiter. Use Cloudflare WAF rate limiting for a public launch.
  const now=Date.now(),bucket=buckets.get(ip);
  if(!bucket || now-bucket.start>60e3) {if(buckets.size>2000)buckets.clear();buckets.set(ip,{start:now,count:1});return false;}
  return ++bucket.count>limit;
}
function json(value,status=200) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}});
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if(!['GET','POST'].includes(request.method)||request.method==='POST'&&url.pathname!=='/api/research') return json({error:'Method not allowed.'},405);
    if(request.method==='POST' && request.headers.get('Origin')!==url.origin)return json({error:'Same-origin research requests only.'},403);
    const client=(request.headers.get('CF-Connecting-IP') || 'local')+'|'+url.pathname;
    if(rateLimited(client,url.pathname==='/api/search'?60:12)) return json({error:'Too many requests. Please wait one minute.'},429);
    try {
      if(url.pathname==='/api/config')return json({researchConfigured:!!env.OPENAI_API_KEY,researchModel:env.OPENAI_MODEL||RESEARCH_MODEL,researchEffort:RESEARCH_EFFORT,dailyResearchLimit:Number(env.RESEARCH_DAILY_LIMIT)||10,modelVersion:MODEL_VERSION});
      if(url.pathname==='/api/forecast') {
        const symbol=(url.searchParams.get('symbol')||'').toUpperCase(),period=url.searchParams.get('period')||'';
        if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(period))throw new DataError('Invalid forecast lookup.');
        if(!env.RESEARCH)return json({status:'not_started'});
        const key=[symbol,period,RESEARCH_COMPAT_VERSION,RESEARCH_VERSION,env.OPENAI_MODEL||RESEARCH_MODEL].join(':');
        const store=env.RESEARCH.get(env.RESEARCH.idFromName('global-research-v1'));
        const response=await store.fetch(new Request('https://research.internal/?key='+encodeURIComponent(key)));
        return response.status===404?json({status:'not_started',key}):json(await response.json(),response.status);
      }
      if(url.pathname==='/api/research') {
        if(!env.OPENAI_API_KEY)return json({error:'Research is awaiting your server-side OPENAI_API_KEY. See the Research tab for setup.'},503);
        if(!env.RESEARCH)return json({error:'Research storage is unavailable.'},503);
        const store=env.RESEARCH.get(env.RESEARCH.idFromName('global-research-v1'));
        if(request.method==='GET') {
          const key=url.searchParams.get('key')||'';
          if(!/^[A-Z0-9.\-]{1,12}:\d{4}-\d{2}-\d{2}:(?:0\.2\.0:research-3|0\.3\.0:research-4|0\.4\.0:research-5):[a-zA-Z0-9._-]{1,80}$/.test(key))throw new DataError('Invalid research job key.');
          const response=await store.fetch(new Request('https://research.internal/?key='+encodeURIComponent(key)));return json(await response.json(),response.status);
        }
        if(Number(request.headers.get('Content-Length'))>2048)throw new DataError('Research request too large.',413);
        const body=await request.text();if(body.length>2048)throw new DataError('Research request too large.',413);
        let input;try{input=JSON.parse(body);}catch{throw new DataError('Invalid JSON research request.');}
        if(typeof input.symbol!=='string')throw new DataError('A ticker string is required.');
        const data=await withDeadline(loadCompany(input.symbol,env,[],{includePeers:false}),30000);
        const response=await store.fetch(new Request('https://research.internal/',{method:'POST',body:JSON.stringify(data)}));return json(await response.json(),response.status);
      }
      if(url.pathname==='/api/search') {
        const q=url.searchParams.get('q')||'',companies=await withDeadline(searchCompanies(q,env),10000);
        return json({companies,hint:privateCompanyHint(q)});
      }
      if(url.pathname==='/api/peers') {
        const peers=(url.searchParams.get('peers')||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
        return json(await withDeadline(loadPeerComparison(url.searchParams.get('symbol')||'',env,peers),28000,'Peer comparison timed out. The company analysis remains available.'));
      }
      if(url.pathname==='/api/company') {
        const symbol=url.searchParams.get('symbol')||'';
        const peers=(url.searchParams.get('peers')||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
        if(peers.length>4) throw new DataError('Choose up to four peers.');
        const data=await withDeadline(loadCompany(symbol,env,peers,{includePeers:url.searchParams.get('includePeers')!=='0'}),30000,'Company data did not load within 30 seconds. Please retry.');
        return json(attachIssuedForecast(data));
      }
      return json({error:'API route not found.'},404);
    } catch(e) {
      console.error(e.name,e.message);
      return json({error:e instanceof DataError?e.message:'The analysis could not be completed. Please try again.',details:e.details||[]},e.status||500);
    }
  }
};
