# 25 job scenarios

Each row is one estimator job. Pack microtests remain in tools/visibility-audit.test.js.

Arithmetic pass and full-scenario pass are separate. A blocked incomplete zero is not a usable priced quote.

Arithmetic pass: 25. Coverage pass: 25. Role pass: 25. Full scenario pass: 25. Fail: 0.

Usable priced quotes: 16. Blocked or incomplete zero totals: 6. Finalized zeros: 0.

Live browser employee login, customer token, and live deposit acceptance: UNTESTED.

| ID | Job | Locale | Footprint | Sell expected | Sell actual | Finalized | Full pack charge | Covered | Zero class | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | chicago-floor-100-solid | Chicago, IL | 100 sq ft solid | 800 | 800 | true | 1 | true | nonzero | pass |
| S02 | phoenix-floor-100-solid | Phoenix, AZ | 100 sq ft solid | 800 | 800 | true | 1 | true | nonzero | pass |
| S03 | chicago-floor-250-flake | Chicago, IL | 250 sq ft flake | 2500 | 2500 | true | 1 | true | nonzero | pass |
| S04 | dallas-floor-40-metallic | Dallas, TX | 40 sq ft metallic | 600 | 600 | true | 1 | true | nonzero | pass |
| S05 | chicago-floor-zero-sqft | Chicago, IL | 0 sq ft | 0 | 0 | false |  | true | blocked-or-incomplete-zero | pass |
| S06 | chicago-1car-flake | Chicago, IL | 1-car package | 1900 | 1900 | true |  |  | nonzero | pass |
| S07 | milwaukee-2car-flake | Milwaukee, WI | 2-car package | 3150 | 3150 | true |  |  | nonzero | pass |
| S08 | chicago-3car-flake | Chicago, IL | 3-car package | 4900 | 4900 | true |  |  | nonzero | pass |
| S09 | chicago-1car-sealer-rejected | Chicago, IL | 1-car sealer preset | 0 | 0 | false |  |  | blocked-or-incomplete-zero | pass |
| S10 | chicago-2car-flat-would-zero | Chicago, IL | 2-car with a flat that would zero 3150 | 0 | 0 | false |  |  | blocked-or-incomplete-zero | pass |
| S11 | chicago-1car-unknown | Chicago, IL | 1-car unknown condition | 0 | 0 | false |  |  | blocked-or-incomplete-zero | pass |
| S12 | naperville-measured-garage-200 | Naperville, IL | 200 sq ft measured garage | 2000 | 2000 | true | 1 | true | nonzero | pass |
| S13 | chicago-flatwork-small | Chicago, IL | small band countertop | 400 | 400 | true |  |  | nonzero | pass |
| S14 | austin-flatwork-blank-override | Austin, TX | no size band | 0 | 0 | false |  |  | blocked-or-incomplete-zero | pass |
| S15 | chicago-two-chairs | Chicago, IL | 2 chairs | 360 | 360 | true |  |  | nonzero | pass |
| S16 | denver-stool-unknown | Denver, CO | 1 stool | 0 | 0 | false |  |  | blocked-or-incomplete-zero | pass |
| S17 | chicago-floor-2gal-of-3 | Chicago, IL | 100 sq ft plus 2 gal primer need | 800 | 800 | true | 90 | true | nonzero | pass |
| S18 | chicago-floor-exact-3gal | Chicago, IL | 100 sq ft plus exact 3 gal | 800 | 800 | true | 90 | true | nonzero | pass |
| S19 | chicago-floor-just-over-3gal | Chicago, IL | 100 sq ft plus 3.01 gal | 800 | 800 | true | 180 | true | nonzero | pass |
| S20 | chicago-floor-6gal | Chicago, IL | 100 sq ft plus 6 gal | 800 | 800 | true | 180 | true | nonzero | pass |
| S21 | chicago-floor-zero-primer-need | Chicago, IL | 100 sq ft and 0 gal primer override | 800 | 800 | true |  | true | nonzero | pass |
| S22 | chicago-floor-missing-pack-size | Chicago, IL | 100 sq ft, primer pack size missing | 800 | 800 | false |  | false | nonzero | pass |
| S23 | chicago-floor-missing-pack-price | Chicago, IL | 100 sq ft, primer pack selling price missing | 800 | 800 | false |  | false | nonzero | pass |
| S24 | chicago-two-areas-one-primer-pack | Chicago, IL | two 250 sq ft solid areas | 4000 | 4000 | true | 1 | true | nonzero | pass |
| S25 | chicago-floor-missing-purchase-cost | Chicago, IL | 100 sq ft, primer purchase cost missing | 800 | 800 | false |  | false | nonzero | pass |

Inclusive installed prices are not increased by the pack charge. If the full pack selling charge is greater than the installed total, or the pack price is missing, the quote stays unfinalized.

Command: `node tools/scenario-25.js`
