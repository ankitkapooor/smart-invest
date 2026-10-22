import {operatingForecast} from './prediction.js';
import {analyze,defaults,median,unlever,RATINGS,RATINGS_SOURCE,MODEL_VERSION} from './model.js';
import {requestJSON} from './request.js';

const $=s=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(x):'Unavailable';
const pct=(x,d=1)=>Number.isFinite(x)?`${(x*100).toFixed(d)}%`:'—';
const num=(x,d=0)=>Number.isFinite(x)?new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}).format(x):'—';
const big=x=>Number.isFinite(x)?`$${num(x/1000,1)}B`:'—';
const date=x=>x?new Date(x.length===10?x+'T12:00:00Z':x).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'}):'Unavailable';
const dateTime=x=>x?new Date(x).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:'America/Los_Angeles'}):'Unavailable';
const signed=x=>Number.isFinite(x)?`${x>=0?'+':''}${pct(x)}`:'—';
const link=(url,label)=>url?`<a class="ext" href="${esc(url)}" target="_blank" rel="noopener">${label}</a>`:'Unavailable';
let data=null,a=null,result=null,currentView='overview',isExample=false,changes=0,loadController=null,searchTimer=null,searchController=null;
let researchConfig={researchConfigured:false},researchJob=null,researchBusy=false,validationReport=null,quarterlyReport=null;
const configReady=requestJSON('/api/config',{timeoutMs:5000}).then(c=>{researchConfig=c;if(data)render();}).catch(()=>{});
fetch('/validation/quarterly.json').then(r=>r.json()).then(v=>{quarterlyReport=v;if(data&&currentView==='validation')render();}).catch(()=>{});
fetch('/validation/latest.json').then(r=>r.json()).then(v=>{validationReport=v;if(data&&currentView==='validation')render();}).catch(()=>{});
let saved=[];try{saved=JSON.parse(localStorage.getItem('valuelens.saved')||'[]').filter(x=>typeof x==='string').slice(0,20);}catch{}
let activeCommit=null;
async function checkRelease(){
  try{
    const release=await requestJSON('/build.json?check='+Date.now(),{timeoutMs:5000});
    if(!/^[a-f0-9]{40}$/.test(release.commit||''))return;
    if(activeCommit&&activeCommit!==release.commit){const box=$('#release-status');if(box){box.hidden=false;box.innerHTML='<div class="note-box">A newer version is available. <button class="button" id="reload-app">Load latest version</button></div>';}}
    else activeCommit=release.commit;
  }catch{}
}
void checkRelease();setInterval(checkRelease,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkRelease();});

