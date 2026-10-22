// Fitted operating assumptions and explicit long-run scenarios; deterministic arithmetic.
export const bounded=(x,a,b)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=bounded(x,0,1);return x*x*(3-2*x);};
export function buildForecast(base,a) {
  const rows=[];let revenue=base.revenue,nwc=base.nwc;
  const fitted=a.operatingForecast?.status==='fitted';
  const business=a.valuationForecast;
  for(let year=1;year<=10;year++) {
    const fade=smooth((year-5)/5);
    const drivers=[];
    // The statistical benchmark and the researched valuation case are separate.
    // Only the benchmark has a completed historical operating evaluation.
    const revenueFade=fitted?smooth((year-1)/9):fade;
    const point=business?.years[Math.min(year,5)-1],last=business?.years[4];
    const growthShift=business?a.growth-business.years[0].growth:0;
    const growth=business?(year<=5?point.growth+growthShift:(last.growth+growthShift)*(1-fade)+a.terminalGrowth*fade):a.growth+(a.terminalGrowth-a.growth)*revenueFade;revenue*=1+growth;
    const nearMargin=fitted?a.operatingForecast.nearMargin:base.ebit/base.revenue+(a.margin-base.ebit/base.revenue)*Math.min(year/5,1);
    const margin=business?(year<=5?point.margin+(a.margin-business.terminal.margin):(last.margin+a.margin-business.terminal.margin)*(1-fade)+a.margin*fade):nearMargin+(a.margin-nearMargin)*fade;
    const ebit=revenue*margin,cashTax=Math.max(ebit,0)*a.tax,nopat=ebit-cashTax;
    const da=revenue*(business?(year<=5?point.daRatio:last.daRatio*(1-fade)+business.terminal.daRatio*fade):a.da);
    const rawCapex=revenue*(business?point.capexRatio:a.capex);
    const nextNwc=revenue*(business?(year<=5?point.nwcRatio:last.nwcRatio*(1-fade)+business.terminal.nwcRatio*fade):a.nwc),deltaNwc=nextNwc-nwc;nwc=nextNwc;
    const rawReinvestment=rawCapex-da+deltaNwc;
    const steadyReinvestment=nopat*growth/a.terminalROIC;
    // Fade the economic reinvestment ratio along with growth and margin, ending
    // exactly at g/ROIC. A labeled adjustment preserves the FCFF identity.
    const reinvestment=rawReinvestment+(steadyReinvestment-rawReinvestment)*fade;
    const capex=da+reinvestment-deltaNwc;
    rows.push({year,growth,margin,revenue,ebit,cashTax,nopat,da,capex,nwc,deltaNwc,
      rawCapex,reinvestment,steadyReinvestment,transitionAdjustment:capex-rawCapex,
      fcff:nopat-reinvestment,drivers,forecastBasis:business?(year<=5?'Company-specific researched analyst estimate':'Fade from researched year five to the explicit stable state'):fitted?(year===1?a.operatingForecast.basis:'Long-run fade scenario; predictive accuracy unmeasured'):'Manual operating scenario'});
  }
  return rows;
}
