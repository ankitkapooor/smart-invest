// Fitted operating assumptions and explicit long-run scenarios; deterministic arithmetic.
export const bounded=(x,a,b)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=bounded(x,0,1);return x*x*(3-2*x);};
export function buildForecast(base,a) {
  const rows=[];let revenue=base.revenue,nwc=base.nwc;
  const fitted=a.operatingForecast?.status==='fitted';
  for(let year=1;year<=10;year++) {
    const fade=smooth((year-5)/5);
    const drivers=[];
    // Only year one is a tested near-term forecast. Later years are explicitly
    // a growth-fade scenario, not repeated claims of quarterly predictive skill.
    const revenueFade=fitted?smooth((year-1)/9):fade;
    const growth=a.growth+(a.terminalGrowth-a.growth)*revenueFade;revenue*=1+growth;
    const nearMargin=fitted?a.operatingForecast.nearMargin:base.ebit/base.revenue+(a.margin-base.ebit/base.revenue)*Math.min(year/5,1);
    const margin=nearMargin+(a.margin-nearMargin)*fade;
    const ebit=revenue*margin,cashTax=Math.max(ebit,0)*a.tax,nopat=ebit-cashTax;
    const da=revenue*a.da;
    const rawCapex=revenue*a.capex;
    const nextNwc=revenue*a.nwc,deltaNwc=nextNwc-nwc;nwc=nextNwc;
    const rawReinvestment=rawCapex-da+deltaNwc;
    const steadyReinvestment=nopat*growth/a.terminalROIC;
    // Fade the economic reinvestment ratio along with growth and margin, ending
    // exactly at g/ROIC. A labeled adjustment preserves the FCFF identity.
    const reinvestment=rawReinvestment+(steadyReinvestment-rawReinvestment)*fade;
    const capex=da+reinvestment-deltaNwc;
    rows.push({year,growth,margin,revenue,ebit,cashTax,nopat,da,capex,nwc,deltaNwc,
      rawCapex,reinvestment,steadyReinvestment,transitionAdjustment:capex-rawCapex,
      fcff:nopat-reinvestment,drivers,forecastBasis:fitted?(year===1?a.operatingForecast.basis:'Long-run fade scenario; predictive accuracy unmeasured'):'Manual operating scenario'});
  }
  return rows;
}
