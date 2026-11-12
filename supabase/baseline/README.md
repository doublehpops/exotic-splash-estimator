# Schema baseline (reference only)

`schema.sql` is a schema-only snapshot of the `public` and `private` schemas, read from the
live project catalog on 2026-11-12 after every file in `supabase/migrations` was applied.

It is **not a migration**. It lives outside `supabase/migrations` on purpose, so
`supabase db push` never runs it. Do not run it against the live project.

What it has: extensions, sequences, tables, constraints, indexes, functions, triggers, row
level security, policies, grants and comments.

What it does not have: row data, seed data, price book values, users, emails, keys or
secrets. It also leaves out the `auth` and `storage` schemas, the `job-photos` bucket
policies (those are in `supabase/migrations/20261111225110_job_photos_storage.sql`) and the
trigger on `auth.users` that calls `private.handle_new_auth_user()`.

## Uses

- Read the whole schema in one place.
- Diff it against a fresh `supabase db dump --schema public,private` to spot drift.
- Rebuild an empty project: run it first on the empty database, recreate the
  `auth.users` trigger, then mark every file in `supabase/migrations` as applied with
  `supabase migration repair --status applied <version>` (the snapshot already includes
  them). Add the price book rows and the first owner by hand. Never copy owner costs into
  this repo.

## Migration file names

The file names in `supabase/migrations` match the versions recorded in the live
`supabase_migrations.schema_migrations` table, and each file is byte-identical to the SQL
that was applied. Some files were applied through the dashboard or MCP, which stamps the
apply time as the version, so the files were renamed on 2026-11-12 to match:

| Old repo file | Live version |
| --- | --- |
| 20261110120000_extra_discount_approval.sql | 20261110011912 + 20261110012040_extra_discount_stale_persists |
| 20261110143000_discount_approval_private_wrappers.sql | 20261110014129 |
| 20261110160000_record_approved_discount_columns.sql | 20261110085927 |
| 20261111090000_job_numbering.sql | 20261111225042 |
| 20261111090100_discount_request_inbox.sql | 20261111225059 |
| 20261111090200_estimate_acceptance.sql | 20261111225105 |
| 20261111090300_job_photos_storage.sql | 20261111225110 |
| 20261112053000_cost_model_owner_defaults.sql | 20261112034714 |
| 20261112110000_cost_model_followup.sql | 20261112074520 |
| 20261112113000_price_book_version_trigger.sql | 20261112074535 |
| 20261112120000_jobs_job_number_unique.sql | 20261112074537 |
| 20261112143000_package_table_and_extras.sql | 20261112080433 |

Comments inside some files still mention the old names. They were left alone so each file
stays identical to what ran.

When a new migration is applied through the dashboard or MCP, rename its file in the same
pull request to the version the project recorded.
