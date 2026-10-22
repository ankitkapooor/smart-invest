# ValueLens valuation methodology

Version 0.2.0 · October 21, 2026

## Objective and scope

Estimate a reproducible, conditional range of operating enterprise values and common-equity values. Show the difference between the market's price, the model's current-structure value and a feasible recapitalization scenario. A valuation gap supports a research decision; it is not evidence by itself that a security is suitable for a particular investor.

The implemented adapter supports profitable, non-financial US-GAAP SEC filers with standardized XBRL tags. Financial institutions, insurers, funds and real-estate businesses require excess-return, dividend, embedded-value or FFO/NAV methods. Loss-making businesses require explicit recovery, financing and NOL schedules. International companies require accounting, currency, country-risk and listing/share-class adapters. Searching the catalog does not imply a company is automatically valuatable.

## 1. Establish an auditable base

Resolve company name → SEC ticker → CIK. Obtain submissions, company facts and the latest 10-K. Store raw source values separately from forecast assumptions. Preserve tag, unit, start/end, form, filing date and accession.

For annual flows, require 330–380-day durations and select the latest filed comparable record available by the analysis date. Do not mix a quarter's amount with an annual label or use a future filing in an as-of query. Normalize USD and shares to millions. The historical series contains up to ten complete fiscal years.

Where available, compute TTM flows as latest full fiscal year + current fiscal YTD − corresponding prior fiscal YTD. Balance-sheet instants must match the base period end. No annual balance silently fills a missing quarterly balance. Every TTM component remains in the provenance ledger.

Required revenue, EBIT, D&A, capex, working capital, cash, debt and shares must be numerical before valuation. Absent debt or investment disclosures remain null. Missing core inputs block valuation. Aggregate term debt is used once; current maturities are not added again. An explicitly reported combined current-debt balance can substitute for its unreported split. Finance leases are added only when not already included in the selected debt tag. Noncurrent marketable securities are kept outside working capital and added separately to equity. Separately reported depreciation and intangible amortization are added when an aggregate D&A tag is absent. Assets-versus-liabilities/equity and, when complete, cash-flow-section identities are tested. A documented one-for-one Exxon predecessor/successor continuity link restores comparable history; unknown restructurings remain unsupported. LLM extraction of a missing value requires a literal SEC quotation, number/unit and period checks; it cannot overwrite a reported fact. Taxonomy and custom-disclosure gaps remain visible.

