# Role visibility

Observed in code and in `tools/visibility-audit.test.js`. This draft did not sign in to the live staff app, so live RLS was not re-executed here. The quote gate below is the same function the edge function is written to call.

| Surface | Owner | Employee | Customer link | Anonymous / inactive |
| --- | --- | --- | --- | --- |
| Approved selling rates and catalog starts | Yes | Yes, locked | Only on a ready, server-issued estimate | No app data |
| Pending vs explicit $0 | Yes | Yes on selling fields | Pending total, not a fake $0 | No |
| Inactive floor proposals ($8 / $10 / $15) | Review panel only. Not in the quote until activation. | Hidden | Hidden | Hidden |
| Product package costs | Internal baseline and Costs & pricing | Hidden. Auth and demo worker views omit the cost block. | Hidden | Hidden |
| Cost rates, pay, markup, profit, margin | Internal docs and owner summary | Not in staff snapshot or employee HTML | Not in customer snapshot or estimate page | Request rejected (403) |
| Customer estimate HTML | Selling document. Internal block only if the owner flag is on and the viewer is the owner. | Same selling document, internal block forced off | Read-only allowlist: estimate, issued_at, expires_at | No token, no payload |
| JSON backup | Includes the owner draft settings | Settings omitted, markup omitted | Not available | Not available |

Employee devices receive redacted cost numbers (zeros). That redacted book must not be audited as if zero were an owner decision. The review list is built from the owner settings object only.
