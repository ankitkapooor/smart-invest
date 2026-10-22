# Audit of systematic valuation discounts

October 21, 2026. Source application: `67ae41b`. The companion `audit.json`
contains quote times, financial periods, input-source URLs, diagnostic outputs
and coverage errors. These are current-snapshot diagnostics, not a stock-price
forecast test. Several production requests temporarily returned HTTP 503; the
audit completed using the same loader against the public sources directly.
Microsoft's hosted API was also confirmed to return HTTP 200 again.

## Findings

| Company | Market quote | Default DCF | Gap | Selected first-year revenue growth | Observed trailing revenue growth | DCF using observed growth in year one |
|---|---:|---:|---:|---:|---:|---:|
| AAPL | $343.99 | $87.79 | −74.5% | 0.0% | 14.2% | $150.69 |
| MSFT | $532.95 | $251.81 | −52.8% | 18.0% | 17.8% | $249.46 |
| COST | $998.31 | $217.69 | −78.2% | 0.0% | 10.1% | $329.60 |
| NVDA | $221.97 | $169.71 | −23.5% | 33.8% | 83.4% | $728.16 |

The final column is an unvalidated illustration. It changes only initial growth,
retaining the existing ten-year fade, margin, tax, discount rate, investment
ratios and terminal-ROIC assumptions. Repeating Nvidia's exceptionally high
observed growth illustrates the sensitivity, not a justified prediction.
ExxonMobil was the fifth requested issuer; missing EBIT, NWC and cash blocked
valuation, so it is recorded as a coverage failure rather than assigned a price.

### Arithmetic reconciles

For the four valued companies, independently recomputing discounted cash flows
plus terminal value exactly recovered the published enterprise values. FCFF,
the equity bridge and the diluted-share proxy also reconciled within numeric
tolerance. No uniform percentage scaling or denominator error was found in
these cases. This does not prove that the underlying financial inputs are complete.

### Economic assumptions explain the major differences

1. Apple and Costco selected the seasonal benchmark, which repeats the latest
   four reported quarters and therefore produces zero first-year growth. It
   won the historical selection rule. That result does not establish zero
   expected growth in today's business or validate a ten-year DCF path.
2. Terminal ROIC defaults to a cost-of-capital proxy: about 9.8%, 9.6%, 9.4%
   and 12.3% for the four companies. It approaches WACC, assuming very little
   perpetual excess return. Increasing growth also consumes reinvestment;
   growth does not generate a free terminal-value premium. Durable excess
   returns require an independently justified scenario assumption.
3. The terminal transition can dominate spending. Apple's modeled capex rises
   from $14.3bn in year one to $49.2bn in year ten; the latter includes $33.1bn
   added to the spending-ratio scenario by the terminal-reinvestment convention.
   Nvidia's year-ten capex includes a $124.9bn terminal-transition adjustment.
   These amounts are scenario constructions, not management capex guidance.
4. Microsoft's initial growth is already near its reported 17.8% trailing growth.
   Its cash capex/revenue ratio is 34.9%; year-one modeled capex is $136.8bn.
   Swapping growth alone does not resolve its gap. Long-term investment payoff,
   growth duration and sustainable margins require company-specific analysis.

The October reference uses a 5.29% Treasury and 4.20% implied ERP, confirmed on
[Damodaran's source page](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm).
The daily FRED feed was unavailable. That labeled fallback affects discount
rates, but is not a fabricated rate or sufficient explanation for all discounts.
The economic link between sustainable return, growth and reinvestment follows
[Damodaran's terminal-value framework](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/termvalueexreturns.htm).

## Changes shipped from this audit

- Summary assumption audit: selected growth versus observed trailing growth,
  benchmark labeling, terminal ROIC versus WACC and the modeled capex transition.
- Conditional reverse DCF: solve only initial growth with all other assumptions
  fixed. With the existing fade, initial growth around 37.9%, 37.9%, 40.4% and
  42.3% respectively matches these quotes. These are conditional algebraic
  solutions, not market forecasts; different margins, returns and durations can
  produce the same prices. Invalid/unbracketed/multiple solutions are withheld.
- An independently labeled recent-growth illustration and arithmetic checks in
  the UI and exports. Price-derived diagnostics cannot modify model selection
  or the active forecast. Existing numerical valuations were verified unchanged.
- Unreviewed results now call the safety level a scenario threshold and explain
  that a gap alone does not establish mispricing. The capex adjustment label now
  identifies a scenario construction rather than claiming researched guidance.
- Four additional tests cover independent perpetuity/terminal identities, known
  reverse-solve recovery, a growing company selected into a flat benchmark,
  unavailable solutions and invariance of forecasts to quote changes.

## What remains to improve valuation quality

Near-term statistical revenue/margin evaluation does not establish FCFF,
terminal-value, intrinsic-share-price or investment-return accuracy. A reliable
valuation requires reviewed multi-year business-driver scenarios, duration of
growth and competitive advantage, returns on incremental invested capital,
maintenance/growth capex and asset depreciation, working-capital components,
cash taxes and a complete equity bridge. Validate the operational assumptions
against future reported outcomes and preserve forecast vintages. Market-price
agreement alone is not validation and has not been used to tune the default.
