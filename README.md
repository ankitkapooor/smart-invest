# ValueLens

Transparent valuation research for [ankitkapoor.me](https://ankitkapoor.me). [Open ValueLens](https://valuelens.ankitkapoor.me).

Version 0.3 separates reported facts, fitted operating forecasts, cited research and conditional valuation. It measures quarterly revenue/margins rather than claiming that a gap from today's stock price proves accuracy.

## Run

```sh
npm install
npm run dev
```

Node 22+. The existing OpenAI key stays in the ignored `.dev.vars` locally and the encrypted `OPENAI_API_KEY` Cloudflare Worker secret in production. Never put credentials in `public/` or commit them. Research uses `gpt-5.6-terra`, low reasoning, at most six web calls and 12,000 output tokens, with ten new reports per UTC day. Cached reports do not incur another generation. Limits bound calls, not a guaranteed dollar amount.

## Deployments

Production is the existing Cloudflare Worker `valuelens`. Its Git integration must connect `ankitkapooor/smart-invest`, production branch `main`, with build command `npm run build:ci` and deploy command `npm run deploy && npm run deploy:verify`. Once connected, pushing to `main` runs the checks and updates the website automatically. See [deployment setup](docs/DEPLOYMENT.md).

The public `/build.json` endpoint identifies the exact deployed commit. Build and post-deploy verification never invoke paid LLM research. `.node-version` pins CI to Node 22; the OpenAI secret stays on the Worker.

## Version 0.4

Company-specific, source-checked analyst estimates now drive the DCF: five explicit annual growth, EBIT margin, cash capex, D&A and working-capital assumptions, then a five-year fade toward researched terminal growth, margin and ROIC. Terra researches public filings without receiving a quote or valuation target. The existing quarterly statistical forecast remains a separately evaluated benchmark; its short-run error rates do not validate the new DCF.

Company loading automatically applies a current issued case or starts/resumes cached background research. The app withholds the default DCF until that forecast is ready instead of displaying the old flat-growth fallback. Every research request and body transfer has a deadline; changing companies cancels stale UI updates. Manual operating overrides explicitly clear the researched path.

Five live research vintages are recorded under `reports/v04-live`. `node scripts/refresh-issued-forecasts.mjs` validates and packages their reports for fast first loads. They expire after seven days or a change in financial period/model/research version. Fresh statements, prices and rates are still fetched; no saved DCF price is used. Other issuers use the same research pipeline, subject to the existing daily quota. Specialized businesses still require their appropriate accounting model. Missing historical D&A no longer prevents a researched forward-D&A DCF, but EBITDA and OCS are withheld rather than treating the missing balance as zero.

Source checks and arithmetic checks establish functionality and internal consistency. Prospective forecast accuracy and investment-return accuracy remain unmeasured. See [live release validation](reports/v04-live/REPORT.md).

## Version 0.7

- **Value ranges:** 1,000 scenarios from measured forecast errors give an 80% range (held-out calibration 80.8% revenue, 78.7% margin) and the share of scenarios that justify the price; a panel shows which source drives the width. Market prices sat inside the model's 80% range for 74–84% of companies historically.
- **One-off charges** above the five-year average are added back (margin error 7.99 vs 10.57 points in one-off years).
- **Tested and rejected:** cyclical mid-cycle margins and sales-to-capital reinvestment did not beat existing rules; return on new investment is shown as a diagnostic.

## Version 0.6

- **Three readings of every price:** the five-year revenue growth today's price requires; an analyst-consensus case (two fiscal years of revenue estimates, then convergence to the long-run rate; unofficial Yahoo source); and the fundamental case.
- **R&D as investment:** capitalized over industry lives with spike capping; explicit cash flows unchanged, returns measured on all invested capital.
- **Analyst margins:** the consensus case carries the margins analysts' EPS estimates imply (net of the issuer's buyback or dilution trend).
- **Long-run margin rule:** years 2–10 use the midpoint of TTM and five-year median margins (backtested), so one weak quarter no longer persists forever.
- **Capex surges** (≥2× the five-year median, e.g. Oracle's AI build-out) fade to normal by year 5, per the archive's surge history; negative equity is explained rather than shown as −100%.
- **Search** folds punctuation, matches by words ("Adobe Systems" → ADBE) and explains well-known private companies (e.g. OpenAI).
- **Return backtest re-run:** mean rank IC −0.017; still no demonstrated return edge.

## Version 0.5

- **Data coverage:** standard balance-sheet lines absent from the balance-sheet filing are labeled zeros (checked against company-specific tags in the primary filing); EBIT derived from pre-tax income where no operating-income subtotal exists; D&A, cash, debt and share fallbacks; 53-week fourth quarters retained. Complete inputs on the 155-issuer archive: 13 → 125. Cover-page share counts must be current (seven issuers had been priced on 2009–2016 counts).
- **Backtested defaults:** years 2–5 revenue growth shrinks the five-year CAGR toward 5% (five-year error 30% vs 40%, bias −5% vs −29%); terminal ROIC retains 60% of excess operating ROIC (observed 70% after eight years); Blume-adjusted betas; peer medians need three peers.
- **Timing:** mid-year discounting valued at the quote date; terminal growth capped below the risk-free rate.
- **Honest verdicts:** the summary shows the discount rate the price implies. A five-origin point-in-time backtest found no demonstrated return edge (mean rank IC −0.004); see [validation](docs/VALIDATION.md).

## Version 0.3 (archived statistical benchmark)

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
