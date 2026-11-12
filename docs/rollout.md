# Rollout and rollback

This pull request is a draft split from the closed review on `cursor/pending-visibility-audit-a787` (PR 2, left closed). It is rebased onto main `74307da`. Do not merge, deploy, or write live prices until the price audit is reviewed.

## In this pull request

- Inactive price-book review (`js/price-proposals.js`). Activation stays off. Sourced estimates are an empty list. Confirmed selling rates are shown and are not written.
- Quote safeguards on the current cost model: a garage package does not take a flat sealer, custom, critical, or leveling amount. A non-positive package stays blocked instead of becoming a free quote. A blank flatwork override is not treated as a missing package price. Flake yield factors are unchanged and still flagged.
- Employee and customer snapshots drop owner-only keys. The customer page ignores any sibling internal payload.
- No SQL migration is included. Nothing in this pull request was applied to a database.

## Left for a separate reviewed pull request

Whole-pack billing and costbook v8 are not in this branch. That includes `js/pack-billing.js`, `js/es-costbook.js`, and `supabase/migrations/20261105140000_v8_material_costbook.sql` from the closed draft. They wait for their own reviewed pull request. Do not apply that migration from this draft.

## What this draft does not change

- Garage base fees stay the selected tier’s flake rate times 250 / 450 / 650 sq ft. Per-package solid credits stay. The $2,000 minimum stays.
- Per-sq-ft price caps stay. A rate outside $0–$40 is still blocked.
- Property add-in defaults stay at zero and are still not a separate customer line.

## Order, after review

1. Re-run `node tools/visibility-audit.test.js` on the reviewed head. Stop if it fails.
2. Merge that pinned head. Do not force-push.
3. Leave proposal activation off. Do not write null catalog fields, product costs, or cost rates from this review.

## Rollback

Revert the merge commit. Static hosting then serves the previous files. No database rollback is required, because this draft writes nothing.
