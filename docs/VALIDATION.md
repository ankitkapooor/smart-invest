# Forecast validation contracts

## Version 0.3 quarterly evaluation

See `reports/2026-10-21-v03/REPORT.md`, detailed `validation.json`, the public `public/validation/quarterly.json`, and the frozen selection rules in `scripts/forecast-protocol.json`. The first quarterly run reserved 2026 outcomes, which were absent from the older annual experiment. It is a new temporal target, not a new issuer universe. No candidate/threshold tuning was done after inspecting 2026 results. To change selection, register a new protocol and collect new future outcomes.

`npm run validate:quarterly` reads the cached SEC archive created by `npm run validate`. It filters each origin by first revenue filing date, reconstructs discrete quarterly flows as of that date, and scores target actuals available at their first revenue filing. Quarter 4 derives from annual minus nine months. A missing period breaks the consecutive history. Quarterly operating forecasts include loss-making origins, while FCFF valuation still refuses unsupported loss situations. This differs from v0.2's annual/profitable-origin test; the results are not a direct v0.2/v0.3 comparison.

Compare next-quarter revenue and the sum of the next four quarters against the same seasonal forecast. Margins compare against the latest available quarter margin. The preregistered gate requires both revenue errors to improve, margin MAE not to worsen by more than 0.1 percentage point and at least 100 cases each. It passed. Sector results retain regressions; issuer-cluster paired bootstrap intervals account for repeated cases within an issuer (not every cross-company/macroeconomic dependence). Marginal nominal 80% ranges are checked separately at horizons 1 and 4; four-quarter aggregate point error and fourth-quarter marginal coverage are different measures.

Company Forecast accuracy panels show in-history selection diagnostics and prequential historical-error ranges. These are not an independent holdout. At least 12 errors are required to publish a nominal 80% range. Published coverage is empirical, not guaranteed future coverage. Optional validated LLM guidance scenarios do not inherit these ranges and are excluded from the historical evaluation.

## Prospective quarterly scoring

Completed research vintages now include `forecastSnapshot.quarterly` and an optional separate `quarterlyGuidance`, with the forecast period start, four estimated fiscal ends, numerical predictions, selected model and guidance flag. To score matured operating outcomes:

```sh
node scripts/score-quarterly-vintages.mjs exports.json quarterly-outcomes.json scored.json
```

Each outcome needs `symbol`, exact `forecastHash`, `horizonQuarters` (1–4), `periodStart`, `periodEnd`, `actualsFiledAt`, `actualsSource`, `revenue` and optional `ebit`. Amounts cover the aggregate period from vintage periodStart through the selected quarter end, in USD millions. Period start must match exactly and end within eight days to accommodate estimated fiscal calendars. Outcomes filed after the scoring date or before period end are rejected. Set optional `variant` to `guidance` to score the separately frozen guidance scenario; default `statistical` scores the production default. Guidance use remains attached to each score. Unmatured forecasts are unscored, not failures. Quarterly scoring does not measure FCFF or returns.

## Archived version 0.2 annual evaluation

The expanded report is `reports/2026-10-21-v02/REPORT.md`; detailed per-fold outcomes and coverage are in `validation.json`. `public/validation/latest.json` contains the public metrics and all requested issuers, including coverage failures.

The operating test requests 154 current/historical issuers. It excludes specialized financial/real-estate models using SEC SIC and excludes loss-making origins because the app refuses their going-concern FCFF. These exclusions are recorded before observing the target. Calibration targets precede 2023; held-out targets are 2023–2025. Inputs use filing dates at or before the original annual filing. Target actuals are read as of their first annual filing. Fiscal stubs are not annualized.

The holdout is temporal, not a randomized independent experiment. Cases overlap and are correlated. SEC company facts are today's archive with original filing metadata, not a proven immutable historical snapshot. The current-catalog sample plus three historical issuers does not remove survivorship bias. Forecasts start after annual filings, partway into a fiscal year, so these are fiscal-aligned one-/three-year tests rather than exact lead-time tests.

Revenue MAPE and operating-margin error are compared with frozen v0.1, flat revenue and repeated latest growth. The revenue model in the fallback remains the old growth prior, so identical revenue errors are expected. Calibration-only absolute log errors set a nominal 80% split-conformal interval. Coverage is measured on the holdout; no exchangeability or future-coverage guarantee is asserted. These pooled operating intervals are not DCF price confidence intervals and are not transferred to LLM forecasts.

CFO minus capex is not actual FCFF. No proxy FCFF accuracy or share-price agreement is called predictive accuracy. The present test has no licensed point-in-time market/credit/ERP archive or complete delisting-return history, so investment alpha and total-return accuracy are unmeasured.

