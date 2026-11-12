-- Index public.jobs (updated_at desc, id desc).
-- Not applied by the pull request that adds this file.
--
-- This index was already created on the live database between 2026-11-12
-- 01:40 and 02:25 America/Chicago. It is not in this repo's older files and
-- it is not in supabase_migrations.schema_migrations. This file only records
-- it. CREATE INDEX IF NOT EXISTS does nothing when that name is already present.
--
-- Live schema_migrations version this file should map to: 20261112170000
-- There is no earlier live version for it. Do not attach it to an existing
-- applied version. A later rename of migration filenames should keep this
-- version on this index.

create index if not exists jobs_updated_at_id_desc_idx
  on public.jobs (updated_at desc, id desc);
