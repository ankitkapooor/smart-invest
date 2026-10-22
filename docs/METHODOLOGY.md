# ValueLens valuation methodology

Version 0.7.0 · October 22, 2026

## Objective and scope

Estimate a reproducible, conditional range of operating enterprise values and common-equity values. Show the difference between the market's price, the model's current-structure value and a feasible recapitalization scenario. A valuation gap supports a research decision; it is not evidence by itself that a security is suitable for a particular investor.

The implemented adapter supports profitable, non-financial US-GAAP SEC filers with standardized XBRL tags. Financial institutions, insurers, funds and real-estate businesses require excess-return, dividend, embedded-value or FFO/NAV methods. Loss-making businesses require explicit recovery, financing and NOL schedules. International companies require accounting, currency, country-risk and listing/share-class adapters. Searching the catalog does not imply a company is automatically valuatable.

## 1. Establish an auditable base

Resolve company name → SEC ticker → CIK. Obtain submissions, company facts and the latest 10-K. Store raw source values separately from forecast assumptions. Preserve tag, unit, start/end, form, filing date and accession.

For annual flows, require 330–380-day durations and select the latest filed comparable record available by the analysis date. Do not mix a quarter's amount with an annual label or use a future filing in an as-of query. Normalize USD and shares to millions. The historical series contains up to ten complete fiscal years.

Where available, compute TTM flows as latest full fiscal year + current fiscal YTD − corresponding prior fiscal YTD. Balance-sheet instants must match the base period end. No annual balance silently fills a missing quarterly balance. Every TTM component remains in the provenance ledger.

Required revenue, EBIT, D&A, capex, working capital, cash, debt and shares must be numerical before valuation. Missing core inputs block valuation.

**Not presented versus not found (v0.5).** A balance that cannot be found stays null. A standard balance-sheet line (short- or long-term marketable securities, short-term borrowings, current debt maturities, or any debt at all) that appears nowhere in the filing supplying the balance sheet is not presented there and is recorded as zero. Its provenance names that filing (`NotPresented:` tag) and a review note lists every such field. In production, the primary filing's inline XBRL is then scanned for company-specific (non us-gaap) borrowing or securities concepts carrying a positive period-matched balance; any match withdraws the zero and blocks the bridge. Before v0.5 an absent line blocked the valuation: only 13 of 155 archived issuers had complete core inputs. With these rules, 125 do; the remainder are mostly financial institutions (out of scope) and issuers whose capex uses company-specific concepts.

**Further coverage rules (v0.5).** Issuers without an operating-income subtotal get EBIT = pre-tax income + interest expense − interest income, matched by period; it still contains other non-operating items and is labeled. Depreciation alone is total D&A only when the same filing presents no intangible-amortization line. Interim D&A that is disclosed only annually uses the latest annual D&A-to-revenue ratio on TTM revenue. Current maturities can be derived as aggregate term debt less noncurrent debt. Cash falls back to cash including discontinued operations, the combined cash-and-short-term-investments line (with short-term investments then zero) or, labeled, cash including restricted cash. A narrow fallback capex concept below 25% of D&A is rejected. Multi-class issuers without a period-end count use latest-quarter weighted basic shares, labeled. A cover-page share count must be dated within 100 days before to 150 days after the balance sheet: previously seven archived issuers (UPS, Comcast, Charter, Nike, Ford, Hershey, Regeneron) were priced on counts from 2009–2016. Aggregate term debt is used once; current maturities are not added again. An explicitly reported combined current-debt balance can substitute for its unreported split. Finance leases are added only when not already included in the selected debt tag. Noncurrent marketable securities are kept outside working capital and added separately to equity. Separately reported depreciation and intangible amortization are added when an aggregate D&A tag is absent. Assets-versus-liabilities/equity and, when complete, cash-flow-section identities are tested. A documented one-for-one Exxon predecessor/successor continuity link restores comparable history; unknown restructurings remain unsupported. LLM extraction of a missing value requires a literal SEC quotation, number/unit and period checks; it cannot overwrite a reported fact. Taxonomy and custom-disclosure gaps remain visible.

