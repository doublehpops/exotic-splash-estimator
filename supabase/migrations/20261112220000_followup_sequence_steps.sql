-- Customer text sequence. Not applied by the pull request that adds this file.
-- Do not run this against the live project from the draft. Nothing here sends a text.
-- followups.enabled stays false, dryRun stays true, voiceEnabled stays false,
-- and every sequence step defaults to off.

alter table public.job_followups
  add column if not exists step text not null default 'post_quote';

alter table public.job_followups
  add column if not exists step_vars jsonb not null default '{}'::jsonb;

alter table public.job_followups
  add column if not exists visit_confirmed_at timestamptz;

alter table public.job_followups
  drop constraint if exists job_followups_step_check;

alter table public.job_followups
  add constraint job_followups_step_check check (step in (
    'post_quote','visit_confirm','visit_reminder','quote_thanks',
    'booked_install','undecided_check','last_check','review'
  ));

do $drop_job_unique$
declare
  v_name text;
begin
  for v_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'job_followups'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) = 'UNIQUE (job_id)'
  loop
    execute format('alter table public.job_followups drop constraint %I', v_name);
  end loop;
end
$drop_job_unique$;

create unique index if not exists job_followups_job_step_uidx
  on public.job_followups (job_id, step);

do $steps$
declare
  v_staff jsonb;
  v_row public.price_book%rowtype;
  v_steps jsonb := jsonb_build_object(
    'visit_confirm', false,
    'visit_reminder', false,
    'quote_thanks', false,
    'booked_install', false,
    'undecided_check', false,
    'last_check', false,
    'review', false
  );
  v_followups jsonb;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);
  select * into v_row from public.price_book where id = 1;
  if not found then
    return;
  end if;
  v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
  if jsonb_typeof(v_staff) is distinct from 'object' then
    v_staff := '{}'::jsonb;
  end if;
  v_followups := coalesce(v_staff->'followups', '{}'::jsonb);
  if jsonb_typeof(v_followups) is distinct from 'object' then
    v_followups := '{}'::jsonb;
  end if;
  v_followups := v_followups || jsonb_build_object(
    'enabled', coalesce((v_followups->>'enabled')::boolean, false),
    'dryRun', coalesce((v_followups->>'dryRun')::boolean, true),
    'voiceEnabled', coalesce((v_followups->>'voiceEnabled')::boolean, false),
    'steps', coalesce(v_followups->'steps', '{}'::jsonb) || v_steps
  );
  -- Every sequence step ships off. Missing keys are false.
  v_followups := jsonb_set(
    v_followups,
    '{steps}',
    jsonb_build_object(
      'visit_confirm', coalesce(v_followups #>> '{steps,visit_confirm}', 'false') = 'true',
      'visit_reminder', coalesce(v_followups #>> '{steps,visit_reminder}', 'false') = 'true',
      'quote_thanks', coalesce(v_followups #>> '{steps,quote_thanks}', 'false') = 'true',
      'booked_install', coalesce(v_followups #>> '{steps,booked_install}', 'false') = 'true',
      'undecided_check', coalesce(v_followups #>> '{steps,undecided_check}', 'false') = 'true',
      'last_check', coalesce(v_followups #>> '{steps,last_check}', 'false') = 'true',
      'review', coalesce(v_followups #>> '{steps,review}', 'false') = 'true'
    ),
    true
  );
  v_staff := jsonb_set(v_staff, '{followups}', v_followups, true);
  update public.price_book
     set staff_settings = v_staff,
         version = version + 1,
         updated_at = now()
   where id = 1
     and staff_settings is distinct from v_staff;
end
$steps$;

create or replace function private.followup_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'enabled', coalesce(pb.staff_settings #>> '{followups,enabled}', 'false') = 'true',
    'dryRun', coalesce(pb.staff_settings #>> '{followups,dryRun}', 'true') = 'true',
    'voiceEnabled', coalesce(pb.staff_settings #>> '{followups,voiceEnabled}', 'false') = 'true',
    'steps', jsonb_build_object(
      'visit_confirm', coalesce(pb.staff_settings #>> '{followups,steps,visit_confirm}', 'false') = 'true',
      'visit_reminder', coalesce(pb.staff_settings #>> '{followups,steps,visit_reminder}', 'false') = 'true',
      'quote_thanks', coalesce(pb.staff_settings #>> '{followups,steps,quote_thanks}', 'false') = 'true',
      'booked_install', coalesce(pb.staff_settings #>> '{followups,steps,booked_install}', 'false') = 'true',
      'undecided_check', coalesce(pb.staff_settings #>> '{followups,steps,undecided_check}', 'false') = 'true',
      'last_check', coalesce(pb.staff_settings #>> '{followups,steps,last_check}', 'false') = 'true',
      'review', coalesce(pb.staff_settings #>> '{followups,steps,review}', 'false') = 'true'
    )
  )
  from public.price_book pb
  where pb.id = 1;
$function$;

create or replace function private.followup_quote_total(p_job_id uuid, p_job jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_total numeric;
  v_raw text;
begin
  select q.total into v_total
  from public.job_quotes q
  where q.job_id = p_job_id
    and q.quote_ready is true
    and q.total > 0
  order by q.computed_at desc
  limit 1;
  if v_total is not null then
    return v_total;
  end if;
  v_raw := nullif(btrim(coalesce(p_job->>'customerQuoteTotal', '')), '');
  if v_raw is null or v_raw !~ '^[0-9]+(\.[0-9]+)?$' then
    return null;
  end if;
  v_total := v_raw::numeric;
  if v_total <= 0 then
    return null;
  end if;
  return v_total;
end;
$function$;

create or replace function private.followup_visit_at(p_job jsonb)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_date text := btrim(coalesce(p_job->>'visitDate', ''));
  v_time text := btrim(coalesce(p_job->>'visitTime', ''));
begin
  if v_date !~ '^\d{4}-\d{2}-\d{2}$' or v_time !~ '^\d{2}:\d{2}$' then
    return null;
  end if;
  return (v_date::date + v_time::time) at time zone 'America/Chicago';
exception when others then
  return null;
end;
$function$;

-- Sunday moves to Monday 10:00 America/Chicago. Other times stay inside 9:00-20:00.
create or replace function private.followup_place(p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_local timestamp;
  v_hour int;
  v_result timestamptz;
begin
  v_local := p_at at time zone 'America/Chicago';
  if extract(dow from v_local) = 0 then
    return ((v_local::date + 1) + time '10:00') at time zone 'America/Chicago';
  end if;
  v_hour := extract(hour from v_local)::int;
  if v_hour >= 9 and v_hour < 20 then
    return p_at;
  elsif v_hour < 9 then
    v_result := (v_local::date + time '09:00') at time zone 'America/Chicago';
  else
    v_result := ((v_local::date + 1) + time '09:00') at time zone 'America/Chicago';
  end if;
  v_local := v_result at time zone 'America/Chicago';
  if extract(dow from v_local) = 0 then
    return ((v_local::date + 1) + time '10:00') at time zone 'America/Chicago';
  end if;
  return v_result;
end;
$function$;

create or replace function private.followup_days_at_10(p_from timestamptz, p_days int)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_day date := (p_from at time zone 'America/Chicago')::date + p_days;
  v_at timestamptz;
begin
  v_at := (v_day + time '10:00') at time zone 'America/Chicago';
  if extract(dow from (v_at at time zone 'America/Chicago')) = 0 then
    return ((v_day + 1) + time '10:00') at time zone 'America/Chicago';
  end if;
  return v_at;
end;
$function$;

create or replace function private.followup_apply_blocks(
  p_status text,
  p_reason text,
  p_opted boolean,
  p_consent boolean,
  p_phone text
) returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_opted then jsonb_build_object('status', 'opted_out', 'reason', 'opted_out')
    when p_status = 'scheduled' and p_consent is not true then jsonb_build_object('status', 'skipped', 'reason', 'no_consent')
    when p_status = 'scheduled' and coalesce(p_phone, '') = '' then jsonb_build_object('status', 'skipped', 'reason', 'no_phone')
    else jsonb_build_object('status', p_status, 'reason', coalesce(p_reason, ''))
  end;
$function$;

create or replace function private.upsert_followup_step(
  p_job_id uuid,
  p_step text,
  p_status text,
  p_outcome text,
  p_when timestamptz,
  p_consent boolean,
  p_phone text,
  p_summary text,
  p_first text,
  p_reason text,
  p_vars jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.job_followups%rowtype;
  v_when timestamptz;
  v_token text;
  v_hash text;
  v_anchor text;
  v_prev text;
begin
  select * into v from public.job_followups where job_id = p_job_id and step = p_step for update;
  if found and v.status in ('sent','completed','sending','dry_run','failed','sms_not_configured','opted_out') then
    return;
  end if;
  v_anchor := coalesce(p_vars->>'anchor', '');
  v_prev := case when found then coalesce(v.step_vars->>'anchor', '') else '' end;
  if found and v.status = 'scheduled' and p_status = 'scheduled' and v_anchor <> '' and v_anchor = v_prev then
    v_when := v.scheduled_for;
  else
    v_when := p_when;
  end if;
  if not found then
    if p_step = 'review' then
      v_token := 's' || rtrim(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'), '=');
      v_hash := private.share_token_hash(v_token);
    end if;
    insert into public.job_followups (
      job_id, step, status, channel, job_outcome, scheduled_for, consent, phone_e164,
      project_summary, customer_first_name, survey_token, survey_token_hash, last_error, step_vars
    ) values (
      p_job_id, p_step, p_status, 'sms', p_outcome, v_when, p_consent, nullif(p_phone, ''),
      p_summary, nullif(p_first, ''), v_token, v_hash, nullif(p_reason, ''), coalesce(p_vars, '{}'::jsonb)
    );
    return;
  end if;
  update public.job_followups
     set status = p_status,
         channel = 'sms',
         job_outcome = p_outcome,
         scheduled_for = v_when,
         consent = p_consent,
         phone_e164 = nullif(p_phone, ''),
         project_summary = p_summary,
         customer_first_name = nullif(p_first, ''),
         last_error = nullif(p_reason, ''),
         step_vars = coalesce(p_vars, '{}'::jsonb),
         updated_at = now()
   where id = v.id;
end;
$function$;

create or replace function private.schedule_job_followup(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs%rowtype;
  v_decision text;
  v_outcome text;
  v_consent boolean;
  v_phone text;
  v_summary text;
  v_first text;
  v_opted boolean;
  v_visit timestamptz;
  v_address text;
  v_install text;
  v_total numeric;
  v_quote_done boolean;
  v_quote_at timestamptz;
  v_when timestamptz;
  v_status text;
  v_reason text;
  v_block jsonb;
  v_vars jsonb;
  v_anchor text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then return; end if;

  v_decision := lower(btrim(coalesce(v_job.job_data->>'quoteDecision', '')));
  v_quote_done := v_job.status in ('quoted','issued')
    or v_decision in ('booked','accepted','declined','undecided');
  v_outcome := case
    when v_decision in ('booked','accepted') then 'booked'
    when v_decision = 'declined' then 'declined'
    else 'undecided'
  end;
  v_consent := coalesce(v_job.job_data->'followupConsent' = 'true'::jsonb, false);
  v_phone := private.followup_e164(v_job.job_data->>'phone');
  v_summary := private.followup_project_summary(v_job.job_data);
  v_first := left(split_part(btrim(coalesce(v_job.job_data->>'customer', '')), ' ', 1), 40);
  v_opted := v_phone <> '' and exists (
    select 1 from public.followup_opt_outs o where o.phone_e164 = v_phone
  );
  v_visit := private.followup_visit_at(v_job.job_data);
  v_address := coalesce(
    nullif(btrim(coalesce(v_job.job_data->>'visitAddress', '')), ''),
    nullif(btrim(coalesce(v_job.job_data->>'address', '')), ''),
    ''
  );
  v_install := btrim(coalesce(v_job.job_data->>'installDate', ''));
  if v_install !~ '^\d{4}-\d{2}-\d{2}$' then
    v_install := '';
  end if;
  v_total := private.followup_quote_total(p_job_id, v_job.job_data);

  if v_quote_done then
    select q.computed_at into v_quote_at
    from public.job_quotes q
    where q.job_id = p_job_id and q.quote_ready is true
    order by q.computed_at asc
    limit 1;
    if v_quote_at is null then
      v_quote_at := now();
    end if;
  end if;

  update public.job_followups
     set status = 'skipped',
         last_error = 'replaced_by_sequence',
         updated_at = now()
   where job_id = p_job_id
     and step = 'post_quote'
     and status in ('scheduled','failed');

  if v_visit is not null and v_address <> '' then
    v_when := private.followup_place(now());
    if v_when >= v_visit then
      v_status := 'skipped';
      v_reason := 'visit_passed';
    else
      v_status := 'scheduled';
      v_reason := '';
    end if;
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'visit:' || v_visit::text || '|' || v_address;
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'visit_confirm', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  end if;

  if v_visit is not null then
    v_when := private.followup_days_at_10(v_visit, -1);
    if v_when >= v_visit then
      v_status := 'skipped';
      v_reason := 'window_after_visit';
    else
      v_status := 'scheduled';
      v_reason := '';
    end if;
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'visit:' || v_visit::text;
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'visit_reminder', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  end if;

  if v_quote_done then
    if coalesce(v_summary, '') = '' then
      v_status := 'skipped';
      v_reason := 'missing_project';
    elsif v_total is null then
      v_status := 'skipped';
      v_reason := 'missing_quote';
    else
      v_status := 'scheduled';
      v_reason := '';
    end if;
    v_when := private.followup_place(v_quote_at);
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'quote:' || v_quote_at::text || '|' || coalesce(v_summary, '') || '|' || coalesce(v_total::text, '');
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'quote_thanks', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);

    if v_outcome = 'undecided' then
      if coalesce(v_summary, '') = '' then
        v_status := 'skipped';
        v_reason := 'missing_project';
      elsif v_total is null then
        v_status := 'skipped';
        v_reason := 'missing_quote';
      else
        v_status := 'scheduled';
        v_reason := '';
      end if;
    else
      v_status := 'skipped';
      v_reason := v_outcome;
    end if;
    v_when := private.followup_days_at_10(v_quote_at, 2);
    if v_when < v_quote_at + interval '48 hours' then
      v_when := private.followup_days_at_10(v_quote_at, 3);
    end if;
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'quote:' || v_quote_at::text || '|' || v_outcome || '|' || coalesce(v_total::text, '');
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'undecided_check', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);

    if v_outcome = 'undecided' then
      v_status := 'scheduled';
      v_reason := '';
    else
      v_status := 'skipped';
      v_reason := v_outcome;
    end if;
    v_when := private.followup_days_at_10(v_quote_at, 7);
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'quote:' || v_quote_at::text || '|' || v_outcome;
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'last_check', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  end if;

  if v_outcome = 'booked' then
    if v_install = '' then
      v_status := 'skipped';
      v_reason := 'missing_install';
    else
      v_status := 'scheduled';
      v_reason := '';
    end if;
    v_when := private.followup_place(now());
    v_block := private.followup_apply_blocks(v_status, v_reason, v_opted, v_consent, v_phone);
    v_anchor := 'install:' || v_install;
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'booked_install', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  elsif exists (
    select 1 from public.job_followups f
    where f.job_id = p_job_id and f.step = 'booked_install' and f.status in ('scheduled','failed','skipped')
  ) then
    v_block := private.followup_apply_blocks('skipped', 'not_booked', v_opted, v_consent, v_phone);
    v_when := private.followup_place(now());
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', 'install:' || v_install);
    perform private.upsert_followup_step(p_job_id, 'booked_install', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  end if;

  if v_visit is not null then
    v_when := private.followup_place(v_visit + interval '2 hours');
    v_block := private.followup_apply_blocks('scheduled', '', v_opted, v_consent, v_phone);
    v_anchor := 'visit:' || v_visit::text;
    v_vars := jsonb_build_object('quoteTotal', v_total, 'project', v_summary, 'visitAt', v_visit, 'address', v_address, 'installDate', v_install, 'anchor', v_anchor);
    perform private.upsert_followup_step(p_job_id, 'review', v_block->>'status', v_outcome, v_when, v_consent, v_phone, v_summary, v_first, v_block->>'reason', v_vars);
  end if;

  update public.job_followups
     set step_vars = jsonb_set(coalesce(step_vars, '{}'::jsonb), '{includeStop}', 'false'::jsonb, true)
   where job_id = p_job_id
     and step <> 'post_quote'
     and status in ('scheduled','failed');

  if v_phone <> '' and not exists (
    select 1 from public.job_followups f
    where f.phone_e164 = v_phone and f.sent_at is not null
  ) then
    update public.job_followups f
       set step_vars = jsonb_set(coalesce(f.step_vars, '{}'::jsonb), '{includeStop}', 'true'::jsonb, true)
     where f.id = (
       select id from public.job_followups
       where job_id = p_job_id
         and status in ('scheduled','failed')
         and step <> 'post_quote'
       order by scheduled_for,
         case step
           when 'visit_confirm' then 1
           when 'visit_reminder' then 2
           when 'quote_thanks' then 3
           when 'booked_install' then 4
           when 'undecided_check' then 5
           when 'last_check' then 6
           when 'review' then 7
           else 9
         end
       limit 1
     );
  end if;
end;
$function$;

create or replace function private.quotes_schedule_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.schedule_job_followup(new.job_id);
  return new;
end;
$function$;

drop trigger if exists job_quotes_schedule_followup on public.job_quotes;
create trigger job_quotes_schedule_followup
  after insert on public.job_quotes
  for each row
  execute function private.quotes_schedule_followup();

create or replace function private.claim_followup_send(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.job_followups%rowtype;
  v_voice boolean;
  v_attempt int;
begin
  if coalesce((select pb.staff_settings #>> '{followups,enabled}' from public.price_book pb where pb.id = 1), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  v_voice := coalesce((select pb.staff_settings #>> '{followups,voiceEnabled}' from public.price_book pb where pb.id = 1), 'false') = 'true';

  select * into v from public.job_followups where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'missing');
  end if;
  if coalesce(v.step, 'post_quote') <> 'post_quote'
     and coalesce((select pb.staff_settings #>> array['followups','steps', v.step] from public.price_book pb where pb.id = 1), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'reason', 'step_disabled');
  end if;
  if v.consent is not true then
    return jsonb_build_object('ok', false, 'reason', 'no_consent');
  end if;
  if v.opted_out_at is not null or v.status = 'opted_out' then
    return jsonb_build_object('ok', false, 'reason', 'opted_out');
  end if;
  if v.phone_e164 is not null and exists (select 1 from public.followup_opt_outs o where o.phone_e164 = v.phone_e164) then
    update public.job_followups
       set status = 'opted_out', opted_out_at = coalesce(opted_out_at, now()), updated_at = now()
     where id = p_id and status in ('scheduled','failed','sending','dry_run');
    return jsonb_build_object('ok', false, 'reason', 'opted_out');
  end if;
  if v.channel = 'voice' and not v_voice then
    return jsonb_build_object('ok', false, 'reason', 'voice_disabled');
  end if;
  if v.channel = 'voice' and v_voice is not true then
    return jsonb_build_object('ok', false, 'reason', 'voice_disabled');
  end if;
  if v.status = 'sending' then
    return jsonb_build_object('ok', false, 'reason', 'in_flight');
  end if;
  if v.status in ('sent','completed','skipped','opted_out','dry_run','sms_not_configured') then
    return jsonb_build_object('ok', false, 'reason', 'already_handled');
  end if;
  if v.status not in ('scheduled','failed') then
    return jsonb_build_object('ok', false, 'reason', 'not_sendable');
  end if;
  if v.attempt_count >= v.max_attempts then
    return jsonb_build_object('ok', false, 'reason', 'retries_exhausted');
  end if;
  if v.provider_ref is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_sent');
  end if;
  if v.scheduled_for > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;

  v_attempt := v.attempt_count + 1;
  update public.job_followups
     set status = 'sending',
         attempt_count = v_attempt,
         updated_at = now()
   where id = p_id
     and status in ('scheduled','failed')
     and attempt_count = v.attempt_count;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'in_flight');
  end if;
  return jsonb_build_object(
    'ok', true,
    'attempt', v_attempt,
    'idempotencyKey', p_id::text || ':' || v_attempt::text,
    'channel', v.channel
  );
end;
$function$;

create or replace function public.owner_set_followup_settings(p_enabled boolean, p_dry_run boolean, p_voice_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb;
  v_flags jsonb;
  v_steps jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change follow-up switches' using errcode = '42501';
  end if;
  select staff_settings->'followups' into v_old from public.price_book where id = 1 for update;
  v_steps := coalesce(v_old->'steps', '{}'::jsonb);
  v_flags := jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'dryRun', coalesce(p_dry_run, true),
    'voiceEnabled', coalesce(p_voice_enabled, false),
    'steps', v_steps
  );
  perform set_config('es.price_book_version_assigned', 'on', true);
  perform set_config('es.price_change_reason', 'Follow-up switches', true);
  update public.price_book
     set staff_settings = jsonb_set(coalesce(staff_settings, '{}'::jsonb), '{followups}', v_flags, true),
         version = version + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where id = 1;
  return v_flags;
end;
$function$;

create or replace function public.owner_set_followup_settings(
  p_enabled boolean,
  p_dry_run boolean,
  p_voice_enabled boolean,
  p_steps jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_flags jsonb;
  v_steps jsonb := '{}'::jsonb;
  v_key text;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change follow-up switches' using errcode = '42501';
  end if;
  if p_steps is not null and jsonb_typeof(p_steps) <> 'object' then
    raise exception 'steps must be a JSON object' using errcode = '22023';
  end if;
  foreach v_key in array ARRAY['visit_confirm','visit_reminder','quote_thanks','booked_install','undecided_check','last_check','review']::text[]
  loop
    v_steps := v_steps || jsonb_build_object(
      v_key,
      coalesce(p_steps->>v_key, 'false') in ('true') or coalesce(p_steps->v_key, 'false'::jsonb) = 'true'::jsonb
    );
  end loop;
  v_flags := jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'dryRun', coalesce(p_dry_run, true),
    'voiceEnabled', coalesce(p_voice_enabled, false),
    'steps', v_steps
  );
  perform set_config('es.price_book_version_assigned', 'on', true);
  perform set_config('es.price_change_reason', 'Follow-up switches', true);
  update public.price_book
     set staff_settings = jsonb_set(coalesce(staff_settings, '{}'::jsonb), '{followups}', v_flags, true),
         version = version + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where id = 1;
  return v_flags;
end;
$function$;

create or replace function public.list_followups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_owner boolean;
  v_rows jsonb;
  v_settings jsonb;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  v_owner := private.is_owner();
  if v_owner then
    select private.followup_settings() into v_settings;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id,
      'jobId', f.job_id,
      'jobNumber', j.job_number,
      'customerFirstName', f.customer_first_name,
      'status', f.status,
      'channel', f.channel,
      'step', f.step,
      'jobOutcome', f.job_outcome,
      'scheduledFor', f.scheduled_for,
      'sentAt', f.sent_at,
      'attemptCount', f.attempt_count,
      'lastError', f.last_error,
      'consent', f.consent,
      'optedOutAt', f.opted_out_at,
      'dryRun', f.dry_run,
      'callStatus', f.call_status,
      'transcriptSummary', f.transcript_summary,
      'callAnalysis', f.call_analysis,
      'surveyAnswers', f.survey_answers,
      'outcomeReason', f.outcome_reason,
      'projectSummary', f.project_summary,
      'inboundReplies', f.inbound_replies,
      'surveyUsedAt', f.survey_used_at,
      'stepVars', f.step_vars,
      'visitConfirmedAt', f.visit_confirmed_at
    ) order by j.job_number, f.scheduled_for), '[]'::jsonb)
      into v_rows
    from public.job_followups f
    join public.jobs j on j.id = f.job_id;
    return jsonb_build_object(
      'role', 'owner',
      'settings', coalesce(v_settings, '{"enabled":false,"dryRun":true,"voiceEnabled":false}'::jsonb),
      'rows', v_rows
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'jobId', f.job_id,
    'jobNumber', j.job_number,
    'customerFirstName', f.customer_first_name,
    'status', f.status,
    'step', f.step,
    'scheduledFor', f.scheduled_for,
    'sentAt', f.sent_at
  ) order by f.scheduled_for desc), '[]'::jsonb)
    into v_rows
  from public.job_followups f
  join public.jobs j on j.id = f.job_id
  where private.user_can_access_job(auth.uid(), f.job_id);
  return jsonb_build_object('role', 'employee', 'rows', v_rows);
end;
$function$;

revoke all on function private.followup_quote_total(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.followup_visit_at(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.followup_place(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.followup_days_at_10(timestamptz, int) from public, anon, authenticated, service_role;
revoke all on function private.followup_apply_blocks(text, text, boolean, boolean, text) from public, anon, authenticated, service_role;
revoke all on function private.upsert_followup_step(uuid, text, text, text, timestamptz, boolean, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.quotes_schedule_followup() from public, anon, authenticated, service_role;
revoke all on function public.owner_set_followup_settings(boolean, boolean, boolean, jsonb) from public, anon, service_role;
grant execute on function public.owner_set_followup_settings(boolean, boolean, boolean, jsonb) to authenticated;
grant execute on function private.followup_settings() to service_role;
