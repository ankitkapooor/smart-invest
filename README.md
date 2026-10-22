# ValueLens

A transparent valuation research app for [ankitkapoor.me](https://ankitkapoor.me). [Open ValueLens](https://valuelens.ankitkapoor.me).

Version 0.2 separates reported accounting, researched assumptions, deterministic valuation and measured forecast performance.

## Run and configure research

```sh
npm install
npm run dev
```

Node 22+ is required. Put `OPENAI_API_KEY=your-key` in the ignored `.dev.vars` file and restart the dev server. Do not add it to `public/` or commit it. `.env.example` documents configuration. The research model defaults to `gpt-5.6-terra` and can be changed with `OPENAI_MODEL`.

For the hosted app, use Cloudflare Dashboard → Workers & Pages → **valuelens** → Settings → Variables and Secrets → add an encrypted secret named **OPENAI_API_KEY**. Alternatively:

```sh
npx wrangler secret put OPENAI_API_KEY
```

The key is used only by the server. The configured model is GPT-5.6 Terra with low reasoning effort, at most six web tool calls and 12,000 output tokens per report. Research caches include the model identifier. Unit tests cover the contract and calculations; `npm run test:live -- AAPL` explicitly runs one potentially billable hosted smoke test and saves its report under `reports/terra-live/`. A cached validated report is reused without a new generation.

## What changed

- Accounting: period-aligned TTM, additive depreciation/intangible amortization when an aggregate is absent, debt aggregation without current-maturity double counting, separately added finance leases, noncurrent marketable securities, dilution proxy, statement identity checks and documented predecessor continuity. Missing debt is null and blocks valuation.
- Company research: a background OpenAI Responses request researches each supported company’s actual volume/price drivers, five-year operating/investment path, competitive fade, peers, bond yields, liquidity, maturities, stress policy and all seven h judgments. There are no five-company forecast templates. The key is required to activate this step.
- Evidence: strict structured output, date/identity/bounds checks, observed citation URLs, and literal SEC quotation/value verification for missing accounting disclosures. A citation does not establish that a forecast is correct.
- Valuation: current capex/margins anchor the fallback, growth/margin/net reinvestment fade together to g/ROIC, and both g=0 and g>0 have matching transitions. Forecast math, beta, WACC, rating fixed points and equity bridges remain deterministic.
- Financing: researched peer data are reloaded, recent comparable-duration observed debt yields can replace current synthetic borrowing cost, and coverage, debt/EBITDA and liquidity constrain the debt sweep. h remains an uncalibrated policy heuristic.
- Validation: 154 requested issuers, dated historical folds, held-out years, flat/repeat-growth benchmarks, calibrated revenue intervals and visible unsupported cases. Immutable prospective LLM vintages include model version and an input hash.

## Verify

```sh
npm run check
npm test
npm run deploy:check
npm run validate
```

Read [the latest validation report](reports/2026-10-21-v02/REPORT.md). Its operating forecasts are the **fallback**, not live LLM forecasts. It does not establish improved prediction or investment returns. The one-year holdout revenue MAPE is 9.6%, versus 8.1% for flat revenue. Nominal 80% interval coverage is 88.1% at one year and 77.0% at three years.

`scripts/sanity-check.mjs` imports frozen v0.1 modules so the original five-company audit stays reproducible. `scripts/validate.mjs` writes the expanded v0.2 report and public metrics. Run `npm run snapshot -- AAPL` to refresh the labeled example.

## Coverage and remaining work

Automatic FCFF valuation covers profitable nonfinancial US-GAAP SEC filers with sufficient reconciled inputs and USD quotes. SEC-listed foreign issuers, banks, insurers and REITs can receive company research and model-routing explanations; specialized valuation, IFRS/local-GAAP, ADR/currency reconciliation and non-SEC global filing adapters remain unimplemented. This is not yet universal public-company coverage.

Unreported balances, custom tags, material option/convertible schedules and other claims may still block a valuation. Weighted diluted-minus-basic shares are only a dilution proxy. Book debt is not market debt; full tax/NOL schedules, distressed debt beta and probability-weighted APV/distress losses remain outside this edition. LLM evidence validation is not a guarantee of factual completeness or economic reasonableness.

Public-source data may be delayed. Yahoo’s chart feed is unofficial; use a licensed point-in-time feed, including delisting returns, before asserting stock-return performance or broad redistribution rights. No live LLM accuracy claim is made before prospective results mature. See [methodology](docs/METHODOLOGY.md), [key setup and deployment](docs/DEPLOYMENT.md), and [validation contracts](docs/VALIDATION.md).

## Implementation

| File | Responsibility |
|---|---|
| `src/accounting.js` | Normalization, source records, identities and continuity registry |
| `src/data.js` | SEC, market sources and peer ingestion |
| `src/research.js` | LLM contract, evidence validation, quota and immutable vintages |
| `public/forecast.js` | Business-driver aggregation and stable-state fade |
| `public/model.js` | FCFF, CAPM, debt, WACC, capital sweep and equity valuation |
| `src/worker.js` | Same-origin API and server configuration |
| `public/app.js` | Research, valuation, sources and validation workspace |

The original class workbook is unchanged. User watchlists stay in browser storage. Research storage contains public-company evidence and forecasts. The global durable quota defaults to ten new reports per UTC day; cached jobs do not spend another call. Limits bound calls, not a guaranteed dollar budget; configure an OpenAI project spending limit as well.
