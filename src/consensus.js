// Analyst consensus revenue estimates. Source: Yahoo Finance quoteSummary earningsTrend, an
// unofficial endpoint (not a licensed feed). Used only to show how the market's analysts see
// the business; it never alters the fundamental (base-rate) case.
const YAHOO='https://query1.finance.yahoo.com';
let session=null;
const memo=new Map();

async function yahooSession(fetcher,now) {
  if(session&&session.expires>now)return session;
  const first=await fetcher('https://fc.yahoo.com/',{headers:{'User-Agent':'Mozilla/5.0'},redirect:'manual'});
  const raw=first.headers.get('set-cookie')||'';
  const cookie=raw.split(/,(?=\s*[A-Za-z0-9_]+=)/).map(c=>c.split(';')[0].trim()).filter(c=>/^A[13S]=/.test(c)).join('; ');
  if(!cookie)throw new Error('Consensus session unavailable.');
  const crumbResponse=await fetcher(`${YAHOO}/v1/test/getcrumb`,{headers:{'User-Agent':'Mozilla/5.0',Cookie:cookie}});
  const crumb=(await crumbResponse.text()).trim();
  if(!crumbResponse.ok||!crumb||crumb.length>40||/[<\s]/.test(crumb))throw new Error('Consensus session unavailable.');
  session={cookie,crumb,expires:now+3600e3};
  return session;
}

export function parseConsensus(body,symbol,asOf) {
  const trend=body?.quoteSummary?.result?.[0]?.earningsTrend?.trend||[];
  const years=trend.filter(t=>['0y','+1y'].includes(t.period)).map(t=>({period:t.period,end:t.endDate,
    revenue:t.revenueEstimate?.avg?.raw/1e6,low:t.revenueEstimate?.low?.raw/1e6,high:t.revenueEstimate?.high?.raw/1e6,
    growth:t.revenueEstimate?.growth?.raw,analysts:t.revenueEstimate?.numberOfAnalysts?.raw,
    epsGrowth:t.growth?.raw,epsAnalysts:t.earningsEstimate?.numberOfAnalysts?.raw}))
    .filter(y=>/^\d{4}-\d{2}-\d{2}$/.test(y.end)&&y.revenue>0&&Number.isFinite(y.growth));
  if(years.length<2)return null;
  return {source:'Yahoo Finance analyst consensus (unofficial; not a licensed feed)',url:`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis/`,asOf,years};
}

export async function consensusEstimates(symbol,{fetcher=fetch,now=Date.now()}={}) {
  const hit=memo.get(symbol);
  if(hit&&hit.expires>now)return hit.value;
  let value=null;
  for(let attempt=0;attempt<2&&value===null;attempt++) {
    const s=await yahooSession(fetcher,now);
    const r=await fetcher(`${YAHOO}/v10/finance/quoteSummary/${encodeURIComponent(symbol.replace('.','-'))}?modules=earningsTrend&crumb=${encodeURIComponent(s.crumb)}`,{headers:{'User-Agent':'Mozilla/5.0',Cookie:s.cookie}});
    if(r.status===401||r.status===403){session=null;continue;}
    if(!r.ok)break;
    value=parseConsensus(await r.json(),symbol,new Date(now).toISOString());
    break;
  }
  memo.set(symbol,{value,expires:now+6*3600e3});
  if(memo.size>500)memo.delete(memo.keys().next().value);
  return value;
}
