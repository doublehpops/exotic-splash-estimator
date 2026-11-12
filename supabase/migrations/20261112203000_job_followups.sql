-- Post-quote follow-up texts. Not applied by the pull request that adds this file.
-- Do not run this against the live project from the draft. Nothing here sends a text.
--
-- followups.enabled defaults false, followups.dryRun defaults true, and
-- followups.voiceEnabled defaults false. Voice rows are not inserted.
-- No prices, costs, margins, or secrets are stored.

create extension if not exists pgcrypto with schema extensions;

alter table public.jobs
  add column if not exists followup_consent boolean not null default false;

create table if not exists public.job_followups (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.jobs (id) on delete cascade,
  status text not null default 'scheduled',
  channel text not null default 'sms',
  job_outcome text not null default 'undecided',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  provider text,
  provider_ref text,
  consent boolean not null default false,
  opted_out_at timestamptz,
  dry_run boolean not null default false,
  call_status text,
  transcript_summary text,
  call_analysis jsonb,
  sms_body text,
  inbound_replies jsonb not null default '[]'::jsonb,
  survey_token text,
  survey_token_hash text unique,
  survey_used_at timestamptz,
  survey_answers jsonb,
  outcome_reason text,
  project_summary text,
  customer_first_name text,
  phone_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_followups_status_check check (status in (
    'scheduled','sending','sent','failed','completed','skipped','sms_not_configured','opted_out','dry_run'
  )),
  constraint job_followups_channel_check check (channel in ('sms','voice')),
  constraint job_followups_outcome_check check (job_outcome in ('booked','declined','undecided')),
  constraint job_followups_attempts_check check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts + 5),
  constraint job_followups_replies_array check (jsonb_typeof(inbound_replies) = 'array')
);

create index if not exists job_followups_due_idx
  on public.job_followups (scheduled_for)
  where status in ('scheduled','failed');

create index if not exists job_followups_phone_idx
  on public.job_followups (phone_e164);

create table if not exists public.followup_opt_outs (
  phone_e164 text primary key,
  opted_out_at timestamptz not null default now(),
  source text,
  followup_id uuid
);

create table if not exists public.followup_events (
  id bigint generated always as identity primary key,
  followup_id uuid,
  job_id uuid,
  at timestamptz not null default now(),
  kind text not null,
  detail jsonb
);

alter table public.job_followups enable row level security;
alter table public.followup_opt_outs enable row level security;
alter table public.followup_events enable row level security;
alter table public.job_followups force row level security;
alter table public.followup_opt_outs force row level security;
alter table public.followup_events force row level security;

revoke all on table public.job_followups from public, anon, authenticated;
revoke all on table public.followup_opt_outs from public, anon, authenticated;
revoke all on table public.followup_events from public, anon, authenticated;
grant select, insert, update, delete on table public.job_followups to service_role;
grant select, insert, update, delete on table public.followup_opt_outs to service_role;
grant select, insert, update, delete on table public.followup_events to service_role;
grant usage, select on sequence public.followup_events_id_seq to service_role;

-- Employees can read status columns for their own jobs. Survey answers, replies,
-- tokens, and phone numbers are not granted. Owners read the full row through
-- security definer functions below (the function owner bypasses column grants).
grant select (
  id, job_id, status, channel, scheduled_for, sent_at, updated_at, customer_first_name
) on table public.job_followups to authenticated;

drop policy if exists job_followups_owner_all on public.job_followups;
create policy job_followups_owner_all on public.job_followups
  for all to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

drop policy if exists job_followups_employee_select on public.job_followups;
create policy job_followups_employee_select on public.job_followups
  for select to authenticated
  using (
    (select private.is_active_staff())
    and not (select private.is_owner())
    and (select private.can_access_job(job_id))
  );

drop policy if exists followup_opt_outs_owner on public.followup_opt_outs;
create policy followup_opt_outs_owner on public.followup_opt_outs
  for all to authenticated
  using ((select private.is_owner()))
  with check ((select private.is_owner()));

drop policy if exists followup_events_owner on public.followup_events;
create policy followup_events_owner on public.followup_events
  for select to authenticated
  using ((select private.is_owner()));

-- Status-only view. security_invoker so the employee's row policy still applies.
create or replace view public.followup_status_v
with (security_invoker = true) as
select id, job_id, status, channel, scheduled_for, sent_at, updated_at, customer_first_name
from public.job_followups;

