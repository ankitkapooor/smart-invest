import {analyze,defaults,median,unlever,RATINGS,RATINGS_SOURCE,MODEL_VERSION} from './model.js';

const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(x):'Unavailable';
const pct=(x,d=1)=>Number.isFinite(x)?`${(x*100).toFixed(d)}%`:'—';
const num=(x,d=0)=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}).format(x):'—';
const big=x=>Number.isFinite(x)?`$${num(x/1000,1)}B`:'—';
const date=x=>x?new Date(x.length===10?x+'T12:00:00Z':x).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'}):'Unavailable';
const dateTime=x=>x?new Date(x).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:'America/Los_Angeles'}):'Unavailable';
const signed=x=>Number.isFinite(x)?`${x>=0?'+':''}${pct(x)}`:'—';
const link=(url,label)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${label} ↗</a>`:'Unavailable';
let data=null,a=null,result=null,currentView='overview',isExample=true,changes=0,loadController=null,searchTimer=null,searchController=null;
let researchConfig={researchConfigured:false},researchJob=null,researchBusy=false,validationReport=null;
fetch('/api/config').then(r=>r.json()).then(c=>{researchConfig=c;if(data&&currentView==='research')render();}).catch(()=>{});
fetch('/validation/latest.json').then(r=>r.json()).then(v=>{validationReport=v;if(data&&currentView==='validation')render();}).catch(()=>{});
let saved=[];try{saved=JSON.parse(localStorage.getItem('valuelens.saved')||'[]').filter(x=>typeof x==='string').slice(0,20);}catch{}

function panel(title,subtitle,body,tag='') {
  return `<section class="panel"><div class="panel-header"><div><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</div>${tag?`<span class="chip">${tag}</span>`:''}</div>${body}</section>`;
}
function metric(label,value,sub,primary=false) {return `<div class="metric ${primary?'primary':''}"><div class="metric-label">${label}<span>↗</span></div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;}
function table(headers,rows,cls='') {return `<div class="table-scroll"><table class="${cls}"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr ${r.highlight?'class="highlight-row"':''}>${r.cells.map((c,i)=>`<${i===0?'th scope="row"':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function overview() {
  const r=result,v=r.valued,o=r.optimized;
  const label=r.status==='Above modeled value'?'Price exceeds this model’s value.':r.status==='Review required'?'The numbers need a closer look.':r.status==='Below safety threshold'?'A valuation gap worth investigating.':'Below value, with a narrow safety cushion.';
  const reason=r.status==='Review required'?'Data gaps, stale inputs or a manual quote prevent a reliable price comparison. Review the audit trail and assumptions first.':`The modeled value is <strong>${pct(Math.abs(r.upside))} ${r.upside<0?'below':'above'} the last traded price</strong>. This is a comparison with one set of assumptions, not a forecast of stock returns.`;
  return `<div class="metrics">
    ${metric('Modeled value / share',money(v?.price),`<span class="metric-primary-badge">BASE CASE</span> ${signed(r.upside)} vs. market`,true)}
    ${metric('Last traded price',money(r.marketPrice),`${a.quoteOverride!==null?'Manual quote · review required':dateTime(data.quote?.asOf)+' · '+esc(data.quote?.exchange||'')}<br>${a.quoteOverride!==null?'Entered in assumptions':'Quote may be delayed'}`)}
    ${metric('Current cost of capital',pct(r.current.wacc,2),`Cost of equity ${pct(r.current.ke)}<br>Cost of debt ${pct(r.current.kd)}`)}
    ${metric('Value at constrained OCS',money(o?.price),`Conditional recap scenario<br>${a.hReviewed?'h factors reviewed':'Draft h factors · review required'}`)}
    </div>
    <div class="two-columns">
    ${panel('Cash generation, brought into focus.','Ten-year operating forecast · USD billions',`<div class="panel-body">${fcfChart(r.rows)}<div class="legend"><span><i></i>Free cash flow to firm</span><span><i class="line"></i>Operating profit after tax</span></div></div><div class="chart-footer"><span>Growth fades toward ${pct(a.terminalGrowth)} after year 5</span><button class="text-button" data-view="cashflows">Explore cash flows ↗</button></div>`,'FORWARD ESTIMATES')}
    ${panel('From the business to the share.','Enterprise-to-equity bridge · current structure',`<div class="panel-body"><ul class="value-bridge"><li><span>PV of forecast cash flows</span><strong>${big(v?.pvFlows)}</strong></li><li><span>PV of terminal value</span><strong>${big(v?.pvTerminal)}</strong></li><li class="total"><span>Enterprise value</span><strong>${big(v?.ev)}</strong></li><li><span>+ Cash & current securities</span><strong>${big(Math.max(0,data.base.cash-a.cashReserve))}</strong></li><li><span>+ Noncurrent marketable securities</span><strong>${big(data.base.nonOperatingInvestments)}</strong></li><li><span>− Gross financial debt</span><strong>${big(data.base.debt)}</strong></li><li><span>− Other claims / adjustments</span><strong>${big(a.otherClaims)}</strong></li><li class="total"><span>Common equity value</span><strong>${big(v?.equity)}</strong></li></ul><div class="bridge-bar"><span>÷ ${num(data.base.valuationShares??data.base.shares,0)}M shares (dilution proxy)</span><strong>${money(v?.price)}</strong></div></div>`)}
    </div>
    <div class="insight ${r.status==='Review required'?'amber':''}"><span class="insight-icon">✳</span><div><h3>${label}</h3><p>${reason} At your ${pct(a.marginOfSafety,0)} margin of safety, the research threshold is <strong>${money(r.buyBelow)}</strong>. Business quality, concentration, liquidity needs and your investment horizon still matter.</p></div></div>
    ${panel('A range of futures.','Bear, base and bull are explicit assumption sets; they are not probability estimates.',`<div class="panel-body"><div class="scenario-grid">${r.cases.map((c,i)=>`<div class="scenario-card"><div class="section-kicker">${c.name.toUpperCase()} <span>${i===0?'↘':i===1?'→':'↗'}</span></div><strong>${money(c.price)}</strong><p>Initial growth ${pct(c.growth)}<br>Target EBIT margin ${pct(c.margin)}<br>Terminal growth ${pct(c.terminalGrowth)}</p><div class="scenario-track"><span style="width:${[38,64,88][i]}%"></span></div></div>`).join('')}</div><p class="muted">The current WACC stays fixed across these operating scenarios. A full recession case may also require a higher business-risk premium.</p></div>`,'CHANGE THE ASSUMPTIONS')}
    <div class="two-columns equal">
    ${panel('What if the business stops growing?','Two steady states, each with a matching growth and reinvestment fade.',table(['Terminal assumption','Enterprise value','Value / share'],[
      {cells:['g = 0 · maintenance reinvestment',big(r.zero?.ev),money(r.zero?.price)]},
      {highlight:true,cells:[`g = ${pct(a.terminalGrowth)} · ROIC ${pct(a.terminalROIC)}`,big(v?.ev),money(v?.price)]}
    ])+`<div class="table-note">g = 0 assumes net reinvestment of zero and sustainable maintenance capex equal to D&A. It does not mean capital spending disappears.</div>`)}
    ${panel('The assumptions doing the work.','Trace the value back to its economic drivers.',`<div class="panel-body"><ul class="value-bridge"><li><span>Initial revenue growth</span><strong>${pct(a.growth)}</strong></li><li><span>Target operating margin</span><strong>${pct(a.margin)}</strong></li><li><span>Terminal ROIC</span><strong>${pct(a.terminalROIC)}</strong></li><li><span>Value from the terminal period</span><strong>${pct(v?.terminalShare)}</strong></li></ul><p class="stamp">${v?.terminalShare>.75?'Terminal value is over 75% of gross operating value. Small changes can materially change the result.':'Review the sensitivity grid before relying on a point estimate.'}</p></div>`)}
    </div>
    ${sensitivityPanel()}
    ${qualityPanel()}`;
}

function fcfChart(rows) {
  const width=600,height=225,left=40,right=16,top=18,bottom=32;
  const low=Math.min(0,...rows.map(r=>r.fcff)),high=Math.max(1,...rows.map(r=>Math.max(r.nopat,r.fcff)))*1.12;
  const y=v=>top+(high-v)/(high-low)*(height-top-bottom),step=(width-left-right)/rows.length;
  const points=rows.map((r,i)=>`${left+step*(i+.5)},${y(r.nopat)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected free cash flows over ten years, with operating profit after tax for comparison"><defs><linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#44745c"/><stop offset="1" stop-color="#89a183"/></linearGradient></defs>${[0,.25,.5,.75,1].map(f=>{const val=low+(high-low)*f;return `<line x1="${left}" y1="${y(val)}" x2="${width-right}" y2="${y(val)}" stroke="#edf0e6" stroke-dasharray="3 4"/><text x="${left-10}" y="${y(val)+3}" text-anchor="end">${num(val/1000,0)}</text>`;}).join('')}${rows.map((r,i)=>`<rect x="${left+step*(i+.22)}" y="${Math.min(y(r.fcff),y(0))}" width="${step*.56}" height="${Math.max(1,Math.abs(y(0)-y(r.fcff)))}" rx="3" fill="url(#bar-fill)" opacity="${.72+i*.025}"><title>Year ${r.year}: FCFF ${big(r.fcff)}</title></rect><text x="${left+step*(i+.5)}" y="${height-9}" text-anchor="middle">Y${r.year}</text>`).join('')}<polyline points="${points}" fill="none" stroke="#c4a270" stroke-width="1.7" stroke-dasharray="4 4"/></svg>`;
}

function sensitivityPanel() {
  return panel('Small changes. Different valuations.','Value per share across WACC and terminal growth · explicit fade and terminal reinvestment recalculated.',`<div class="table-scroll"><table class="sensitivity"><thead><tr><th>WACC ↓ / g →</th>${result.sensitivity[0].values.map(c=>`<th>${pct(c.g)}</th>`).join('')}</tr></thead><tbody>${result.sensitivity.map((row,i)=>`<tr><th scope="row">${pct(row.wacc,2)}</th>${row.values.map((v,j)=>`<td class="${i===2&&j===2?'active-cell':''}" style="background:${v.price===null?'#faf9f4':`rgba(118,153,90,${Math.max(.03,.2-i*.028+j*.015)})`}">${v.price===null?'Invalid: WACC ≤ g':money(v.price)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,'CURRENT STRUCTURE');
}

function qualityPanel() {
  const items=[...data.quality,
    ...data.rates.notes.map(text=>({severity:'review',text})),
    {severity:'review',text:'Forecasts start at the analysis date using the latest reported TTM run rate. The gap from the reporting date is not filled with unreported financial results.'},
    {severity:'review',text:'Forecast assumptions and unverified balance-sheet adjustments remain provisional. Stable reinvestment fades to g/ROIC; business drivers require company research. Diluted-minus-basic weighted shares are only a dilution proxy.'},
    {severity:'review',text:(data.research?.status==='validated'?'Peers use the cited LLM selection. ':'Candidate peers are a broad industry screen. ')+'Beta uses book debt proxies and assumes negligible debt beta. Review peer leverage, cash balances, business mix and tax rates.'}
  ];
  return panel('Before you trust the number.','Known data gaps and modeling choices remain attached to every exported analysis.',`<div class="panel-body">${items.map(q=>`<div class="quality-item ${q.severity}"><span class="flag">${q.severity==='critical'?'Data gap':'Review'}</span><span>${esc(q.text)}</span></div>`).join('')}</div>`,`${items.length} ITEMS`);
}

function cashflows() {
  const r=result;
  const lines=[['Revenue','revenue'],['Revenue growth','growth','pct'],['Operating margin','margin','pct'],['EBIT','ebit'],['− Unlevered cash tax','cashTax'],['Net operating profit after tax','nopat'],['+ Depreciation & amortization','da'],['− Capital expenditure (after fade)','capex'],['↳ Transition adjustment vs. researched capex','transitionAdjustment'],['− Change in operating NWC','deltaNwc'],['Free cash flow to firm','fcff']];
  const hist=data.history;
  return `<div class="section-actions"><div><h2 class="section-title">Follow the cash.</h2><p class="section-intro">Operating performance first. Financing second. All statement amounts below are in USD millions.</p></div><button class="outline-button" id="export-csv">↓ Forecast CSV</button></div>
    ${panel('The historical evidence.','Full fiscal years; latest filed comparative facts, with period-specific source provenance.',table(['Fiscal year end',...hist.map(h=>esc(h.end))],['revenue','ebit','da','capex','cfo'].map(k=>({cells:[({revenue:'Revenue',ebit:'EBIT',da:'D&A',capex:'Capital expenditure',cfo:'Cash from operations'})[k],...hist.map(h=>num(h[k]))]}))))}
    ${panel('From operating profit to free cash flow.','Year 1 is the next twelve months from analysis; growth fades to the terminal rate in years 6–10.',table(['USD millions',...r.rows.map(f=>`Year ${f.year}`)],lines.map(([name,key,format])=>({highlight:key==='fcff'||key==='nopat',cells:[name,...r.rows.map(f=>format==='pct'?pct(f[key]):num(f[key]))]})))+`<div class="table-note">FCFF = EBIT − unlevered cash tax + D&A − capex − Δoperating NWC. Stock-based compensation stays in operating expenses; it is not added back as free cash.</div>`)}
    <div class="two-columns equal">${panel('The transition to perpetuity.','Terminal growth is supported by productive reinvestment.',`<div class="panel-body"><ul class="value-bridge"><li><span>Year 11 NOPAT</span><strong>${big(r.valued?.terminalNopat)}</strong></li><li><span>Reinvestment rate: g / ROIC</span><strong>${pct(a.terminalGrowth/a.terminalROIC)}</strong></li><li><span>− Terminal reinvestment</span><strong>${big(r.valued?.terminalReinvestment)}</strong></li><li><span>Year 11 FCFF</span><strong>${big(r.valued?.terminalFCFF)}</strong></li><li><span>Undiscounted terminal value</span><strong>${big(r.valued?.terminalValue)}</strong></li><li class="total"><span>PV of terminal value</span><strong>${big(r.valued?.pvTerminal)}</strong></li></ul><div class="formula">TV₁₀ = NOPAT₁₁ × (1 − g / ROIC) / (WACC − g)</div></div>`)}
    ${panel('A reconciliation to review.','The cash-flow statement offers a useful cross-check.',`<div class="panel-body"><ul class="value-bridge"><li><span>Reported TTM CFO</span><strong>${big(data.base.cfo)}</strong></li><li><span>− Reported TTM capex</span><strong>${big(data.base.capex)}</strong></li><li class="total"><span>Levered CFO less capex</span><strong>${Number.isFinite(data.base.cfo)?big(data.base.cfo-data.base.capex):'Unavailable'}</strong></li><li><span>Reported interest expense</span><strong>${data.base.interest===null?'Unavailable':big(data.base.interest)}</strong></li></ul><div class="note-box">CFO less capex is not FCFF. It includes interest, reported tax timing and non-cash addbacks (including SBC). A full FCFF reconciliation requires those adjustments; missing interest is left unavailable.</div></div>`)}
    </div>${sensitivityPanel()}`;
}

function capitalChart() {
  const r=result,w=760,h=220,left=47,right=24,top=20,bottom=35;
  const min=Math.min(...r.sweep.map(x=>x.wacc))*.92,max=Math.max(...r.sweep.filter(x=>x.weight<=.65).map(x=>x.wacc))*1.04;
  const x=t=>left+t/.8*(w-left-right),y=t=>h-bottom-(t-min)/(max-min)*(h-top-bottom);
  const inBounds=r.sweep.filter(t=>t.wacc<=max);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="WACC across gross debt to capital ratios; shaded markers show feasible candidates">${[0,.25,.5,.75,1].map(f=>{let v=min+(max-min)*f;return `<line x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}" stroke="#edf0e6"/><text x="${left-10}" y="${y(v)+3}" text-anchor="end">${pct(v,1)}</text>`;}).join('')}<polyline points="${inBounds.map(t=>`${x(t.weight)},${y(t.wacc)}`).join(' ')}" fill="none" stroke="#9fb28e" stroke-width="2"/>${inBounds.filter(t=>t.feasible).map(t=>`<circle cx="${x(t.weight)}" cy="${y(t.wacc)}" r="2.5" fill="#3c6b41"/>`).join('')}${r.optimal?`<line x1="${x(r.optimal.weight)}" y1="${top}" x2="${x(r.optimal.weight)}" y2="${h-bottom}" stroke="#c29c68" stroke-dasharray="4 4"/><circle cx="${x(r.optimal.weight)}" cy="${y(r.optimal.wacc)}" r="5" fill="#bf9964"/>`:''}${Array.from({length:9},(_,i)=>`<text x="${x(i/10)}" y="${h-10}" text-anchor="middle">${i*10}%</text>`).join('')}</svg>`;
}

function capital() {
  const r=result,c=r.current,o=r.optimal;
  const compare=[['Debt / market capital','weight','pct'],['Gross debt ($M)','debt','num'],['Equity beta','beta','beta'],['Cost of equity','ke','pct'],['Synthetic rating','rating','raw'],['Default spread','spread','pct'],['Cost of debt','kd','pct'],['Annual interest ($M)','interest','num'],['Normal EBIT / interest','coverage','coverage'],['Stressed EBIT / interest','stressedCoverage','coverage'],['Effective shield tax rate','taxShieldRate','pct'],['WACC','wacc','pct']];
  return `<h2 class="section-title">Debt has a cost. So does too little of it.</h2><p class="section-intro">Search for the lowest modeled WACC within a coverage constraint. This is a financing scenario, conditional on refinancing access, tax capacity and the seven h judgments below.</p>
    <div class="metrics">${metric('Current gross debt weight',pct(r.currentWeight),`Debt / (market equity + gross debt)`)}${metric('Constrained grid minimum',pct(o?.weight),`1-point grid · 0–80% debt weight`,true)}${metric('Difference in debt weight',o?`${o.weight-r.currentWeight>=0?'+':''}${num((o.weight-r.currentWeight)*100,1)}<span class="unit">pp</span>`:'—',`Target gross debt ${big(o?.debt)}`)}${metric('Required stressed coverage h',`${num(r.h,2)}<span class="unit">×</span>`,`Max. annual interest ${big(r.maxInterest)}`)}</div>
    <div class="two-columns">${panel('The leverage curve.','Feasible candidates must satisfy normal and stressed coverage.',`<div class="panel-body">${capitalChart()}<div class="legend"><span><i></i>Feasible debt weight</span><span><i class="sage"></i>Modeled WACC</span><span><i class="line"></i>Constrained minimum</span></div></div>`)}
    ${panel('Your class coverage test, made explicit.','h is a minimum stressed coverage requirement.',`<div class="panel-body"><ul class="value-bridge"><li><span>TTM revenue</span><strong>${big(data.base.revenue)}</strong></li><li><span>Revenue stress</span><strong>−${pct(a.stressDrop)}</strong></li><li><span>Stressed EBIT margin</span><strong>${pct(a.stressMargin)}</strong></li><li><span>Stressed EBIT</span><strong>${big(r.stressEBIT)}</strong></li><li><span>÷ h</span><strong>${num(r.h,2)}×</strong></li><li class="total"><span>Maximum annual interest</span><strong>${big(r.maxInterest)}</strong></li></ul><div class="formula">Debt ceiling at each rating = max interest / (Rf + spread)</div></div>`)}
    </div>
    ${panel('Current structure vs. the constrained candidate.','Gross debt uses book principal as a proxy; weights use market equity. Cash stays in the equity bridge.',table(['Metric','Current structure','Constrained OCS'],compare.map(([label,key,format])=>{const f=x=>format==='pct'?pct(x,2):format==='num'?num(x):format==='beta'?num(x,2):format==='coverage'?(x===null?'Debt-free':num(x,2)+'×'):esc(x||'—');return{highlight:key==='wacc',cells:[label,f(c[key]),o?f(o[key]):'Unavailable']};}))+`<div class="table-note">At each weight, the engine enumerates all rating bands and solves debt × (Rf + spread) → interest → EBIT / interest → rating. It chooses the conservative self-consistent band. No fixed point means the candidate is excluded.</div>`)}
    <div class="insight amber"><span class="insight-icon">◇</span><div><h3>The OCS value is conditional.</h3><p>Estimated change in gross debt: <strong>${big(o?o.debt-data.base.debt:null)}</strong>. Illustrative refinancing / transaction costs: <strong>${big(r.recapCosts)}</strong>. Value attributed to existing shareholders is ${money(r.optimized?.price)} per current share, including net recap proceeds, less costs. A post-recap share price also depends on the repurchase or issuance price.</p></div></div>
    ${panel('What happens to the share count?','Illustrative full recap, executed at the last traded price. A financing optimum is not a buyback recommendation.',table(['Recap mechanics','Conditional outcome'],[
      {cells:['Assumed execution price',money(r.postRecap?.executionPrice)]},
      {cells:['Shares retired / (issued), millions',num(r.postRecap?.sharesRetired,1)]},
      {cells:['Post-recap common shares, millions',num(r.postRecap?.shares,1)]},
      {cells:['Post-recap common equity',big(r.postRecap?.equity)]},
      {highlight:true,cells:['Conditional post-recap value / share',money(r.postRecap?.price)]}
    ])+`<div class="table-note">Fees reduce buyback proceeds or increase issuance needed. Buying back above intrinsic value can hurt remaining shareholders even if modeled WACC falls. This illustration assumes immediate refinancing, no execution slippage, no covenants, and constant operating cash flows.</div>`)}
    ${panel('Valuation under each structure.','Each terminal case uses the same operating forecast and a matching discount rate.',table(['Scenario','g = 0','g = '+pct(a.terminalGrowth)],[{cells:['Current structure · per share',money(r.zero?.price),money(r.valued?.price)]},{highlight:true,cells:['Conditional OCS · value / existing share',money(r.optimizedZero?.price),money(r.optimized?.price)]}]))}
    ${panel('Seven ways financial distress can hurt the business.','Company-specific scores come from cited LLM research. Pending research uses visible placeholders; h remains an uncalibrated policy heuristic.',data.hFactors.map((f,i)=>`<div class="factor"><div class="factor-head"><h4>0${i+1} &nbsp; ${esc(f.name)}</h4><label><span class="sr-only">${esc(f.name)} score</span><select data-h-index="${i}">${[...new Set([1,1.5,2,2.5,3,a.hScores[i]])].sort((x,y)=>x-y).map(s=>`<option value="${s}" ${a.hScores[i]===s?'selected':''}>${num(s,1)} / 3</option>`).join('')}</select></label></div><p>${esc(f.description)}. ${esc(f.basis)}</p>${f.sources?f.sources.map(s=>link(s.url,esc(s.title))).join(' · '):''}${f.sources?'':f.evidence?`<blockquote>Matched filing wording: “${esc(f.evidence)}”</blockquote>${link(f.url,'Review Risk Factors in the 10-K')}`:'<div class="note-box">Research pending. This score is a policy placeholder. Run company research to obtain evidence and review the judgment.</div>'}</div>`).join('')+`<div class="review-bar"><label class="checkbox-label"><input id="h-reviewed" type="checkbox" ${a.hReviewed?'checked':''}> I reviewed the seven scores and the source risk factors.</label></div>`,'1 = NEGLIGIBLE · 3 = HIGH')}
    <details><summary>Inspect all 81 leverage candidates and the rating table</summary>${table(['D / capital','Debt $M','Rating','Coverage','Stress cover','WACC','Feasible'],r.sweep.map(x=>({highlight:x===o,cells:[pct(x.weight,0),num(x.debt),esc(x.rating),x.coverage===null?'Debt-free':num(x.coverage,2)+'×',x.stressedCoverage===null?'Debt-free':num(x.stressedCoverage,2)+'×',pct(x.wacc,2),x.feasible?'Yes':x.consistent?'Coverage / rate constraint':'Rating cliff']})))}<div class="panel-body"><p class="muted">${link(RATINGS_SOURCE,'January 2026 large-firm rating table')}. These are synthetic ratings, not agency credit ratings. A traded bond yield of comparable maturity is preferable when available.</p></div>${table(['Minimum ICR','Synthetic rating','Spread above Rf'],RATINGS.map(x=>({cells:[Number.isFinite(x.min)?num(x.min,2)+'×':'Below 0.20×',esc(x.rating),pct(x.spread,2)]})))}</details>`;
}

function comps() {
  const usable=data.peers.filter(p=>p.beta&&p.debt!==null&&p.equity>0&&a.peerIncluded.includes(p.symbol));
  const peerBeta=median(usable.map(p=>unlever(p.beta.beta,p.debt,p.equity,a.tax)));
  return `<h2 class="section-title">Risk is easier to see in context.</h2><p class="section-intro">${esc(data.peerScreen)}. Candidate peers are an explainable starting screen. Include only businesses whose operating risk belongs in this valuation.</p>
    <div class="metrics">${metric('Bottom-up operating beta',num(peerBeta,2),`${usable.length} included candidates · median`,true)}${metric('Active asset beta',num(a.assetBeta,2),`${esc(a.betaBasis)}`)}${metric('Company equity beta',num(data.beta?.beta,2),`${data.beta?.n||0} monthly observations vs. SPY`)}${metric('Current relevered equity beta',num(result.current?.beta,2),`Gross D/E with a ${pct(a.tax,0)} tax assumption`)}</div>
    ${panel('The peer set is part of the thesis.','Adjusted monthly returns over up to five years; complete months only; at least 36 aligned observations.',`<div class="table-scroll"><table><thead><tr>${['Use','Company','Equity β','Unlevered β','R²','Std. error','Debt $M','Market equity $M','EBIT margin','EV / EBIT'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${data.peers.map(p=>{const valid=p.beta&&p.debt!==null&&p.equity>0;return `<tr><td><label><span class="sr-only">Include ${esc(p.symbol)} in peer beta</span><input class="peer-check" type="checkbox" data-peer="${esc(p.symbol)}" ${a.peerIncluded.includes(p.symbol)?'checked':''} ${valid?'':'disabled'}></label></td><th scope="row">${esc(p.symbol)}<div class="subline">${esc(p.name)}</div></th><td>${num(p.beta?.beta,2)}</td><td>${valid?num(unlever(p.beta.beta,p.debt,p.equity,a.tax),2):'—'}</td><td>${pct(p.beta?.r2,0)}</td><td>${num(p.beta?.standardError,2)}</td><td>${num(p.debt)}</td><td>${num(p.equity)}</td><td>${pct(p.margin)}</td><td>${p.ev!==null&&p.ebit>0?num(p.ev/p.ebit,1)+'×':'—'}</td></tr>`;}).join('')}</tbody></table></div><div class="table-note">Unlevered β = equity β / [1 + (1 − tax) × gross debt / market equity]. Peer tax rates currently share the editable marginal-tax prior. Debt beta is assumed negligible; material cash and risky debt require adjustment.</div>`)}
    <div class="note-box">Peer changes update the operating beta. The company's own regression is a cross-check, not a substitute for appropriate business comparisons. All quotes are independently timestamped; financial period ends differ.</div>
    ${data.peers.map(p=>panel(`${esc(p.symbol)} · why it is in the candidate screen`,esc(p.rationale),`<div class="panel-body"><p class="muted">Period end ${esc(p.end||'unavailable')} · Quote ${date(p.quoteDate)}${p.beta?` · Regression ${esc(p.beta.from)}–${esc(p.beta.to)}`:''}</p>${(p.quality||[]).map(q=>`<div class="quality-item critical"><span class="flag">Verify</span><span>${esc(q)}</span></div>`).join('')}${p.quoteUrl?`<p class="stamp">${link(p.quoteUrl,'View quote source')}</p>`:''}</div>`)).join('')}
    ${panel('Use a different comparison set.','Choose up to four US tickers. Company and peer data are fetched again.',`<div class="panel-body"><form id="peer-form" class="peer-controls"><label for="peer-tickers">Peer tickers</label><input id="peer-tickers" value="${esc(data.peers.map(p=>p.symbol).join(', '))}" placeholder="MSFT, ORCL, CRM, ADBE"><button class="primary-button">Update peer set ↗</button></form></div>`)}
    <div class="two-columns equal">${panel('A more current market risk premium.','Use a dated implied premium, with 5% retained as a sensitivity.',`<div class="panel-body"><ul class="value-bridge"><li><span>Active ERP</span><strong>${pct(a.erp,2)}</strong></li><li><span>Published implied ERP</span><strong>${pct(data.rates.erp,2)}</strong></li><li><span>Published date</span><strong>${date(data.rates.erpDate)}</strong></li><li><span>Cost of equity at a 5% ERP</span><strong>${pct(a.rf+result.current?.beta*.05,2)}</strong></li><li><span>Active cost of equity</span><strong>${pct(result.current?.ke,2)}</strong></li></ul><p class="stamp">${link(data.rates.erpUrl,'Source and methodology')}</p></div>`)}
    ${panel('How to use the cross-check.','Price multiples are context, not an independent DCF conclusion.',`<div class="panel-body"><p class="muted">Compare profitability, growth, capital intensity and leverage before reading an EV/EBIT gap as cheapness. Loss-making peers have no meaningful positive EV/EBIT. The table uses a simplified equity + debt − liquid assets enterprise bridge.</p><div class="formula">β = Cov(monthly stock return, SPY return) / Var(SPY return)</div><p class="stamp">The regression uses total-return adjusted prices; it shows sample size, R² and slope standard error. A return beta can change as the business changes.</p></div>`)}</div>`;
}

function methodology() {
  const steps=[
    ['Start with the evidence.','Match the SEC ticker and CIK. Normalize full fiscal years and TTM financials from SEC XBRL. Keep period, unit, tag, accession and filing date for every source value. Foreign accounting standards, banks and other specialized models are routed out.','TTM = latest FY + current YTD − prior YTD'],
    ['Forecast the business.','Research the company’s actual volume, pricing/mix, capacity, margins and investment with a cited LLM report. The historical-growth baseline remains provisional until research passes checks. Fade growth, margins and reinvestment together in years 6–10.','FCFF = EBIT(1 − cash tax rate) + D&A − capex − ΔNWC'],
    ['Price business risk.','Use an industry-screened peer median of unlevered betas. Relever at each debt ratio. Show a company regression cross-check and expose peer quality. CAPM uses a dated 10-year USD Treasury reference and implied ERP.','Ke = Rf + βe × ERP'],
    ['Stress the financing.','Average the seven h scores from the class framework. Apply a revenue shock and a stressed margin. Limit interest to stressed EBIT / h. Enumerate rating bands at each leverage point to ensure cost of debt and coverage agree.','Kd = 10-year Treasury reference + synthetic default spread'],
    ['Pay for perpetual growth.','A ten-year explicit forecast enters a stable state with a separately chosen ROIC. Reinvestment funds growth. Require g below WACC, terminal ROIC and the nominal risk-free-rate assumption. Evaluate g = 0 separately.','TV = NOPAT₁₁ × (1 − g / ROIC) / (WACC − g)'],
    ['Bring value back to equity.','Discount FCFF using WACC. Add non-operating liquid assets, subtract gross debt and other claims, then divide by shares including a disclosed dilution proxy. Show scenarios, sensitivity and a user-defined safety threshold. OCS is a conditional recap value per existing share.','WACC = E/(D+E) × Ke + D/(D+E) × Kd × (1 − usable tax shield)']
  ];
  return `<h2 class="section-title">An argument you can inspect.</h2><p class="section-intro">ValueLens turns a corporate-finance model into a reproducible research process. Reported facts, estimated inputs and investor judgments have different roles—and remain visible.</p><div class="flow-steps">${steps.map(([name,body,formula],i)=>`<article class="method-card"><div class="method-number">0${i+1}</div><h3>${name}</h3><p>${body}</p><div class="formula">${formula}</div></article>`).join('')}</div>
    <div class="note-box">Model version ${MODEL_VERSION}. Forecasts and implied values are deterministic conditional estimates. Company research requires a server-side OpenAI key. Segment estimates, peer selection and debt maturities carry citations and uncertainty. Full NOL tax schedules, option valuation, specialized valuation adapters and probability-weighted distress costs remain outside this edition.</div>
    ${panel('What changed from the class template.','Keep the transparent sequence; improve the economic consistency.',table(['Class-model choice','ValueLens treatment'],[
      {cells:['Net-debt capital weights','Gross financial debt and market equity; liquid assets in the equity bridge']},
      {cells:['βu = βe / (1 + net D/E), without tax','Tax-adjusted gross-debt unlevering; debt-beta and cash caveats visible']},
      {cells:['Nearest sample rating','Explicit coverage intervals; enumerate self-consistent rating / yield pairs']},
      {cells:['Debt capacity called the optimum','Constrained WACC sweep; h sets a financing ceiling']},
      {cells:['Fixed 5% MRP','Dated implied ERP, editable; 5% cost-of-equity comparison']},
      {cells:['Perpetual FCFF growth','Stable-state ROIC determines necessary reinvestment']},
      {cells:['One value and recommendation','Bear/base/bull, sensitivity, source quality and a safety threshold']},
      {cells:['Missing values converted to zero','Required inputs block outputs; explicit absent-tag assumptions are flagged']}
    ]))}
    ${panel('Where judgment cannot be automated away.','A price gap is the beginning of a research question.',`<div class="panel-body"><p class="muted">The best peer is not always in the same SIC code. A single bad year is not always a sustainable stress margin. A company with negative operating capital can release cash while growing, but that relationship may not persist. Research pricing power, competitive durability, capital allocation, cyclicality and governance before accepting the baseline.</p><br><p class="muted">The h average is a class-specific policy heuristic, not an empirically calibrated default model. A minimum WACC on an 81-point grid is a constrained modeled candidate. It excludes execution barriers, distress-related operating losses, dynamic financing, tax-law limits and the time to recapitalize. An APV model with explicit tax shields, expected distress costs and financing costs is an appropriate next-level cross-check.</p></div>`)}
    ${panel('Coverage and data access.','US-listed, non-financial SEC filers with sufficient standardized facts.',`<div class="panel-body"><p class="muted">Any company name can be searched in the SEC ticker catalog. A valuation requires a supported US-GAAP filing history and usable market data. Banks, insurers, funds and real-estate businesses need a different valuation model. IFRS filers, highly distressed firms and companies with custom-only accounting tags are not automatically normalized here.</p><br><p class="muted">SEC statements are public. Yahoo’s chart endpoint is unofficial and can fail or change; quotes are timestamped and may be delayed. A production service should use a licensed market-data feed with redistribution rights. Public production also needs an account-level API rate limit and a source-refresh policy.</p></div>`)}`;
}

function sources() {
  const rows=[];
  for(const [metric,items] of Object.entries(data.base.provenance)) items.forEach((f,i)=>rows.push({cells:[`${esc(metric)}${f.operation?' · '+esc(f.operation):''}`,num(f.value,3),esc(f.end),esc(f.filed),esc(f.form),`<span title="${esc(f.tag)}">${esc(f.tag)}</span>`,link(f.url,'Filing')]}));
  return `<h2 class="section-title">Nothing hidden behind the number.</h2><p class="section-intro">Fetched ${date(data.fetchedAt)}. Financial base: ${esc(data.base.basis)}, ending ${esc(data.base.end)}. Quote: ${date(data.quote?.asOf)}. Values are USD millions unless the row is shares.</p>
    ${panel('Public sources, attached to this analysis.','Financials and market inputs carry their own reporting dates.',data.sources.map(s=>`<div class="source-row"><div><strong>${esc(s.name)}</strong><p>${esc(s.kind)}</p></div>${link(s.url,'Open source')}</div>`).join(''))}
    ${panel('The financial input ledger.','TTM rows combine FY + YTD − prior YTD. Instant balances use the TTM end date.',table(['Input / component','Value ($M / M shares)','Period end','Filed','Form','XBRL tag','Source'],rows))}
    <div class="note-box">Historical annual input provenance and complete model outputs are included in the JSON export. Source values are kept separate from forecast assumptions. Exported analyses retain timestamps, quality warnings, selected peers, h scores and the model version.</div>
    ${qualityPanel()}`;
}

function research() {
  const report=data.research?.report,job=researchJob||data.research,state=job?.status||'not_started';
  return `<h2 class="section-title">Research the business behind the forecast.</h2><p class="section-intro">Company-specific volume, pricing, investment, peers and financing judgments. The LLM cites dated public evidence; deterministic code checks inputs and calculates the valuation.</p>
  ${panel('Company research',researchConfig.researchConfigured?esc(researchConfig.researchModel)+' · '+esc(researchConfig.researchEffort||'low')+' reasoning · Up to '+researchConfig.dailyResearchLimit+' new reports per UTC day.':'Awaiting your server-side API key.',`<div class="panel-body"><p><strong>Status: ${esc(state.replaceAll('_',' '))}</strong></p><p class="muted">Reports use the latest financial base and are cached by company, reporting period and research version. Forecasts are estimates, even when citations pass verification.</p><br><button class="outline-button" id="run-research" ${researchBusy||!researchConfig.researchConfigured?'disabled':''}>${researchBusy?'Researching…':report?'Load cached research':'Research '+esc(data.symbol)+' ↗'}</button>${job?.errors?.length?'<div class="error-box">'+job.errors.map(esc).join('<br>')+'</div>':''}</div>`)}
  ${!researchConfig.researchConfigured?panel('Add your key once.','Keep credentials on the server.',`<div class="panel-body"><p>Local development: put your key after <code>OPENAI_API_KEY=</code> in the ignored <code>.dev.vars</code> file, then restart the dev server.</p><br><p>Hosted app: Cloudflare Dashboard → Workers & Pages → valuelens → Settings → Variables and Secrets → Add secret named <code>OPENAI_API_KEY</code>. Or run <code>npx wrangler secret put OPENAI_API_KEY</code> from this project.</p><br><p class="muted">Refresh this page after saving. The key is never sent to browser code. The configured model is ${esc(researchConfig.researchModel||'gpt-5.6-terra')}; you can change OPENAI_MODEL in Wrangler configuration.</p></div>`):''}
  ${report?.forecast?panel('Business drivers',esc(report.businessDescription),table(['Segment','Starting revenue weight','Volume driver','Price / mix driver','Year 1 volume','Year 1 price / mix'],report.forecast.segments.map(s=>({cells:[esc(s.name),pct(s.weight),esc(s.volumeDriver),esc(s.priceDriver),pct(s.volumeGrowth[0]),pct(s.priceGrowth[0])]})))+`<div class="panel-body">${report.forecast.segments.map(s=>'<p><strong>'+esc(s.name)+':</strong> '+esc(s.rationale.explanation)+'</p>').join('<br>')}</div>`)+panel('Reinvestment and stable state','Growth, margins and net reinvestment fade together in years 6–10.',`<div class="panel-body"><p>${esc(report.forecast.investmentRationale.explanation)}</p><br><p>${esc(report.forecast.terminalRationale.explanation)}</p></div>`)+panel('Uncertainty and evidence','Citations establish traceability; they do not prove a forecast.',`<div class="panel-body"><ul>${report.uncertainties.map(u=>'<li>'+esc(u)+'</li>').join('')}</ul></div>`+report.sources.map(s=>`<div class="source-row"><div><strong>${esc(s.title)}</strong><p>${esc(s.id)} · ${esc(s.publishedAt)}</p></div>${link(s.url,'Primary source')}</div>`).join('')):''}
  ${report&&!report.forecast?panel('Specialized company research',esc(report.modelFamily),'<div class="panel-body"><p>'+esc(report.businessDescription)+'</p><br><p>'+esc(report.modelRationale.explanation)+'</p><br><ul>'+report.uncertainties.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul><br>'+report.sources.map(s=>link(s.url,esc(s.title))).join('<br>')+'</div>'):''}
  ${panel('Accounting reconciliation','Missing disclosures remain missing until verified.',table(['Check','Period','Result','Difference $M'],(data.reconciliations||[]).map(c=>({cells:[esc(c.name),esc(c.period),c.passed?'Passed':'Failed',num(c.difference,3)]})))+(data.continuity?'<div class="panel-body">'+esc(data.continuity.basis)+' '+link(data.continuity.source,'Continuity disclosure')+'</div>':''))}
  ${qualityPanel()}`;
}
function validation() {
  const v=validationReport;
  return `<h2 class="section-title">Measure the forecasts before trusting the value.</h2><p class="section-intro">${esc(v?.scope||'Validation report loading…')}</p>${v?panel('Out-of-sample operating forecasts',v.candidates+' requested issuers · '+v.issuersWithFolds+' issuers with usable history · '+v.folds+' forecast cases. Holdout targets: 2023–2025.',table(['Horizon / split','Cases','Revenue MAPE','v0.1 MAPE','Flat revenue MAPE','Margin MAE (pp)','Nominal 80% interval coverage'],v.metrics.map(m=>({cells:[m.horizon+'y / '+esc(m.split),num(m.n),pct(m.revenueMAPE),pct(m.oldRevenueMAPE),pct(m.flatRevenueMAPE),num(m.marginMAEpp,2),pct(m.observedCoverage)]})))+`<div class="panel-body"><p>Historical growth does not consistently beat a flat-revenue forecast. LLM forecasts need prospective validation after the key is configured; these results evaluate the fallback only.</p><br><ul>${v.limitations.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><br>${link('/validation/latest.json','Download metrics and complete coverage ledger')}</div>`):''}`;
}
async function runResearch() {
  if(researchBusy||!data)return;
  const symbol=data.symbol;researchBusy=true;currentView='research';render();
  try {
    let response=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol})});
    let job=await response.json();if(!response.ok)throw Error(job.error);
    for(let i=0;i<80;i++) {
      if(data.symbol!==symbol)return;researchJob=job;render();
      if(!['starting','running'].includes(job.status))break;
      await new Promise(resolve=>setTimeout(resolve,15000));
      if(data.symbol!==symbol)return;
      response=await fetch('/api/research?key='+encodeURIComponent(job.key));job=await response.json();if(!response.ok)throw Error(job.error);
    }
    researchJob=job;
    if(job.analysis){data=job.analysis;a=defaults(data);isExample=false;changes=0;}
  }catch(e){researchJob={status:'failed',errors:[e.message]};}
  finally{researchBusy=false;if(data.symbol===symbol)render();}
}

function render() {
  if(!data) return;
  result=analyze(data,a);
  $('#breadcrumb-name').textContent=data.symbol+' valuation';
  $('#company-monogram').textContent=data.symbol[0];
  $('#company-name').textContent=data.name.replace(/,?\s*(INC\.?|CORPORATION|CORP\.?)$/i,'');
  $('#company-ticker').textContent=data.symbol;
  $('#company-description').textContent=`${data.industry||'SEC filer'} · USD · Financials through ${date(data.base.end)}`;
  $('#data-banner').innerHTML=`<span>${isExample?'SAVED EXAMPLE':'FETCHED ANALYSIS'} · ${esc(data.symbol)} · ${isExample?'Captured':'Fetched'} ${date(data.fetchedAt)} · Quote ${date(data.quote?.asOf)}${changes?' · Modified assumptions':''}${result.incomplete?' · Provisional inputs':''}</span><button id="refresh-live">Refresh live data ↻</button>`;
  $('#save-company').textContent=saved.includes(data.symbol)?'★ Saved company':'☆ Save company';
  $('#assumption-count').hidden=changes===0;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===currentView || b.classList.contains('side-link')&&b.dataset.view==='overview'&&['cashflows','capital','comps'].includes(currentView));b.setAttribute('aria-current',b.classList.contains('active')?'page':'false');});
  const error=result.errors.length && !['methodology','sources','comps','research','validation'].includes(currentView);
  $('#view').innerHTML=error?`<div class="error-box"><strong>The model needs complete inputs.</strong><br>${result.errors.map(esc).join('<br>')}</div><button class="outline-button" data-view="research">Research missing inputs ↗</button> <button class="outline-button" id="open-error-assumptions">Review assumptions ↗</button>${qualityPanel()}`:({overview,cashflows,capital,comps,methodology,sources,research,validation}[currentView]||overview)();
  $('#workspace').hidden=false;
  renderSaved();
}

async function loadCompany(symbol,peers=[]) {
  clearTimeout(searchTimer);searchController?.abort();
  loadController?.abort();loadController=new AbortController();const controller=loadController;
  $('#loading').hidden=false;$('#workspace').hidden=true;$('#message').textContent='';$('#search-results').hidden=true;$('#analyze-button').disabled=true;
  const steps=['Reading SEC financial statements…','Building comparable-company return histories…','Matching debt, risk factors and market inputs…','Checking source coverage and assembling the analysis…'];
  let i=0;$('#loading-step').textContent=steps[0];const timer=setInterval(()=>$('#loading-step').textContent=steps[Math.min(++i,steps.length-1)],6500);
  try {
    const response=await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}${peers.length?'&peers='+encodeURIComponent(peers.join(',')):''}`,{signal:controller.signal});
    const body=await response.json();if(!response.ok)throw new Error(body.error+(body.details?.length?' '+body.details.join(' '):''));
    if(controller!==loadController)return;
    data=body;researchJob=null;a=defaults(data);isExample=false;changes=0;currentView='overview';$('#search-results').hidden=true;render();
    history.replaceState(null,'',`?symbol=${encodeURIComponent(data.symbol)}`);
  } catch(e) {
    if(e.name!=='AbortError') {$('#message').textContent=e.message;if(data)render();}
  } finally {
    clearInterval(timer);if(controller===loadController){$('#loading').hidden=true;$('#analyze-button').disabled=false;}
  }
}

function renderSaved() {
  $('#saved-count').textContent=saved.length;
  $('#saved-list').innerHTML=saved.length?saved.map(s=>`<div class="saved-item"><span class="dot"></span><button data-symbol="${esc(s)}">${esc(s)}</button><button data-remove="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></div>`).join(''):'<p>Your watchlist starts here.<br>Save a company to revisit it.</p>';
  try{localStorage.setItem('valuelens.saved',JSON.stringify(saved));}catch{}
}

const FIELDS=[
  ['Operating forecast','growth','Initial revenue growth','pct','Exploratory fallback only. Editing operating inputs replaces the researched driver path with an explicit manual scenario.'],
  ['', 'margin','Target EBIT margin','pct','Current margin anchors the fallback; researched terminal margin applies after the competitive fade.'],
  ['', 'capex','Capex / revenue','pct','Current reported spending anchors the fallback. Company research supplies five annual capex ratios.'],
  ['', 'da','D&A / revenue','pct','Current reported D&A, with separately reported intangible amortization included.'],
  ['', 'nwc','Operating NWC / revenue','pct','Current broad non-cash working-capital proxy. Negative ratios can be valid.'],
  ['Discount rate','rf','10-year Treasury / risk-free rate','pct','Dated USD Treasury reference. Match the currency and duration of the cash flows.'],
  ['', 'erp','Equity risk premium','pct','Dated implied US ERP; use geography-weighted country risk for material international exposure.'],
  ['', 'assetBeta','Active unlevered beta','number','Median unlevered candidate-peer beta, with company regression fallback. Override with a researched value.'],
  ['', 'tax','Marginal tax rate','pct','25% is an analyst prior. Review jurisdiction, NOLs and interest deductibility.'],
  ['Stable state','terminalGrowth','Terminal growth g','pct','2.5% prior; must be below WACC, terminal ROIC and nominal risk-free rate.'],
  ['', 'terminalROIC','Terminal ROIC','pct','Researched stable incremental return, or cost-of-capital proxy pending research. Reinvestment fades to g/ROIC.'],
  ['Debt capacity','stressDrop','Stress revenue decline','pct','10% prior. It combines with the stress EBIT margin.'],
  ['', 'stressMargin','Stressed EBIT margin','pct','Lowest annual historical EBIT margin; negative stress EBIT gives no debt capacity.'],
  ['', 'minCoverage','Minimum normal EBIT / interest','number','2.5× prior, in addition to the h-based stressed coverage constraint.'],
  ['', 'recapCost','Cost / absolute debt adjustment','pct','Illustrative transaction cost of 1%; no negotiated refinancing terms assumed.'],
  ['Equity bridge and decision','cashReserve','Operating cash reserve ($M)','number','Zero prior. Reserve is not added as excess cash; prevent double counting.'],
  ['', 'otherClaims','Other claims, net ($M)','number','Zero prior. Add preferred equity, minority interests, pensions, option claims; negative adds non-operating assets.'],
  ['', 'marginOfSafety','Margin of safety','pct','Research threshold = modeled current-structure value × (1 − safety margin).'],
  ['', 'quoteOverride','Manual quote override ($ / share)','optional','Leave blank to use the timestamped source quote. Manual quotes keep the comparison flagged for review.']
];
function openAssumptions() {
  if(!a)return;
  $('#assumption-fields').innerHTML=FIELDS.map(([group,key,label,type,note])=>`${group?`<h3 class="assumption-group">${group}</h3>`:''}<div class="input-field"><label for="input-${key}">${label}${type==='pct'?' <small>(%)</small>':''}</label><input type="number" id="input-${key}" data-assumption="${key}" data-type="${type}" step="any" ${type!=='optional'?'required':''} value="${a[key]===null?'':Number((type==='pct'?a[key]*100:a[key]).toFixed(4))}"><p>${note}</p></div>`).join('');
  document.querySelectorAll('[data-assumption]').forEach(input=>input.dataset.initial=input.value);
  $('#assumption-error').innerHTML='';$('#assumptions-dialog').showModal();
}
function exportData() {
  if(!data)return;
  const payload={...data,isSavedExample:isExample,assumptions:a,analysis:result,exportedAt:new Date().toISOString(),modelVersion:MODEL_VERSION};
  download(`${data.symbol}-valuelens.json`,JSON.stringify(payload,null,2),'application/json');
}
function download(name,content,type) {
  const u=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=u;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}

document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.view) {currentView=button.dataset.view;render();return;}
  if(button.dataset.symbol) {loadCompany(button.dataset.symbol);return;}
  if(button.dataset.remove) {saved=saved.filter(s=>s!==button.dataset.remove);renderSaved();if(data)render();return;}
  if(button.id==='run-research'){runResearch();return;}
  if(button.id==='refresh-live')loadCompany(data.symbol,data.peers.map(p=>p.symbol));
  if(button.id==='assumptions-button'||button.id==='open-error-assumptions')openAssumptions();
  if(button.id==='save-company' && data) {saved=saved.includes(data.symbol)?saved.filter(s=>s!==data.symbol):[...saved,data.symbol].slice(-20);render();}
  if(button.id==='export-json')exportData();
  if(button.id==='export-csv') {
    if(result.errors.length){$('#message').textContent='Forecast export is unavailable until the financial inputs are complete.';return;}
    const keys=['year','revenue','growth','margin','ebit','cashTax','nopat','da','capex','nwc','deltaNwc','fcff'];
    download(`${data.symbol}-forecast-usd-millions.csv`,keys.join(',')+'\n'+result.rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n'),'text/csv');
  }
  if(button.id==='reset-assumptions') {a=defaults(data);changes=0;render();openAssumptionsRefresh();}
  if(button.id==='apply-assumptions') {
    const next={...a};
    const edited=new Set();
    document.querySelectorAll('[data-assumption]').forEach(input=>{if(input.value!==input.dataset.initial){edited.add(input.dataset.assumption);next[input.dataset.assumption]=input.value.trim()===''?null:Number(input.value)/(input.dataset.type==='pct'?100:1);}});
    if([...edited].some(k=>['growth','margin','capex','da','nwc'].includes(k)))next.driverForecast=null;
    if(edited.has('assetBeta'))next.betaBasis='Analyst override';
    else if(edited.has('tax') && a.betaBasis!=='Analyst override') {
      const peers=data.peers.filter(p=>a.peerIncluded.includes(p.symbol)&&p.beta&&p.debt!==null&&p.equity>0);
      next.assetBeta=median(peers.map(p=>unlever(p.beta.beta,p.debt,p.equity,next.tax))) ?? (data.beta?unlever(data.beta.beta,data.base.debt,(next.quoteOverride??data.quote?.price)*data.base.shares,next.tax):null);
    }
    const check=analyze(data,next);
    if(check.errors.length) {$('#assumption-error').innerHTML=`<div class="error-box">${check.errors.map(esc).join('<br>')}</div>`;return;}
    a=next;changes++;$('#assumptions-dialog').close();render();
  }
});
function openAssumptionsRefresh(){ $('#assumptions-dialog').close();openAssumptions(); }

