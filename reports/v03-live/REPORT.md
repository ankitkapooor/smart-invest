# ValueLens 0.3 live verification

Production: https://valuelens.ankitkapoor.me

Final deployment: 5ab4fd0b-b609-4e02-b986-8341a72a3652.

46 automated checks passed. Worker packaging and deployed API configuration passed. Hosted model remains gpt-5.6-terra, low reasoning. Secret-file route returns 404; no configured key found in public assets or saved reports.

| Company | Quarterly history | Revenue forecasts | Method | Reconciled segments | Complete DCF |
|---|---:|---:|---|---|---|
| AAPL | 64 | 4 | seasonal | reconciled | Computed; review flags remain |
| MSFT | 64 | 4 | recent-trend | reconciled | Blocked by accounting/risk inputs |
| NVDA | 64 | 4 | damped-trend | reconciled | Computed; review flags remain |
| COST | 61 | 4 | seasonal | reconciled | Blocked by accounting/risk inputs |
| XOM | 38 | 4 | seasonal | unavailable | Blocked by accounting/risk inputs |

Nvidia's hosted evidence-only report: validated; 5 dated sources; 7 h factors; 4 immutable quarterly predictions; no valuation calculation errors. The model's stitched guidance quotation was withheld because it did not occur literally in the SEC exhibit. An exact-quotation/encoded-HTML regression fixture verifies that valid guidance can pass without accepting stitched text. No guidance overlay changed the production default.

The local Apple report also passed evidence and valuation checks, but completed before quarterly-vintage persistence was added; the hosted Nvidia report verifies the final snapshot contract. Functional checks do not establish predictive accuracy.

The separate quarterly evaluation has 8931 cases across 135 issuers; its preregistered release gate passed. See ../2026-10-21-v03/REPORT.md. It excludes FCFF, share-price predictions, guidance overlays and investment returns. The SEC archive/universe/correlated-case limitations remain material.