function panel(title,subtitle,body,tag='') {
  return `<section class="panel"><div class="panel-header"><div><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</div>${tag?`<span class="chip">${tag}</span>`:''}</div>${body}</section>`;
}
function viewHeader(title,intro,actions='') {return `<header class="view-header"><div><h2>${title}</h2>${intro?`<p>${intro}</p>`:''}</div>${actions}</header>`;}
function metric(label,value,sub,primary=false) {return `<div class="metric ${primary?'primary':''}"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;}
function table(headers,rows,cls='') {return `<div class="table-scroll"><table class="${cls}"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr ${r.highlight?'class="highlight-row"':''}>${r.cells.map((c,i)=>`<${i===0?'th scope="row"':'td'}>${c}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
const STATUS={'Above modeled value':['neg','Above modeled value'],'Below modeled value':['pos','Below modeled value'],'Below safety threshold':['pos','Below buy threshold'],'Review required':['warn','Review required']};
const tone=x=>!Number.isFinite(x)?'':x>=0?'positive':'negative';
function niceStep(range,count=4) {const raw=range/count,mag=10**Math.floor(Math.log10(raw)),n=raw/mag;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*mag;}
function fairValueScale(r) {
  const v=r.valued?.price,price=r.marketPrice,prices=r.cases.map(c=>c.price).filter(Number.isFinite);
  if(!Number.isFinite(v)||!Number.isFinite(price)) return '';
  const lo=Math.min(0,...prices),step=niceStep(Math.max(price,v,...prices)*1.08-lo),hi=Math.ceil(Math.max(price,v,...prices)*1.08/step)*step;
  const x=n=>Math.max(0,Math.min(100,(n-lo)/(hi-lo)*100)),buy=Number.isFinite(r.buyBelow)?r.buyBelow:v;
  const place=p=>p<22?'start':p>78?'end':'',tickPlace=p=>p<3?'start':p>97?'end':'';
  const ticks=[];for(let t=Math.ceil(lo/step)*step;t<=hi+1e-9;t+=step)ticks.push(t);
  const bear=Math.min(...prices),bull=Math.max(...prices);
  return `<div class="fv" role="img" aria-label="Market price ${money(price)} compared with modeled value ${money(v)}, buy threshold ${money(buy)} and scenario range ${money(bear)} to ${money(bull)}">
    <div class="fv-row"><span class="fv-label accent ${place(x(price))}" style="left:${x(price)}%">Market price <b>${money(price)}</b></span></div>
    <div class="fv-track"><span class="fv-zone pos" style="left:0;width:${x(buy)}%"></span><span class="fv-zone mid" style="left:${x(buy)}%;width:${x(v)-x(buy)}%"></span><span class="fv-zone neg" style="left:${x(v)}%;right:0"></span>${prices.length>1?`<span class="fv-range" style="left:${x(bear)}%;width:${Math.max(.4,x(bull)-x(bear))}%"></span>`:''}<span class="fv-value" style="left:${x(v)}%"></span><span class="fv-price" style="left:${x(price)}%"></span></div>
    <div class="fv-row"><span class="fv-label ${place(x(v))}" style="left:${x(v)}%">Modeled value <b>${money(v)}</b></span></div>
    <div class="fv-axis">${ticks.map(t=>`<span class="${tickPlace(x(t))}" style="left:${x(t)}%">$${num(t)}</span>`).join('')}</div>
  </div><div class="fv-legend"><span><i class="pos"></i>Below buy threshold</span><span><i class="mid"></i>Between threshold and value</span><span><i class="neg"></i>Above modeled value</span>${prices.length>1?`<span><i class="range"></i>Bear–bull scenarios ${money(bear)}–${money(bull)}</span>`:''}</div>`;
}
function overview() {
  const r=result,v=r.valued,o=r.optimized;
  const [cls,label]=STATUS[r.status]||['neutral',r.status];
  const headline=Number.isFinite(r.upside)?`Modeled value is ${pct(Math.abs(r.upside))} ${r.upside<0?'below':'above'} the market price`:'No price comparison is available';
  const reason=r.status==='Review required'?'This DCF scenario has unreviewed assumptions or unresolved data. The price gap alone does not establish mispricing. The audit below shows the growth and reinvestment assumptions behind it.':'This compares the price with one set of assumptions. It is not a forecast of stock returns.';
  return `<section class="verdict">
    <div class="verdict-top"><div><span class="status ${cls}">${label}</span><h2>${headline}</h2><p class="verdict-copy">${reason} Business quality, concentration, liquidity needs and your horizon still matter.</p></div>
    <div class="verdict-stats"><dl>
      <div class="verdict-stat"><dt>Market price</dt><dd>${money(r.marketPrice)}</dd></div>
      <div class="verdict-stat"><dt>Modeled value</dt><dd>${money(v?.price)}</dd></div>
      <div class="verdict-stat"><dt>${r.status==='Review required'?'Scenario safety threshold':'Buy below'} (${pct(a.marginOfSafety,0)} margin)</dt><dd>${money(r.buyBelow)}</dd></div>
      <div class="verdict-stat"><dt>Value vs. market</dt><dd class="${tone(r.upside)}">${signed(r.upside)}</dd></div>
    </dl></div></div>
    <div class="verdict-bar">${fairValueScale(r)}</div>
    <div class="panel-footer"><span>${a.quoteOverride!==null?'Manual quote entered in assumptions · review required':`Quote ${dateTime(data.quote?.asOf)}${data.quote?.exchange?' · '+esc(data.quote.exchange):''} · may be delayed`}</span><button class="link-button" id="open-error-assumptions">Edit assumptions</button></div>
  </section>
  ${valuationAuditPanel()}
  <div class="metrics">
    ${metric('Cost of capital (WACC)',pct(r.current.wacc,2),`Cost of equity ${pct(r.current.ke)} · Cost of debt ${pct(r.current.kd)}`)}
    ${metric('Enterprise value',big(v?.ev),`Forecast ${big(v?.pvFlows)} + terminal ${big(v?.pvTerminal)}`)}
    ${metric('Terminal value share',pct(v?.terminalShare),v?.terminalShare>.75?'Over 75% of value. Small changes move the result.':'Share of gross operating value')}
    ${metric('Value at constrained OCS',money(o?.price),`Conditional recap scenario · ${a.hReviewed?'h factors reviewed':'h factors in draft'}`)}
  </div>
  <div class="two-columns">
    ${panel('Free cash flow forecast','Ten-year operating forecast · USD billions',`<div class="panel-body">${fcfChart(r.rows)}<div class="legend"><span><i></i>Free cash flow to firm</span><span><i class="line"></i>Operating profit after tax</span></div></div><div class="panel-footer"><span>${a.valuationForecast?'Company estimates through year 5; stable-state fade in years 6–10':'Scenario growth fades to '+pct(a.terminalGrowth)}</span><button class="link-button" data-view="cashflows">Cash flow detail</button></div>`)}
    ${panel('Enterprise to equity bridge','Current capital structure',`<div class="panel-body"><ul class="value-bridge"><li><span>PV of forecast cash flows</span><strong>${big(v?.pvFlows)}</strong></li><li><span>PV of terminal value</span><strong>${big(v?.pvTerminal)}</strong></li><li class="total"><span>Enterprise value</span><strong>${big(v?.ev)}</strong></li><li><span>+ Cash &amp; current securities</span><strong>${big(Math.max(0,data.base.cash-a.cashReserve))}</strong></li><li><span>+ Noncurrent marketable securities</span><strong>${big(data.base.nonOperatingInvestments)}</strong></li><li><span>− Gross financial debt</span><strong>${big(data.base.debt)}</strong></li><li><span>− Other claims / adjustments</span><strong>${big(a.otherClaims)}</strong></li><li class="total"><span>Common equity value</span><strong>${big(v?.equity)}</strong></li></ul><div class="bridge-bar"><span>÷ ${num(data.base.valuationShares??data.base.shares,0)}M diluted shares (proxy)</span><strong>${money(v?.price)}</strong></div></div>`)}
  </div>
  ${panel('Scenarios','Bear, base and bull are explicit assumption sets, not probability estimates. WACC is held at the current structure.',`<div class="panel-body"><div class="scenario-grid">${r.cases.map((c,i)=>{const d=Number.isFinite(c.price)&&Number.isFinite(r.marketPrice)?c.price/r.marketPrice-1:null;return `<div class="scenario-card ${i===1?'base':''}"><div class="section-kicker">${esc(c.name)} <span class="vs-price ${tone(d)}">${signed(d)} vs. price</span></div><strong>${money(c.price)}</strong><dl><dt>Initial growth</dt><dd>${pct(c.growth)}</dd><dt>Target EBIT margin</dt><dd>${pct(c.margin)}</dd><dt>Terminal growth</dt><dd>${pct(c.terminalGrowth)}</dd></dl></div>`;}).join('')}</div><p class="stamp">A full recession case may also require a higher business-risk premium.</p></div>`)}
  <div class="two-columns equal">
    ${panel('Zero-growth comparison','Two steady states, each with matching growth and reinvestment.',table(['Terminal assumption','Enterprise value','Value / share'],[
      {cells:['g = 0 · maintenance reinvestment',big(r.zero?.ev),money(r.zero?.price)]},
      {highlight:true,cells:[`g = ${pct(a.terminalGrowth)} · ROIC ${pct(a.terminalROIC)}`,big(v?.ev),money(v?.price)]}
    ])+`<div class="table-note">g = 0 assumes zero net reinvestment and maintenance capex equal to D&amp;A. It does not mean capital spending disappears.</div>`)}
    ${panel('Key drivers','The assumptions that move the value most.',`<div class="panel-body"><ul class="value-bridge"><li><span>Initial revenue growth</span><strong>${pct(a.growth)}</strong></li><li><span>Target operating margin</span><strong>${pct(a.margin)}</strong></li><li><span>Terminal ROIC</span><strong>${pct(a.terminalROIC)}</strong></li><li><span>Terminal growth</span><strong>${pct(a.terminalGrowth)}</strong></li></ul><p class="stamp">Review the sensitivity grid before relying on a point estimate.</p></div>`)}
  </div>
  ${sensitivityPanel()}
  ${qualityPanel()}`;
}

function valuationAuditPanel() {
  const d=result.diagnostics;if(!d)return '';
  const reverse=d.reverse,method=({seasonal:'Seasonal benchmark',flat:'Flat annual benchmark','damped-trend':'Damped issuer trend','recent-trend':'Recent issuer trend',manual:'Manual scenario','business-case':'Company-specific researched analyst estimate'})[d.method]||'Fitted issuer forecast';
  const rows=[
    {cells:['First-year revenue growth',pct(d.initialGrowth),esc(method)]},
    {cells:['Reported trailing revenue growth',pct(d.reportedGrowth),d.reportedGrowth===null?'Eight aligned quarters unavailable':'Latest four reported quarters vs. previous four; historical observation']},
    {cells:['Terminal ROIC / current WACC',pct(d.terminalROIC)+' / '+pct(d.wacc),Math.abs(d.terminalExcessReturn)<.005?'Near-zero terminal excess returns assumed':'Terminal excess return '+num(d.terminalExcessReturn*100,2)+' percentage points']},
    {cells:['Year 10 capital expenditure',big(d.yearTenCapex),big(d.yearTenCapexBeforeTransition)+' spending-ratio scenario + '+big(d.yearTenCapexAdjustment)+' terminal transition']}
  ];
  return panel('Why this value differs from the market','Audit the assumptions before interpreting the price gap.',
    (d.flatBenchmark?'<div class="panel-body"><div class="note-box"><strong>The selected revenue benchmark assumes 0% growth in year one.</strong> Historical selection favored repeating the latest four quarters. This is a statistical benchmark; it does not establish that the business has stopped growing.</div></div>':'')+
    table(['Driver','Current assumption','Basis'],rows)+
    `<div class="panel-body"><p><strong>Conditional reverse DCF:</strong> ${reverse.status==='solved'?`Matching the ${money(result.marketPrice)} quote requires <strong>${pct(reverse.initialGrowth)} first-year revenue growth</strong>, fading to ${pct(a.terminalGrowth)} in year 10, ${a.valuationForecast?'by shifting the five-year growth path in parallel before its stable-state fade':'with all other assumptions held fixed'}.`:'No unique valid growth solution was found within the −50% to +100% initial-growth search range.'}</p><p class="stamp">This is one conditional combination of assumptions, not a market forecast. Different margins, investment returns or growth durations can support the same price.</p>${Number.isFinite(d.recentGrowthScenario?.price)?`<p>For comparison, a scenario starting with the reported ${pct(d.reportedGrowth)} trailing growth rate gives <strong>${money(d.recentGrowthScenario.price)}</strong> per share under the same fade. This illustration has not passed a forecast evaluation and does not replace the selected model.</p>`:''}<p class="stamp">Arithmetic reconciliation: ${d.arithmetic.passed?'passed':'failed'}. Quarterly revenue/margin evaluation does not establish accuracy of FCFF or share value. Terminal ROIC and the ten-year fade remain scenario assumptions.</p></div>`);
}

function fcfChart(rows) {
  const narrow=innerWidth<640,width=narrow?380:600,height=narrow?220:240,left=narrow?32:40,right=8,top=14,bottom=28;
  const low=Math.min(0,...rows.map(r=>Math.min(r.fcff,r.nopat))),max=Math.max(1,...rows.map(r=>Math.max(r.nopat,r.fcff)));
  const step0=niceStep((max-low)/1000)*1000,high=Math.ceil(max/step0)*step0,floor=Math.floor(low/step0)*step0;
  const y=v=>top+(high-v)/(high-floor)*(height-top-bottom),step=(width-left-right)/rows.length;
  const ticks=[];for(let t=floor;t<=high+1e-9;t+=step0)ticks.push(t);
  const cx=i=>left+step*(i+.5);
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected free cash flow to firm over ten years, with operating profit after tax for comparison">${ticks.map(t=>`<line class="${t===0?'zero':'grid'}" x1="${left}" y1="${y(t)}" x2="${width-right}" y2="${y(t)}"/><text x="${left-8}" y="${y(t)+4}" text-anchor="end">${num(t/1000,0)}</text>`).join('')}${rows.map((r,i)=>`<rect class="bar" x="${left+step*(i+.2)}" y="${Math.min(y(r.fcff),y(0))}" width="${step*.6}" height="${Math.max(1,Math.abs(y(0)-y(r.fcff)))}" rx="2"><title>Year ${r.year}: FCFF ${big(r.fcff)} · NOPAT ${big(r.nopat)}</title></rect><text x="${cx(i)}" y="${height-8}" text-anchor="middle">${narrow&&i%2?'':'Y'+r.year}</text>`).join('')}<polyline class="line-2" points="${rows.map((r,i)=>`${cx(i)},${y(r.nopat)}`).join(' ')}"/>${rows.map((r,i)=>`<circle class="dot-2" cx="${cx(i)}" cy="${y(r.nopat)}" r="2.5"/>`).join('')}</svg>`;
}

function sensitivityPanel() {
  const price=result.marketPrice,vals=result.sensitivity.flatMap(r=>r.values.map(v=>v.price)).filter(Number.isFinite),lo=Math.min(...vals),hi=Math.max(...vals);
  const cell=(v,i,j)=>v.price===null?`<td class="cell-na">WACC ≤ g</td>`:`<td class="cell ${Number.isFinite(price)&&v.price>=price?'above':''} ${i===2&&j===2?'active-cell':''}" style="--t:${hi>lo?((v.price-lo)/(hi-lo)).toFixed(2):.5}">${money(v.price)}</td>`;
  return panel('Sensitivity: WACC × terminal growth',`Value per share. Darker cells are higher values; values at or above the ${money(price)} market price are green. The outlined cell is the base case.`,`<div class="table-scroll"><table class="sensitivity"><thead><tr><th scope="col">WACC ↓ · g →</th>${result.sensitivity[0].values.map(c=>`<th scope="col">${pct(c.g)}</th>`).join('')}</tr></thead><tbody>${result.sensitivity.map((row,i)=>`<tr><th scope="row">${pct(row.wacc,2)}</th>${row.values.map((v,j)=>cell(v,i,j)).join('')}</tr>`).join('')}</tbody></table></div>`);
}

function qualityPanel() {
  const items=[...data.quality,
    ...data.rates.notes.map(text=>({severity:'review',text})),
    {severity:'review',text:'Year one covers the four reporting quarters after the latest filed quarter when supported; those quarters can include time already elapsed since the report. Valuation discounts use whole-year periods as an approximation; no unreported results are invented.'},
    {severity:'review',text:'Investment ratios, tax assumptions and unverified balance-sheet adjustments remain provisional. Quarterly revenue/margins have an aggregate evaluation; FCFF and long-run value do not. Diluted-minus-basic weighted shares are only a dilution proxy.'},
    {severity:'review',text:(data.research?.status==='validated'?'Peers use the cited LLM selection. ':'Candidate peers are a broad industry screen. ')+'Beta uses book debt proxies and assumes negligible debt beta. Review peer leverage, cash balances, business mix and tax rates.'}
  ];
  const critical=items.filter(q=>q.severity==='critical').length;
  return `<details class="quality" ${critical?'open':''}><summary><h3>Data quality and caveats</h3><p>${critical?`<span class="critical-count">${critical} data ${critical===1?'gap':'gaps'}</span> · `:''}${items.length} items</p></summary><div class="panel-body">${items.map(q=>`<div class="quality-item ${q.severity}"><span class="flag">${q.severity==='critical'?'Data gap':'Review'}</span><span>${esc(q.text)}</span></div>`).join('')}</div></details>`;
}

function cashflows() {
  const r=result;
  const lines=[['Revenue','revenue'],['Revenue growth','growth','pct'],['Operating margin','margin','pct'],['EBIT','ebit'],['− Unlevered cash tax','cashTax'],['Net operating profit after tax','nopat'],['+ Depreciation & amortization','da'],['− Capital expenditure (after fade)','capex'],['↳ Terminal transition vs. spending-ratio scenario','transitionAdjustment'],['− Change in operating NWC','deltaNwc'],['Free cash flow to firm','fcff']];
  const hist=data.history;
  return `${viewHeader('Cash flows','Operating performance first, financing second. Statement amounts in USD millions.','<button class="button" id="export-csv">Download CSV</button>')}
    ${panel('Historical financials','Full fiscal years; latest filed comparative facts, with period-specific source provenance.',table(['Fiscal year end',...hist.map(h=>esc(h.end))],['revenue','ebit','da','capex','cfo'].map(k=>({cells:[({revenue:'Revenue',ebit:'EBIT',da:'D&A',capex:'Capital expenditure',cfo:'Cash from operations'})[k],...hist.map(h=>num(h[k]))]}))))}
    ${panel('Free cash flow build','Years 1–5 use company-specific growth, margin and investment estimates when researched. Years 6–10 fade to the explicit stable state.',table(['USD millions',...r.rows.map(f=>`Year ${f.year}`)],lines.map(([name,key,format])=>({highlight:key==='fcff'||key==='nopat',cells:[name,...r.rows.map(f=>format==='pct'?pct(f[key]):num(f[key]))]})))+`<div class="table-note">FCFF = EBIT − unlevered cash tax + D&A − capex − Δoperating NWC. Stock-based compensation stays in operating expenses; it is not added back as free cash.</div>`)}
    <div class="two-columns equal">${panel('Terminal value','Terminal growth is funded by productive reinvestment.',`<div class="panel-body"><ul class="value-bridge"><li><span>Year 11 NOPAT</span><strong>${big(r.valued?.terminalNopat)}</strong></li><li><span>Reinvestment rate: g / ROIC</span><strong>${pct(a.terminalGrowth/a.terminalROIC)}</strong></li><li><span>− Terminal reinvestment</span><strong>${big(r.valued?.terminalReinvestment)}</strong></li><li><span>Year 11 FCFF</span><strong>${big(r.valued?.terminalFCFF)}</strong></li><li><span>Undiscounted terminal value</span><strong>${big(r.valued?.terminalValue)}</strong></li><li class="total"><span>PV of terminal value</span><strong>${big(r.valued?.pvTerminal)}</strong></li></ul><div class="formula">TV₁₀ = NOPAT₁₁ × (1 − g / ROIC) / (WACC − g)</div></div>`)}
    ${panel('Cash flow cross-check','Reported cash-flow statement figures.',`<div class="panel-body"><ul class="value-bridge"><li><span>Reported TTM CFO</span><strong>${big(data.base.cfo)}</strong></li><li><span>− Reported TTM capex</span><strong>${big(data.base.capex)}</strong></li><li class="total"><span>Levered CFO less capex</span><strong>${Number.isFinite(data.base.cfo)?big(data.base.cfo-data.base.capex):'Unavailable'}</strong></li><li><span>Reported interest expense</span><strong>${data.base.interest===null?'Unavailable':big(data.base.interest)}</strong></li></ul><div class="note-box">CFO less capex is not FCFF. It includes interest, reported tax timing and non-cash addbacks (including SBC). A full FCFF reconciliation requires those adjustments; missing interest is left unavailable.</div></div>`)}
    </div>${sensitivityPanel()}`;
}

function capitalChart() {
  const r=result,narrow=innerWidth<640,w=narrow?380:640,h=narrow?220:240,left=narrow?40:46,right=12,top=14,bottom=30;
  const min=Math.min(...r.sweep.map(x=>x.wacc))*.96,max=Math.max(...r.sweep.filter(x=>x.weight<=.65).map(x=>x.wacc))*1.02;
  const x=t=>left+t/.8*(w-left-right),y=t=>h-bottom-(t-min)/(max-min)*(h-top-bottom);
  const inBounds=r.sweep.filter(t=>t.wacc<=max);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="WACC across gross debt to capital ratios; markers show feasible candidates">${[0,.25,.5,.75,1].map(f=>{const v=min+(max-min)*f;return `<line class="grid" x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end">${pct(v,1)}</text>`;}).join('')}${r.optimal?`<line class="marker" x1="${x(r.optimal.weight)}" y1="${top}" x2="${x(r.optimal.weight)}" y2="${h-bottom}"/>`:''}<polyline class="line-1" points="${inBounds.map(t=>`${x(t.weight)},${y(t.wacc)}`).join(' ')}"/>${inBounds.filter(t=>t.feasible).map(t=>`<circle class="dot-1" cx="${x(t.weight)}" cy="${y(t.wacc)}" r="2.5"/>`).join('')}${r.optimal?`<circle class="marker-dot" cx="${x(r.optimal.weight)}" cy="${y(r.optimal.wacc)}" r="5"><title>Constrained minimum: ${pct(r.optimal.weight,0)} debt, WACC ${pct(r.optimal.wacc,2)}</title></circle>`:''}${Array.from({length:9},(_,i)=>narrow&&i%2?'':`<text x="${x(i/10)}" y="${h-8}" text-anchor="middle">${i*10}%</text>`).join('')}</svg>`;
}

function capital() {
  const r=result,c=r.current,o=r.optimal;
  const compare=[['Debt / market capital','weight','pct'],['Gross debt ($M)','debt','num'],['Equity beta','beta','beta'],['Cost of equity','ke','pct'],['Synthetic rating','rating','raw'],['Default spread','spread','pct'],['Cost of debt','kd','pct'],['Annual interest ($M)','interest','num'],['Normal EBIT / interest','coverage','coverage'],['Stressed EBIT / interest','stressedCoverage','coverage'],['Effective shield tax rate','taxShieldRate','pct'],['WACC','wacc','pct']];
  return `${viewHeader('Capital structure','The lowest modeled WACC within a coverage constraint. A financing scenario, conditional on refinancing access, tax capacity and the seven distress factors below.')}
    <div class="metrics">${metric('Current gross debt weight',pct(r.currentWeight),`Debt / (market equity + gross debt)`)}${metric('Constrained grid minimum',pct(o?.weight),`1-point grid · 0–80% debt weight`,true)}${metric('Difference in debt weight',o?`${o.weight-r.currentWeight>=0?'+':''}${num((o.weight-r.currentWeight)*100,1)}<span class="unit">pp</span>`:'—',`Target gross debt ${big(o?.debt)}`)}${metric('Required stressed coverage h',`${num(r.h,2)}<span class="unit">×</span>`,`Max. annual interest ${big(r.maxInterest)}`)}</div>
    <div class="two-columns">${panel('WACC by debt weight','Feasible candidates satisfy both normal and stressed coverage.',`<div class="panel-body">${capitalChart()}<div class="legend"><span><i class="sage"></i>Modeled WACC</span><span><i class="dot"></i>Feasible debt weight</span><span><i class="line"></i>Constrained minimum</span></div></div>`)}
    ${panel('Stressed coverage test','h is the minimum stressed EBIT / interest.',`<div class="panel-body"><ul class="value-bridge"><li><span>TTM revenue</span><strong>${big(data.base.revenue)}</strong></li><li><span>Revenue stress</span><strong>−${pct(a.stressDrop)}</strong></li><li><span>Stressed EBIT margin</span><strong>${pct(a.stressMargin)}</strong></li><li><span>Stressed EBIT</span><strong>${big(r.stressEBIT)}</strong></li><li><span>÷ h</span><strong>${num(r.h,2)}×</strong></li><li class="total"><span>Maximum annual interest</span><strong>${big(r.maxInterest)}</strong></li></ul><div class="formula">Debt ceiling at each rating = max interest / (Rf + spread)</div></div>`)}
    </div>
    ${panel('Current structure vs. constrained optimum','Gross debt uses book principal as a proxy; weights use market equity. Cash stays in the equity bridge.',table(['Metric','Current structure','Constrained OCS'],compare.map(([label,key,format])=>{const f=x=>format==='pct'?pct(x,2):format==='num'?num(x):format==='beta'?num(x,2):format==='coverage'?(x===null?'Debt-free':num(x,2)+'×'):esc(x||'—');return{highlight:key==='wacc',cells:[label,f(c[key]),o?f(o[key]):'Unavailable']};}))+`<div class="table-note">At each weight, the engine enumerates all rating bands and solves debt × (Rf + spread) → interest → EBIT / interest → rating. It chooses the conservative self-consistent band. No fixed point means the candidate is excluded.</div>`)}
    <div class="insight warn"><div><h3>The optimal-capital-structure value is conditional</h3><p>Estimated change in gross debt: <strong>${big(o?o.debt-data.base.debt:null)}</strong>. Illustrative refinancing / transaction costs: <strong>${big(r.recapCosts)}</strong>. Value attributed to existing shareholders is ${money(r.optimized?.price)} per current share, including net recap proceeds, less costs. A post-recap share price also depends on the repurchase or issuance price.</p></div></div>
    ${panel('Share count after recap','Illustrative full recap, executed at the last traded price. A financing optimum is not a buyback recommendation.',table(['Recap mechanics','Conditional outcome'],[
      {cells:['Assumed execution price',money(r.postRecap?.executionPrice)]},
      {cells:['Shares retired / (issued), millions',num(r.postRecap?.sharesRetired,1)]},
      {cells:['Post-recap common shares, millions',num(r.postRecap?.shares,1)]},
      {cells:['Post-recap common equity',big(r.postRecap?.equity)]},
      {highlight:true,cells:['Conditional post-recap value / share',money(r.postRecap?.price)]}
    ])+`<div class="table-note">Fees reduce buyback proceeds or increase issuance needed. Buying back above intrinsic value can hurt remaining shareholders even if modeled WACC falls. This illustration assumes immediate refinancing, no execution slippage, no covenants, and constant operating cash flows.</div>`)}
    ${r.capitalStructureUnavailable?'<div class="note-box">'+esc(r.capitalStructureUnavailable)+'</div>':''}${panel('Value under each structure','Each terminal case uses the same operating forecast and a matching discount rate.',table(['Scenario','g = 0','g = '+pct(a.terminalGrowth)],[{cells:['Current structure · per share',money(r.zero?.price),money(r.valued?.price)]},{highlight:true,cells:['Conditional OCS · value / existing share',money(r.optimizedZero?.price),money(r.optimized?.price)]}]))}
    ${panel('Distress cost factors (h)','Company-specific scores come from cited LLM research. Pending research uses visible placeholders; h remains an uncalibrated policy heuristic.',data.hFactors.map((f,i)=>`<div class="factor"><div class="factor-head"><h4><span class="idx">0${i+1}</span>${esc(f.name)}</h4><label><span class="sr-only">${esc(f.name)} score</span><select data-h-index="${i}">${[...new Set([1,1.5,2,2.5,3,a.hScores[i]])].sort((x,y)=>x-y).map(s=>`<option value="${s}" ${a.hScores[i]===s?'selected':''}>${num(s,1)} / 3</option>`).join('')}</select></label></div><p>${esc(f.description)}. ${esc(f.basis)}</p>${f.sources?f.sources.map(s=>link(s.url,esc(s.title))).join(' · '):''}${f.sources?'':f.evidence?`<blockquote>Matched filing wording: “${esc(f.evidence)}”</blockquote>${link(f.url,'Review Risk Factors in the 10-K')}`:'<div class="note-box">Research pending. This score is a policy placeholder. Run company research to obtain evidence and review the judgment.</div>'}</div>`).join('')+`<div class="review-bar"><label class="checkbox-label"><input id="h-reviewed" type="checkbox" ${a.hReviewed?'checked':''}> I reviewed the seven scores and the source risk factors.</label></div>`,'1 = NEGLIGIBLE · 3 = HIGH')}
    <details class="disclosure"><summary>All 81 leverage candidates and the rating table</summary>${table(['D / capital','Debt $M','Rating','Coverage','Stress cover','WACC','Feasible'],r.sweep.map(x=>({highlight:x===o,cells:[pct(x.weight,0),num(x.debt),esc(x.rating),x.coverage===null?'Debt-free':num(x.coverage,2)+'×',x.stressedCoverage===null?'Debt-free':num(x.stressedCoverage,2)+'×',pct(x.wacc,2),x.feasible?'Yes':x.consistent?'Coverage / rate constraint':'Rating cliff']})))}<div class="panel-body"><p class="muted">${link(RATINGS_SOURCE,'January 2026 large-firm rating table')}. These are synthetic ratings, not agency credit ratings. A traded bond yield of comparable maturity is preferable when available.</p></div>${table(['Minimum ICR','Synthetic rating','Spread above Rf'],RATINGS.map(x=>({cells:[Number.isFinite(x.min)?num(x.min,2)+'×':'Below 0.20×',esc(x.rating),pct(x.spread,2)]})))}</details>`;
}

function comps() {
  const usable=data.peers.filter(p=>p.beta&&p.debt!==null&&p.equity>0&&a.peerIncluded.includes(p.symbol));
  const peerBeta=median(usable.map(p=>unlever(p.beta.beta,p.debt,p.equity,a.tax)));
  return `${viewHeader('Peers &amp; risk',`${esc(data.peerScreen)}. Candidate peers are a starting screen; include only businesses whose operating risk belongs in this valuation.`)}
    <div class="metrics">${metric('Bottom-up operating beta',num(peerBeta,2),`${usable.length} included candidates · median`,true)}${metric('Active asset beta',num(a.assetBeta,2),`${esc(a.betaBasis)}`)}${metric('Company equity beta',num(data.beta?.beta,2),`${data.beta?.n||0} monthly observations vs. SPY`)}${metric('Current relevered equity beta',num(result.current?.beta,2),`Gross D/E with a ${pct(a.tax,0)} tax assumption`)}</div>
    ${panel('Candidate peers','Adjusted monthly returns over up to five years; complete months only; at least 36 aligned observations.',`<div class="table-scroll"><table><thead><tr>${['Use','Company','Equity β','Unlevered β','R²','Std. error','Debt $M','Market equity $M','EBIT margin','EV / EBIT'].map((h,i)=>`<th scope="col" class="${i<2?'left':''}">${h}</th>`).join('')}</tr></thead><tbody>${data.peers.map(p=>{const valid=p.beta&&p.debt!==null&&p.equity>0;return `<tr><td><label><span class="sr-only">Include ${esc(p.symbol)} in peer beta</span><input class="peer-check" type="checkbox" data-peer="${esc(p.symbol)}" ${a.peerIncluded.includes(p.symbol)?'checked':''} ${valid?'':'disabled'}></label></td><th scope="row" class="left"><span class="tag-mono">${esc(p.symbol)}</span><div class="subline">${esc(p.name)}</div></th><td>${num(p.beta?.beta,2)}</td><td>${valid?num(unlever(p.beta.beta,p.debt,p.equity,a.tax),2):'—'}</td><td>${pct(p.beta?.r2,0)}</td><td>${num(p.beta?.standardError,2)}</td><td>${num(p.debt)}</td><td>${num(p.equity)}</td><td>${pct(p.margin)}</td><td>${p.ev!==null&&p.ebit>0?num(p.ev/p.ebit,1)+'×':'—'}</td></tr>`;}).join('')}</tbody></table></div><div class="table-note">Unlevered β = equity β / [1 + (1 − tax) × gross debt / market equity]. Peer tax rates currently share the editable marginal-tax prior. Debt beta is assumed negligible; material cash and risky debt require adjustment.</div>`)}
    <div class="note-box">Peer changes update the operating beta. The company's own regression is a cross-check, not a substitute for appropriate business comparisons. All quotes are independently timestamped; financial period ends differ.</div>
    ${panel('Peer rationale','Why each company is in the candidate screen.',data.peers.map(p=>`<div class="factor"><div class="factor-head"><h4><span class="idx">${esc(p.symbol)}</span>${esc(p.name)}</h4>${p.quoteUrl?link(p.quoteUrl,'Quote source'):''}</div><p>${esc(p.rationale)}</p><p class="stamp">Period end ${esc(p.end||'unavailable')} · Quote ${date(p.quoteDate)}${p.beta?` · Regression ${esc(p.beta.from)}–${esc(p.beta.to)}`:''}</p>${(p.quality||[]).map(q=>`<div class="quality-item critical"><span class="flag">Verify</span><span>${esc(q)}</span></div>`).join('')}</div>`).join(''))}
    ${panel('Change peer set','Choose up to four US tickers. Company and peer data are fetched again.',`<div class="panel-body"><form id="peer-form" class="peer-controls"><label for="peer-tickers">Peer tickers</label><input id="peer-tickers" value="${esc(data.peers.map(p=>p.symbol).join(', '))}" placeholder="MSFT, ORCL, CRM, ADBE"><button class="button primary">Update peers</button></form></div>`)}
    <div class="two-columns equal">${panel('Equity risk premium','Use a dated implied premium, with 5% retained as a sensitivity.',`<div class="panel-body"><ul class="value-bridge"><li><span>Active ERP</span><strong>${pct(a.erp,2)}</strong></li><li><span>Published implied ERP</span><strong>${pct(data.rates.erp,2)}</strong></li><li><span>Published date</span><strong>${date(data.rates.erpDate)}</strong></li><li><span>Cost of equity at a 5% ERP</span><strong>${pct(a.rf+result.current?.beta*.05,2)}</strong></li><li><span>Active cost of equity</span><strong>${pct(result.current?.ke,2)}</strong></li></ul><p class="stamp">${link(data.rates.erpUrl,'Source and methodology')}</p></div>`)}
    ${panel('Reading the cross-check','Price multiples are context, not an independent DCF conclusion.',`<div class="panel-body"><p class="muted">Compare profitability, growth, capital intensity and leverage before reading an EV/EBIT gap as cheapness. Loss-making peers have no meaningful positive EV/EBIT. The table uses a simplified equity + debt − liquid assets enterprise bridge.</p><div class="formula">β = Cov(monthly stock return, SPY return) / Var(SPY return)</div><p class="stamp">The regression uses total-return adjusted prices; it shows sample size, R² and slope standard error. A return beta can change as the business changes.</p></div>`)}</div>`;
}

function methodology() {
  const steps=[
    ['Collect reported financials','Match the SEC ticker and CIK. Normalize full fiscal years and TTM financials from SEC XBRL. Keep period, unit, tag, accession and filing date for every source value. Foreign accounting standards, banks and other specialized models are routed out.','TTM = latest FY + current YTD − prior YTD'],
    ['Forecast operations','Build a cited, company-specific five-year analyst case for growth, margins, cash capex, depreciation and working capital. Fade to a separately researched stable state in years 6–10. Retain issuer-history statistical forecasts as an independent short-term benchmark.','FCFF = EBIT(1 − cash tax rate) + D&A − capex − ΔNWC'],
    ['Estimate business risk','Use an industry-screened peer median of unlevered betas. Relever at each debt ratio. Show a company regression cross-check and expose peer quality. CAPM uses a dated 10-year USD Treasury reference and implied ERP.','Ke = Rf + βe × ERP'],
    ['Stress-test financing','Average the seven h scores from the class framework. Apply a revenue shock and a stressed margin. Limit interest to stressed EBIT / h. Enumerate rating bands at each leverage point to ensure cost of debt and coverage agree.','Kd = 10-year Treasury reference + synthetic default spread'],
    ['Set the terminal value','A ten-year explicit forecast enters a stable state with a separately chosen ROIC. Reinvestment funds growth. Require g below WACC, terminal ROIC and the nominal risk-free-rate assumption. Evaluate g = 0 separately.','TV = NOPAT₁₁ × (1 − g / ROIC) / (WACC − g)'],
    ['Bridge to equity value','Discount FCFF using WACC. Add non-operating liquid assets, subtract gross debt and other claims, then divide by shares including a disclosed dilution proxy. Show scenarios, sensitivity and a user-defined safety threshold. OCS is a conditional recap value per existing share.','WACC = E/(D+E) × Ke + D/(D+E) × Kd × (1 − usable tax shield)']
  ];
  return `${viewHeader('Methodology','ValueLens turns a corporate-finance model into a reproducible research process. Reported facts, estimated inputs and investor judgments play different roles, and all remain visible.')}<div class="flow-steps">${steps.map(([name,body,formula],i)=>`<article class="method-card"><div class="method-number">0${i+1}</div><h3>${name}</h3><p>${body}</p><div class="formula">${formula}</div></article>`).join('')}</div>
    <div class="note-box">Model version ${MODEL_VERSION}. Forecasts and implied values are deterministic conditional estimates. Company research requires a server-side OpenAI key. Segment estimates, peer selection and debt maturities carry citations and uncertainty. Full NOL tax schedules, option valuation, specialized valuation adapters and probability-weighted distress costs remain outside this edition.</div>
    ${panel('Changes from the class template','Same transparent sequence, more economic consistency.',table(['Class-model choice','ValueLens treatment'],[
      {cells:['Net-debt capital weights','Gross financial debt and market equity; liquid assets in the equity bridge']},
      {cells:['βu = βe / (1 + net D/E), without tax','Tax-adjusted gross-debt unlevering; debt-beta and cash caveats visible']},
      {cells:['Nearest sample rating','Explicit coverage intervals; enumerate self-consistent rating / yield pairs']},
      {cells:['Debt capacity called the optimum','Constrained WACC sweep; h sets a financing ceiling']},
      {cells:['Fixed 5% MRP','Dated implied ERP, editable; 5% cost-of-equity comparison']},
      {cells:['Perpetual FCFF growth','Stable-state ROIC determines necessary reinvestment']},
      {cells:['One value and recommendation','Bear/base/bull, sensitivity, source quality and a safety threshold']},
      {cells:['Missing values converted to zero','Required inputs block outputs; explicit absent-tag assumptions are flagged']}
    ]))}
    ${panel('Where judgment is required','A price gap is the start of a research question, not the answer.',`<div class="panel-body"><p class="muted">The best peer is not always in the same SIC code. A single bad year is not always a sustainable stress margin. A company with negative operating capital can release cash while growing, but that relationship may not persist. Research pricing power, competitive durability, capital allocation, cyclicality and governance before accepting the baseline.</p><p class="muted">The h average is a class-specific policy heuristic, not an empirically calibrated default model. A minimum WACC on an 81-point grid is a constrained modeled candidate. It excludes execution barriers, distress-related operating losses, dynamic financing, tax-law limits and the time to recapitalize. An APV model with explicit tax shields, expected distress costs and financing costs is an appropriate next-level cross-check.</p></div>`)}
    ${panel('Coverage and data access','US-listed, non-financial SEC filers with sufficient standardized facts.',`<div class="panel-body"><p class="muted">Any company name can be searched in the SEC ticker catalog. A valuation requires a supported US-GAAP filing history and usable market data. Banks, insurers, funds and real-estate businesses need a different valuation model. IFRS filers, highly distressed firms and companies with custom-only accounting tags are not automatically normalized here.</p><p class="muted">SEC statements are public. Yahoo’s chart endpoint is unofficial and can fail or change; quotes are timestamped and may be delayed. A production service should use a licensed market-data feed with redistribution rights. Public production also needs an account-level API rate limit and a source-refresh policy.</p></div>`)}`;
}

function sources() {
  const rows=[];
  for(const [metric,items] of Object.entries(data.base.provenance)) items.forEach((f,i)=>rows.push({cells:[`${esc(metric)}${f.operation?' · '+esc(f.operation):''}${f.basis?'<div class="subline">'+esc(f.basis)+'</div>':''}`,num(f.value,3),esc(f.end),esc(f.filed),esc(f.form),`<span class="tag-mono" title="${esc(f.tag)}">${esc(f.tag)}</span>`,link(f.url,'Filing')]}));
  return `${viewHeader('Sources',`Fetched ${date(data.fetchedAt)}. Financial base: ${esc(data.base.basis)}, ending ${esc(data.base.end)}. Quote: ${date(data.quote?.asOf)}. Values in USD millions unless the row is shares.`)}
    ${panel('Public sources','Financials and market inputs carry their own reporting dates.',data.sources.map(s=>`<div class="source-row"><div><strong>${esc(s.name)}</strong><p>${esc(s.kind)}</p></div>${link(s.url,'Open source')}</div>`).join(''))}
    ${panel('Financial input ledger','TTM rows combine FY + YTD − prior YTD. Instant balances use the TTM end date.',table(['Input / component','Value ($M / M shares)','Period end','Filed','Form','XBRL tag','Source'],rows))}
    <div class="note-box">Historical annual input provenance and complete model outputs are included in the JSON export. Source values are kept separate from forecast assumptions. Exported analyses retain timestamps, quality warnings, selected peers, h scores and the model version.</div>
    ${qualityPanel()}`;
}

function research() {
  const report=data.research?.report,job=researchJob||data.research,state=job?.status||'not_started';
  return `${viewHeader('Company research','An LLM extracts business drivers, management guidance, peer evidence and financing judgments. Company-specific analyst estimates drive the five-year valuation path. A separate statistical benchmark measures short-term forecast performance.')}
  ${panel('Company research',researchConfig.researchConfigured?esc(researchConfig.researchModel)+' · '+esc(researchConfig.researchEffort||'low')+' reasoning · Up to '+researchConfig.dailyResearchLimit+' new reports per UTC day.':'Awaiting your server-side API key.',`<div class="panel-body"><div class="research-status"><div><span class="status ${state==='validated'?'pos':state==='failed'?'neg':['starting','running'].includes(state)?'warn':'neutral'}">${esc(state.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()))}</span><p style="margin-top:8px">Reports use the latest financial base and are cached by company, reporting period and research version. Forecasts are estimates, even when citations pass verification.</p></div><button class="button primary" id="run-research" ${researchBusy||!researchConfig.researchConfigured?'disabled':''}>${researchBusy?'Researching…':report?'View issued research':'Research '+esc(data.symbol)}</button></div>${job?.errors?.length?'<div class="error-box">'+job.errors.map(esc).join('<br>')+'</div>':''}</div>`)}
  ${!researchConfig.researchConfigured?panel('Configure the research key','Credentials stay on the server.',`<div class="panel-body"><p>Local development: put your key after <code>OPENAI_API_KEY=</code> in the ignored <code>.dev.vars</code> file, then restart the dev server.</p><p>Hosted app: Cloudflare Dashboard → Workers & Pages → valuelens → Settings → Variables and Secrets → Add secret named <code>OPENAI_API_KEY</code>. Or run <code>npx wrangler secret put OPENAI_API_KEY</code> from this project.</p><p class="muted">Refresh this page after saving. The key is never sent to browser code. The configured model is ${esc(researchConfig.researchModel||'gpt-5.6-terra')}; you can change OPENAI_MODEL in Wrangler configuration.</p></div>`):''}
  ${report?panel('Business evidence',esc(report.businessDescription),report.businessDrivers?table(['Business driver','Observable in disclosures?','Evidence'],report.businessDrivers.map(d=>({cells:[esc(d.name),esc(d.observability),esc(d.description)+'<br>'+d.sourceIds.map(id=>{const src=report.sources.find(s=>s.id===id);return src?link(src.url,esc(id)):esc(id);}).join(' · ')]}))):'<div class="panel-body">'+esc(report.modelRationale.explanation)+'</div>')+panel('Guidance extraction','Only literal SEC guidance with matched fiscal period, units and numerical bounds can anchor a forecast.',table(['Period end','Verified range ($M)','Source'],(data.research?.guidance?.accepted||[]).map(g=>({cells:[esc(g.periodEnd),num(g.low)+' – '+num(g.high),link(g.url,'Guidance')]})))+'<div class="panel-body"><p class="muted">'+(data.research?.guidance?.accepted?.length?'Management guidance is an observable anchor; its forecasting performance remains unmeasured.':'No mechanically verified quarterly guidance. The statistical forecast is retained.')+'</p>'+(data.research?.guidance?.rejected||[]).map(g=>'<p class="muted">Withheld: '+esc(g.reason)+'</p>').join('')+'</div>')+panel('Uncertainty and sources','Evidence validation does not establish predictive accuracy.','<div class="panel-body"><ul>'+report.uncertainties.map(u=>'<li>'+esc(u)+'</li>').join('')+'</ul></div>'+report.sources.map(src=>'<div class="source-row"><div><strong>'+esc(src.title)+'</strong><p>'+esc(src.publishedAt)+'</p></div>'+link(src.url,'Primary source')+'</div>').join('')):''}
  ${panel('Accounting reconciliation','Missing disclosures remain missing until verified.',table(['Check','Period','Result','Difference $M'],(data.reconciliations||[]).map(c=>({cells:[esc(c.name),esc(c.period),c.passed?'<span class="status-text-pass">Passed</span>':'<span class="status-text-fail">Failed</span>',num(c.difference,3)]})))+(data.continuity?'<div class="panel-body">'+esc(data.continuity.basis)+' '+link(data.continuity.source,'Continuity disclosure')+'</div>':''))}
  ${qualityPanel()}`;
}
function validation() {
  const v=quarterlyReport,old=validationReport,one=v?.metrics.find(m=>m.split==='evaluation-2026'&&m.horizon===1),four=v?.metrics.find(m=>m.split==='evaluation-2026'&&m.horizon===4);
  return `${viewHeader('Validation','Operating forecasts, company diagnostics and investment returns are evaluated separately. The figures below summarize the reserved 2026 evaluation across issuers.')}${one&&four?`<div class="metrics">${metric('Next-quarter revenue error',pct(one.revenueMAPE,2),'Seasonal benchmark '+pct(one.seasonalMAPE,2),true)}${metric('Four-quarter total revenue error',pct(four.revenueMAPE,2),'Seasonal benchmark '+pct(four.seasonalMAPE,2))}${metric('Next-quarter margin error',num(one.marginMAEpp,2)+' pp','Latest-margin benchmark '+num(one.latestMarginMAEpp,2)+' pp')}${metric('Observed revenue range coverage',pct(one.observedPointCoverage,1),'Nominal 80% · '+one.intervalN+' next-quarter cases')}</div>`:''}${v?panel('Quarterly model evaluation',v.issuersWithFolds+' issuers · '+num(v.folds)+' forecast cases · 2026 targets reserved before the first quarterly run.',table(['Target split','Quarters aggregated','Cases','Revenue MAPE','Seasonal MAPE','Margin MAE pp','Latest-margin MAE pp'],v.metrics.map(m=>({highlight:m.split==='evaluation-2026',cells:[esc(m.split),m.horizon,num(m.n),pct(m.revenueMAPE,2),pct(m.seasonalMAPE,2),num(m.marginMAEpp,2),num(m.latestMarginMAEpp,2)]})))+`<div class="panel-body"><p><strong>Release gate: ${v.gatePassed?'passed':'failed'}. ${esc(v.productionPolicy)}.</strong></p><p>Four-quarter rows compare the sum of four future fiscal quarters. These results exclude LLM guidance overlays, FCFF, terminal valuation and stock returns. Forecast lead times depend on filing dates.</p><br><ul>${v.limitations.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul>${link('/validation/quarterly.json','Metrics, sector results and coverage')}</div>`):'<p class="muted">Loading evaluation…</p>'}
  ${old?panel('Earlier annual fallback test','Archived v0.2 results; these do not measure the current quarterly model.',table(['Horizon / split','Cases','v0.2 revenue MAPE','Flat MAPE'],old.metrics.map(m=>({cells:[m.horizon+'y / '+esc(m.split),num(m.n),pct(m.revenueMAPE),pct(m.flatRevenueMAPE)]})))+`<div class="panel-body">${link('/validation/latest.json','Archived annual metrics')}</div>`):''}`;
}
function predictions() {
  const f=a.operatingForecast,q=f?.quarterly,quarters=f?.quarters||[],segments=data.reportedSegments;
  return `${valuationCasePanel()}${viewHeader('Statistical benchmark',`${esc(f?.basis||'Manual operating scenario. Reset assumptions to restore fitted forecasts.')}. Price and valuation targets do not enter model selection.`)}
  ${panel('Next four reported quarters','USD millions. Fiscal end dates are estimated; the interval starts after the latest filed quarter, not today.',(quarters.length?table(['Estimated period end','Revenue','EBIT margin','EBIT','Historical-error revenue range¹','Method'],quarters.map(r=>({cells:[esc(r.end),num(r.revenue),pct(r.margin),num(r.ebit),r.low===null?'Not calibrated':num(r.low)+' – '+num(r.high),esc(r.basis)]}))):'<div class="panel-body">Eight consecutive quarters ending at the current financial base are required. Annual flat-revenue benchmark used where quarterly coverage is insufficient.</div>')+`<div class="table-note">¹ Nominal 80% ranges need at least 12 prequential residuals for that horizon. These are marginal revenue ranges, not joint paths, share-price confidence intervals or a guarantee. Guidance overlays do not inherit statistical ranges.</div>`)}
  ${f?.guidanceComparison?.length?panel('Management guidance comparison','Statistical forecasts stay the default. Guidance is an optional scenario until its prospective accuracy is measured.',table(['Quarter','Statistical revenue $M','Guidance range $M','Source'],f.guidanceComparison.map(g=>({cells:[esc(g.periodEnd),num(g.statisticalRevenue),num(g.low)+' – '+num(g.high),link(g.url,'SEC guidance')]})))+`<div class="panel-body"><button class="button" id="toggle-guidance">${f.appliedGuidance.length?'Restore statistical default':'Use guidance scenario'}</button></div>`):''}
  ${q?.status==='fitted'?panel('Why this model?','Selection uses this issuer’s historical rolling folds. Challenger needs four completed folds and 5% lower aggregate revenue error.',table(['Candidate','Completed four-quarter folds','Historical selection MAPE','Chosen'],q.fit.scores.map(s=>({cells:[esc(s.method),num(s.n),pct(s.mape,2),s.method===q.fit.method?'Yes':'—']})))+`<div class="panel-body"><p>Margin model: <strong>${esc(q.marginFit.method)}</strong>. ${num(q.historyCount)} consecutive quarters available through ${esc(q.through)}.</p><p class="muted">These company diagnostics helped select the model and are not an independent test. Use the Validation tab for the reserved 2026 evaluation.</p></div>`):''}
  ${segments?.status==='reconciled'?panel('Reported revenue segments','Single-axis inline-XBRL partition reconciled to consolidated annual revenue. Historical amounts, not estimated weights.',table(['Segment','Period','Revenue $M','Reported weight'],segments.latest.members.map(s=>({cells:[esc(s.name),esc(segments.latest.end),num(s.revenue),pct(s.weight)]})))+`<div class="panel-body">Difference from consolidated revenue: ${num(segments.latest.difference,3)} million. ${link(segments.latest.source,'SEC source')}<br><p class="muted">Segment quantities, prices and future growth are not invented when undisclosed. Forecasting currently selects on consolidated issuer history; segment-specific operating adapters remain future work.</p></div>`):panel('Reported revenue segments','Custom or unsupported segment tables remain unavailable.','<div class="panel-body">'+esc(segments?.reason||'No reconciled inline-XBRL partition attached to this snapshot.')+'</div>')}
  ${panel('Quarterly source history','Discrete periods; Q2/Q3 cash-flow YTD and Q4 annual figures are differenced before use.',table(['Period start','Period end','Revenue $M','EBIT $M','Capex $M','Basis','Revenue source'],(data.quarterly||[]).slice(-12).map(r=>({cells:[esc(r.start),esc(r.end),num(r.revenue),num(r.ebit),num(r.capex),esc(r.basis),link(r.provenance?.revenue?.[0]?.url,'Filing')]}))))}
  ${panel('Investment and working capital','Ratios are fitted to historical disclosures. These inputs have not yet passed an FCFF forecast evaluation.',table(['Input','Ratio','Basis'],Object.entries(f?.ratios||{}).map(([key,r])=>({cells:[esc(key),pct(r.value),esc(r.method)]})))+`<div class="panel-body"><p class="muted">The valuation uses separate company research for years 1–5 and fades toward its explicit stable state in years 6–10. The statistical benchmark above remains an independent comparison. Capital-expenditure transition adjustments, tax simplifications and dilution remain visible in the cash-flow audit.</p></div>`)}
  <button class="button" data-view="validation">View reserved evaluation</button>`;
}
function valuationCasePanel() {
  const c=a.valuationForecast;if(!c)return '';
  const report=data.research.report;
  const evidence=key=>{const r=c[key];return '<p>'+esc(r.explanation)+'</p><p>'+r.sourceIds.map(id=>{const source=report.sources.find(s=>s.id===id);return source?link(source.url,esc(source.title)):esc(id);}).join(' · ')+'</p>';};
  return panel('Company-specific valuation forecast','Source-checked analyst estimates · issued '+dateTime(data.research.completedAt)+' · separate from the statistical benchmark.',table(['Year','Revenue growth','EBIT margin','Cash capex / sales','D&A / sales','Operating NWC / sales'],c.years.map(y=>({cells:[y.year,pct(y.growth),pct(y.margin),pct(y.capexRatio),pct(y.daRatio),pct(y.nwcRatio)]})))+'<div class="panel-body"><h4>Growth</h4>'+evidence('growthRationale')+'<h4>Margins</h4>'+evidence('marginRationale')+'<h4>Investment</h4>'+evidence('investmentRationale')+'<h4>Stable state · growth '+pct(a.terminalGrowth)+' · ROIC '+pct(a.terminalROIC)+'</h4>'+evidence('terminalRationale')+'</div>');
}
function forecastPending() {
  const failed=['failed','rejected'].includes(researchJob?.status);
  return viewHeader('Company valuation forecast',failed?'The forecast could not be completed.':'Financial statements are loaded. Building the company-specific growth, margin and investment estimates…')+
    panel(failed?'Forecast needs attention':researchBusy?'Research in progress':'Company forecast required','The financials and statistical benchmark are available in the other tabs.',`<div class="panel-body"><p>${researchJob?.errors?.map(esc).join('<br>')||'The valuation will appear here when its cited assumptions pass source and accounting checks.'}</p><p class="muted">Research runs in the background and is cached for this financial period.</p><button class="button primary" id="run-research" ${researchBusy?'disabled':''}>${researchBusy?'Researching '+esc(data.symbol)+'…':'Build company forecast'}</button></div>`);
}
async function runResearch(background=false) {
  if(researchBusy||!data)return;
  if(data.research?.status==='validated'&&data.research.report?.forecast){if(!background)currentView='research';render();return;}
  const symbol=data.symbol,controller=loadController;
  const current=()=>controller===loadController&&data?.symbol===symbol;
  researchBusy=true;researchJob={status:'starting'};if(!background)currentView='research';render();
  const get=(url,options={})=>requestJSON(url,{signal:controller.signal,timeoutMs:60000,...options});
  try {
    let job=await get('/api/forecast?symbol='+encodeURIComponent(symbol)+'&period='+data.base.end);
    if(['not_started','failed','rejected'].includes(job.status))job=await get('/api/research',{method:'POST',body:{symbol}});
    for(let i=0;i<40;i++) {
      if(!current())return;researchJob=job;render();
      if(!['starting','running'].includes(job.status))break;
      await new Promise(resolve=>setTimeout(resolve,7000));
      if(!current())return;
      job=await get('/api/research?key='+encodeURIComponent(job.key));
    }
    if(!current())return;
    if(['starting','running'].includes(job.status))throw Error('Research is still running. Retry to resume the cached job.');
    researchJob=job;
    if(job.analysis){
      if(job.analysis.base.end!==data.base.end)throw Error('The financial period changed. Refresh company data.');
      data={...job.analysis,quote:data.quote,rates:data.rates,fetchedAt:data.fetchedAt};
      if(changes===0)a=defaults(data);isExample=false;
    }
  }catch(e){if(current()&&e.name!=='AbortError')researchJob={status:'failed',errors:[e.message]};}
  finally{if(current()){researchBusy=false;render();}}
}

function render() {
  if(!data) return;
  result=analyze(data,a);
  document.title=`${data.symbol} · ValueLens`;
  $('#company-monogram').textContent=data.symbol[0];
  $('#company-name').textContent=data.name.replace(/,?\s*(INC\.?|CORPORATION|CORP\.?)$/i,'');
  $('#company-ticker').textContent=data.symbol;
  $('#company-description').textContent=`${data.industry||'SEC filer'} · USD · Financials through ${date(data.base.end)}`;
  $('#data-banner').innerHTML=`<span class="tag">${isExample?'Saved example':'Live analysis'}</span><span>${isExample?'Captured':'Fetched'} ${date(data.fetchedAt)}</span><span class="sep">·</span><span>Quote ${date(data.quote?.asOf)}</span>${changes?'<span class="tag warn">Modified assumptions</span>':''}${result.incomplete?'<span class="tag warn">Provisional inputs</span>':''}<span>${data.peerStatus==='pending'?'Peer comparisons loading…':data.peerStatus==='failed'?'Peer comparison unavailable':''}</span><button id="refresh-live">Refresh live data</button>`;
  const isSaved=saved.includes(data.symbol);
  $('#save-company').textContent=isSaved?'Saved':'Save';
  $('#save-company').classList.toggle('saved',isSaved);
  $('#save-company').setAttribute('aria-pressed',String(isSaved));
  $('#assumption-count').hidden=changes===0;
  $('#assumption-count').textContent=changes;
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>{const on=b.dataset.view===currentView;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const error=result.errors.length && !['methodology','sources','comps','research','validation','predictions'].includes(currentView);
  const pending=!a.valuationForecast&&changes===0&&data.modelFamily!=='specialized'&&['overview','cashflows','capital'].includes(currentView);
  $('#view').innerHTML=pending?forecastPending():error?`<div class="error-box"><strong>The model needs complete inputs.</strong><br>${result.errors.map(esc).join('<br>')}</div><div class="error-actions"><button class="button" data-view="research">Research missing inputs</button><button class="button" id="open-error-assumptions">Review assumptions</button></div>${qualityPanel()}`:({overview,cashflows,capital,comps,methodology,sources,research,validation,predictions}[currentView]||overview)();
  $('#workspace').hidden=false;
  renderSaved();
}

async function loadCompany(symbol,peers=[]) {
  clearTimeout(searchTimer);searchController?.abort();
  loadController?.abort();loadController=new AbortController();const controller=loadController;
  $('#loading').hidden=false;$('#workspace').hidden=true;$('#message').textContent='';$('#search-results').hidden=true;$('#analyze-button').disabled=true;
  const started=Date.now();
  const progress=()=>{$('#loading-step').textContent=`Loading ${symbol.toUpperCase()} from public sources… ${Math.floor((Date.now()-started)/1000)}s elapsed. This attempt ends within 35 seconds.`;};
  progress();const timer=setInterval(progress,1000);
  try {
    const body=await requestJSON(`/api/company?symbol=${encodeURIComponent(symbol)}&includePeers=0`,{signal:controller.signal});
    if(controller!==loadController)return;
    data=body;researchBusy=false;researchJob=null;a=defaults(data);isExample=false;changes=0;currentView='overview';$('#search-results').hidden=true;$('#company-search').value='';$('#company-search').blur();render();
    history.replaceState(null,'',`?symbol=${encodeURIComponent(data.symbol)}`);
    void loadPeerComparison(data.symbol,peers.length?peers:data.research?.report?.peers?.map(p=>p.symbol)||data.peerCandidates||[],controller);
    void configReady.then(()=>{if(controller===loadController&&researchConfig.researchConfigured&&!a.valuationForecast)void runResearch(true);});
  } catch(e) {
    if(controller!==loadController||e.name==='AbortError')return;
    $('#message').innerHTML=`<div class="error-box" role="alert"><strong>${esc(symbol.toUpperCase())} did not load.</strong><p>${esc(e.message)}</p><button class="button" data-symbol="${esc(symbol)}">Retry ${esc(symbol.toUpperCase())}</button></div>`;
    $('#workspace').hidden=true;
  } finally {
    clearInterval(timer);if(controller===loadController){$('#loading').hidden=true;$('#analyze-button').disabled=false;}
  }
}

async function loadPeerComparison(symbol,peers,controller) {
  try {
    const comparison=await requestJSON(`/api/peers?symbol=${encodeURIComponent(symbol)}${peers.length?'&peers='+encodeURIComponent(peers.join(',')):''}`,{signal:controller.signal,timeoutMs:30000});
    if(controller!==loadController||data?.symbol!==symbol||researchBusy)return;
    data={...data,peers:comparison.peers,peerScreen:comparison.peerScreen,peerStatus:'loaded',quality:[...data.quality.filter(q=>!['peer-coverage','peer-debt'].includes(q.code)),...comparison.quality]};
    if(changes===0)a=defaults(data);
    render();
  }catch(e){
    if(controller!==loadController||data?.symbol!==symbol||e.name==='AbortError')return;
    data={...data,peerStatus:'failed',quality:[...data.quality.filter(q=>q.code!=='peer-coverage'),{severity:'critical',code:'peer-coverage',text:'Peer comparison unavailable: '+e.message+' Company financials remain available.'}]};render();
  }
}

function renderSaved() {
  $('#saved-count').textContent=saved.length;
  $('#saved-list').innerHTML=saved.length?saved.map(s=>`<div class="saved-item ${data?.symbol===s?'current':''}"><button data-symbol="${esc(s)}">${esc(s)}</button><button data-remove="${esc(s)}" aria-label="Remove ${esc(s)} from watchlist">×</button></div>`).join(''):'<p>Save a company to keep it here.</p>';
  try{localStorage.setItem('valuelens.saved',JSON.stringify(saved));}catch{}
}

const FIELDS=[
  ['Operating forecast','growth','Initial revenue growth','pct','First year of the company-specific forecast when available. Editing operating inputs creates an explicit manual scenario.'],
  ['', 'margin','Target EBIT margin','pct','Terminal EBIT margin in the company-specific forecast. An override creates a manual margin scenario.'],
  ['', 'capex','Capex / revenue','pct','Year-one cash capex estimate from company research; later years are shown in Forecast. Editing creates a manual spending-ratio scenario.'],
  ['', 'da','D&A / revenue','pct','Year-one company forecast of depreciation and amortization. Historical reported amounts remain in Sources.'],
  ['', 'nwc','Operating NWC / revenue','pct','Year-one company estimate for non-cash operating working capital. Negative ratios can be valid.'],
  ['Discount rate','rf','10-year Treasury / risk-free rate','pct','Dated USD Treasury reference. Match the currency and duration of the cash flows.'],
  ['', 'erp','Equity risk premium','pct','Dated implied US ERP; use geography-weighted country risk for material international exposure.'],
  ['', 'assetBeta','Active unlevered beta','number','Median unlevered candidate-peer beta, with company regression fallback. Override with a researched value.'],
  ['', 'tax','Marginal tax rate','pct','25% is an analyst prior. Review jurisdiction, NOLs and interest deductibility.'],
  ['Stable state','terminalGrowth','Terminal growth g','pct','Company-researched stable growth; must be below WACC, terminal ROIC and nominal risk-free rate.'],
  ['', 'terminalROIC','Terminal ROIC','pct','Company-specific sustainable return on invested capital with cited economic reasoning. Reinvestment fades to g/ROIC.'],
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
  const payload={...data,isSavedExample:isExample,assumptions:a,analysis:a.valuationForecast||changes>0?result:null,forecastStatus:a.valuationForecast?'company_case':changes>0?'manual':'pending',exportedAt:new Date().toISOString(),modelVersion:MODEL_VERSION};
  download(`${data.symbol}-valuelens.json`,JSON.stringify(payload,null,2),'application/json');
}
function download(name,content,type) {
  const u=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=u;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}

document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.id==='reload-app'){location.reload();return;}
  if(button.dataset.view) {currentView=button.dataset.view;render();if(data&&!button.closest('.view-header'))window.scrollTo({top:0});return;}
  if(button.id==='theme-toggle'){const dark=document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'light':'dark';try{localStorage.setItem('valuelens.theme',document.documentElement.dataset.theme);}catch{}return;}
  if(button.dataset.symbol) {loadCompany(button.dataset.symbol);return;}
  if(button.dataset.remove) {saved=saved.filter(s=>s!==button.dataset.remove);renderSaved();if(data)render();return;}
  if(button.id==='toggle-guidance'){const f=operatingForecast(data,{useGuidance:!a.operatingForecast.appliedGuidance.length});a={...a,valuationForecast:null,operatingForecast:f,growth:f.firstGrowth,margin:f.nearMargin};changes++;render();return;}
  if(button.id==='run-research'){runResearch();return;}
  if(button.id==='refresh-live')loadCompany(data.symbol,data.peers.map(p=>p.symbol));
  if(button.id==='assumptions-button'||button.id==='open-error-assumptions')openAssumptions();
  if(button.id==='save-company' && data) {saved=saved.includes(data.symbol)?saved.filter(s=>s!==data.symbol):[...saved,data.symbol].slice(-20);render();}
  if(button.id==='export-json')exportData();
  if(button.id==='export-csv') {
    if(result.errors.length||(!a.valuationForecast&&changes===0)){$('#message').textContent='Forecast export is unavailable until the financial inputs are complete.';return;}
    const keys=['year','revenue','growth','margin','ebit','cashTax','nopat','da','capex','nwc','deltaNwc','fcff'];
    download(`${data.symbol}-forecast-usd-millions.csv`,keys.join(',')+'\n'+result.rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n'),'text/csv');
  }
  if(button.id==='reset-assumptions') {a=defaults(data);changes=0;render();openAssumptionsRefresh();}
  if(button.id==='apply-assumptions') {
    const next={...a};
    const edited=new Set();
    document.querySelectorAll('[data-assumption]').forEach(input=>{if(input.value!==input.dataset.initial){edited.add(input.dataset.assumption);next[input.dataset.assumption]=input.value.trim()===''?null:Number(input.value)/(input.dataset.type==='pct'?100:1);}});
    if([...edited].some(k=>['growth','margin','capex','da','nwc'].includes(k))){next.driverForecast=null;next.operatingForecast=null;next.valuationForecast=null;}
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
    $('#search-results').innerHTML=body.companies.length?body.companies.map(c=>`<button type="button" data-symbol="${esc(c.symbol)}"><strong>${esc(c.symbol)}</strong><span>${esc(c.name)}</span></button>`).join(''):'<p class="empty">No SEC-listed match. Try a ticker or another company name.</p>';
    $('#search-results').hidden=false;$('#company-search').setAttribute('aria-expanded','true');
  }catch(e){if(showError&&e.name!=='AbortError')$('#message').textContent=e.message;}
}
const SUGGESTED=[['AAPL','Apple'],['MSFT','Microsoft'],['NVDA','NVIDIA'],['COST','Costco']];
function showSuggestions() {
  const row=([sym,name])=>`<button type="button" data-symbol="${esc(sym)}"><strong>${esc(sym)}</strong><span>${esc(name)}</span></button>`;
  $('#search-results').innerHTML=(saved.length?'<div class="results-label">Watchlist</div>'+saved.map(s=>row([s,''])).join(''):'')+'<div class="results-label">Suggested</div>'+SUGGESTED.filter(([s])=>!saved.includes(s)).map(row).join('');
  $('#search-results').hidden=false;$('#company-search').setAttribute('aria-expanded','true');
}
$('#company-search').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('#company-search').value.trim();if(q.length<2){if(q.length)$('#search-results').hidden=true;else showSuggestions();return;}searchTimer=setTimeout(()=>search(q),450);});
$('#company-search').addEventListener('focus',()=>{if(!$('#company-search').value.trim())showSuggestions();});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.target.closest('input,textarea,select,[contenteditable]')&&!$('#assumptions-dialog').open){e.preventDefault();$('#company-search').focus();}});
document.addEventListener('click',e=>{if(!e.target.closest('#search-form')){$('#search-results').hidden=true;$('#company-search').setAttribute('aria-expanded','false');}});
$('#company-search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#search-results').hidden=true;e.target.setAttribute('aria-expanded','false');e.target.blur();}if(e.key==='ArrowDown'&&!$('#search-results').hidden){e.preventDefault();$('#search-results button')?.focus();}});
$('#search-results').addEventListener('keydown',e=>{const items=[...document.querySelectorAll('#search-results button')],i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();items[Math.min(i+1,items.length-1)]?.focus();}if(e.key==='ArrowUp'){e.preventDefault();(i<=0?$('#company-search'):items[i-1]).focus();}if(e.key==='Escape'){$('#search-results').hidden=true;$('#company-search').focus();}});

renderSaved();
const requested=new URLSearchParams(location.search).get('symbol');
if(requested)loadCompany(requested);
else $('#message').innerHTML=`<div class="panel-body"><h1>Analyze a public company</h1><p>Search above to load its financial statements and valuation assumptions.</p><div class="error-actions">${SUGGESTED.map(([symbol,name])=>`<button class="button" data-symbol="${symbol}">${name} · ${symbol}</button>`).join('')}</div></div>`;
