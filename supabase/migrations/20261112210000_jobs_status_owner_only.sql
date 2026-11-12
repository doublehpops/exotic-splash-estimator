-- Job status is owner-only.
-- Not applied by the pull request that adds this file. No rows are removed.
--
-- Employees can still insert a job and update the fields they edit today.
-- jobs_guard still forces a new employee job to draft and still blocks
-- method, agreed total, custom rates, and over-cap discounts.
-- A direct change to jobs.status by anyone who is not the owner is rejected.
-- Trusted server writes (server_record_quote and create_estimate_share) still
-- set status. They set es.trusted_job_write, the same flag jobs_guard uses.
--
-- This trigger is named so it runs before jobs_guard_trg. Both are BEFORE
-- UPDATE, and Postgres fires those in name order. The status error is the
-- one the employee sees.

create or replace function private.jobs_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trusted boolean := coalesce(current_setting('es.trusted_job_write', true), '') = 'on';
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not v_trusted
     and not private.is_owner() then
    raise exception 'Only the owner can change job status' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_guard_status_trg on public.jobs;
create trigger jobs_guard_status_trg
  before update of status on public.jobs
  for each row
  execute function private.jobs_guard_status();

revoke all on function private.jobs_guard_status() from public, anon, authenticated, service_role;
