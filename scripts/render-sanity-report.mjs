import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../reports/2026-10-21/',import.meta.url);
const r=JSON.parse(await readFile(new URL('sanity-check.json',root),'utf8'));
const percent=x=>Number.isFinite(x)?`${(100*x).toFixed(1)}%`:'Unavailable';
const dollars=x=>Number.isFinite(x)?`$${x.toFixed(2)}`:'Unavailable';
const rows=r.live.map(x=>{
  const b=r.summary.byCompany.find(c=>c.symbol===x.symbol);
  return `| ${x.symbol} | ${dollars(x.modeledPrice)} | ${dollars(x.quote?.price)} | ${percent(x.gap)} | ${percent(b.oneYear.revenueMAPE)} | ${percent(b.oneYear.ebitMAPE)} |`;
}).join('\n');
const bt=r.summary.byCompany.map(x=>`| ${x.symbol} | ${x.oneYear.count} | ${percent(x.oneYear.revenueMAPE)} | ${percent(x.oneYear.flatRevenueMAPE)} | ${percent(x.oneYear.lastGrowthRevenueMAPE)} | ${percent(x.threeYear.revenueMAPE)} |`).join('\n');
const sensitivities=r.live.filter(x=>x.modeledPrice!==undefined).map(x=>`| ${x.symbol} | ${dollars(x.modeledPrice)} | ${dollars(x.variants.currentMargin)} | ${dollars(x.variants.currentCapex)} | ${dollars(x.variants.currentMarginAndCapex)} | ${dollars(x.variants.erp5Percent)} |`).join('\n');
const sourceLinks={
  AAPL:'https://www.apple.com/newsroom/pdfs/fy2026q3/FY26_Q3_Consolidated_Financial_Statements.pdf',
  MSFT:'https://www.microsoft.com/en-us/investor/earnings/fy-2026-q4/press-release-webcast',
  NVDA:'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-second-quarter-fiscal-2027/',
  COST:'https://www.sec.gov/Archives/edgar/data/909832/000090983226000084/costex9918-k92426.htm',
  XOM:'https://investor.exxonmobil.com/company-information/press-releases/detail/1208/exxonmobil-announces-second-quarter-2026-results'
};
const text=`# ValueLens: five-company sanity check

Audit date: October 21, 2026 (America/Los_Angeles). Model: deployed v${r.modelVersion}. Model source SHA-256: \`${r.modelSha256}\`.

## Verdict

ValueLens is an inspectable research model with material data and forecasting weaknesses. It is not yet a validated stock-price or investment-return predictor. Its calculation consistency is substantially stronger than its evidence for predictive accuracy.

Five companies were attempted. Four returned provisional valuations; ExxonMobil failed the history requirement. All four returned valuations carried a “review required” status. These are conditional model outputs, not four verified sell signals. The failure is retained in the scorecard rather than silently replaced with an easier company.

There is no observable ground-truth intrinsic value today. Agreement with the current stock price is not a valid accuracy score for an independent DCF. Validation therefore separates source-data correctness, calculation consistency, operating forecast error, and future investment performance.

## 1. Live scorecard

Prices are the timestamped last-trade inputs captured in this run, not guaranteed executable or real-time quotes. Gap = model / observed price − 1; it is **not** forecast error. Historical error columns measure operating forecasts, not stock-price predictions.

| Company | Base DCF / share | Captured last trade | Model / price gap | One-year revenue MAPE | One-year EBIT MAPE |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows}

Each of the four usable companies has five one-year observations. ExxonMobil has none. The revenue/EBIT averages below pool only those four companies; fifth-company failure is reported separately.

## 2. Historical test design

- Train at the first 10-K filing date for fiscal years ending in calendar 2020–2024; reveal the subsequent one-year fiscal result, or three-year result where available through 2025.
- Reconstruct each historical input using only SEC facts with filing dates at or before that origin. The maximum input filing date is recorded and checked against the forecast issue date.
- Preserve the deployed forecasting rules: three-year historical CAGR capped between −10% and +20%, six-year historical median target margin and capex/D&A ratios, current broad NWC ratio, and a fixed 25% tax prior. No parameters were chosen to fit these outcomes.
- Compare against two elementary revenue baselines: hold the last annual revenue flat, and repeat the last observed annual growth rate. Compare EBIT against the last observed EBIT held flat.
- Measure MAPE = mean(abs(predicted / actual − 1)). EBIT percentages can be large when actual profit is small; the NVIDIA mean includes such a year. Preserve individual errors rather than hiding them.
- The test is fiscal-year aligned. The first annual filing occurs roughly one to two months into the target fiscal year, so this is not a pristine 12-month-ahead forecast issued before the target year begins. No later filings are used.
- This is an operating forecast test, not a historical DCF or return backtest. Historical prices, peers, rates, country risk, dividends and delistings were not reconstructed for valuation/return testing.

There are **${r.summary.allOneYear.count} one-year** and **${r.summary.allThreeYear.count} three-year** observations. Origins overlap and the companies are surviving mega-caps chosen today. These data are diagnostic, not a representative or independent statistical sample. The current SEC archive is queried with original filing-date filters; a fully immutable vintage archive is still needed for stronger point-in-time assurance.

### Results

| Company | One-year observations | Model revenue MAPE | Flat-revenue MAPE | Repeat-last-growth MAPE | Three-year model revenue MAPE |
| --- | ---: | ---: | ---: | ---: | ---: |
${bt}

Pooled one-year revenue MAPE: **${percent(r.summary.allOneYear.revenueMAPE)}**, versus **${percent(r.summary.allOneYear.flatRevenueMAPE)}** for flat revenue and **${percent(r.summary.allOneYear.lastGrowthRevenueMAPE)}** for repeating last growth. The gain over the latter baseline is only about 0.8 percentage points in this small selected sample. Apple underperforms flat revenue; Costco underperforms repeating last growth.

Pooled one-year EBIT MAPE: **${percent(r.summary.allOneYear.ebitMAPE)}**, versus **${percent(r.summary.allOneYear.flatEbitMAPE)}** for flat EBIT. NVIDIA's EBIT error is **76.8%**, slightly worse than its flat-EBIT baseline (75.3%).

Three-year revenue MAPE: **${percent(r.summary.allThreeYear.revenueMAPE)}**; three-year EBIT MAPE: **${percent(r.summary.allThreeYear.ebitMAPE)}**. NVIDIA three-year revenue error is 51.1%, versus 27.7% for repeating the last observed growth rate. Apple three-year revenue error is 29.0%, versus 13.4% for flat revenue. Complexity is not consistently buying accuracy.

The existing ±3-percentage-point growth bear/bull endpoints contain just **${r.summary.allOneYear.bearBullRevenueCovered}/${r.summary.allOneYear.count}** one-year revenue outcomes and **${r.summary.allThreeYear.bearBullRevenueCovered}/${r.summary.allThreeYear.count}** three-year outcomes. Those scenarios were never specified as probability intervals; the low coverage demonstrates why they must not be described as calibrated confidence ranges.

Historical FCFF comparisons are included only as an experimental appendix in the JSON. They use a fixed-tax, broad-NWC proxy with incomplete tag coverage (17 one-year and 11 three-year comparisons). They are **not** an audited free-cash-flow accuracy claim. A statement-level reconciliation is needed first.

## 3. Source and calculation sanity checks

An independently recomputed discounted-cash-flow sum and equity bridge match the code's four current-structure outputs to floating-point precision. The existing 18 automated tests also pass. This supports arithmetic consistency; it does not validate accounting normalization, economic assumptions, credit ratings or future stock performance.

Spot checks against separately published company statements:

| Company | Check | Finding |
| --- | --- | --- |
| Apple | Current/prior nine-month revenue, capex and D&A; cash, debt and shares | Selected current/prior YTD source amounts agree with [Apple's statement](${sourceLinks.AAPL}). TTM still depends on the separately sourced FY component. The automated equity bridge omits $84.118B of non-current marketable securities unless manually adjusted. |
| Microsoft | FY revenue, EBIT and cash capex | $331.839B revenue, $155.237B EBIT and $115.948B capex agree with [the FY26 earnings statements](${sourceLinks.MSFT}). The D&A adapter chooses depreciation alone ($34.3B) even though a separate $4.7B intangible-amortization fact exists; neither this nor “D&A and other” should be used without reconciliation. |
| NVIDIA | Current/prior six-month revenue | $177.837B / $90.805B agree with [the quarterly release](${sourceLinks.NVDA}). The TTM result also uses the prior full fiscal-year component. Missing current investments/short borrowing tags remain flagged. |
| Costco | FY total revenue and EBIT | $303.154B total revenue and $11.685B EBIT agree with [the earnings statement](${sourceLinks.COST}). Total revenue correctly includes membership fees; it is not the $297.247B merchandise-sales line. |
| ExxonMobil | Entity/history continuity | The SEC ticker catalog resolves to ExxonMobil Holdings, CIK 2115436. Its facts feed has only 2025/2026 interim revenue periods and no sufficient annual history. [The public earnings release](${sourceLinks.XOM}) confirms current operations exist; the importer needs verified predecessor/successor history resolution, not an assertion that the business lacks history. |

These are targeted spot checks, not an audit of every ledger input. Raw API snapshots and component provenance are saved alongside this report. Current quote checks rely on the captured unofficial Yahoo feed, not an independently certified exchange close.

## 4. Material model findings

### Apple: historical averages and the equity bridge

Initial growth is 1.8%, drawn from full-year history, while the TTM base is more recent. This mismatch is a modeling choice that should be tested against a forward operating thesis. Adding all omitted non-current securities as accessible non-operating assets would add about $5.76/share before tax/restriction adjustments; it does not close the large gap to market and should not be assumed automatically. Device/services mix, repurchases and share-count timing need separate schedules.

### Microsoft: the investment regime has changed

Default capex/revenue is 15.7%, versus 34.9% in the latest FY. Holding the higher recent ratio through the explicit forecast, with all other inputs fixed, lowers modeled value from $338.18 to $230.34. This is a diagnostic sensitivity, **not** a claim that the new ratio should persist for ten years or that $230.34 is a corrected fair value. An AI infrastructure capex, asset-life, depreciation and utilization schedule is needed. It is possible to underestimate growth and simultaneously overestimate cash conversion.

Microsoft's seven h factors all have missing excerpts and neutral placeholder scores of 2. The UI's qualitative evidence is not sufficient for an independently supported optimal financing decision.

### NVIDIA: one growth rule cannot handle this regime

The deployed +20% cap truncates an approximately 100.5% three-year revenue CAGR. Target operating margin is 45.7%, versus a 65.2% TTM margin. The historical holdout confirms substantial revenue and EBIT misses; this is not just a stock-price disagreement.

Simply removing the growth cap produces about $2,287/share in this model because it extends roughly 100% growth for five years before fading. That is an extrapolation stress test, not a credible replacement forecast. The right improvement is a supply/demand, product-mix and market-size model with multiple growth stages and downside constraints.

### Costco: better operating predictability does not validate the DCF price

One-year revenue/EBIT errors are relatively low (5.3% / 6.3%), but the current $434.59 DCF is far below the captured quote. That disagreement alone cannot establish either undervaluation/overvaluation truth. Membership renewals and fee changes, warehouse openings, comparable sales, merchandise economics and financing advantages need explicit drivers. Peer beta and long-run ROIC also require business-specific review.

### Terminal reinvestment is economically abrupt

The terminal formula pays for growth, but the explicit forecast does not converge smoothly to that economic state. NVIDIA's modeled net reinvestment jumps from $5.3B in year 10 to $86.4B in year 11, even as stable growth is reached. Apple's jumps from a $2.5B release to $27.4B of investment. A universal 12% terminal ROIC creates these discontinuities. Fade incremental ROIC, reinvestment, margins and growth together; do not repair this by choosing a terminal ROIC to match market price.

### Financing and uncertainty remain provisional

Candidate peers contain unverified missing debt tags; the active beta still uses their exploratory debt assumptions. The h screen is keyword-driven, and all seven Microsoft excerpts are missing. A synthetic rating from coverage is not a bond quote or an agency rating. A constrained WACC grid is not a validated optimal recapitalization policy. A present-price-dependent capital base also requires care in any historical valuation backtest.

## 5. Assumption sensitivity, not alternative truth

Each change below holds the other default inputs fixed. “Current margin + investment” uses current EBIT margin, capex/revenue and D&A/revenue together. No scenario is fitted to the current share price.

| Company | Default | Current margin | Current capex ratio | Current margin + investment ratios | ERP = 5% |
| --- | ---: | ---: | ---: | ---: | ---: |
${sensitivities}

## 6. Prioritized accuracy plan

### Priority 1 — repair accounting and entity continuity

Create a reviewed issuer/CIK/predecessor registry, semantic XBRL mappings and filing-note extraction. Separate depreciation from intangible amortization; distinguish current/noncurrent/total debt and cash from marketable securities. Reconcile the income statement, cash-flow statement and balance sheet, including leases, stock compensation, tax, minority interests and dilution. Keep unavailable inputs unavailable; do not use an absent tag as proof of zero. Add a fiscal stub and correct timing from the latest statement to the analysis date.

**Release gate:** every core input reconciles to its cited statement within displayed rounding; dates/units/signs are validated; unresolved critical inputs block an investment-ready output. New issuer reorganizations cannot silently break the history chain.

### Priority 2 — forecast business drivers and investment together

Introduce business archetypes, with reviewed segment assumptions: Apple devices/services; Microsoft cloud/productivity and AI capex; NVIDIA accelerator/networking demand, capacity and pricing; Costco memberships, warehouses and comparable sales; Exxon commodity prices, production, reserves and through-cycle margins. Anchor near-term forecasts to public guidance and credible operating evidence, document disagreements, then fade competitive advantages and growth at a justified pace.

Link growth to incremental invested capital and ROIC. Model asset vintages, capex, maintenance and depreciation together; make stable-state reinvestment converge smoothly. Use actual tax/NOL/interest-limitation schedules where material. Do not persist a median ratio through a structural change by default.

**Validation gate:** beat predeclared flat, last-growth and simple trend/ratio baselines on unseen companies and dates for revenue, operating margin and reconciled FCFF. Report errors by business archetype and horizon, not just a pooled number.

### Priority 3 — improve risk inputs and financing economics

Use reviewed business-risk peers (ideally segment-weighted), peer-specific taxes, cash/risky-debt beta adjustments and synchronized prices/share counts. Source comparable-maturity debt yields or validated spread curves; maintain dated risk-free and ERP inputs. Replace unsupported h keyword conclusions with evidence-backed judgments and quantitative downside/liquidity tests. Validate covenants, maturities and refinancing feasibility; cross-check the constrained WACC candidate with APV and expected distress/transaction costs.

**Validation gate:** avoid a precise OCS recommendation when peer leverage, tax shields or credit evidence is unverified; show a feasible financing range and robustness to downturns instead.

### Priority 4 — calibrate uncertainty and test investment usefulness separately

Store immutable analysis vintages and subsequent outcomes. Expand to hundreds of issuers across sectors and failed/delisted companies. Use expanding-window evaluation, company/sector holdouts and a final untouched evaluation period. Select rules on training/validation data, then test once on the final holdout. This five-company audit becomes diagnostic evidence, not the tuning target.

Score revenue MAPE, operating-margin errors in percentage points, signed bias, reconciled FCFF WAPE/MAE, data coverage and missing-input rates. Calibrate scenario/quantile ranges from held-out residuals or justified operating distributions, with growth/margin/reinvestment correlations; test interval coverage and width. A proposed 80% interval should achieve roughly 80% empirical coverage with sampling uncertainty, not merely look plausible.

Separately test the valuation signal against subsequent 1/3/5-year **total returns** relative to a market and sector benchmark, including dividends, splits, delistings, costs and the time the filing was actually available. Report excess-return dispersion and drawdowns; don't score every stock-price increase as success. Market-price agreement may be a descriptive metric, never the training target for an allegedly independent intrinsic-value model.

**Product framing now:** a transparent valuation scenario workspace with explicit uncertainty. Predictive or investment-edge claims require this broader validation.

## Reproduce and inspect

Run \`node scripts/sanity-check.mjs\` followed by \`node scripts/render-sanity-report.mjs\`. The audit uses a temporary local source cache to preserve the captured run. A new evaluation date should get a new report directory and fresh cache rather than overwriting this vintage.

- [Complete audit JSON](sanity-check.json): live inputs, assumptions, source provenance, component forecasts, metrics and exceptions.
- [Individual forecast outcomes](backtest.csv): the 32 scored company/horizon/origin records.
- [Apple snapshot](AAPL-snapshot.json), [Microsoft snapshot](MSFT-snapshot.json), [NVIDIA snapshot](NVDA-snapshot.json), [Costco snapshot](COST-snapshot.json).

The deployed forecasting/valuation code was held fixed for this audit. No production deployment or assumption calibration was performed as part of evaluating it.
`;
await writeFile(new URL('REPORT.md',root),text);
console.log(new URL('REPORT.md',root).pathname);
