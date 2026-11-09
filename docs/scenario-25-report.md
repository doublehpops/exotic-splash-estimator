# 25-scenario review

Local engine and quote-core mock only. Not live access control and not a routed drive.

Pass 25 / fail 0 / rows with a blocked or incomplete zero 8.

| ID | Name | Locale | Result | Actual total | Note |
| --- | --- | --- | --- | --- | --- |
| S01 | floor-chicago-100-solid | Chicago, IL | pass | 800 |  |
| S02 | floor-phoenix-100-solid | Phoenix, AZ | pass | 800 |  |
| S03 | floor-chicago-250-flake | Chicago, IL | pass | 2500 |  |
| S04 | floor-dallas-40-metallic | Dallas, TX | pass | 600 |  |
| S05 | floor-chicago-zero-sqft | Chicago, IL | pass | 0 |  |
| S06 | garage-1car-chicago-flake | Chicago, IL | pass | 1000 |  |
| S07 | garage-2car-milwaukee-flake | Milwaukee, WI | pass | 2000 |  |
| S08 | garage-3car-chicago-flake | Chicago, IL | pass | 3000 |  |
| S09 | garage-1car-unsafe-negative-delta | Chicago, IL | pass | 0 | blocked non-positive scope, not rewritten to a free quote |
| S10 | garage-2car-unsafe-zero-scope | Chicago, IL | pass | 0 | zero scope stays blocked, not a finalized free quote |
| S11 | garage-1car-unknown-condition | Chicago, IL | pass | 0 |  |
| S12 | garage-measured-200-flake | Naperville, IL | pass | 2000 |  |
| S13 | flatwork-small-chicago | Chicago, IL | pass | 400 | size-band start, blank override ignored |
| S14 | flatwork-blank-override-austin | Austin, TX | pass | 0 | Optional flatwork override is blank and no size band matched for Odd. A blank override is not a missing package price. Choose a size band or enter an item override. The item stays  |
| S15 | seating-two-chairs-chicago | Chicago, IL | pass | 360 | 2 × 180 |
| S16 | seating-unknown-denver | Denver, CO | pass | 0 | Condition is Unknown for Stool — do not assume $0. Inspect or configure an explicit adjustment. |
| S17 | pack-zero-usage | not a priced city | pass | — | No positive requirement, so no pack is billed. |
| S18 | pack-two-of-three | not a priced city | pass | — | 1 whole pack cover 2. The billed quantity is 3, not a prorated fraction. |
| S19 | pack-exact-three | not a priced city | pass | — | 1 whole pack cover 3. The billed quantity is 3, not a prorated fraction. |
| S20 | pack-just-over-three | not a priced city | pass | — | 2 whole packs cover 3.01. The billed quantity is 6, not a prorated fraction. |
| S21 | pack-two-exact-packs | not a priced city | pass | — | 2 whole packs cover 6. The billed quantity is 6, not a prorated fraction. |
| S22 | pack-missing-size | not a priced city | pass | — | Sellable pack size is missing. No pack count was invented and it was not treated as zero. |
| S23 | pack-unit-mismatch | not a priced city | pass | — | Required unit does not match the sellable pack unit. No conversion was invented. |
| S24 | floor-two-areas-aggregated-primer | Chicago, IL | pass | 4000 | Two 1-gal needs share one 3-gal pack. Pack dollars are not added to the 4000 installed total. |
| S25 | deposit-block-and-role-snapshots | Chicago, IL | pass | — | local mock only — not live RLS or a browser session |

City labels do not change selling rates. S01 and S02 are the pair that shows that.

Command: `node tools/scenario-25.js`
