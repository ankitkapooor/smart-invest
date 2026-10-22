import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('prospective scorer requires a matching vintage, mature aligned actuals and complete total returns',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'valuelens-score-'));
  try {
    const vintage={symbol:'TEST',research:{forecastSnapshot:{inputHash:'fixture-hash',issuedAt:'2020-01-02T12:00:00Z',analysis:{rows:[{revenue:100,margin:.2,fcff:20}],status:'Review required',upside:.3}}}};
    const outcome={symbol:'TEST',forecastHash:'fixture-hash',horizonYears:1,periodStart:'2020-01-02',periodEnd:'2021-01-01',actualsFiledAt:'2021-02-15',actualsSource:'https://www.sec.gov/example',revenue:200,ebit:40,reconciledFcff:25,fcffReconciliationSource:'fixture reconciliation',returns:{start:'2020-01-02',end:'2021-01-02',stock:.2,benchmark:.1,includesDividendsSplitsAndDelistings:true,source:'fixture total-return provider',benchmarkSource:'fixture benchmark'}};
    const vintages=join(dir,'vintages.json'),outcomes=join(dir,'outcomes.json'),output=join(dir,'scored.json');
    await writeFile(vintages,JSON.stringify([vintage]));
    async function score(value){await writeFile(outcomes,JSON.stringify([value]));execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/score-vintages.mjs',import.meta.url)),vintages,outcomes,output],{stdio:'pipe'});return JSON.parse(await readFile(output,'utf8'));}
    const valid=await score(outcome);assert.equal(valid.metrics.n,1);assert.equal(valid.metrics.revenueMAPE,.5);assert.equal(valid.results[0].fcffError,-5);assert.ok(Math.abs(valid.results[0].excessReturn-.1)<1e-12);
    assert.equal((await score({...outcome,forecastHash:'another-vintage'})).metrics.n,0);
    assert.equal((await score({...outcome,periodEnd:'2023-01-01'})).metrics.n,0);
    assert.equal((await score({...outcome,actualsFiledAt:'2099-01-01'})).metrics.n,0);
    const incomplete=await score({...outcome,returns:{...outcome.returns,includesDividendsSplitsAndDelistings:false}});assert.equal(incomplete.metrics.totalReturnsScored,0);assert.equal(incomplete.metrics.n,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});
