# Role visibility

Observed in code and in `tools/visibility-audit.test.js`. This draft did not sign in to the live staff app, so live RLS was not re-executed here. The quote gate below is the same function the edge function is written to call.

| Surface | Owner | Employee | Customer link | Anonymous / inactive |
| --- | --- | --- | --- | --- |
| Approved selling rates and catalog starts | Yes | Yes, locked | Only on a ready, server-issued estimate | No app data |
| Pending vs explicit $0 | Yes | Yes on selling fields | Pending total, not a fake $0 | No |
| Inactive floor-rate review | Review panel only. Not written into the quote. | Hidden | Hidden | Hidden |
| Product package costs | Internal baseline and Costs & pricing | Hidden. Auth views omit the cost block from the server book. | Hidden | Hidden |
| Cost rates, pay, markup, profit, margin | Internal docs and owner summary | Not in the staff snapshot or employee response | Not in the customer snapshot or estimate page | Request rejected (403) |
| Customer estimate HTML | Selling document | Same selling document | Read-only allowlist: estimate, issued_at, expires_at | No token, no payload |

Employee devices receive redacted cost numbers (zeros). That redacted book must not be audited as if zero were an owner decision. The review list is built from the owner settings object only. Whole-pack billing and the material costbook are not in this pull request.
