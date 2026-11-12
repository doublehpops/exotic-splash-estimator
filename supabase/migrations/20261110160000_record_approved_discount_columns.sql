-- New quotes: write the approved, consumed extra discount into the reporting
-- columns. The customer snapshot already holds that amount. This keeps the
-- same cap, role, and status checks. A snapshot discount is stored only when
-- a consumed approval matches this estimate, the selected tier, the amount,
-- and the snapshot total. Anything else stays 0.
-- Not applied by this pull request.

create or replace function private.jobs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid        uuid := auth.uid();
  v_role       text := private.staff_role();
  v_employee   boolean;
  v_old_data   jsonb := case when tg_op = 'UPDATE' then old.job_data else '{}'::jsonb end;
  v_area       jsonb;
  v_old_rate   jsonb;
  v_discount   numeric;
  v_old_disc   numeric;
  v_adj        jsonb;
  v_cap        numeric;
  v_opt        text;
  v_trusted    boolean := coalesce(current_setting('es.trusted_job_write', true), '') = 'on';
begin
  if v_uid is not null and v_role is null then
    raise exception 'Account is disabled or not yet approved by the owner' using errcode = '42501';
  end if;
  v_employee := (v_role = 'employee');

  -- markup is owner-only data: never stored inside job_data
  new.job_data := new.job_data - 'markup';

  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    if v_uid is not null then new.created_by := v_uid; end if;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- trusted status-only writes (server_record_quote / create_estimate_share)
    -- must not invalidate the quote they belong to
    new.version := case when v_trusted then old.version else old.version + 1 end;
  end if;
  new.updated_at := now();
  new.updated_by := v_uid;
  new.job_number := left(coalesce(new.job_data ->> 'number', new.job_number, ''), 80);
  new.customer_label := left(coalesce(nullif(new.job_data ->> 'customer', ''), new.job_data ->> 'company', ''), 120);

  -- pricing option must be one the engine understands
  v_opt := coalesce(nullif(new.job_data ->> 'priceOption', ''), 'regular');
  if v_opt not in ('regular','opt1','opt2') then
    raise exception 'Unknown pricing option %', v_opt using errcode = '22023';
  end if;

  v_discount := coalesce(private.jnum(new.job_data -> 'discount'), 0);
  if v_discount < 0 then
    raise exception 'Discount cannot be negative' using errcode = '22023';
  end if;
  v_discount := round(v_discount, 2);
  v_old_disc := case when tg_op = 'UPDATE' then old.discount_amount else 0 end;
  if v_trusted and new.discount_set_by is not null and new.discount_amount is distinct from v_discount then
    -- server_record_quote named the approving owner and the consumed amount.
    -- The client job payload keeps discount at 0, so do not replace either.
    null;
  elsif tg_op = 'UPDATE' and not v_trusted and v_discount = 0 and v_old_disc > 0
        and private.user_staff_role(old.discount_set_by) = 'owner' then
    -- A later save still sends discount 0. Keep the quote's recorded amount.
    new.discount_amount := v_old_disc;
    new.discount_set_by := old.discount_set_by;
  else
    new.discount_amount := v_discount;
    if tg_op = 'INSERT' or v_discount <> v_old_disc then
      new.discount_set_by := v_uid;
    else
      new.discount_set_by := old.discount_set_by;
    end if;
  end if;

  if v_employee then
    new.job_data := jsonb_set(new.job_data, '{includeInternalInCustomer}', 'false'::jsonb, true);

    if tg_op = 'INSERT' then
      new.assigned_staff := '{}';
      if new.status not in ('draft') then new.status := 'draft'; end if;
    else
      new.assigned_staff := old.assigned_staff;
      if new.status is distinct from old.status then
        if not v_trusted and (new.status in ('archived','issued') or old.status = 'archived') then
          raise exception 'Only the owner can archive or un-archive jobs; links issue status' using errcode = '42501';
        end if;
      end if;
    end if;

    if coalesce(nullif(new.job_data ->> 'method', ''), 'rates')
       is distinct from coalesce(nullif(v_old_data ->> 'method', ''), 'rates') then
      raise exception 'Only the owner can change the customer pricing method' using errcode = '42501';
    end if;

    if coalesce(private.jnum(new.job_data -> 'agreedTotal'), 0)
       is distinct from coalesce(private.jnum(v_old_data -> 'agreedTotal'), 0) then
      raise exception 'Only the owner can set an agreed total' using errcode = '42501';
    end if;

    for v_area in select value from jsonb_array_elements(coalesce(
                     case when jsonb_typeof(new.job_data -> 'areas') = 'array' then new.job_data -> 'areas' end,
                     '[]'::jsonb))
    loop
      if v_area ? 'rate' and jsonb_typeof(v_area -> 'rate') <> 'null' and coalesce(v_area ->> 'rate', '') <> '' then
        select o.value -> 'rate' into v_old_rate
          from jsonb_array_elements(coalesce(
                 case when jsonb_typeof(v_old_data -> 'areas') = 'array' then v_old_data -> 'areas' end,
                 '[]'::jsonb)) o
         where o.value ->> 'id' = v_area ->> 'id'
         limit 1;
        if v_old_rate is null or private.jnum(v_old_rate) is distinct from private.jnum(v_area -> 'rate') then
          raise exception 'Only the owner can set a custom $/sq ft rate on an area' using errcode = '42501';
        end if;
      end if;
    end loop;

    -- approved adjustment (discount) cap, amount mode enforced here
    if v_discount > 0 and (tg_op = 'INSERT' or v_discount <> v_old_disc) then
      select pb.staff_settings -> 'approvedAdjustment' into v_adj from public.price_book pb where pb.id = 1;
      if coalesce(v_adj ->> 'mode', 'amount') = 'pct' then
        -- percent mode: cap depends on the server-computed regular price.
        -- Checked when the server records the quote and when a link is issued.
        null;
      else
        v_cap := coalesce(private.jnum(v_adj -> 'amount'), 0);
        if v_discount > v_cap then
          raise exception 'Discount % exceeds the owner-approved adjustment limit %', v_discount, v_cap
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  -- owners (and trusted server paths) may change status, assignment, method, rates.

  return new;
