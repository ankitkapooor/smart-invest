# ValueLens

Transparent valuation research for [ankitkapoor.me](https://ankitkapoor.me). [Open ValueLens](https://valuelens.ankitkapoor.me).

Version 0.3 separates reported facts, fitted operating forecasts, cited research and conditional valuation. It measures quarterly revenue/margins rather than claiming that a gap from today's stock price proves accuracy.

## Run

```sh
npm install
npm run dev
```

Node 22+. The existing OpenAI key stays in the ignored `.dev.vars` locally and the encrypted `OPENAI_API_KEY` Cloudflare Worker secret in production. Never put credentials in `public/` or commit them. Research uses `gpt-5.6-terra`, low reasoning, at most six web calls and 12,000 output tokens, with ten new reports per UTC day. Cached reports do not incur another generation. Limits bound calls, not a guaranteed dollar amount.

## Version 0.3

- **Quarterly accounting:** up to 64 discrete fiscal quarters, with Q2/Q3 YTD and Q4 annual amounts differenced and source provenance retained. Filing-date filters apply before subtraction. Reporting gaps prevent calendar misalignment.
- **Fitted forecasts:** seasonal, damped-trend and recent-trend candidates. Issuer-specific rolling comparisons select revenue and margin models. A challenger requires four completed folds and at least 5% lower selection error. The production challenger is enabled only after the preregistered aggregate evaluation gate passes. Insufficient quarterly data uses annual flat revenue.
- **Evidence-only LLM:** numerical growth/margin/investment paths are forbidden. Research extracts disclosed/estimated/undisclosed business drivers, peers, financing evidence and explicit management guidance. Guidance is an opt-in scenario and can anchor a quarter only after literal SEC quote, issuer, period, unit and bound checks. Its performance is separately unmeasured; it does not inherit fitted prediction intervals.
- **Reported segments:** supported inline-XBRL business/product revenue partitions must reconcile to consolidated revenue. No guessed weights. Reclassifications, custom concepts and unsupported dimensions remain visible gaps. Segment-specific operating adapters are not yet implemented; production forecasts select on consolidated issuer history.
- **Forecast audit:** four quarterly predictions, model comparisons, historical-error ranges, source quarters, reported segments, ratio choices and remaining limitations appear in Forecast accuracy. Years 2–10 are explicitly long-run valuation scenarios.
- **Measured uncertainty:** nominal 80% marginal revenue ranges use prequential errors, with at least 12 observations. The reserved evaluation measures coverage. These are not DCF/share-price confidence intervals.
- **Vintages:** research stores compressed immutable inputs, numerical forecasts, verified guidance, original assumptions, model version and fingerprint. New quarterly outcomes can be scored against exact vintages.

## Verification and results

```sh
npm run check
npm test
npm run validate:quarterly
npm run deploy:check
npm run test:live -- AAPL
```

The live test may create one paid research report and saves public evidence under `reports/v03-live/`.

The [v0.3 evaluation](reports/2026-10-21-v03/REPORT.md) covers 135 issuers and 8,931 operating forecast cases. On reserved 2026 outcomes, next-quarter revenue MAPE is **9.78% vs 11.72%** for seasonal; next-four-quarter aggregate MAPE is **7.58% vs 9.35%**. Margin MAE improves too. The selection protocol predates the first quarterly evaluation; see `scripts/forecast-protocol.json`. Individual companies/sectors can perform worse. The universe overlaps the older annual test, cases are correlated, and current SEC archives are not independently proven historical vintages. LLM guidance overlays, FCFF and stock-return performance are not measured by this test.

`npm run validate:quarterly` uses the previously collected SEC archive at `/private/tmp/valuelens-validation-v02`. Run `npm run validate` to populate that cache if absent. The archived v0.2 annual test now imports frozen v0.2 model/forecast modules; the original five-company audit imports frozen v0.1. Do not present these different horizons/cohorts as a direct old/new model comparison. Full metrics, coverage, sector results, paired issuer-cluster uncertainty and hashes are in the v0.3 JSON report.

## Scope and remaining work

Automatic FCFF valuation covers profitable nonfinancial US-GAAP SEC filers with sufficient reconciled accounting and USD quotes. Operating forecasts can exist while missing debt, cash or working capital blocks valuation. Banks, insurers, REITs, IFRS, foreign currencies, ADR reconciliation and non-SEC issuers still need specialized adapters.

FCFF uses reported investment ratios and a disclosed transition to terminal reinvestment g/ROIC. Maintenance/growth capex, asset-cohort depreciation, acquisition/R&D capitalization, component working capital, full cash-tax/NOL schedules and option/convertible claims remain unfinished. The diluted-share proxy is not a complete option valuation. Beta, book-debt proxies, synthetic ratings and h stress policy remain conditional modeling choices. Yahoo's market feed is unofficial. Investment-performance claims require complete point-in-time total returns and a predeclared portfolio rule; no such claim is made here.

See [methodology](docs/METHODOLOGY.md), [validation and prospective scoring](docs/VALIDATION.md), and [deployment](docs/DEPLOYMENT.md). The original class workbook is unchanged. Watchlists stay in browser storage. Research storage contains public-company evidence and forecasts.