Sources: [SEC API definitions and CORS constraints](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [SEC developer access guidance](https://www.sec.gov/about/developer-resources).

## 2. Forecast operating economics

Use nominal USD cash flows and a matching nominal USD discount rate. Extract discrete fiscal quarters from standardized facts. Direct 60–125-day facts take precedence (a 53-week year's 17-week fourth quarter is 119 days; before v0.5 it was dropped, which broke Costco's quarterly chain three times); otherwise subtract a matching prior cumulative period from YTD or annual amounts. Do not invent an absent quarter. Preserve exact source records and filing dates. Require eight consecutive quarters ending at the current financial base.

Fit seasonal, damped-trend and recent-trend revenue candidates independently for each issuer. Rolling four-quarter aggregate errors determine selection; replacing seasonal requires at least four completed folds and at least 5% lower error. Select last-quarter versus four-/eight-quarter median margins using rolling margin errors and the same gate. A separately preregistered 2026 evaluation enables the challenger in production. Sparse quarterly coverage retains flat annual revenue. Forecasts do not receive prices or valuation targets.

Year one aggregates the next four fiscal quarters after the latest filed quarter; the reporting lag means these periods can include time already elapsed. Future fiscal dates are estimates.

**Years 2–5 (statistical case, v0.5)** use 25% of the issuer's own five-year revenue CAGR (clamped to −25%…+60%) plus 75% of a 5% long-run nominal anchor; years 6–10 fade to terminal g. Evidence: on the SEC archive (137 non-financial issuers, 977 five-year origins), this rule's mean absolute log error on five-year cumulative revenue is 30% with −5% bias. The previous fallback (first-year rate, typically 0% from the seasonal benchmark, fading to 2.5%) had 40% error and −29% bias: it predicted five-year revenue roughly a quarter too low on average. On origins from 2016 onward, held out from rule selection, the errors are 29% versus 44%. A time-varying cross-sectional anchor did not improve out-of-sample error. Researched company cases keep their own five-year paths.

The LLM extracts business drivers, observability, peers, financing judgments and explicit revenue guidance. Its forecast field must be null: no invented growth, margin, investment or terminal paths. A guidance anchor needs a continuous literal SEC quotation, matching issuer, recent publication, future fiscal-quarter label, unit and numerical range. Missing or failed guidance retains the statistical forecast. Statistical forecasts remain the default; guidance is an opt-in scenario. Accepted guidance is labeled and stored separately; its performance is unmeasured and statistical ranges are withheld for that quarter.

Inline-XBRL segment partitions must have supported revenue concepts and a single business dimension (a recognized operating-segment consolidation marker can qualify it). Avoid product-parent double counting; require leaves to reconcile to the reported parent before excluding it. Members must sum within 0.5% of consolidated annual revenue, with no conflicting duplicate facts. Custom/multidimensional partitions can remain unavailable. These historical partitions explain the business; segment-specific forecasting adapters are not implemented.

Capex, D&A and broad NWC use latest versus three-year median reported ratios chosen on historical ratio errors, with sufficient observations required to replace the latest ratio. On the SEC archive, the latest capex-to-revenue ratio predicted the next five years' capex intensity better than three- or five-year medians (mean absolute log error 26% vs 28–31%, bias −0.5%), including after capex spikes.

**Terminal ROIC default (v0.5).** ROIC on operating invested capital excluding goodwill and acquired intangibles (the return new investment earns) is shrunk toward the estimated cost of capital: terminal ROIC = cost of capital + 0.60 × (ROIC − cost of capital), bounded to [cost of capital − 3%, 40%]. Evidence: issuers kept a median 70% of excess ROIC over ~9% after eight years; ~50% ROIC businesses fell to ~35% and 100%+ to ~50%. The perpetuity uses a little more decay (60%) and a 40% cap. The prior default (terminal ROIC = cost of capital) contradicted this persistence and removed all value from future growth.

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

## 2b. Three readings of the price (v0.6)

The summary leads with what the price requires, then sets two independent views beside it. All three share the active case's margins, investment ratios, discount rate and stable state; only the five-year revenue path differs, and years 6–10 fade to terminal growth.

- **Market-implied.** The constant five-year revenue growth at which the active case, discounted at the model's WACC, equals the market price. Only crossings where value rises with growth count (deep declines can release working capital and create a spurious root); several crossings are reported as ambiguous, none as outside −30%…+80%.
- **Analyst consensus.** Revenue estimates for the current and next fiscal years from Yahoo Finance's unofficial analyst consensus (not a licensed feed; fetched with a five-second deadline and omitted on failure). Forecast years 1–2 are time-weighted blends of the fiscal years they overlap. Analysts publish two years, so years 3–5 converge linearly from the year-2 rate to the long-run anchor (the backtested medium-term rate in the statistical case, 5% otherwise). A consensus first year that does not contain the base date, or a fiscal-year revenue more than 60% from TTM revenue, is rejected. The consensus case has no historical accuracy test here; it describes perception, not evidence.
- **Fundamental.** The researched case or, without research, the statistical case whose rules were backtested.

**One-off charges (v0.7).** Impairment, restructuring and litigation charges are extracted per period (largest reported concept per group, so aggregates and components are not double counted). The issuer's five-year average charge rate is a recurring cost. When TTM charges exceed that average by more than 2% of revenue (a one-off year), the excess is added back to EBIT and the long-run margin rule uses normalized margins. SEC archive (898 origins): margin error two to five years ahead 5.54 vs 5.69 points overall, and 7.99 vs 10.57 in one-off years, with bias halved. Normalized earnings also set the long-run ROIC and the consensus margin baseline (analysts' EPS is typically before one-offs). Full-cycle (10-year median) margins for cyclical industries were tested and rejected (9.15 vs 8.51 points).

**Reinvestment.** Linking reinvestment to growth through the issuer's sales-to-capital ratio was tested and rejected: its error on next-five-year net capex was 2.17–2.23% of revenue against 1.92–2.13% for the latest capex ratio on the same cases. The summary instead shows each case's return on new investment over years 1–5 (incremental NOPAT ÷ cumulative reinvestment) so an internally inconsistent forecast is visible.

**Long-run margin (v0.6, statistical case).** Year 1 keeps the measured quarterly margin; years 2–10 use the midpoint of the TTM operating margin and the five-year median annual margin. On the SEC archive (898 origins), this rule's mean absolute error on margins two to five years ahead is 5.69pp, against 6.18pp for the latest annual margin; a single quarter is noisier still. Previously the near-term quarterly selection could carry one depressed quarter into perpetuity: Meta's latest quarter (20.1% margin, down from ~40%) moved its value from $391 to $126 between consecutive filings; it is now $391 and $349.

**Analyst margins in the consensus case.** Analysts' EPS estimates imply margins: EBIT growth ≈ (1 + EPS growth) × (1 + share-count change) − 1, using the issuer's three-year diluted share trend (clamped −6%…+4% a year). Each consensus fiscal year's margin moves from the TTM margin by (1 + EBIT growth) / (1 + revenue growth), bounded to 0.6–1.6× the TTM margin; forecast years blend fiscal years by revenue-weighted overlap; the year-2 margin is then held, as analysts' figures imply. Without EPS estimates the consensus case keeps measured margins.

**Capex surges (v0.6, statistical case).** When the latest capex intensity is at least 2× its five-year median (a build-out), it fades linearly to that median by year 5, keeping 80% of the surge in year 1 (80%, 60%, 40%, 20%, 0%). SEC archive: surges of 3× or more kept ~80% of the excess after one year and ~30% after three (small sample, n = 9); 2–3× surges kept more. Below 2×, the latest ratio predicted best and is kept. Holding a build-out's peak intensity for five years while revenue grows at the base rate is internally inconsistent: Oracle's 83% capex-to-revenue (13% five-year median) produced negative equity. Among 75 current large caps, only Oracle triggers the rule. When equity value is still below zero, the app says so and explains why instead of showing −100%.

**R&D as investment (v0.6, statistical case).** R&D is capitalized and amortized straight-line over an industry life: 10 years for pharmaceuticals, biotechnology and medical devices; 3 for software and IT services; 5 otherwise. The research asset is the unamortized R&D of the last `life` years (missing early years repeat the earliest disclosed amount). A year above 1.5× the five-year median R&D intensity, typically acquired in-process R&D expensed inside the line, is capped at that level; the forward ratio is the three-year median. Adjusted NOPAT = reported NOPAT + R&D − amortization; reinvestment includes the same net R&D, so explicit-year FCFF is unchanged. Invested capital includes the research asset, and terminal ROIC and the stable-state reinvestment rate use that basis. Effect on the archive's R&D-intensive issuers: measured ROIC becomes more credible (Apple 155% → 72%; AbbVie 563% → 31%), and values move modestly (typically +1% to +11%; Merck +27% because its real R&D intensity is ~28% of revenue). Researched cases keep their own stable-state ROIC and are not capitalized.

## 2c. Value ranges (v0.7)

Every valuation reports an 80% range from 1,000 seeded scenarios around the active case. Revenue errors are five-year cumulative log errors of the revenue rule; margin errors are long-run margin errors standardized by √(issuer margin s.d. × median issuer s.d.) and rescaled to the company, so stable businesses get tighter ranges. Both distributions are measured on the SEC archive by `scripts/calibrate-uncertainty.mjs`; fitted on origins to 2015, their 80% ranges contained 80.8% (revenue) and 78.7% (margin) of outcomes from 2016 on. Scaling revenue errors by company volatility under-covered (73.5%) and was rejected. Beta varies by the company's regression standard error (Blume-scaled), the ERP by about 0.6 points (its historical variation), terminal growth by ±0.5 points and long-run ROIC retention within 40–80% of excess; these are documented assumptions. Sources are treated as independent. The status chip reports whether the price is below, within or above the range, and a panel shows the range width attributable to each source alone.

## 3. Estimate equity risk from operating peers

Research selects three or four economically comparable public peers with cited rationales. The server reloads their financial/return data before use. Until research is ready, named industry/SIC screens are provisional candidates. The user can replace up to four tickers and exclude inappropriate candidates. Missing peer debt cannot be assumed zero.

Estimate regression beta from up to five years of complete, dividend/split-adjusted monthly returns against SPY, aligned by month. Require at least 36 aligned observations. Exclude the incomplete current month, and do not replace missing adjusted prices with raw prices. Show beta, sample count, R² and the slope standard error. The company's own regression is a cross-check.

Regression betas are Blume-adjusted toward 1 (0.67β + 0.33) before unlevering, because estimated betas regress toward the mean (Blume 1971). A peer median requires at least three usable peers; otherwise the company's own adjusted regression is used and the basis says so. Before v0.5 a single usable peer could set the operating beta (Amazon from Walmart alone; Comcast from AT&T alone, producing a 5.4% WACC). Amazon is screened with internet and cloud platforms; Comcast with cable and media.

```text
βe_peer = Cov(peer return, benchmark return) / Var(benchmark return)
βadj_peer = 0.67 × βe_peer + 0.33
βu_peer = βadj_peer / [1 + (1 − tax_peer) × gross D_peer / market E_peer]
βu_target = median(included peer βu), at least three peers
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

Require 0 ≤ g < WACC and g < ROIC; the interface also constrains g below the nominal risk-free assumption as a conservative nominal-economy guardrail. Terminal g is an editable 2.5% prior, capped at the risk-free rate less 0.5% (v0.5; previously any risk-free rate below 2.5%, as in 2020–2021, blocked every valuation). Terminal ROIC follows the persistence rule in section 2; neither is an observed fact.

**Timing (v0.5).** Cash flows are discounted mid-year, and year 1 starts after the latest filed period, so value is rolled forward to the quote date: each flow is discounted by (1 + WACC)^(t − 0.5 − lag), where lag = years from the financial base end to the quote (at most 0.75). The Gordon terminal value of mid-year flows is discounted from year 9.5 − lag. Previously every flow was discounted a full year from the filing date, understating value by roughly 5–11%.

**Market-implied discount rate (v0.5).** The summary shows the WACC at which the same cash flows reproduce the market price, beside the CAPM WACC actually used. It is a diagnostic only and never enters the forecast. Growth fades from year 2 to g in year 10. During years 6–10, economic net reinvestment fades to NOPAT × growth / terminal ROIC. Margins use the fitted estimate unless manually overridden. Capex is reconstructed as D&A + reinvestment − ΔNWC, and the adjustment from the near-term spending ratio is visible in cash flows. Year 10 ends exactly at g/ROIC, so year 11 FCFF scales by (1+g). A transition implying negative capex blocks valuation and needs an explicit asset-release model. Assess whether competitive forces justify stable ROIC above the cost of capital. If ROIC approaches WACC, extra growth contributes little economic value.

For g = 0, stable net reinvestment is zero, so FCFF equals sustainable NOPAT. This assumes replacement capex offsets D&A and steady operating working capital. It does not assume assets never wear out. The zero-growth case has its own matching explicit fade to zero growth and zero net reinvestment. WACC/g sensitivities also recompute their matching fade. Show undiscounted TV, PV(TV), and terminal share of operating value.

### Audit systematic gaps before interpreting a price signal

The summary compares selected first-year growth with growth between the latest
two reported four-quarter totals, when eight consecutive quarters align with
the financial base. A seasonal selection means 0% year-on-year growth. This is
the selected statistical benchmark, not evidence that the company has stopped
growing. The summary also exposes terminal ROIC versus WACC and the year-ten
capex adjustment created by the terminal-reinvestment convention. A cost-of-capital
ROIC prior can remove most of the terminal excess-return premium for durable
businesses. These are substantive economic assumptions, not validated stock prices.

A conditional reverse DCF solves initial revenue growth within −50% to +100%,
holding the displayed margins, WACC, tax, investment ratios, terminal ROIC,
terminal growth, equity bridge and existing ten-year fade fixed. It scans for
valid sign-changing brackets and reports unavailable/ambiguous results instead
of extrapolating a solution. Invalid cash-flow paths are excluded. The result
is one conditional combination that matches the quote; it is not a forecast of
what the market expects. Alternative growth durations, margins and returns can
fit the same price. Quote-derived solutions never modify forecast inputs or
selection. A separately labeled illustration substitutes observed trailing
growth for the first-year rate while retaining the fade; it has no independent
forecast evaluation and never becomes the default automatically.

Arithmetic diagnostics check the FCFF identity, independently reconstruct the
discounted operating value and reconcile the equity bridge and per-share
denominator. Analytic tests cover a level perpetuity, the ROIC=WACC terminal
identity and recovery of a known reverse-DCF solution. Passing those checks
does not validate growth, sustainable returns, capex or the investment decision.

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

The quarterly evaluation covers 135 issuers and 8,931 cases. Its protocol reserved 2026 target ends before the first quarterly run. For each historical origin, inputs are reconstructed as of its first revenue filing and actuals as of their first revenue filing; future filings are excluded. Overlapping cases, the previously used universe and current SEC archives limit independence. The release gate requires improved next-quarter and four-quarter aggregate revenue MAPE, no material margin-error regression, and at least 100 cases at each horizon. The gate passed. Interval coverage and paired issuer-cluster uncertainty are also reported. See [VALIDATION.md](VALIDATION.md).

These results exclude guidance overlays, FCFF, valuation prices and investment returns. Research creates an immutable input/forecast vintage and fingerprint. Prospective quarterly outcomes must match its exact period and hash. Historical LLM simulation is not used because a historical-date prompt cannot eliminate training-data leakage. Return scoring requires complete dated dividend/split/delisting-inclusive stock and benchmark data; those outcomes have not been collected.