end;
$function$;

create or replace function public.server_record_quote(
  p_job_id uuid, p_job_version integer, p_requested_by uuid, p_engine_version text,
  p_price_book_version integer, p_quote_ready boolean, p_quote_status text,
  p_total numeric, p_cap_base numeric, p_customer_snapshot jsonb, p_staff_snapshot jsonb, p_internal jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job   public.jobs%rowtype;
  v_adj   jsonb;
  v_pbv   int;
  v_cap   numeric;
  v_id    uuid;
  v_setter_role text;
  v_snap_discount numeric;
  v_quote_discount numeric;
  v_owner uuid;
begin
  if not private.user_can_access_job(p_requested_by, p_job_id) then
    raise exception 'Requester cannot access this job (or account disabled)' using errcode = '42501';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if v_job.version <> p_job_version then
    raise exception 'Job changed since the quote was computed (server version %)', v_job.version using errcode = '40001';
  end if;

  select pb.staff_settings -> 'approvedAdjustment', pb.version into v_adj, v_pbv from public.price_book pb where pb.id = 1;
  if v_pbv <> p_price_book_version then
    raise exception 'Price book changed during quote calculation' using errcode = '40001';
  end if;

  if coalesce(v_adj ->> 'mode', 'amount') = 'pct' then
    v_cap := round(greatest(coalesce(p_cap_base, 0), 0) * coalesce(private.jnum(v_adj -> 'pct'), 0) / 100, 2);
  else
    v_cap := round(coalesce(private.jnum(v_adj -> 'amount'), 0), 2);
  end if;

  v_setter_role := private.user_staff_role(v_job.discount_set_by);
  if v_job.discount_amount > v_cap and coalesce(v_setter_role, 'employee') <> 'owner' then
    raise exception 'Discount % exceeds the owner-approved adjustment limit %', v_job.discount_amount, v_cap
      using errcode = '42501';
  end if;

  v_snap_discount := round(coalesce(private.jnum(p_customer_snapshot #> '{totals,discount}'), 0), 2);
  if v_snap_discount < 0 then
    v_snap_discount := 0;
  end if;
  v_quote_discount := 0;
  v_owner := null;
  if v_snap_discount > 0 then
    select a.owner_id into v_owner
      from public.discount_approvals a
     where a.estimate_id = p_job_id
       and a.status = 'consumed'
       and a.tier = coalesce(nullif(p_customer_snapshot #>> '{selected,key}', ''), 'regular')
       and a.amount = v_snap_discount
       and a.after_total = round(coalesce(private.jnum(p_customer_snapshot #> '{totals,total}'), 0), 2)
     order by a.applied_at desc nulls last
     limit 1;
    if v_owner is not null then
      v_quote_discount := v_snap_discount;
    end if;
  end if;

  insert into public.job_quotes (job_id, job_version, engine_version, price_book_version, computed_for,
                                 quote_ready, quote_status, total, cap_base, discount, cap_amount,
                                 customer_snapshot, staff_snapshot)
  values (p_job_id, p_job_version, left(coalesce(p_engine_version, ''), 40), p_price_book_version, p_requested_by,
          coalesce(p_quote_ready, false), left(coalesce(p_quote_status, ''), 200), round(coalesce(p_total, 0), 2),
          round(coalesce(p_cap_base, 0), 2), v_quote_discount, v_cap,
          private.customer_safe_snapshot(p_customer_snapshot), private.staff_safe_snapshot(p_staff_snapshot))
  returning id into v_id;

  if p_internal is not null then
    insert into public.job_quote_internal (quote_id, internal) values (v_id, p_internal);
  end if;

  if (v_job.status = 'draft' and coalesce(p_quote_ready, false))
     or v_quote_discount is distinct from v_job.discount_amount then
    perform set_config('es.trusted_job_write', 'on', true);
    update public.jobs
       set status = case
             when status = 'draft' and coalesce(p_quote_ready, false) then 'quoted'
             else status
           end,
           discount_amount = v_quote_discount,
           discount_set_by = case when v_quote_discount > 0 then v_owner else discount_set_by end
     where id = p_job_id;
    perform set_config('es.trusted_job_write', '', true);
  end if;

  return v_id;
end;
$function$;
