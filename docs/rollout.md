# Rollout and rollback

This pull request is a draft. A Nov 9, 2026 5:50 PM CT instruction superseded every earlier merge and publish approval. Do not merge, deploy, or write live prices, functions, or the database until Double reviews the 25-scenario results and says yes again.

## What is in this repo

- V7 staff app on `main` at `6d83b1e` (merged PR #1) remains the published app.
- This draft adds an inactive review list and snapshot scrubbing. Default activation is off, so customer totals do not change.
- No SQL migration is included. The price book is JSON behind the existing `owner_update_price_book` RPC. Inventing a new migration without the live schema would be unsafe.
- V8 safeguards are in this draft as code only: `js/es-costbook.js` and unapplied `supabase/migrations/20261105140000_v8_material_costbook.sql`. The vendor cost catalog is not in the repo. An empty catalog does not change installed quotes.
- Garage material adjustments are not seeded. A flat delta sized for 450 sq ft is rejected because it can wipe a smaller package. The engine blocks a non-positive package total instead of rewriting it to $0. The allowed shape, once an owner sets each package area, is (system rate − flake rate) × that package area, using the live $8 / $10 / $15 / $3 selling rates. Package starts stay as already saved.

## Order, after parent review

1. Re-run `node tools/visibility-audit.test.js` on the reviewed head. Stop if it fails.
2. Merge that pinned head. Do not force-push.
3. Deploy the static Pages files for this head, including `js/es-costbook.js`. Keep the previous V7 files available for rollback. Do not upload a vendor cost JSON.
4. Leave `applyOwnerConfirmedFloorSelling` and `applySourcedEstimates` false. Quotes keep the current book.
5. Before any live rate write, read the current `price_book.staff_settings` rates. If solid / flake / metallic are already the owner-confirmed $8 / $10 / $15, do nothing. If they differ, patch only those three selling keys through the existing owner RPC and record the reason. Do not overwrite null catalog fields, product costs, or cost rates.
6. Sourced Chicagoland averages: do not write any. None were attached to this draft. A later dataset has to arrive with per-field provenance before `applySourcedEstimates` can do anything. The code ignores that flag while the dataset is empty.
7. Apply `supabase/migrations/20261105140000_v8_material_costbook.sql` only after review. It is additive and unapplied. Do not re-run the already-live v7 migrations. Do not load vendor costs in that step. Owner product rows stay empty until size, price, and coverage describe the same kit (see `docs/owner-pricing-schema.json`). Job markup rows stay as they are.
8. Staff activation for live tests: parent-only, outside this pull request. This draft does not create accounts or change `active`.

## Rollback

- App: revert the merge commit. Static hosting then serves the previous V7 files. No database rollback is required for this draft, because it writes nothing.
- If step 5 was later applied: restore the prior `price_book` version from `owner_price_book_audit` and the previous `staff_settings.rates` values. Do not delete the audit row.
- If a future V8 publish goes out: put the previous V7 Pages files back. Do not delete the V8 artifact; unpublish it by restoring V7.

## Still blocked on parent input

- Sanitized live price-book snapshot (so Pending rows can be compared with production instead of code defaults).
- Sourced estimate dataset with provenance. Do not treat these review statuses as researched averages.
- Corrected selling estimates. The 450 sq ft flat deltas are not approved.
- Owner product prices. Size mismatches are unresolved, so no product row is ready to write.
