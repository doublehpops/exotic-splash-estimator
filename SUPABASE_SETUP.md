# Supabase setup and recovery

The app is static (GitHub Pages). Everything that matters for security and pricing lives in
the Supabase project: tables, row-level security, the `private.*` helper functions, the
RPCs the app calls, and the `quote-job` Edge Function. This file is the checklist for
keeping that project reproducible and for rebuilding it if it is ever lost.

## 1. Base schema

A schema-only reference snapshot of the live `public` and `private` schemas is in
`supabase/baseline/schema.sql`, with notes in `supabase/baseline/README.md`. It is not a
migration and `supabase db push` does not run it. It has no data, users, keys or owner
costs. Do not add a data dump to this repo.

The files in `supabase/migrations` use the versions recorded in the live project's
migration history, so `supabase db push --dry-run` should report nothing to apply. When a
migration is applied through the dashboard or MCP, rename its file to the recorded version
in the same pull request.

## 2. Applying migrations

```bash
supabase db push
```

This applies every file in `supabase/migrations` that the project has not seen. The files
added on 2026-11-11 are additive and safe to apply to the live project:

| File | What it adds |
| --- | --- |
| `20261111225042_job_numbering.sql` | Server-assigned `ES-YYYYMMDD-NN` job numbers |
| `20261111225059_discount_request_inbox.sql` | Owner inbox of pending discount requests |
| `20261111225105_estimate_acceptance.sql` | Customer "Accept estimate" on the share page |
| `20261111225110_job_photos_storage.sql` | Private `job-photos` Storage bucket and policies |

## 3. Edge Function

```bash
supabase secrets set ES_ALLOWED_ORIGINS=https://doublehpops.github.io
supabase functions deploy quote-job
```

`ES_ALLOWED_ORIGINS` is a comma-separated list of site origins (scheme and host only). If
it is unset the function now echoes the request origin and logs a warning, so the app keeps
working, but set it so only the real site can call the function from a browser.

Redeploy the function whenever `js/epoxy-engine.js`, `js/quote-core.js` or
`js/discount-approval.js` change. The copies under `supabase/functions/_shared` must stay
byte-identical to the ones under `js`.

## 4. Auth settings (dashboard)

- Authentication → URL configuration → Site URL: `https://doublehpops.github.io/exotic-splash-estimator/index.html`
- Redirect URLs: the same URL. Invite and password-reset links return here.
- Authentication → Providers → Email: keep "Enable sign-ups" **off**. Staff are invited from
  Authentication → Users → Invite user, then enabled by the owner in the app's Staff view.

## 5. Public config

`public-config.js` holds only the project URL and the publishable (anon) key. Never put the
service_role or an `sb_secret_` key there; `js/es-config.js` refuses to start if it sees one.

## 6. Follow-up texts (not applied with this file)

The follow-up migrations and the `followup-dispatch` / `followup-inbound` functions
are in the repo only. Do not apply the migrations or deploy the functions until
the draft is reviewed. They ship with follow-ups disabled and dry run on, so a
deploy still does not text anyone until the owner turns the switches on.

After review, the owner sets these as function secrets (never in `public-config.js`
or the git repo):

| Secret | Required |
| --- | --- |
| `RETELL_API_KEY` | Yes, for Retell texts and for verifying Retell webhooks |
| `RETELL_FOLLOWUP_AGENT_ID` | Yes for Retell. Use the Ashley Text - Exotic Splash agent id |
| `RETELL_FROM_NUMBER` | Optional. Defaults to `+13125842873` |
| `RETELL_VOICE_AGENT_ID` | Only if voice is turned on later. Voice is not scheduled |
| `FOLLOWUP_SMS_PROVIDER` | `retell` or `twilio`. Empty means the send is marked not configured |
| `TWILIO_ACCOUNT_SID` | Only for the Twilio provider |
| `TWILIO_AUTH_TOKEN` | Only for the Twilio provider, also verifies inbound Twilio signatures |
| `TWILIO_FROM_NUMBER` | Optional. Defaults to `+13125842873` |
| `FOLLOWUP_SURVEY_BASE_URL` | Optional. Defaults to the GitHub Pages `survey.html` |

The 15-minute cron reads two Vault secrets, which are also not in the repo:
`project_url` (the project API URL) and `followup_dispatch_bearer` (the service
role key). Until those exist, the cron logs a skip and does not call the function.

The sending number needs A2P 10DLC registration before real texts. The Ashley Text
prompt to paste into Retell is in `docs/followup-ashley-text-prompt.md`.

Deploy the inbound function with JWT verification off (`--no-verify-jwt`). Retell
and Twilio do not send a Supabase JWT. The function rejects requests that fail
their own signature checks.

## 7. Rebuilding from nothing

1. Create a new project and run `supabase link`. Run `supabase/baseline/schema.sql` on the
   empty database, then mark the migrations as applied as described in
   `supabase/baseline/README.md` (the snapshot already includes them).
2. Deploy the function and set the secret as in section 3.
3. Set the auth URLs as in section 4, invite the owner account, and in SQL set that
   profile's role to `owner` and `active` to true.
4. Update `public-config.js` with the new URL and key, sign in, open Costs & pricing, and
   save the price book with the real prices (see the owner notes in the app).
