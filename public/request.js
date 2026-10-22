// Bound the complete operation, including response-body transfer. The explicit
// race also ends waiting if a network layer does not settle after cancellation.
export async function requestJSON(url,{signal,timeoutMs=35000,fetcher=fetch,method='GET',body}={}) {
  const controller=new AbortController();let timer,rejectAbort;
  const abort=()=>{controller.abort();rejectAbort?.(new DOMException('Request cancelled','AbortError'));};
  if(signal?.aborted)throw new DOMException('Request cancelled','AbortError');
  signal?.addEventListener('abort',abort,{once:true});
  try {
    const task=(async()=>{
      const response=await fetcher(url,{method,signal:controller.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const text=await response.text();let payload;
      try{payload=JSON.parse(text);}catch{throw Error(response.ok?'The data service returned an unreadable response. Please retry.':`The data service is temporarily unavailable (HTTP ${response.status}). Please retry.`);}
      if(!response.ok)throw Error(payload.error||`The data service returned HTTP ${response.status}. Please retry.`);
      if(!payload||typeof payload!=='object')throw Error('The data service returned an incomplete response. Please retry.');
      return payload;
    })();
    return await Promise.race([task,new Promise((_,reject)=>{
      rejectAbort=reject;
      timer=setTimeout(()=>{reject(Error('The analysis did not load within '+Math.round(timeoutMs/1000)+' seconds. Please retry.'));controller.abort();},timeoutMs);
    })]);
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
