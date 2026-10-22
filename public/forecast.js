// Fitted operating assumptions and explicit long-run scenarios; deterministic arithmetic.
export const bounded=(x,a,b)=>Math.max(a,Math.min(b,x));
export const smooth=x=>{x=bounded(x,0,1);return x*x*(3-2*x);};
export function buildForecast(base,a) {
  const rows=[];let revenue=base.revenue,nwc=base.nwc;
  // R&D capitalized: R&D is investment amortized over rdLife years. Adjusted NOPAT adds back
  // net R&D (R&D − amortization) and reinvestment includes it, so explicit-year FCFF is
  // unchanged; the stable-state reinvestment rate and ROIC use the same adjusted basis.
  const rdOn=a.rdCapitalize&&a.rdRatio>0&&a.rdLife>0&&Array.isArray(a.rdSchedule)&&a.rdSchedule.length>=a.rdLife;
  const rdHistory=rdOn?[...a.rdSchedule]:[];
  // An explicit five-year revenue growth path (consensus case or implied-growth solve)
  // overrides growth only; margins and investment ratios follow the active case.
  const path=Array.isArray(a.growthPath)&&a.growthPath.length===5?a.growthPath:null;
  // A consensus margin path covers years 1–5 and is then held (analysts' implied margin persists).
  const marginPath=Array.isArray(a.marginPath)&&a.marginPath.length===5?a.marginPath:null;
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
    // Statistical case: year 1 is the measured near-term forecast; years 2–5 use the
    // backtested medium-term rule; years 6–10 fade to the stable state.
    const medium=fitted&&Number.isFinite(a.mediumGrowth)?a.mediumGrowth:null;
    const growth=path?(year<=5?path[year-1]:path[4]*(1-fade)+a.terminalGrowth*fade)
      :business?(year<=5?point.growth+growthShift:(last.growth+growthShift)*(1-fade)+a.terminalGrowth*fade)
      :medium!==null?(year===1?a.growth:year<=5?medium:medium*(1-fade)+a.terminalGrowth*fade)
      :a.growth+(a.terminalGrowth-a.growth)*revenueFade;revenue*=1+growth;
    const nearMargin=fitted?a.operatingForecast.nearMargin:base.ebit/base.revenue+(a.margin-base.ebit/base.revenue)*Math.min(year/5,1);
    // Statistical case: year 1 is the measured quarterly margin; years 2–10 use the
    // backtested long-run margin (a.margin).
    const margin=marginPath?marginPath[Math.min(year,5)-1]:business?(year<=5?point.margin+(a.margin-business.terminal.margin):(last.margin+a.margin-business.terminal.margin)*(1-fade)+a.margin*fade):fitted?(year===1?nearMargin:a.margin):nearMargin+(a.margin-nearMargin)*fade;
    const ebit=revenue*margin,cashTax=Math.max(ebit,0)*a.tax,nopatReported=ebit-cashTax;
    const rd=rdOn?revenue*a.rdRatio:0,rdAmortization=rdOn?rdHistory.slice(-a.rdLife).reduce((s,x)=>s+x,0)/a.rdLife:0;
    if(rdOn)rdHistory.push(rd);
    const netRD=rd-rdAmortization,nopat=nopatReported+netRD;
    const da=revenue*(business?(year<=5?point.daRatio:last.daRatio*(1-fade)+business.terminal.daRatio*fade):a.da);
    // A capex surge (statistical case) fades to its five-year median by year 5.
    const capexPath=!business&&Array.isArray(a.capexPath)&&a.capexPath.length===5?a.capexPath:null;
    const rawCapex=revenue*(business?point.capexRatio:capexPath?capexPath[Math.min(year,5)-1]:a.capex);
    const nextNwc=revenue*(business?(year<=5?point.nwcRatio:last.nwcRatio*(1-fade)+business.terminal.nwcRatio*fade):a.nwc),deltaNwc=nextNwc-nwc;nwc=nextNwc;
    const rawReinvestment=rawCapex-da+deltaNwc+netRD;
    const steadyReinvestment=nopat*growth/a.terminalROIC;
    // Fade the economic reinvestment ratio along with growth and margin, ending
    // exactly at g/ROIC. A labeled adjustment preserves the FCFF identity.
    const reinvestment=rawReinvestment+(steadyReinvestment-rawReinvestment)*fade;
    const capex=da+reinvestment-netRD-deltaNwc;
    rows.push({year,growth,margin,revenue,ebit,cashTax,nopat,nopatReported,rd,rdAmortization,netRD,da,capex,nwc,deltaNwc,
      rawCapex,reinvestment,steadyReinvestment,transitionAdjustment:capex-rawCapex,
      fcff:nopat-reinvestment,drivers,forecastBasis:business?(year<=5?'Company-specific researched analyst estimate':'Fade from researched year five to the explicit stable state'):fitted?(year===1?a.operatingForecast.basis:medium!==null&&year<=5?'Medium-term rule: 25% own five-year CAGR + 75% × 5% (backtested)':'Long-run fade scenario; predictive accuracy unmeasured'):'Manual operating scenario'});
  }
  return rows;
}
