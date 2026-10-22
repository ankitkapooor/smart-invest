import {writeFile} from 'node:fs/promises';
import {loadCompany} from '../src/data.js';
const data=await loadCompany(process.argv[2]||'AAPL',{SEC_USER_AGENT:'ValueLens research (https://ankitkapoor.me)'});
await writeFile(new URL('../public/example.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({symbol:data.symbol,baseEnd:data.base.end,quoteDate:data.quote?.asOf,peers:data.peers.length,quality:data.quality.map(x=>x.text)},null,2));
