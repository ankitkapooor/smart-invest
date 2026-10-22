# Microsoft and Costco loading regression

Reproduced October 21, 2026 against production commit `71ad408`.
Both `/api/company` requests returned HTTP 200, but the browser's deterministic
valuation rejected missing debt and operating working capital. Microsoft also
lost the company-beta fallback because unlevering requires debt. An explicit
`COSTCO` API symbol returned 404, although the search UI resolved the company.

The SEC Company Facts feed omitted Microsoft's dimensional current/noncurrent
finance-lease split and neither issuer supplied a standard current-period
short-term-borrowing tag. Missing tags alone cannot establish zero.

## Resolution

The loader now consults the exact base-period primary filing before withholding
those inputs. Inline facts require issuer, period, currency, supported dimensions,
valid numbers and agreement among duplicate facts. Finance-lease components must
sum to the consolidated lease liability. Narrative absence requires a consolidated
year-end statement for that fiscal year. A reconciled Total debt row can support
a residual inference; this is explicitly labeled for review in Sources, caveats
and exported provenance. The original cached Company Facts object is not mutated.
Unsupported or conflicting disclosures still remain missing.

| Company | Filing end | Recovered finance leases, current / noncurrent ($m) | Debt including finance leases ($m) | Operating NWC ($m) | Local live-source model errors |
|---|---|---:|---:|---:|---|
| MSFT | 2026-06-30 | 4,290 / 62,304 | 106,888 | -24,441 | None |
| COST | 2026-08-30 | 94 / 1,319 (already in structured data) | 7,575 | -16,329 | None |

For Microsoft, the filing's Total debt row of $40,294m reconciles to current
term debt of $9,227m plus noncurrent term debt of $31,067m. A zero short-term
borrowing residual is a reporting-materiality inference, not an explicit absence
quotation. Costco explicitly states that no short-term borrowings were outstanding
at the end of 2026. Lease obligations are included once; operating leases retain
the existing operating-expense convention. Neither credit capacity, undiscounted
lease payments nor commercial-paper investments are substituted for debt.

- [Microsoft 10-K, filed July 29, 2026](https://www.sec.gov/Archives/edgar/data/789019/000119312526323660/msft-20260630.htm), balance sheet, Note 10 and Note 13.
- [Costco 10-K, filed October 7, 2026](https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm), Notes 4 and 5.

`COSTCO` and `MICROSOFT` also resolve to their listed tickers. Live-source loader
checks for MSFT, COSTCO and AAPL produced no model errors before release. Apple
required no supplement. Six added regression tests cover both actual companies,
future/wrong-period evidence, scope, currency, conflicting facts, incomplete lease
reconciliation, absence wording and precedence of reported nonzero borrowings.

The fix restores calculation; it does not establish forecast or investment
accuracy. Noncurrent investments, peer debt, business-driver research and other
unresolved inputs retain their existing quality warnings. Historical model
evaluation continues to use its original Company Facts inputs; the supplemental
filing reader is used only by the live loader.
