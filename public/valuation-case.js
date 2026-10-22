// Company-specific analyst estimates are distinct from measured short-term
// statistical forecasts. Quotes never enter construction of this contract.
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const rationale=object({explanation:{type:'string'},sourceIds:{type:'array',items:{type:'string'},minItems:1,maxItems:12}});
export const VALUATION_CASE_SCHEMA=object({
  periodEnd:{type:'string'},basis:{type:'string',enum:['analyst_estimate']},
  years:{type:'array',minItems:5,maxItems:5,items:object({year:{type:'integer',minimum:1,maximum:5},growth:number(-.5,1),margin:number(0,.8),capexRatio:number(0,1),daRatio:number(0,.5),nwcRatio:number(-1,1)})},
  terminal:object({growth:number(0,.04),roic:number(.03,.6),margin:number(0,.8),daRatio:number(0,.3),nwcRatio:number(-1,1)}),
  growthRationale:rationale,marginRationale:rationale,investmentRationale:rationale,terminalRationale:rationale
});
export function validateValuationCase(value,data,sources) {
  const errors=[],fail=message=>errors.push('Valuation forecast: '+message);
  if(!value||value.basis!=='analyst_estimate'||value.periodEnd!==data.base.end||!Array.isArray(value.years)||value.years.length!==5)return ['Valuation forecast: invalid forecast contract or financial period.'];
  const check=(v,min,max,key)=>{if(!Number.isFinite(v)||v<min||v>max)fail(key+' outside bounds.');};
  for(const [i,y] of value.years.entries()){
    if(!y||y.year!==i+1)fail('Years must be consecutive 1–5.');
    for(const [key,min,max] of [['growth',-.5,1],['margin',0,.8],['capexRatio',0,1],['daRatio',0,.5],['nwcRatio',-1,1]])check(y?.[key],min,max,key);
  }
  const t=value.terminal;
  if(!t)fail('Terminal assumptions missing.');
  else{
    for(const [key,min,max] of [['growth',0,.04],['roic',.03,.6],['margin',0,.8],['daRatio',0,.3],['nwcRatio',-1,1]])check(t[key],min,max,'terminal '+key);
    if(!(t.roic>t.growth&&data.rates.rf>t.growth))fail('Terminal growth must be below ROIC and the risk-free rate.');
  }
  for(const key of ['growthRationale','marginRationale','investmentRationale','terminalRationale']){
    const r=value[key];if(!r||typeof r.explanation!=='string'||r.explanation.length<60||!Array.isArray(r.sourceIds)||!r.sourceIds.length||r.sourceIds.some(id=>!sources.has(id)))fail(key+' needs a substantive rationale and observed sources.');
  }
  return errors;
}