Sources: [SEC API definitions and CORS constraints](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer access guidance](https://www.sec.gov/about/developer-resources).

## 2. Forecast operating economics

Use nominal USD cash flows and a matching nominal USD discount rate. Forecast ten years from the analysis date using the latest reported TTM run rate. This explicitly assumes the reported run rate can anchor today's forward forecast; it does not invent unreported quarterly actuals. A production enhancement should construct a fiscal-year stub using interim actuals and event adjustments.

The activated research workflow uses an LLM with web search and strict structured output. It identifies company-specific revenue segments, starting weights, volume and price/mix drivers, and five annual growth paths. Segment revenue compounds volume and price growth separately and then consolidates. It researches five annual EBIT margins, capex/revenue, D&A/revenue and NWC/revenue, with dated citations and explicit uncertainty. The LLM does not receive the traded price or calculate valuation. Source identity/date, observed citation URLs, numeric bounds, segment sums and evidence references are validated. Citation checks establish traceability, not truth or forecast accuracy. Until a key is configured and research passes checks, the old bounded growth prior remains an explicitly provisional fallback; current margins, capex and D&A replace historical medians as fallback anchors.

```text
Revenue[t] = Revenue[t−1] × (1 + growth[t])
EBIT[t] = Revenue[t] × operating margin[t]
Unlevered cash taxes[t] = max(EBIT[t], 0) × marginal tax assumption
NOPAT[t] = EBIT[t] − unlevered cash taxes[t]
FCFF[t] = NOPAT[t] + D&A[t] − capex[t] − Δoperating NWC[t]
```

Operating NWC is a broad proxy: current assets less cash/short-term securities, less current liabilities, plus current financial borrowings. This includes some tax and accrual items that need reclassification. Avoid using changes in net fixed assets as a substitute for capex less depreciation without acquisitions, disposals, FX and impairment reconciliation.

Stock-based compensation remains an operating expense. Do not add it back and also ignore dilution. Keep operating leases in operating expenses and out of debt unless the forecast and EBIT are consistently lease-adjusted. Review finance leases separately. Capitalized R&D, acquisitions, intangibles and maintenance capex require a researched normalization schedule for a production-quality company thesis.

The 25% marginal tax rate is an editable prior. A full product should forecast cash taxes with jurisdiction mix, NOL use, limitations on interest deductions and deferred-tax effects; no immediate tax refunds on losses are assumed here.

## 3. Estimate equity risk from operating peers

Research selects three or four economically comparable public peers with cited rationales. The server reloads their financial/return data before use. Until research is ready, named industry/SIC screens are provisional candidates. The user can replace up to four tickers and exclude inappropriate candidates. Missing peer debt cannot be assumed zero.

Estimate regression beta from up to five years of complete, dividend/split-adjusted monthly returns against SPY, aligned by month. Require at least 36 aligned observations. Exclude the incomplete current month, and do not replace missing adjusted prices with raw prices. Show beta, sample count, R² and the slope standard error. The company's own regression is a cross-check.

```text
βe_peer = Cov(peer return, benchmark return) / Var(benchmark return)
βu_peer = βe_peer / [1 + (1 − tax_peer) × gross D_peer / market E_peer]
βu_target = median(included peer βu)
βe_target(d) = βu_target × [1 + (1 − tax_target) × d / (1 − d)]
```

This simplified Hamada treatment assumes negligible debt beta. It currently uses a common editable marginal-tax prior for peers and debt principal as a market-value proxy. It does not cash-adjust the operating beta; material non-operating cash and risky debt require an extended debt-beta/cash decomposition. Different peer business mixes and unverified missing debt tags keep the result provisional. Selecting no usable peer leaves the active peer beta unavailable rather than quietly averaging excluded peers.

Source: [Damodaran corporate-finance materials](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/ACF4E/appldCF4E.htm).

## 4. Use a dated risk-free rate and implied ERP

Prefer the latest available ten-year US Treasury constant-maturity yield, with date, as a practical duration proxy for long-lived USD cash flows. Ideally use a term structure for explicit cash flows and a duration-consistent long-run rate. A corporate ten-year bond's yield is not the risk-free rate; it includes a credit spread.

Use the implied US equity risk premium from a documented forward-looking market cash-flow model, rather than a timeless 5% constant. Keep 5% as a sensitivity and show the implied expected market return. On October 1, 2026, the source's adjusted-payout ERP is 4.20% with a 5.29% Treasury reference. That is a dated observation, not an assertion that either number will remain current.

The app attempts a daily FRED DGS10 download. When unavailable, it explicitly labels the Treasury reference paired with the monthly ERP. It attempts to parse current monthly ERP; if parsing fails, the dated reference remains visible. Old risk inputs cause a review-required state. No stale reference is relabeled as live data.

```text
Cost of equity = Rf + relevered equity beta × ERP
```

For global operations, use geographic operating exposure to construct incremental country risk, avoiding double counting sovereign/default risk in Rf and ERP. That adjustment is not automated in this edition.

Sources: [DGS10](https://fred.stlouisfed.org/series/DGS10), [Damodaran monthly implied ERP](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm), [implied ERP datasets](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/implpr.html).

## 5. Separate borrowing cost, capacity and optimum

Use a traded bond's market yield of comparable currency, maturity, seniority and liquidity when available. Do not use coupon/face value or historical interest/book debt as the marginal rate. The LLM can supply a cited recent USD senior-unsecured market yield with seven-to-thirteen-year maturity and an observation within thirty days; numerical/date checks are required, and quote completeness still needs review. The observed yield sets current borrowing cost and can raise the synthetic spread curve for hypothetical leverage. If unavailable, use the visible synthetic fallback. There is no licensed bond-price feed.

The January 2026 large non-financial-company coverage table supplies rating/spread bands. It must be versioned and refreshed. Smaller-company use is flagged. Ratings are synthetic modeling categories, not claims about an issuer's actual credit rating.

For each debt weight d from 0% to 80% in one-percentage-point steps:

```text
Reference capital = current market equity + current gross debt
Candidate debt = d × reference capital
Kd = Rf + default spread
Candidate interest = candidate debt × Kd
Normal coverage = current operating EBIT / candidate interest
```

Enumerate every band. Recompute coverage using that band's rate and retain the bands whose own coverage maps back to the same rating. If multiple self-consistent bands exist, choose the higher-spread band. If no band is self-consistent, exclude that candidate from the optimum; show a conservative borrowing-cost bound for inspection. This avoids unstable iterations around rating cliffs.

Debt-free coverage is not encoded as zero. No target weight with 100% debt is evaluated; equity beta's D/E would be undefined.

Source: [January 2026 coverage bands and default spreads](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ratings.html).

## 6. Retain the complete h analysis as a stress policy

Assess demand drop, competitive attack, loss of suppliers, loss of specialized employees, asset fire sales, loss of dealers and loss of capital-market access. Each factor receives a company-specific LLM explanation, source references and a score from 1 to 3. Evidence/date checks are required. The user can edit the score and must acknowledge review. Pending research uses a visibly marked neutral placeholder. Keyword matches no longer assign live scores. These judgments are not calibrated default probabilities.

The average is h, a minimum stressed EBIT/interest ratio. It is not a maximum coverage ratio. A higher h means a lower permitted interest burden.

```text
Stressed EBIT = current revenue × (1 − revenue shock) × max(stress margin, 0)
Maximum annual interest = stressed EBIT / h
Rating-specific gross debt capacity = maximum interest / (Rf + spread)
```

Default stress revenue declines by 10%, and stress margin is the lowest observed annual operating margin. Both are editable policy choices. Require a separate minimum normal coverage of 2.5×. A candidate must meet both normal and stressed constraints, a researched debt/EBITDA ceiling and a self-consistent rating. When provided, the model checks the disclosed two-year maturity wall against liquid resources above the reserve and two years of modeled first-year FCFF. This simplified liquidity test assumes no asset sales or new refinancing and is not a detailed maturity ladder. Missing liquidity/maturity data keeps the result provisional.

Seven subjective vulnerability scores cannot by themselves establish an economically optimal debt ratio. They provide a financing-capacity constraint. A production workflow should pair h with revenue/earnings volatility, covenant headroom, liquidity, maturity walls, downturn simulations and empirical sector credit evidence.

## 7. Calculate WACC consistently

```text
WACC(d) = (1 − d) × Ke(d) + d × Kd(d) × (1 − usable shield rate)
```

Use gross debt and market equity weights. Do not put net debt over operating enterprise value in the denominator while adding an ordinary interest tax shield. Cash is treated in the equity bridge.

The usable shield rate is capped by positive EBIT relative to interest. This is a simple tax-capacity guard, not a replacement for a tax-law schedule. Select the feasible grid point with the lowest modeled WACC. Display the debt-weight difference from current structure and all 81 candidates. Call it a **constrained modeled OCS**, not an unconditional optimum.

This method holds operating cash flows fixed while financing changes, caps debt in dollar terms using current reference capital, and does not re-solve firm value and debt simultaneously. It cannot capture distress-induced lost sales, strategic flexibility, dynamic leverage or issuance feasibility. A higher-quality economic optimum should be cross-checked with APV:

```text
APV = unlevered operating value + PV(usable tax shields)
      − PV(expected distress costs) − financing / execution costs
```

## 8. Make both terminal cases economically complete

```text
NOPAT[11] = NOPAT[10] × (1 + g)
Stable reinvestment rate = g / terminal ROIC
FCFF[11] = NOPAT[11] × (1 − g / terminal ROIC)
TV[10] = FCFF[11] / (WACC − g)
```

Require 0 ≤ g < WACC and g < ROIC; the interface also constrains g below the nominal risk-free assumption as a conservative nominal-economy guardrail. The LLM researches stable growth, operating margin and incremental ROIC. Without research, g is 2.5% and terminal ROIC is a bounded cost-of-capital proxy; neither is an observed fact. During years 6–10 a smoothstep fade takes growth to g, margins to terminal margin, and economic net reinvestment to NOPAT × growth / terminal ROIC. Capex is reconstructed as D&A + reinvestment − ΔNWC, and the adjustment from the near-term spending ratio is visible in cash flows. Year 10 ends exactly at g/ROIC, so year 11 FCFF scales by (1+g). A transition implying negative capex blocks valuation and needs an explicit asset-release model. Assess whether competitive forces justify stable ROIC above the cost of capital. If ROIC approaches WACC, extra growth contributes little economic value.

For g = 0, stable net reinvestment is zero, so FCFF equals sustainable NOPAT. This assumes replacement capex offsets D&A and steady operating working capital. It does not assume assets never wear out. The zero-growth case has its own matching explicit fade to zero growth and zero net reinvestment. WACC/g sensitivities also recompute their matching fade. Show undiscounted TV, PV(TV), and terminal share of operating value.

## 9. Bridge enterprise value to common equity and recap value

```text
EV = Σ FCFF[t] / (1 + WACC)^t + TV[10] / (1 + WACC)^10
Common equity = EV + excess liquid assets − gross debt − other claims
Modeled value per share = common equity / valuation shares
```

Review operating cash reserves, restricted cash, non-current investments, preferred equity, minority interests, unfunded pensions, options/RSUs, convertibles and multiple share classes. The bridge adds identified noncurrent marketable securities once and lets the user enter reserves and net claims. Identified preferred/minority/pension claims initialize the adjustment. A disclosed dilution proxy adds annual weighted diluted-minus-basic shares to period-end common shares; this does not independently value options, RSUs or convertibles. Unknown balances and schedules stay flagged. Do not confuse weighted-average diluted EPS shares with a date-specific dilution schedule.

For the OCS scenario, subtract transaction costs equal to 1% (editable) of the absolute debt adjustment. Attribute value to **existing** holders: subtract the current debt, not just the new debt, because existing holders also receive net borrowing/recap proceeds. Do not count borrowing itself as operating enterprise-value creation.

The app separately illustrates a complete immediate recap executed at the observed market price:

```text
Net cash for buybacks = new debt − old debt − transaction costs
Post-recap shares = old shares − net cash for buybacks / execution price
Post-recap equity = pre-cost operating EV + excess cash − new debt − other claims
Post-recap value per share = post-recap equity / post-recap shares
```

Negative net buyback cash means new equity must be issued at the assumed execution price. Costs are paid through the funding/repurchase proceeds, not deducted twice from post-recap equity. Results with nonpositive post-recap shares or equity are unavailable. This is a conditional share-count illustration, not a prediction of a future trading price. Repurchasing above intrinsic value can reduce the value of remaining shares even while a recap reduces modeled WACC.

## 10. Support an investment research judgment

Show bear/base/bull operating cases, WACC/g sensitivity, the current-structure and recap values under both terminal cases, and the last traded price with its timestamp. The default 25% margin-of-safety threshold is configurable:

```text
Research price threshold = modeled current-structure value × (1 − safety margin)
Upside to modeled value = modeled value / observed price − 1
```

Do not equate this upside percentage with expected stock returns or a calibrated probability. Block a clean comparison when required data are absent, critical assumptions remain unverified, the quote is old, the financial base is stale, or a manual quote has been entered without independent verification. Display “review required.”

Then assess the thesis: quality of earnings, competitive durability, capital allocation, downside financing, catalysts, governance, concentration, horizon and liquidity needs. A decision process also needs a reason the market is mispricing the business and a plan for what evidence would invalidate the thesis. This product currently helps with valuation research; it does not implement individualized portfolio suitability.

## Verification

Automated checks cover known-beta regression recovery, rating-boundary behavior, debt/rating/coverage fixed points, forecast cash-flow identities, g/ROIC reinvestment, zero-growth maintenance economics, both financing bridges, h feasibility, missing-data blocks, tax/claim adjustments, stale quotes, reporting-period selection, TTM alignment, adjusted-return handling and API validation.

Live imports are checked separately against a saved public-company snapshot. These checks validate implementation and data paths; they do not establish that a mechanical growth/margin forecast is an accurate prediction of a company's future.

## 11. Measure performance separately

The expanded test requests 154 current/historical issuers, retains coverage failures, excludes unsupported business models and loss-making origins, splits calibration from 2023–2025 holdout targets, and compares operating forecast errors with frozen v0.1, flat revenue and repeated growth. Calibration-only log-error scores form nominal 80% revenue intervals. The fallback does not consistently beat flat revenue. These are not LLM, FCFF or stock-return accuracy results. Full methodology and data limitations are in [VALIDATION.md](VALIDATION.md).

Completed LLM reports store the original input snapshot, model version, assumptions, cash-flow/valuation outputs or errors, issued time and SHA-256 input fingerprint. Prospective outcomes must match that fingerprint. Historical LLM simulation is not used because training-data leakage cannot be removed by a prompt. Return scoring requires dated, dividend/split/delisting-inclusive stock and benchmark data; these outcomes have not been collected.
