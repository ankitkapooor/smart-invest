# Class template → product methodology

Read-only review of `Finance_Final_Template_v4.xlsx`, supplied by the user. Its workbook instructions were treated as model documentation, not as instructions authorizing other actions. The original file was not modified or published.

The workbook has five sheets: usage guidance, Assumptions, Solution, Formulas and Engine. Its Solution sheet proceeds from operating cash flows to enterprise value, seven distress factors, coverage-derived borrowing capacity, synthetic credit, comparable-company beta, WACC and two terminal-growth cases. That sequence is a good foundation for an inspectable research interface.

| Template area | Observed treatment | Product change / reason |
| --- | --- | --- |
| Solution B64:J77 | Seven factors, scored 1–3; mean used as h | Retain the framework, but mark draft scores as qualitative judgments with evidence and editable review. Do not represent h as a statistically estimated default probability. |
| Solution C80:C87 | Stressed margin × revenue; divide stressed EBIT by h for max interest | Retain the capacity calculation and explicitly identify h as the **minimum stressed coverage requirement**, producing a **maximum interest burden**. |
| Solution B89:M103 | Closest exhibit coverage or comparative leverage selects the rating | Use coverage bands with defined boundaries and solve rating → spread → interest → coverage consistently. Candidate ratings that do not agree with their own coverage are excluded. |
| Solution C109:C113 | Borrowing capacity is called optimal net debt | Separate capacity from optimality. Sweep gross debt / market capital and select the minimum modeled WACC among coverage-feasible points. |
| Solution B115:O124 | Unlever beta with net debt and no tax; fallback average of all comps | Use tax-adjusted gross-debt unlevering, a visible included-peer median and explicit missing-data behavior. Cash and risky debt still need further adjustments where material. |
| Solution C127:C137 | Net-debt / EV weights and an after-tax borrowing rate | Use gross financial debt and market equity weights, consistent with the capital-structure model. Liquid assets are handled in the equity bridge. |
| Assumptions E136 | Fixed 5% market risk premium | Fetch a dated implied US ERP, retain 5% as a visible comparison, and show input staleness. |
| Solution C148:C149 | Growing FCFF perpetuity and NOPAT/WACC zero-growth perpetuity | Require terminal reinvestment = NOPAT × g / ROIC. Make the maintenance assumptions behind the zero-growth case explicit. |
| Solution C159:D170 | Enterprise value, net-debt bridge and per-share comparison | Expose gross debt, liquid assets, other claims, reported shares, dilution limitations, uncertainty, safety threshold and recap proceeds/costs. |
| Multiple formulas | Missing data often becomes 0 through N/IFERROR | Preserve missing required data as unavailable. Disclose any absent-tag zero assumption and keep the analysis provisional. |

The workbook has no company-specific facts populated for this project. Its example case notes are teaching examples, not inputs to the live company analysis. The product's Apple example comes from an independently fetched, timestamped public-data import.
