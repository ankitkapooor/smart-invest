import {DataError} from './accounting.js';
export async function withDeadline(task,ms,message='The public-data request timed out. Please retry.') {
  let timer;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new DataError(message,504)),ms);})]);}
  finally{clearTimeout(timer);}
}