## Earlier annual/return vintage format (v0.2)

Completed research stores an immutable initial vintage, including issued time, filing snapshot, source references, model/research versions, original assumptions, original forecast (or blocking errors) and a SHA-256 input fingerprint. JSON exports retain it even if a user later edits assumptions. Do not use today's LLM to manufacture a historical forecast: training-data leakage cannot be prevented by merely asking it to pretend a historical date.

When outcomes mature, run:

```sh
node scripts/score-vintages.mjs exports.json outcomes.json scored.json
```

`exports.json` is an array of unmodified exported app analyses. `outcomes.json` contains independently sourced actuals, matched to the exact forecast hash:

```json
[{
  "symbol": "EXAMPLE",
  "forecastHash": "sha256-from-research.forecastSnapshot.inputHash",
  "horizonYears": 1,
  "periodStart": "2026-10-22",
  "periodEnd": "2027-10-21",
  "actualsFiledAt": "2027-12-01",
  "actualsSource": "https://www.sec.gov/Archives/...",
  "revenue": 1000,
  "ebit": 200,
  "reconciledFcff": 120,
  "fcffReconciliationSource": "https://issuer.example/reconciliation",
  "returns": {
    "start": "2026-10-22",
    "end": "2027-10-22",
    "stock": 0.12,
    "benchmark": 0.10,
    "includesDividendsSplitsAndDelistings": true,
    "source": "licensed provider vintage/reference",
    "benchmarkSource": "licensed benchmark vintage/reference"
  }
}]
```

Amounts are USD millions; returns are decimal total returns. The example is a format illustration, not real observations. The scorer refuses missing hashes, unmatched periods and unconfirmed total-return coverage. Unmatured/missing outcomes remain explicitly unscored. For a portfolio-performance claim, pre-register the stock universe, contemporaneous signal, holding/rebalancing rules, transaction costs and treatment of bankruptcies/delistings before collecting outcomes.


## v0.5 accuracy evidence (October 22, 2026)

**Extraction coverage.** On the 155-issuer SEC archive, complete core inputs (revenue, EBIT, D&A, capex, NWC, cash, debt, shares) rose from 13 to 125 issuers after the not-presented-means-zero rule, derived EBIT, D&A/cash/debt fallbacks the 53-week-quarter fix and a recency requirement on cover-page share counts (seven issuers had been priced on 2009–2016 counts). Most remaining gaps are financial institutions (out of scope) and company-specific capex concepts. Point-in-time, the prior model valued 6–8 of 133 archived issuers at historical origins; v0.5 values 91–101.

**Medium-term revenue.** Five-year cumulative revenue, 977 issuer-origins: the v0.5 rule (25% own five-year CAGR + 75% × 5%) has 30.4% mean absolute log error and −5.1% bias; the prior fallback had 39.9% and −29.1%. Origins from 2016 onward, held out from selection: 29.3% vs 44.2%.

**ROIC and capex.** Excess ROIC (excluding goodwill and intangibles) over ~9% retained a median 70% after eight years. The latest capex/revenue ratio predicted next-five-year capex intensity best (26% error, −0.5% bias).

**Return predictiveness (not established).** `npm run backtest:returns` values each archived non-financial issuer at five year-end origins (2020–2024) using only filings available then, the month's split-consistent price, a 60-month Blume-adjusted beta and that date's published Treasury rate and implied ERP, then ranks forward excess returns over SPY. Rank ICs were 0.098, −0.081, −0.097, 0.026 and 0.034 (mean −0.004; 477 valuations). The over/undervalued signal therefore has no demonstrated predictive power. With about 100 issuers per origin the standard error of a rank IC is near 0.1; 12-month momentum also read as noise in the same sample, so a small edge can be neither confirmed nor excluded. Results are in `public/validation/returns.json` and the Validation tab.

**Rejected: price-calibrated ERP.** `scripts/calibrate-market.mjs` solves the ERP that values the median company at its price under ValueLens cash flows. On 39 current large caps it returned 1.2% (halves 0.6% and 2.0%), with ±47% out-of-sample dispersion for every terminal-growth candidate. That premium is neither economically credible nor stable, and fitting it would make verdicts echo prices. The published implied ERP is retained; the summary instead shows the discount rate the price implies.

**Known limitations after v0.5.** Shrinking growth toward a 5% anchor is unbiased on average but lifts structurally declining businesses (Comcast's statistical case is +254% above its price). Relevering at very high debt weights produces double-digit WACCs and can value equity at zero (Charter). Issuers whose capex uses only company-specific concepts (several energy and utility companies) and multi-class issuers without any current share count (Hershey) remain blocked rather than estimated.
