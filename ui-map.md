# Estimator UI map

Staff app: `index.html` → sign-in gate (`js/es-gate.js`) → guided shell (`js/guided-app.js`). Customer link: `estimate.html` (read-only).

| Click | Where it lands |
| --- | --- |
| Guided workflow | Steps Contact → Areas → Prep → System → Pricing → Review. Garage packages are on Areas. |
| Costs & pricing | Selling rates, payment tiers, catalog packages. Owner also sees the inactive proposal review. Employees do not. |
| Internal job-cost | Section “0. Current baseline — &lt;area&gt;”, then field plan. Print uses the same `internalContent(true)`. |
| Customer doc | Selling estimate inside the staff app. |
| Shared link | `estimate.html#t=est_…` renders only the customer snapshot. |

Proposal review is an owner-only `<details>` on Costs & pricing. Its activation button is disabled. It is not a new visual system: it uses `details`, `warn-banner`, and the existing table. Whole-pack container lines and the material costbook panel are not on this map.
