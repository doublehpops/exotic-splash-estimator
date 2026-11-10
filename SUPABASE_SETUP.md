# Supabase setup and recovery

The app is static (GitHub Pages). Everything that matters for security and pricing lives in
the Supabase project: tables, row-level security, the `private.*` helper functions, the
RPCs the app calls, and the `quote-job` Edge Function. This file is the checklist for
keeping that project reproducible and for rebuilding it if it is ever lost.

## 1. One-time: capture the base schema into this repo

The repo currently holds only the migrations added since 2026-11-10. The original schema
(profiles, jobs, price_book, price_book_owner, job_owner_pricing, estimate shares, quote
records, the `private` schema helpers and all RLS policies) exists only in the live project.
Dump it once so the repo is the source of truth:

```bash
npm install -g supabase
supabase login
supabase link --project-ref xokzebezxkwxzyhahmqr
supabase db dump --schema public,private --file supabase/migrations/20261101000000_baseline.sql
supabase db dump --schema public,private --data-only --file supabase/seed_price_book_check.sql
```

Then:

1. Open the baseline file and confirm it contains `create schema private`, the `profiles`
   and `jobs` tables, the `private.is_active_staff`, `private.is_owner` and
   `private.user_can_access_job` functions, and every `create policy`.
2. Delete the data-only dump after confirming it has no secrets; it is only there to check
   that the price book rows exist. Do not commit it.
3. Commit the baseline migration. Its timestamp must sort before the 2026-11-10 files.

## 2. Applying migrations

```bash
supabase db push
```

This applies every file in `supabase/migrations` that the project has not seen. The files
added on 2026-11-11 are additive and safe to apply to the live project:

| File | What it adds |
| --- | --- |
| `20261111090000_job_numbering.sql` | Server-assigned `ES-YYYYMMDD-NN` job numbers |
| `20261111090100_discount_request_inbox.sql` | Owner inbox of pending discount requests |
| `20261111090200_estimate_acceptance.sql` | Customer "Accept estimate" on the share page |
| `20261111090300_job_photos_storage.sql` | Private `job-photos` Storage bucket and policies |

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

## 6. Rebuilding from nothing

1. Create a new project, run `supabase link`, then `supabase db push` (baseline first).
2. Deploy the function and set the secret as in section 3.
3. Set the auth URLs as in section 4, invite the owner account, and in SQL set that
   profile's role to `owner` and `active` to true.
4. Update `public-config.js` with the new URL and key, sign in, open Costs & pricing, and
   save the price book with the real prices (see the owner notes in the app).
