# Forecast validation contracts

The expanded report is `reports/2026-10-21-v02/REPORT.md`; detailed per-fold outcomes and coverage are in `validation.json`. `public/validation/latest.json` contains the public metrics and all requested issuers, including coverage failures.

The operating test requests 154 current/historical issuers. It excludes specialized financial/real-estate models using SEC SIC and excludes loss-making origins because the app refuses their going-concern FCFF. These exclusions are recorded before observing the target. Calibration targets precede 2023; held-out targets are 2023–2025. Inputs use filing dates at or before the original annual filing. Target actuals are read as of their first annual filing. Fiscal stubs are not annualized.

The holdout is temporal, not a randomized independent experiment. Cases overlap and are correlated. SEC company facts are today's archive with original filing metadata, not a proven immutable historical snapshot. The current-catalog sample plus three historical issuers does not remove survivorship bias. Forecasts start after annual filings, partway into a fiscal year, so these are fiscal-aligned one-/three-year tests rather than exact lead-time tests.

Revenue MAPE and operating-margin error are compared with frozen v0.1, flat revenue and repeated latest growth. The revenue model in the fallback remains the old growth prior, so identical revenue errors are expected. Calibration-only absolute log errors set a nominal 80% split-conformal interval. Coverage is measured on the holdout; no exchangeability or future-coverage guarantee is asserted. These pooled operating intervals are not DCF price confidence intervals and are not transferred to LLM forecasts.

CFO minus capex is not actual FCFF. No proxy FCFF accuracy or share-price agreement is called predictive accuracy. The present test has no licensed point-in-time market/credit/ERP archive or complete delisting-return history, so investment alpha and total-return accuracy are unmeasured.

## Prospective LLM vintages

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
