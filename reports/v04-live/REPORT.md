# ValueLens 0.4 release verification

Five live Terra runs produced source-checked company-specific paths. Each ten-year FCFF path reconciles to EBIT after tax + D&A − capex − change in working capital; growth reinvestment converges to g/ROIC and enterprise value reconciles to per-share equity. The quarterly statistical model and its reserved evaluation are unchanged.

| Company | Old engine | Company case | Year-one growth | Terminal ROIC | OCS |
|---|---:|---:|---:|---:|---|
| AAPL | $89.54 | $134.93 | 7.5% | 35.0% | Available, conditional |
| MSFT | $235.65 | $304.13 | 16.0% | 22.0% | Available, conditional |
| COST | $258.17 | $498.69 | 8.0% | 18.0% | Available, conditional |
| NVDA | $154.77 | $115.63 | 40.0% | 50.0% | Available, conditional |
| GOOGL | Withheld | $177.05 | 20.0% | 25.0% | Withheld: historical D&A missing |

The comparison holds source inputs and researched financing assumptions constant to isolate forecast-engine changes. These are conditional estimates, not realized stock-price predictions or evidence that the new model is more accurate. Some estimates remain well below the quote and NVIDIA’s estimate falls. We did not select assumptions to close market-price gaps.

Apple and Costco no longer inherit the zero-growth statistical benchmark as their default DCF. Microsoft and Alphabet explicitly normalize their AI investment cycle. Sustainable ROIC and terminal margins come from individual cited business judgments, rather than automatic cost-of-capital returns. Retail margin stress scales to the business margin instead of applying the same three-percentage-point shock used for high-margin businesses.

Alphabet has a researched forward D&A path but incomplete historical D&A. The missing reported balance remains null; EBITDA, debt/EBITDA and OCS are withheld. A conditional current-structure DCF can still be computed from the explicit forecast.

Raw vintages, inputs, observed web sources, verified filings, source rationales, token usage and immutable forecast hashes are saved in the five company JSON files. Seed packaging validates each report again and only ships reports, not quotes or DCF prices. Fresh financials/quotes/rates are fetched on every company load. Seeds expire after seven days or a changed period/model version; the normal cached research pipeline handles other companies.

Release checks: syntax, offline tests, Wrangler dry run, browser interaction and production commit/forecast checks. Historical quarterly errors (9.78% next quarter, 7.58% four-quarter aggregate) measure the frozen statistical benchmark, not this new analyst case. FCFF, terminal assumptions and investment returns require prospective realized outcomes; no long-horizon accuracy claim has been made.

Production verification on October 22, 2026: AAPL, MSFT, COST, NVDA and GOOGL returned their company cases, no valuation errors, and passing arithmetic reconciliation. Cached core responses took 141–675 ms in the recorded run; full core + peer checks took 447–1,059 ms. Exact deployed commit and model/secret configuration were verified. The final offline suite has 66 passing tests, including a bounded single retry for transient read-only gateway failures. See `production-check.json`.