revoke all on table public.followup_status_v from public, anon, authenticated;
grant select on table public.followup_status_v to authenticated;

-- Price-book switches. Missing keys mean the safe defaults.
do $migration$
declare
  v_staff jsonb;
  v_row public.price_book%rowtype;
  v_flags jsonb := jsonb_build_object('enabled', false, 'dryRun', true, 'voiceEnabled', false);
begin
  perform set_config('es.price_book_version_assigned', 'on', true);
  select * into v_row from public.price_book where id = 1;
  if found then
    v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
    if jsonb_typeof(v_staff) is distinct from 'object' then
      v_staff := '{}'::jsonb;
    end if;
    if jsonb_typeof(v_staff->'followups') is distinct from 'object' then
      v_staff := jsonb_set(v_staff, '{followups}', v_flags, true);
    else
      v_staff := jsonb_set(
        v_staff,
        '{followups}',
        (v_staff->'followups') || jsonb_strip_nulls(jsonb_build_object(
          'enabled', case when v_staff #>> '{followups,enabled}' is null then false else null end,
          'dryRun', case when v_staff #>> '{followups,dryRun}' is null then true else null end,
          'voiceEnabled', case when v_staff #>> '{followups,voiceEnabled}' is null then false else null end
        )),
        true
      );
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

