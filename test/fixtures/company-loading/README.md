# Company-loading regression inputs

These reduced public SEC Company Facts fixtures retain standard accounting concepts,
periods from July 2023 onward and filing dates through October 21, 2026. Duplicate
comparative observations are reduced to the latest filed observation for each
concept/unit/start/end/form. They are for current-input regression tests, not
historical forecast evaluation or point-in-time archives.

- Microsoft, CIK 789019: https://data.sec.gov/api/xbrl/companyfacts/CIK0000789019.json
- Costco, CIK 909832: https://data.sec.gov/api/xbrl/companyfacts/CIK0000909832.json

The matching primary filing URLs and reduced inline-XBRL excerpts are in
`test/filing-facts.test.js`. The tests assert the actual recovered balances and
reject wrong periods, scope, units, conflicting facts and unsupported zero claims.
