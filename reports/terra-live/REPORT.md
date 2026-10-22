# GPT-5.6 Terra live verification

The hosted app uses gpt-5.6-terra with low reasoning effort. The local .dev.vars model override and deployment defaults agree. The existing key was configured as an encrypted production Worker secret after explicit user approval; no key appears in this report or browser assets.

33 automated tests pass. Real hosted tests completed on 2026-10-22:

| Company | Status | Dated sources | Business segments | Researched peers | h factors | Research / valuation errors |
|---|---|---:|---:|---:|---:|---|
| AAPL | validated | 4 | 5 | 3 | 7 | 0 / 0 |
| NVDA | validated | 4 | 4 | 4 | 7 | 0 / 0 |

Verified: Responses/background mode, structured output, web search, source/filing checks, peer reloading, deterministic FCFF/valuation, immutable vintage, model-separated cache and cached report reuse. Individual JSON reports contain input fingerprints, source evidence and actual API token usage.

The first live attempts exposed identity/constraint ambiguity and missing web-source metadata on background retrieval. The contract now constrains identity, dates, numerical ranges and vector lengths. Retrieval explicitly requests source metadata. Directory citations require the exact document in the official SEC index and a matching issuer accession/date. Existing responses can be revalidated without another paid generation. Microsoft document paths now use its issuer CIK rather than the filing agent's accession prefix. Resolved validation errors are cleared from successful cached reports.

A live test proves these example workflows function. It does not establish predictive accuracy, investment suitability, complete peer comparability, or universal accounting coverage. All unresolved financial-data, maturity, dilution and forecasting-validation warnings remain attached to results.