create or replace function private.validate_price_book_payload(p_staff jsonb, p_owner jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_key text;
  v_pct numeric;
begin
  if p_staff is not null then
    if jsonb_typeof(p_staff) <> 'object' then
      raise exception 'staff settings must be a JSON object' using errcode = '22023';
    end if;
    for v_key in select jsonb_object_keys(p_staff) loop
      if v_key not in ('business','rates','pricingOptions','addOn','approvedAdjustment','catalog','notes','followups') then
        raise exception 'Unknown or owner-only section "%" in staff price book', v_key using errcode = '22023';
      end if;
    end loop;
    if p_staff ? 'followups' then
      if jsonb_typeof(p_staff->'followups') <> 'object' then
        raise exception 'followups settings must be a JSON object' using errcode = '22023';
      end if;
    end if;
    if jsonb_path_exists(p_staff, 'lax $.** ? (@.type() == "number" && @ < 0)') then
      raise exception 'Prices, rates and limits cannot be negative' using errcode = '22023';
    end if;
    if p_staff ? 'approvedAdjustment' then
      if coalesce(p_staff #>> '{approvedAdjustment,mode}', 'amount') not in ('amount','pct') then
        raise exception 'approvedAdjustment.mode must be amount or pct' using errcode = '22023';
      end if;
      v_pct := nullif(p_staff #>> '{approvedAdjustment,pct}', '')::numeric;
      if v_pct is not null and v_pct > 100 then
        raise exception 'approvedAdjustment.pct cannot exceed 100' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_owner is not null then
    if jsonb_typeof(p_owner) <> 'object' then
      raise exception 'owner settings must be a JSON object' using errcode = '22023';
    end if;
    for v_key in select jsonb_object_keys(p_owner) loop
      if v_key not in ('products','costs') then
        raise exception 'Unknown section "%" in owner price book', v_key using errcode = '22023';
      end if;
    end loop;
    if jsonb_path_exists(p_owner, 'lax $.** ? (@.type() == "number" && @ < 0)') then
      raise exception 'Costs cannot be negative' using errcode = '22023';
    end if;
  end if;
end;
$function$;

-- Keep followups when the staff app saves the price book without that key.
create or replace function public.owner_update_price_book(p_staff_settings jsonb, p_owner_settings jsonb, p_expected_version integer, p_reason text default null::text)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current int;
  v_staff jsonb;
  v_followups jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change product prices, rates, costs, markup or discount limits'
      using errcode = '42501';
  end if;

  perform private.validate_price_book_payload(p_staff_settings, p_owner_settings);

  select version, staff_settings->'followups'
    into v_current, v_followups
  from public.price_book
  where id = 1
  for update;
  if p_expected_version is null or p_expected_version <> v_current then
    raise exception 'Price book changed since you loaded it (server version %, yours %). Reload and re-apply.',
      v_current, p_expected_version using errcode = '40001';
  end if;

  v_staff := p_staff_settings;
  if v_staff is not null and not (v_staff ? 'followups') and v_followups is not null then
    v_staff := v_staff || jsonb_build_object('followups', v_followups);
  end if;

  perform set_config('es.price_change_reason', coalesce(p_reason, ''), true);
  perform set_config('es.price_book_version_assigned', 'on', true);

  update public.price_book
     set staff_settings = coalesce(v_staff, staff_settings),
         version = version + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where id = 1;

  if p_owner_settings is not null then
    update public.price_book_owner
       set owner_settings = p_owner_settings,
           updated_at = now(),
           updated_by = auth.uid()
     where id = 1;
  end if;

  return v_current + 1;
end;
$function$;

create or replace function public.owner_set_followup_settings(p_enabled boolean, p_dry_run boolean, p_voice_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_flags jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change follow-up switches' using errcode = '42501';
  end if;
  v_flags := jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'dryRun', coalesce(p_dry_run, true),
    'voiceEnabled', coalesce(p_voice_enabled, false)
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
    'voiceEnabled', coalesce(pb.staff_settings #>> '{followups,voiceEnabled}', 'false') = 'true'
  )
  from public.price_book pb
  where pb.id = 1;
$function$;

-- Next calendar day at 10:00 America/Chicago. 10:00 is inside 9:00–20:00.
-- 20:00 is outside the window and rolls to the next 9:00.
create or replace function private.next_followup_at(p_from timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_local timestamp;
  v_day date;
  v_target timestamp;
  v_hour int;
begin
  v_local := p_from at time zone 'America/Chicago';
  v_day := v_local::date + 1;
  v_target := v_day + time '10:00';
  v_hour := extract(hour from v_target)::int;
  if v_hour < 9 then
    v_target := v_day + time '09:00';
  elsif v_hour >= 20 then
    v_target := (v_day + 1) + time '09:00';
  end if;
  return v_target at time zone 'America/Chicago';
end;
$function$;

create or replace function private.roll_contact_window(p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_local timestamp;
  v_hour int;
begin
  v_local := p_at at time zone 'America/Chicago';
  v_hour := extract(hour from v_local)::int;
  if v_hour >= 9 and v_hour < 20 then
    return p_at;
  end if;
  if v_hour < 9 then
    return (v_local::date + time '09:00') at time zone 'America/Chicago';
  end if;
  return ((v_local::date + 1) + time '09:00') at time zone 'America/Chicago';
end;
$function$;

create or replace function private.followup_e164(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_raw text := btrim(coalesce(p_phone, ''));
  v_digits text := regexp_replace(v_raw, '\D', '', 'g');
begin
  if length(v_digits) = 10 then
    return '+1' || v_digits;
  end if;
  if length(v_digits) = 11 and left(v_digits, 1) = '1' then
    return '+' || v_digits;
  end if;
  if left(v_raw, 1) = '+' and length(v_digits) between 10 and 15 then
    return '+' || v_digits;
  end if;
  return '';
end;
$function$;

create or replace function private.followup_project_summary(p_job jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_type text := coalesce(p_job->>'projectType', 'floor');
  v_pkg text := coalesce(p_job->>'garagePackage', '');
  v_style text := coalesce(p_job->>'garageStyle', '');
  v_size text;
  v_styles text;
begin
  if v_type = 'garage' then
    v_size := case v_pkg
      when '1car' then '1-car'
      when '2car' then '2-car'
      when '3car' then '3-car'
      when 'measured' then 'measured'
      else 'garage'
    end;
    if v_style = '' then v_style := 'epoxy'; end if;
    if v_size = 'garage' then
      return left(v_size || ', ' || v_style, 160);
    end if;
    return left(v_size || ' garage, ' || v_style, 160);
  end if;
  if v_type = 'flatwork' then return 'countertop'; end if;
  if v_type = 'seating' then return 'seating'; end if;
  select string_agg(distinct a->>'style', ' and ' order by a->>'style')
    into v_styles
  from jsonb_array_elements(coalesce(p_job->'areas', '[]'::jsonb)) a
  where coalesce(a->>'style', '') <> '';
  if coalesce(v_styles, '') = '' then return 'floor'; end if;
  return left(v_styles || ' floor', 160);
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
  v_row public.job_followups%rowtype;
  v_token text;
  v_hash text;
  v_when timestamptz;
  v_status text;
  v_reason text;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found then return; end if;

  v_decision := lower(btrim(coalesce(v_job.job_data->>'quoteDecision', '')));
  if v_job.status not in ('quoted','issued')
     and v_decision not in ('booked','accepted','declined','undecided') then
    return;
  end if;

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

  select * into v_row from public.job_followups where job_id = p_job_id for update;
  if found and v_row.status in ('sent','completed','sending','dry_run','failed','sms_not_configured','opted_out') then
    return;
  end if;

  if v_opted then
    v_status := 'opted_out';
    v_reason := 'opted_out';
  elsif not v_consent then
    v_status := 'skipped';
    v_reason := 'no_consent';
  elsif v_phone = '' then
    v_status := 'skipped';
    v_reason := 'no_phone';
  else
    v_status := 'scheduled';
    v_reason := null;
  end if;

  if found and v_row.status = 'scheduled' and v_status = 'scheduled' then
    v_when := v_row.scheduled_for;
  elsif found and v_status <> 'scheduled' then
    v_when := v_row.scheduled_for;
  else
    v_when := private.next_followup_at(now());
  end if;

  if not found then
    v_token := 'svy_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    v_hash := private.share_token_hash(v_token);
    insert into public.job_followups (
      job_id, status, channel, job_outcome, scheduled_for, consent, phone_e164,
      project_summary, customer_first_name, survey_token, survey_token_hash, last_error
    ) values (
      p_job_id, v_status, 'sms', v_outcome, v_when, v_consent, nullif(v_phone, ''),
      v_summary, nullif(v_first, ''), v_token, v_hash, v_reason
    );
    return;
  end if;

  update public.job_followups
     set status = v_status,
         channel = 'sms',
         job_outcome = v_outcome,
         scheduled_for = v_when,
         consent = v_consent,
         phone_e164 = nullif(v_phone, ''),
         project_summary = v_summary,
         customer_first_name = nullif(v_first, ''),
         last_error = v_reason,
         updated_at = now()
   where id = v_row.id
     and (
       status is distinct from v_status
       or job_outcome is distinct from v_outcome
       or scheduled_for is distinct from v_when
       or consent is distinct from v_consent
       or phone_e164 is distinct from nullif(v_phone, '')
       or project_summary is distinct from v_summary
       or customer_first_name is distinct from nullif(v_first, '')
       or last_error is distinct from v_reason
     );
end;
$function$;

create or replace function private.jobs_sync_followup_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.followup_consent := coalesce(new.job_data->'followupConsent' = 'true'::jsonb, false);
  return new;
end;
$function$;

create or replace function private.jobs_schedule_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('es.followup_scheduling', true) = 'on' then
    return new;
  end if;
  perform set_config('es.followup_scheduling', 'on', true);
  perform private.schedule_job_followup(new.id);
  return new;
end;
$function$;

drop trigger if exists jobs_sync_followup_consent on public.jobs;
create trigger jobs_sync_followup_consent
  before insert or update of job_data on public.jobs
  for each row
  execute function private.jobs_sync_followup_consent();

drop trigger if exists jobs_schedule_followup on public.jobs;
create trigger jobs_schedule_followup
  after insert or update of status, job_data on public.jobs
  for each row
  execute function private.jobs_schedule_followup();

create or replace function private.acceptances_schedule_followup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if current_setting('es.followup_scheduling', true) = 'on' then
    return new;
  end if;
  perform set_config('es.followup_scheduling', 'on', true);
  for v_id in
    select j.id from public.jobs j
    where j.job_number = new.estimate_number
      and coalesce(new.estimate_number, '') <> ''
  loop
    update public.jobs
       set job_data = jsonb_set(coalesce(job_data, '{}'::jsonb), '{quoteDecision}', '"booked"', true)
     where id = v_id
       and coalesce(job_data->>'quoteDecision', '') is distinct from 'booked';
    perform private.schedule_job_followup(v_id);
  end loop;
  return new;
end;
$function$;

drop trigger if exists estimate_acceptances_schedule_followup on public.estimate_acceptances;
create trigger estimate_acceptances_schedule_followup
  after insert on public.estimate_acceptances
  for each row
  execute function private.acceptances_schedule_followup();

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
      'surveyUsedAt', f.survey_used_at
    ) order by f.scheduled_for desc), '[]'::jsonb)
      into v_rows
    from public.job_followups f
    join public.jobs j on j.id = f.job_id;
    return jsonb_build_object('role', 'owner', 'settings', coalesce(v_settings, '{"enabled":false,"dryRun":true,"voiceEnabled":false}'::jsonb), 'rows', v_rows);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'jobId', f.job_id,
    'jobNumber', j.job_number,
    'customerFirstName', f.customer_first_name,
    'status', f.status,
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

create or replace function public.followup_owner_action(p_id uuid, p_action text, p_when timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.job_followups%rowtype;
  v_when timestamptz;
  v_action text := lower(btrim(coalesce(p_action, '')));
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change a follow-up' using errcode = '42501';
  end if;
  select * into v from public.job_followups where id = p_id for update;
  if not found then
    raise exception 'Follow-up was not found' using errcode = 'P0002';
  end if;
  if v_action = 'skip' then
    update public.job_followups
       set status = 'skipped', last_error = 'skipped', updated_at = now()
     where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'skipped');
  end if;
  if v_action = 'text_now' then
    if v.consent is not true then
      raise exception 'The customer has not agreed to a follow-up text' using errcode = '42501';
    end if;
    if v.opted_out_at is not null then
      raise exception 'This number opted out' using errcode = '42501';
    end if;
    v_when := private.roll_contact_window(now());
    update public.job_followups
       set status = 'scheduled',
           channel = 'sms',
           scheduled_for = v_when,
           attempt_count = 0,
           provider_ref = null,
           last_error = null,
           dry_run = false,
           updated_at = now()
     where id = p_id;
    perform private.invoke_followup_dispatch();
    return jsonb_build_object('ok', true, 'status', 'scheduled', 'scheduledFor', v_when);
  end if;
  if v_action = 'reschedule' then
    if p_when is null then
      raise exception 'Choose a time' using errcode = '22023';
    end if;
    v_when := private.roll_contact_window(p_when);
    update public.job_followups
       set status = 'scheduled',
           channel = 'sms',
           scheduled_for = v_when,
           attempt_count = 0,
           provider_ref = null,
           last_error = null,
           updated_at = now()
     where id = p_id;
    return jsonb_build_object('ok', true, 'status', 'scheduled', 'scheduledFor', v_when);
  end if;
  raise exception 'Unknown follow-up action' using errcode = '22023';
end;
$function$;

create or replace function public.get_followup_survey(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v public.job_followups%rowtype;
begin
  if p_token is null or p_token !~ '^svy_[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  v_hash := private.share_token_hash(p_token);
  select * into v from public.job_followups where survey_token_hash = v_hash;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v.survey_used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;
  return jsonb_build_object(
    'ok', true,
    'questions', jsonb_build_array(
      jsonb_build_object('id','on_time','prompt','Was the estimator on time?','type','yes_no'),
      jsonb_build_object('id','professional','prompt','Was the estimator professional?','type','yes_no'),
      jsonb_build_object('id','explained','prompt','Was everything explained right?','type','yes_no'),
      jsonb_build_object('id','experience','prompt','How did you like the experience?','type','scale_1_5'),
      jsonb_build_object('id','improve','prompt','What should we improve?','type','text'),
      jsonb_build_object('id','booked','prompt','Did you book with us?','type','yes_no'),
      jsonb_build_object('id','why_not','prompt','If not, why?','type','text')
    )
  );
end;
$function$;

create or replace function public.submit_followup_survey(p_token text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_hash text;
  v public.job_followups%rowtype;
  v_on text;
  v_pro text;
  v_ex text;
  v_score int;
  v_improve text;
  v_booked text;
  v_why text;
  v_clean jsonb;
begin
  if p_token is null or p_token !~ '^svy_[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please answer each question');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_answers) k
    where k not in ('on_time','professional','explained','experience','improve','booked','why_not')
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Unknown answer');
  end if;

  v_on := lower(btrim(coalesce(p_answers->>'on_time', '')));
  v_pro := lower(btrim(coalesce(p_answers->>'professional', '')));
  v_ex := lower(btrim(coalesce(p_answers->>'explained', '')));
  v_booked := lower(btrim(coalesce(p_answers->>'booked', '')));
  if v_on in ('y','true') then v_on := 'yes'; elsif v_on in ('n','false') then v_on := 'no'; end if;
  if v_pro in ('y','true') then v_pro := 'yes'; elsif v_pro in ('n','false') then v_pro := 'no'; end if;
  if v_ex in ('y','true') then v_ex := 'yes'; elsif v_ex in ('n','false') then v_ex := 'no'; end if;
  if v_booked in ('y','true') then v_booked := 'yes'; elsif v_booked in ('n','false') then v_booked := 'no'; end if;
  if v_on not in ('yes','no') or v_pro not in ('yes','no') or v_ex not in ('yes','no') or v_booked not in ('yes','no') then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please answer each question');
  end if;
  begin
    v_score := (p_answers->>'experience')::int;
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please rate the experience from 1 to 5');
  end;
  if v_score is null or v_score < 1 or v_score > 5 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please rate the experience from 1 to 5');
  end if;
  v_improve := left(btrim(coalesce(p_answers->>'improve', '')), 1000);
  v_why := left(btrim(coalesce(p_answers->>'why_not', '')), 1000);
  if v_booked = 'no' and v_why = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'Please tell us what held you back');
  end if;
  v_clean := jsonb_build_object(
    'on_time', v_on,
    'professional', v_pro,
    'explained', v_ex,
    'experience', v_score,
    'improve', v_improve,
    'booked', v_booked,
    'why_not', v_why
  );

  v_hash := private.share_token_hash(p_token);
  select * into v from public.job_followups where survey_token_hash = v_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v.survey_used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;

  update public.job_followups
     set survey_answers = v_clean,
         survey_used_at = now(),
         survey_token = null,
         outcome_reason = case when v_booked = 'no' then nullif(v_why, '') else outcome_reason end,
         status = case when status in ('sent','dry_run','sms_not_configured') then 'completed' else status end,
         updated_at = now()
   where id = v.id
     and survey_used_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'used');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function private.followup_settings() from public, anon, authenticated, service_role;
revoke all on function private.next_followup_at(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.roll_contact_window(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.followup_e164(text) from public, anon, authenticated, service_role;
revoke all on function private.followup_project_summary(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.schedule_job_followup(uuid) from public, anon, authenticated, service_role;
revoke all on function private.jobs_sync_followup_consent() from public, anon, authenticated, service_role;
revoke all on function private.jobs_schedule_followup() from public, anon, authenticated, service_role;
revoke all on function private.acceptances_schedule_followup() from public, anon, authenticated, service_role;
revoke all on function private.claim_followup_send(uuid) from public, anon, authenticated, service_role;
grant execute on function private.claim_followup_send(uuid) to service_role;

-- PostgREST only exposes public. The dispatcher calls this with the service role.
create or replace function public.service_claim_followup_send(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private.claim_followup_send(p_id);
$function$;

revoke all on function public.service_claim_followup_send(uuid) from public, anon, authenticated;
grant execute on function public.service_claim_followup_send(uuid) to service_role;
grant execute on function private.followup_settings() to service_role;

revoke all on function public.owner_set_followup_settings(boolean, boolean, boolean) from public, anon, service_role;
revoke all on function public.list_followups() from public, anon, service_role;
revoke all on function public.followup_owner_action(uuid, text, timestamptz) from public, anon, service_role;
revoke all on function public.get_followup_survey(text) from public, service_role;
revoke all on function public.submit_followup_survey(text, jsonb) from public, service_role;
grant execute on function public.owner_set_followup_settings(boolean, boolean, boolean) to authenticated;
grant execute on function public.list_followups() to authenticated;
grant execute on function public.followup_owner_action(uuid, text, timestamptz) to authenticated;
grant execute on function public.get_followup_survey(text) to anon, authenticated;
grant execute on function public.submit_followup_survey(text, jsonb) to anon, authenticated;

-- Replaced by the cron migration once pg_net is available. Text now calls this.
create or replace function private.invoke_followup_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.followup_events (kind, detail)
  values ('cron_skipped', jsonb_build_object('reason', 'Dispatcher cron is not installed yet. Nothing was sent.'));
end;
$function$;

revoke all on function private.invoke_followup_dispatch() from public, anon, authenticated, service_role;
