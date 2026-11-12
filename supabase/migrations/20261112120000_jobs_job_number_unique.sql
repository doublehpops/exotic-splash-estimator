-- Unique job numbers on public.jobs.job_number, the column filled by
-- private.jobs_assign_number in 20261111090000_job_numbering.sql.
-- Not applied by the pull request that adds this file.
--
-- Live rows already repeat numbers (including ES-20261105-01 five times and
-- ES-20261110-01 twice). This migration refuses to continue while any
-- duplicate non-null job_number exists. It does not renumber or delete rows.
-- Null job numbers are not duplicates: a unique index treats nulls as
-- distinct, and the check below uses that same rule.
-- Clear the duplicates, then run this file again.

do $migration$
declare
  v_groups integer;
  v_list text;
begin
  select count(*)::integer, string_agg(format('%s x%s', job_number, n), ', ' order by job_number)
    into v_groups, v_list
  from (
    select job_number, count(*) as n
    from public.jobs
    where job_number is not null
    group by job_number
    having count(*) > 1
  ) d;

  if coalesce(v_groups, 0) > 0 then
    raise exception
      'Refusing to add unique index jobs_job_number_unique on public.jobs (job_number): %s duplicate value(s) exist (%s). Resolve those duplicates first. This migration does not renumber or delete rows.',
      v_groups, v_list
      using errcode = '23505';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname = 'jobs_job_number_unique'
  ) then
    create unique index jobs_job_number_unique on public.jobs (job_number);
  end if;
end
$migration$;
