# ValueLens v0.2 validation

Historical operating forecasts only; LLM disabled; no historical share-price or total-return accuracy measured.

154 requested issuers; 113 with usable folds; 1226 forecasts. Calibration targets precede 2023; holdout targets are 2023–2025.

| Horizon | Split | n | Revenue MAPE v0.2 | v0.1 | Flat | Repeat growth | Margin MAE pp v0.2 | v0.1 | Interval coverage |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1y | calibration | 408 | 13.0% | 13.0% | 13.5% | 14.0% | 4.61 | 4.59 | 80.4% |
| 1y | holdout | 310 | 9.6% | 9.6% | 8.1% | 10.0% | 4.09 | 4.02 | 88.1% |
| 3y | calibration | 204 | 20.5% | 20.5% | 23.5% | 29.4% | 5.53 | 5.96 | 80.4% |
| 3y | holdout | 304 | 23.7% | 23.7% | 21.5% | 51.8% | 6.07 | 5.85 | 77.0% |

- Current SEC facts retain original filing dates but are not immutable historical archives.
- Forecasts align with fiscal years and are issued after year-end filing, partway into target fiscal year.
- Current-catalog selection plus three historical issuers is not a survivorship-free market universe.
- Calibration samples are pooled and correlated; 80% is a nominal interval target, not guaranteed future coverage.
- Financial firms lack enterprise EBIT comparability; their data failures remain in coverage. No specialized-model accuracy claimed.
- FCFF and stock-return backtests require reconciled actual FCFF and licensed point-in-time prices including delisting returns; not measured here.
- LLM company-specific forecasts require prospective evaluation after key configuration; these results test the deterministic fallback only.

Coverage failures and source-code hashes are in validation.json. No evidence here establishes superior investment returns.
