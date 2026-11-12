-- Jobs board support. Not applied by the pull request that adds this file.
-- No internal price-book figures and no secrets.
--
-- 1. staff_settings.business.crews — owner-managed crew names (an array of text).
--    jsonb_set does not create missing parents, so {business} is written before
--    {business,crews}. Existing business fields are kept. An existing array is kept.
-- 2. public.staff_directory() — active-staff-gated id and display name only.
--    No email, role notes, or price-book fields.
-- 3. public.owner_delete_jobs(uuid[]) — owner-only hard delete.
--    private.is_owner() runs before any delete. Employees are rejected.
--    Cascades already remove job_owner_pricing, job_quotes (and job_quote_internal),
--    and estimate_shares. This function also removes the rows that do not cascade:
--    discount_approvals (estimate_id), and estimate_acceptances when the job
--    number matches exactly one job.
--    Job photos are not removed here. storage.protect_objects_delete raises
--    42501 unless storage.allow_delete_query is true, and that would roll back
--    the whole delete. The client removes job-photos with the Storage API
--    before it calls this function.

do $migration$
declare
  v_staff jsonb;
  v_business jsonb;
  v_row public.price_book%rowtype;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);

  select * into v_row from public.price_book where id = 1;
  if found then
    v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
    if jsonb_typeof(v_staff) is distinct from 'object' then
      v_staff := '{}'::jsonb;
    end if;

    v_business := v_staff -> 'business';
    if jsonb_typeof(v_business) is distinct from 'object' then
      v_business := '{}'::jsonb;
    end if;
    v_staff := jsonb_set(v_staff, '{business}', v_business, true);

    if jsonb_typeof(v_staff #> '{business,crews}') is distinct from 'array' then
      v_staff := jsonb_set(v_staff, '{business,crews}', '[]'::jsonb, true);
    end if;

    update public.price_book
       set staff_settings = v_staff,
           version = version + 1,
           updated_at = now()
     where id = 1
       and staff_settings is distinct from v_staff;
  end if;
end
$migration$;

create or replace function public.staff_directory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v jsonb;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'displayName', left(coalesce(nullif(btrim(p.full_name), ''), 'Staff'), 80)
         ) order by p.full_name), '[]'::jsonb)
    into v
  from public.profiles p
  where p.role in ('owner', 'employee');
  return v;
end;
$$;

create or replace function public.owner_delete_jobs(p_job_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_id uuid;
  v_ids uuid[];
  v_number text;
  v_approvals integer := 0;
  v_acceptances integer := 0;
  v_jobs integer := 0;
  v_n integer;
  v_one integer;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can delete jobs' using errcode = '42501';
  end if;
  if p_job_ids is null or cardinality(p_job_ids) = 0 then
    raise exception 'Choose at least one job' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
  from unnest(p_job_ids) as x
  where x is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Choose at least one job' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 50 then
    raise exception 'Delete at most 50 jobs at a time' using errcode = '22023';
  end if;

  foreach v_id in array v_ids loop
    select j.job_number into v_number from public.jobs j where j.id = v_id;
    if not found then
      raise exception 'Job not found' using errcode = 'P0002';
    end if;

    delete from public.discount_approvals d where d.estimate_id = v_id;
    get diagnostics v_n = row_count;
    v_approvals := v_approvals + v_n;

    -- Acceptances store a token hash and an estimate number, not a job id.
    -- Skip the delete when the number is shared so a duplicate cannot wipe
    -- another job's acceptance.
    if v_number is not null and btrim(v_number) <> '' then
      select count(*)::integer into v_one from public.jobs j where j.job_number = v_number;
      if v_one = 1 then
        delete from public.estimate_acceptances a where a.estimate_number = v_number;
        get diagnostics v_n = row_count;
        v_acceptances := v_acceptances + v_n;
      end if;
    end if;

    delete from public.jobs j where j.id = v_id;
    get diagnostics v_n = row_count;
    v_jobs := v_jobs + v_n;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'jobs', v_jobs,
    'discount_approvals', v_approvals,
    'estimate_acceptances', v_acceptances
  );
end;
$$;

revoke all on function public.staff_directory() from public, anon, service_role;
revoke all on function public.owner_delete_jobs(uuid[]) from public, anon, service_role;
grant execute on function public.staff_directory() to authenticated;
grant execute on function public.owner_delete_jobs(uuid[]) to authenticated;
