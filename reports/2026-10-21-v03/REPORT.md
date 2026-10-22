# ValueLens v0.3 quarterly evaluation

Discrete quarterly revenue and operating margin; no FCFF, share-price or investment-return accuracy claim

135 issuers; 8931 cases. Release gate: **passed**. Issuer-specific challenger enabled.

| Split | Quarters aggregated | Cases | Revenue MAPE | Seasonal MAPE | Margin MAE pp | Latest margin MAE pp |
|---|---:|---:|---:|---:|---:|---:|
| development | 1 | 4394 | 12.77% | 14.29% | 5.75 | 6.43 |
| development | 4 | 3957 | 11.01% | 11.79% | 5.52 | 6.19 |
| evaluation-2026 | 1 | 292 | 9.78% | 11.72% | 6.06 | 7.38 |
| evaluation-2026 | 4 | 288 | 7.58% | 9.35% | 4.19 | 5.22 |

- Evaluation universe was used in an older annual test. Only 2026 targets are new; this is not a fresh-universe experiment.
- Current companyfacts preserve filing dates but are not immutable historical data vintages.
- Overlapping forecast windows and repeated companies create correlated cases.
- No changes to candidates or selection thresholds after looking at 2026 outcomes without a new protocol and new future evaluation.

Protocol, source hashes, issuer coverage, sector breakdown and every prediction are in validation.json. No historical LLM guesses, FCFF errors or stock-return claims enter these results. Nominal 80% marginal revenue ranges are evaluated separately for horizons 1 and 4; see observedPointCoverage and intervalN in the JSON. Paired issuer-cluster bootstrap intervals for improvement are included, without assuming individual cases are independent.
