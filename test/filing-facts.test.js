import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {supplementFilingFacts} from '../src/filing-facts.js';
import {financials} from '../src/accounting.js';
import {analyze} from '../public/model.js';

const filings={
  MSFT:{cik:789019,end:'2026-06-30',date:'2026-07-29',accession:'0001193125-26-323660',form:'10-K',url:'https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm'},
  COST:{cik:909832,end:'2026-08-30',date:'2026-10-07',accession:'0000909832-26-000093',form:'10-K',url:'https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm'}
};
const load=s=>readFile(new URL('./fixtures/company-loading/'+s+'.json',import.meta.url),'utf8').then(JSON.parse);
const context=(id,f,dimension='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier>${f.cik}</xbrli:identifier>${dimension?`<xbrli:segment><xbrldi:explicitMember dimension="us-gaap:BalanceSheetLocationAxis">${dimension}</xbrldi:explicitMember></xbrli:segment>`:''}</xbrli:entity><xbrli:period><xbrli:instant>${f.end}</xbrli:instant></xbrli:period></xbrli:context>`;
const number=(tag,value,id='whole',extra='')=>`<ix:nonFraction name="us-gaap:${tag}" unitRef="usd" contextRef="${id}" scale="6" ${extra}>${value}</ix:nonFraction>`;
const unit='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
// Reduced factual excerpts: filing URLs, dates, reported balances and dimensions
// match the archived SEC documents. Full filings stay outside the test suite.
function microsoft(f=filings.MSFT){return unit+context('whole',f)+context('current',f,'us-gaap:OtherCurrentLiabilitiesMember')+context('noncurrent',f,'us-gaap:OtherNoncurrentLiabilitiesMember')+
  '<table><tr><td>Total debt</td><td>'+number('LongTermDebt','40,294')+'</td></tr></table>'+number('FinanceLeaseLiability','66,594')+number('FinanceLeaseLiability','4,290','current')+number('FinanceLeaseLiability','62,304','noncurrent');}
const costco='There were no short-term borrowings outstanding at the end of 2026, and short-term borrowings were immaterial at the end of 2025.';
function input(normalized){return {...normalized,peers:[],beta:{beta:1.1},quote:{price:500,asOf:'2026-10-21T20:00:00Z'},rates:{rf:.04,erp:.05},hFactors:Array.from({length:7},()=>({score:2})),modelFamily:'fcff'};}

test('Microsoft recovers dimensional lease principal, debt and working capital with provenance',async()=>{
  const raw=await load('MSFT'),before=JSON.stringify(raw),supp=supplementFilingFacts(raw,microsoft(),filings.MSFT,'2026-10-21');
  const result=financials(supp.raw,{},'2026-10-21'),b=result.base;
  assert.equal(b.financeLeaseCurrent,4290);assert.equal(b.financeLeaseNoncurrent,62304);
  assert.equal(b.debt,106888);assert.equal(b.nwc,-24441);assert.equal(b.shortDebt,0);
  assert.equal(b.provenance.financeLeaseCurrent[0].dimension,'us-gaap:OtherCurrentLiabilitiesMember');
  assert.equal(b.provenance.shortDebt[0].tag,'Derived:TotalDebtLessTermDebt');
  assert.equal(b.provenance.shortDebt[0].url,filings.MSFT.url);
  assert.ok(supp.notes.some(n=>n.text.includes('inference requiring review')));
  assert.deepEqual(analyze(input(result)).errors,[]);
  assert.equal(JSON.stringify(raw),before,'do not mutate a cached Company Facts object');
});
test('Costco uses its explicit absence disclosure for this year and counts finance leases once',async()=>{
  const raw=await load('COST'),s=supplementFilingFacts(raw,costco,filings.COST,'2026-10-21'),n=financials(s.raw,{},'2026-10-21');
  assert.equal(n.base.debt,7575);assert.equal(n.base.nwc,-16329);
  assert.equal(n.base.provenance.shortDebt[0].tag,'Narrative:NoShortTermBorrowings');
  assert.deepEqual(analyze(input(n)).errors,[]);
});
test('missing, facility-only, immaterial, other-year and future disclosures remain unresolved',async()=>{
  const raw=await load('COST');
  for(const html of ['',costco.replace('2026','2025'),costco.replace('outstanding at','outstanding under the bank credit facilities at'),'Short-term borrowings were immaterial at the end of 2026.']){
    const s=supplementFilingFacts(raw,html,filings.COST,'2026-10-21');
    assert.equal(financials(s.raw,{},'2026-10-21').base.debt,null);
  }
  assert.equal(supplementFilingFacts(raw,costco,filings.COST,'2026-09-01').raw,raw);
});
test('term-debt caption, wrong issuer or period and conflicting lease facts are not accepted',async()=>{
  const raw=await load('MSFT');
  const caption=supplementFilingFacts(raw,microsoft().replace('Total debt','Total long-term debt'),filings.MSFT,'2026-10-21');
  assert.equal(financials(caption.raw,{},'2026-10-21').base.debt,null);
  for(const f of [{...filings.MSFT,cik:1},{...filings.MSFT,end:'2025-06-30'}]){
    const s=supplementFilingFacts(raw,microsoft(f),filings.MSFT,'2026-10-21');
    assert.equal(financials(s.raw,{},'2026-10-21').base.financeLeaseCurrent,null);
  }
  for(const html of [microsoft().replace('62,304','62,000'),microsoft()+number('FinanceLeaseLiability','5,000','current'),microsoft().replace('BalanceSheetLocationAxis','ProductOrServiceAxis')]) {
    const s=supplementFilingFacts(raw,html,filings.MSFT,'2026-10-21');
    assert.equal(financials(s.raw,{},'2026-10-21').base.financeLeaseCurrent,null);
  }
});
test('reported nonzero borrowings take precedence over absence inference; wrong units and nil do not become zero',async()=>{
  const raw=await load('COST'),base=unit+context('whole',filings.COST);
  const s=supplementFilingFacts(raw,base+number('ShortTermBorrowings','20')+costco,filings.COST,'2026-10-21');
  assert.equal(financials(s.raw,{},'2026-10-21').base.shortDebt,20);
  for(const html of [base.replace('iso4217:USD','iso4217:EUR')+number('ShortTermBorrowings','20'),base+number('ShortTermBorrowings','0','whole','xsi:nil="true"')]){
    const s=supplementFilingFacts(raw,html,filings.COST,'2026-10-21');assert.equal(financials(s.raw,{},'2026-10-21').base.shortDebt,null);
  }
});
