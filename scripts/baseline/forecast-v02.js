// Forecast assumptions are researched; valuation arithmetic remains deterministic.
export const bounded=(x,a,b)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=bounded(x,0,1);return x*x*(3-2*x);};
export function buildForecast(base,a) {
  const rows=[];let revenue=base.revenue,nwc=base.nwc;
  const researched=a.driverForecast?.status==='validated';
  const segments=researched?a.driverForecast.segments.map(s=>({...s,revenue:base.revenue*s.weight})):null;
  for(let year=1;year<=10;year++) {
    const fade=smooth((year-5)/5);
    let growth,drivers=[];
    if(segments) {
      for(const s of segments) {
        const i=Math.min(year-1,4),near=(1+s.volumeGrowth[i])*(1+s.priceGrowth[i])-1;
        const g=near+(a.terminalGrowth-near)*fade;
        const previous=s.revenue;s.revenue*=1+g;
        drivers.push({name:s.name,revenue:s.revenue,growth:g,volumeGrowth:s.volumeGrowth[i],priceGrowth:s.priceGrowth[i],priorRevenue:previous});
      }
      const next=segments.reduce((t,s)=>t+s.revenue,0);growth=next/revenue-1;revenue=next;
    } else {growth=a.growth+(a.terminalGrowth-a.growth)*fade;revenue*=1+growth;}
    const i=Math.min(year-1,4),d=a.driverForecast;
    const nearMargin=researched?d.margins[i]:base.ebit/base.revenue+(a.margin-base.ebit/base.revenue)*Math.min(year/5,1);
    const margin=nearMargin+(a.margin-nearMargin)*fade;
    const ebit=revenue*margin,cashTax=Math.max(ebit,0)*a.tax,nopat=ebit-cashTax;
    const da=revenue*(researched?d.daRatios[i]:a.da);
    const rawCapex=revenue*(researched?d.capexRatios[i]:a.capex);
    const nextNwc=revenue*(researched?d.nwcRatios[i]:a.nwc),deltaNwc=nextNwc-nwc;nwc=nextNwc;
    const rawReinvestment=rawCapex-da+deltaNwc;
    const steadyReinvestment=nopat*growth/a.terminalROIC;
    // Fade the economic reinvestment ratio along with growth and margin, ending
    // exactly at g/ROIC. A labeled adjustment preserves the FCFF identity.
    const reinvestment=rawReinvestment+(steadyReinvestment-rawReinvestment)*fade;
    const capex=da+reinvestment-deltaNwc;
    rows.push({year,growth,margin,revenue,ebit,cashTax,nopat,da,capex,nwc,deltaNwc,
      rawCapex,reinvestment,steadyReinvestment,transitionAdjustment:capex-rawCapex,
      fcff:nopat-reinvestment,drivers,forecastBasis:researched?'Evidence-validated company drivers':'Current-input baseline; research pending'});
  }
  return rows;
}