document.addEventListener('change',e=>{
  if(e.target.dataset.hIndex!==undefined){a.hScores[Number(e.target.dataset.hIndex)]=Number(e.target.value);a.hReviewed=false;changes++;render();}
  if(e.target.id==='h-reviewed'){a.hReviewed=e.target.checked;changes++;render();}
  if(e.target.dataset.peer){const s=e.target.dataset.peer;a.peerIncluded=e.target.checked?[...a.peerIncluded,s]:a.peerIncluded.filter(t=>t!==s);
    const eligible=data.peers.filter(p=>a.peerIncluded.includes(p.symbol)&&p.beta&&p.debt!==null&&p.equity>0);
    a.assetBeta=median(eligible.map(p=>unlever(p.beta.beta,p.debt,p.equity,a.tax)));a.betaBasis='Median of selected peer unlevered betas';changes++;render();}
});
document.addEventListener('submit',async e=>{
  if(e.target.id==='peer-form'){e.preventDefault();const p=$('#peer-tickers').value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);if(p.length>4||!p.length){$('#message').textContent='Choose one to four peer tickers.';return;}await loadCompany(data.symbol,p);return;}
  if(e.target.id!=='search-form')return;
  e.preventDefault();clearTimeout(searchTimer);const query=$('#company-search').value.trim();if(!query)return;
  await search(query,true);
});
async function search(query,showError=false) {
  searchController?.abort();searchController=new AbortController();const controller=searchController;
  try{
    const response=await fetch('/api/search?q='+encodeURIComponent(query),{signal:controller.signal});const body=await response.json();if(!response.ok)throw new Error(body.error);
    if(controller!==searchController)return;
    if(showError) {
      const exact=body.companies.find(c=>c.symbol===query.toUpperCase() || c.name.toUpperCase().replace(/[,\s]+(INC\.?|CORP\.?|CORPORATION|LTD\.?)$/,'').trim()===query.toUpperCase());
      if(exact){await loadCompany(exact.symbol);return;}
      if(body.companies.length===1){await loadCompany(body.companies[0].symbol);return;}
    }
    $('#search-results').innerHTML=body.companies.length?body.companies.map(c=>`<button type="button" data-symbol="${esc(c.symbol)}"><strong>${esc(c.symbol)}</strong><span>${esc(c.name)}</span></button>`).join(''):'<p class="muted" style="padding:12px">No SEC-listed match. Try a ticker or another company name.</p>';
    $('#search-results').hidden=false;$('#company-search').setAttribute('aria-expanded','true');
  }catch(e){if(showError&&e.name!=='AbortError')$('#message').textContent=e.message;}
}
$('#company-search').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('#company-search').value.trim();if(q.length<2){$('#search-results').hidden=true;return;}searchTimer=setTimeout(()=>search(q),450);});
document.addEventListener('click',e=>{if(!e.target.closest('#search-form')){$('#search-results').hidden=true;$('#company-search').setAttribute('aria-expanded','false');}});
$('#company-search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#search-results').hidden=true;e.target.setAttribute('aria-expanded','false');}});

renderSaved();
try{
  const response=await fetch('/example.json');if(!response.ok)throw new Error();data=await response.json();a=defaults(data);render();
}catch{$('#message').textContent='Enter a company above to begin a filing-backed analysis.';}
const requested=new URLSearchParams(location.search).get('symbol');
if(requested)loadCompany(requested);
