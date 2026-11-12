-- REFERENCE ONLY. NOT A MIGRATION. DO NOT RUN THIS FILE AGAINST THE LIVE PROJECT.
--
-- Schema-only snapshot of the public and private schemas of the Exotic Splash estimator
-- Supabase project, read from the live Postgres catalog on 2026-11-12 (~2:30 AM CT), after
-- the migrations in supabase/migrations through 20261112080433 were applied.
-- Built from pg_catalog (pg_get_functiondef, pg_get_constraintdef, pg_get_indexdef,
-- pg_get_triggerdef, pg_policies, aclexplode). Not produced by pg_dump or supabase db dump.
--
-- Contains: extensions, sequences, tables, constraints, indexes, functions, triggers,
-- row level security, policies, grants and comments.
-- Does not contain: any row data, seed data, price book values, users, emails, keys or
-- secrets. The auth schema, the storage schema (job-photos bucket and its policies, see
-- supabase/migrations/*_job_photos_storage.sql) and the trigger on auth.users that calls
-- private.handle_new_auth_user() are not included.
--
-- Use it to review the full schema, diff it against a fresh dump, or as a starting point to
-- rebuild an empty project. See supabase/baseline/README.md.


-- Extensions

create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

-- Schemas

create schema if not exists private;

-- Sequences

create sequence if not exists public.price_book_audit_id_seq as bigint start 1 increment 1;
create sequence if not exists public.staff_access_audit_id_seq as bigint start 1 increment 1;

-- Tables

create table public.discount_approvals (
  id uuid default gen_random_uuid() not null,
  estimate_id uuid not null,
  revision text not null,
  tier text not null,
  before_total numeric(12,2) not null,
  after_total numeric(12,2) not null,
  amount numeric(12,2) not null,
  percent numeric(8,4),
  reason text not null,
  requester_id uuid not null,
  requested_at timestamp with time zone default now() not null,
  status text default 'pending'::text not null,
  owner_id uuid,
  decided_at timestamp with time zone,
  applied_at timestamp with time zone,
  owner_note text,
  low_margin_exception boolean default false not null
);

create table public.estimate_acceptances (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  estimate_number text,
  customer_name text,
  accepted_name text not null,
  accepted_note text,
  total numeric(12,2),
  snapshot jsonb not null,
  accepted_at timestamp with time zone default now() not null,
  user_agent text
);

create table public.estimate_shares (
  id uuid default gen_random_uuid() not null,
  job_id uuid not null,
  quote_id uuid not null,
  token_hash bytea not null,
  token_hint text not null,
  created_by uuid not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  revoked_by uuid,
  view_count integer default 0 not null,
  last_viewed_at timestamp with time zone
);

create table public.job_number_counters (
  day date not null,
  last_seq integer default 0 not null
);

create table public.job_owner_pricing (
  job_id uuid not null,
  markup_pct numeric(7,2) not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.job_quote_internal (
  quote_id uuid not null,
  internal jsonb not null
);

create table public.job_quotes (
  id uuid default gen_random_uuid() not null,
  job_id uuid not null,
  job_version integer not null,
  engine_version text not null,
  price_book_version integer not null,
  computed_for uuid not null,
  computed_at timestamp with time zone default now() not null,
  quote_ready boolean not null,
  quote_status text default ''::text not null,
  total numeric(12,2) default 0 not null,
  cap_base numeric(12,2) default 0 not null,
  discount numeric(12,2) default 0 not null,
  cap_amount numeric(12,2) default 0 not null,
  customer_snapshot jsonb not null,
  staff_snapshot jsonb not null
);

create table public.jobs (
  id uuid default gen_random_uuid() not null,
  client_ref text not null,
  job_number text default ''::text not null,
  customer_label text default ''::text not null,
  job_data jsonb not null,
  discount_amount numeric(12,2) default 0 not null,
  discount_set_by uuid,
  status text default 'draft'::text not null,
  created_by uuid default auth.uid() not null,
  assigned_staff uuid[] default '{}'::uuid[] not null,
  version integer default 1 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.price_book (
  id smallint default 1 not null,
  staff_settings jsonb default '{}'::jsonb not null,
  version integer default 1 not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.price_book_audit (
  id bigint generated always as identity not null,
  changed_at timestamp with time zone default now() not null,
  changed_by uuid,
  db_user text default CURRENT_USER not null,
  book text not null,
  section text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  price_book_version integer
);

create table public.price_book_owner (
  id smallint default 1 not null,
  owner_settings jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid
);

create table public.profiles (
  id uuid not null,
  email text,
  full_name text default ''::text not null,
  role text default 'employee'::text not null,
  active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  disabled_at timestamp with time zone,
  disabled_reason text
);

create table public.staff_access_audit (
  id bigint generated always as identity not null,
  at timestamp with time zone default now() not null,
  actor uuid,
  target uuid not null,
  old_role text,
  new_role text,
  old_active boolean,
  new_active boolean,
  reason text
);

-- Constraints

alter table only public.discount_approvals add constraint discount_approvals_pkey PRIMARY KEY (id);
alter table only public.estimate_acceptances add constraint estimate_acceptances_pkey PRIMARY KEY (id);
alter table only public.estimate_shares add constraint estimate_shares_pkey PRIMARY KEY (id);
alter table only public.job_number_counters add constraint job_number_counters_pkey PRIMARY KEY (day);
alter table only public.job_owner_pricing add constraint job_owner_pricing_pkey PRIMARY KEY (job_id);
alter table only public.job_quote_internal add constraint job_quote_internal_pkey PRIMARY KEY (quote_id);
alter table only public.job_quotes add constraint job_quotes_pkey PRIMARY KEY (id);
alter table only public.jobs add constraint jobs_pkey PRIMARY KEY (id);
alter table only public.price_book add constraint price_book_pkey PRIMARY KEY (id);
alter table only public.price_book_audit add constraint price_book_audit_pkey PRIMARY KEY (id);
alter table only public.price_book_owner add constraint price_book_owner_pkey PRIMARY KEY (id);
alter table only public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table only public.staff_access_audit add constraint staff_access_audit_pkey PRIMARY KEY (id);
alter table only public.estimate_acceptances add constraint estimate_acceptances_token_hash_key UNIQUE (token_hash);
alter table only public.estimate_shares add constraint estimate_shares_token_hash_key UNIQUE (token_hash);
alter table only public.jobs add constraint jobs_created_by_client_ref_key UNIQUE (created_by, client_ref);
alter table only public.discount_approvals add constraint discount_approvals_after CHECK (((after_total > (0)::numeric) AND (after_total < before_total)));
alter table only public.discount_approvals add constraint discount_approvals_amount CHECK ((amount > (0)::numeric));
alter table only public.discount_approvals add constraint discount_approvals_status CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'stale'::text, 'consumed'::text])));
alter table only public.job_owner_pricing add constraint job_owner_pricing_markup_pct_check CHECK (((markup_pct >= (0)::numeric) AND (markup_pct <= (1000)::numeric)));
alter table only public.jobs add constraint jobs_client_ref_len CHECK (((char_length(client_ref) >= 1) AND (char_length(client_ref) <= 80)));
alter table only public.jobs add constraint jobs_job_data_object CHECK ((jsonb_typeof(job_data) = 'object'::text));
alter table only public.jobs add constraint jobs_job_data_size CHECK ((pg_column_size(job_data) < 15000000));
alter table only public.jobs add constraint jobs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'quoted'::text, 'issued'::text, 'archived'::text])));
alter table only public.price_book add constraint price_book_id_check CHECK ((id = 1));
alter table only public.price_book add constraint price_book_no_owner_sections CHECK ((NOT (staff_settings ?| ARRAY['costs'::text, 'products'::text])));
alter table only public.price_book add constraint price_book_staff_settings_is_object CHECK ((jsonb_typeof(staff_settings) = 'object'::text));
alter table only public.price_book_audit add constraint price_book_audit_book_check CHECK ((book = ANY (ARRAY['staff'::text, 'owner'::text])));
alter table only public.price_book_owner add constraint price_book_owner_id_check CHECK ((id = 1));
alter table only public.price_book_owner add constraint price_book_owner_is_object CHECK ((jsonb_typeof(owner_settings) = 'object'::text));
alter table only public.profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'employee'::text])));
alter table only public.estimate_shares add constraint estimate_shares_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
alter table only public.estimate_shares add constraint estimate_shares_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES job_quotes(id) ON DELETE CASCADE;
alter table only public.job_owner_pricing add constraint job_owner_pricing_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
alter table only public.job_quote_internal add constraint job_quote_internal_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES job_quotes(id) ON DELETE CASCADE;
alter table only public.job_quotes add constraint job_quotes_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
alter table only public.jobs add constraint jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table only public.price_book_owner add constraint price_book_owner_id_fkey FOREIGN KEY (id) REFERENCES price_book(id);
alter table only public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Indexes

CREATE INDEX estimate_shares_job_idx ON public.estimate_shares USING btree (job_id);
CREATE INDEX job_quotes_job_idx ON public.job_quotes USING btree (job_id, computed_at DESC);
CREATE INDEX jobs_assigned_idx ON public.jobs USING gin (assigned_staff);
CREATE INDEX jobs_created_by_idx ON public.jobs USING btree (created_by);
CREATE UNIQUE INDEX jobs_job_number_unique ON public.jobs USING btree (job_number);
-- Live-only index, not created by any migration in this repo at snapshot time:
-- CREATE INDEX jobs_updated_at_id_desc_idx ON public.jobs USING btree (updated_at DESC, id DESC);

-- Functions

set check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.audit_price_book_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_book text;
  v_key text;
  v_version int;
  v_reason text := nullif(current_setting('es.price_change_reason', true), '');
begin
  if tg_table_name = 'price_book' then
    v_old := old.staff_settings; v_new := new.staff_settings; v_book := 'staff'; v_version := new.version;
  else
    v_old := old.owner_settings; v_new := new.owner_settings; v_book := 'owner';
    select pb.version into v_version from public.price_book pb where pb.id = 1;
  end if;

  for v_key in
    select k from (
      select jsonb_object_keys(coalesce(v_old, '{}'::jsonb)) as k
      union
      select jsonb_object_keys(coalesce(v_new, '{}'::jsonb))
    ) keys
  loop
    if (v_old -> v_key) is distinct from (v_new -> v_key) then
      insert into public.price_book_audit (changed_by, book, section, old_value, new_value, reason, price_book_version)
      values (auth.uid(), v_book, v_key, v_old -> v_key, v_new -> v_key, left(v_reason, 500), v_version);
    end if;
  end loop;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.discount_approvals%rowtype;
  v_before numeric(12,2);
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.user_can_access_job(auth.uid(), p_estimate_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v from public.discount_approvals where id = p_id for update;
  if not found then
    raise exception 'Approval request was not found' using errcode = 'P0002';
  end if;
  if v.status = 'pending' then
    raise exception 'A pending request does not reduce the customer price' using errcode = '40001';
  end if;
  if v.status = 'rejected' then
    raise exception 'A rejected request does not reduce the customer price' using errcode = '40001';
  end if;
  if v.status = 'consumed' then
    raise exception 'This approval was already applied' using errcode = '40001';
  end if;
  if v.status = 'stale' then
    raise exception 'This approval is stale' using errcode = '40001';
  end if;
  if v.status <> 'approved' then
    raise exception 'This approval cannot be applied' using errcode = '40001';
  end if;
  if v.estimate_id <> p_estimate_id then
    raise exception 'This approval belongs to a different estimate' using errcode = '40001';
  end if;
  v_before := round(p_before_total, 2);
  if v.tier <> coalesce(p_tier,'') or v.revision <> coalesce(p_revision,'') or v.before_total <> v_before then
    if coalesce(p_mark_stale, false) or coalesce(p_consume, false) then
      update public.discount_approvals set status = 'stale' where id = p_id and status = 'approved';
    end if;
    return jsonb_build_object('ok', false, 'code', 'stale_approval', 'error', 'The estimate changed after approval');
  end if;
  if coalesce(p_consume, false) then
    update public.discount_approvals
      set status = 'consumed', applied_at = now()
      where id = p_id and status = 'approved';
    if not found then
      raise exception 'This approval was already applied' using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', v.id, 'status', case when coalesce(p_consume, false) then 'consumed' else 'approved' end,
    'amount', v.amount, 'beforeTotal', v.before_total, 'afterTotal', v.after_total,
    'estimateId', v.estimate_id, 'tier', v.tier
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.bootstrap_first_owner(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'An owner already exists; bootstrap is disabled. Use owner_set_staff_access from the owner account.'
      using errcode = '42501';
  end if;

  select u.id into v_id
    from auth.users u
   where lower(u.email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'No Supabase Auth user with email %. Create/invite the user in Authentication > Users first.', p_email;
  end if;

  insert into public.profiles (id, email, role, active)
  values (v_id, trim(p_email), 'owner', true)
  on conflict (id) do update
    set role = 'owner', active = true, disabled_at = null, disabled_reason = null, updated_at = now();

  insert into public.staff_access_audit (actor, target, old_role, new_role, old_active, new_active, reason)
  values (null, v_id, null, 'owner', null, true, 'bootstrap_first_owner (SQL editor)');

  return v_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.can_access_job(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.user_can_access_job(auth.uid(), p_job)
$function$
;
CREATE OR REPLACE FUNCTION private.can_touch_job_photo(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job uuid;
begin
  if not private.is_active_staff() then
    return false;
  end if;
  begin
    v_job := split_part(coalesce(p_name, ''), '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return private.user_can_access_job(auth.uid(), v_job);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.customer_safe_lines(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'label', l ->> 'label',
           'description', l ->> 'description',
           'qty', l -> 'qty',
           'unit', l ->> 'unit',
           'rate', l -> 'rate',
           'total', l -> 'total',
           'pending', l -> 'pending'))), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) l
$function$
;
CREATE OR REPLACE FUNCTION private.customer_safe_payments(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('pct', x -> 'pct', 'label', x ->> 'label', 'amount', x -> 'amount')), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) x
$function$
;
CREATE OR REPLACE FUNCTION private.customer_safe_snapshot(s jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case when s is null or jsonb_typeof(s) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'schema', 1,
    'business', jsonb_build_object(
        'name', s #>> '{business,name}', 'address', s #>> '{business,address}',
        'phone', s #>> '{business,phone}', 'email', s #>> '{business,email}'),
    'document', jsonb_build_object(
        'type', case when s #>> '{document,type}' = 'invoice' then 'invoice' else 'estimate' end,
        'number', s #>> '{document,number}', 'date', s #>> '{document,date}'),
    'customer', jsonb_build_object(
        'name', s #>> '{customer,name}', 'company', s #>> '{customer,company}',
        'address', s #>> '{customer,address}'),
    'project', jsonb_build_object(
        'catalog', s #> '{project,catalog}', 'type', s #>> '{project,type}',
        'package', s #>> '{project,package}', 'itemCount', s #> '{project,itemCount}',
        'sqft', s #> '{project,sqft}'),
    'lines', private.customer_safe_lines(s -> 'lines'),
    'catalogStarting', private.customer_safe_lines(s -> 'catalogStarting'),
    'catalogAdjustments', private.customer_safe_lines(s -> 'catalogAdjustments'),
    'scope', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', a ->> 'name', 'sqft', a -> 'sqft', 'description', a ->> 'description',
                 'grip', a -> 'grip', 'topcoat', a -> 'topcoat', 'moisture', a -> 'moisture',
                 'color', a ->> 'color', 'flakeBlend', a ->> 'flakeBlend')), '[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(s -> 'scope') = 'array' then s -> 'scope' else '[]'::jsonb end) a),
    'prepNotes', (select coalesce(jsonb_agg(to_jsonb(left(p #>> '{}', 600))), '[]'::jsonb)
                    from jsonb_array_elements(case when jsonb_typeof(s -> 'prepNotes') = 'array' then s -> 'prepNotes' else '[]'::jsonb end) p),
    'totals', jsonb_build_object(
        'base', s #> '{totals,base}', 'adjustment', s #> '{totals,adjustment}',
        'minimum', s #> '{totals,minimum}', 'discount', s #> '{totals,discount}',
        'subtotal', s #> '{totals,subtotal}', 'taxPct', s #> '{totals,taxPct}',
        'salesTax', s #> '{totals,salesTax}', 'total', s #> '{totals,total}',
        'perSqft', s #> '{totals,perSqft}'),
    'selected', jsonb_build_object(
        'key', s #>> '{selected,key}', 'label', s #>> '{selected,label}', 'short', s #>> '{selected,short}',
        'rate', s #> '{selected,rate}', 'payments', private.customer_safe_payments(s #> '{selected,payments}')),
    'options', (select coalesce(jsonb_agg(jsonb_build_object(
                  'key', o ->> 'key', 'label', o ->> 'label', 'rate', o -> 'rate', 'total', o -> 'total',
                  'savings', o -> 'savings', 'savingsPct', o -> 'savingsPct',
                  'payments', private.customer_safe_payments(o -> 'payments'))), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(s -> 'options') = 'array' then s -> 'options' else '[]'::jsonb end) o),
    'showOptions', s -> 'showOptions',
    'addOn', jsonb_build_object('included', s #> '{addOn,included}', 'label', s #>> '{addOn,label}', 'rate', s #> '{addOn,rate}'),
    'allocation', jsonb_build_object(
        'materials', s #> '{allocation,materials}', 'labor', s #> '{allocation,labor}',
        'other', s #> '{allocation,other}', 'subtotal', s #> '{allocation,subtotal}',
        'salesTax', s #> '{allocation,salesTax}', 'total', s #> '{allocation,total}'),
    'quoteReady', coalesce((s ->> 'quoteReady')::boolean, false),
    'quoteStatus', s ->> 'quoteStatus',
    'pendingReasons', (select coalesce(jsonb_agg(to_jsonb(left(r #>> '{}', 300))), '[]'::jsonb)
                         from jsonb_array_elements(case when jsonb_typeof(s -> 'pendingReasons') = 'array' then s -> 'pendingReasons' else '[]'::jsonb end) r),
    'priceNotes', left(s ->> 'priceNotes', 4000),
    'terms', left(s ->> 'terms', 8000),
    'jobNotes', left(s ->> 'jobNotes', 8000)
  )) end
$function$
;
CREATE OR REPLACE FUNCTION private.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.discount_approvals%rowtype;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can approve or reject an extra discount' using errcode = '42501';
  end if;
  select * into v from public.discount_approvals where id = p_id for update;
  if not found then
    raise exception 'Approval request was not found' using errcode = 'P0002';
  end if;
  if v.status <> 'pending' then
    raise exception 'This request is no longer pending' using errcode = '40001';
  end if;
  if p_amount is not null and round(p_amount, 2) <> v.amount then
    raise exception 'The approved amount cannot be changed' using errcode = '40001';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Decision must be approve or reject' using errcode = '22023';
  end if;
  update public.discount_approvals set
    status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    owner_id = auth.uid(),
    decided_at = now(),
    owner_note = left(coalesce(p_owner_note,''), 500),
    low_margin_exception = (p_decision = 'approve' and coalesce(p_low_margin_exception, false))
  where id = p_id and status = 'pending';
  return jsonb_build_object('id', p_id, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end, 'amount', v.amount, 'estimateId', v.estimate_id);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.forbid_audit_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'Audit rows are append-only' using errcode = '42501';
end;
$function$
;
CREATE OR REPLACE FUNCTION private.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    'employee',   -- never trust client metadata for role
    false         -- owner must activate
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.is_active_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.staff_role() is not null
$function$
;
CREATE OR REPLACE FUNCTION private.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(private.staff_role() = 'owner', false)
$function$
;
CREATE OR REPLACE FUNCTION private.jnum(p jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) = 'number' then return (p #>> '{}')::numeric; end if;
  if jsonb_typeof(p) = 'string' then
    if btrim(p #>> '{}') = '' then return null; end if;
    return (p #>> '{}')::numeric;
  end if;
  return null;
exception when others then
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.jobs_assign_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.job_number, '') = '' then
      new.job_number := private.next_job_number((timezone('America/Chicago', now()))::date);
    end if;
  elsif old.job_number is not null and new.job_number is distinct from old.job_number then
    new.job_number := old.job_number;
  end if;
  if new.job_number is not null then
    new.job_data := jsonb_set(coalesce(new.job_data, '{}'::jsonb), '{number}', to_jsonb(new.job_number), true);
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.jobs_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION private.next_job_number(p_day date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v integer;
begin
  insert into public.job_number_counters (day, last_seq) values (p_day, 1)
  on conflict (day) do update set last_seq = public.job_number_counters.last_seq + 1
  returning last_seq into v;
  return 'ES-' || to_char(p_day, 'YYYYMMDD') || '-' || lpad(v::text, 2, '0');
end;
$function$
;
CREATE OR REPLACE FUNCTION private.owner_list_discount_requests(p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can list discount requests' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t."requestedAt" desc), '[]'::jsonb) into v
  from (
    select d.id, d.estimate_id as "estimateId", j.job_number as "jobNumber", j.customer_label as "customer",
           d.tier, d.before_total as "beforeTotal", d.after_total as "afterTotal", d.amount, d.percent,
           d.reason, d.status, d.requested_at as "requestedAt", d.decided_at as "decidedAt",
           p.email as "requesterEmail", p.full_name as "requesterName"
    from public.discount_approvals d
    left join public.jobs j on j.id = d.estimate_id
    left join public.profiles p on p.id = d.requester_id
    where coalesce(p_status, '') = '' or d.status = p_status
    order by d.requested_at desc
    limit 200
  ) t;
  return v;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.price_book_apply_version_bump()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(current_setting('es.price_book_version_assigned', true), '') = 'on' then
    return null;
  end if;
  if coalesce(current_setting('es.price_book_staff_needs_bump', true), '') <> 'on' then
    return null;
  end if;

  update public.price_book
     set version = version + 1,
         updated_at = now()
   where id = 1;

  perform set_config('es.price_book_version_assigned', 'on', true);
  perform set_config('es.price_book_staff_needs_bump', '', true);
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.price_book_note_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.staff_settings is distinct from old.staff_settings
     and new.version is not distinct from old.version then
    perform set_config('es.price_book_staff_needs_bump', 'on', true);
  end if;

  if new.version is distinct from old.version then
    perform set_config('es.price_book_version_assigned', 'on', true);
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.price_book_owner_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'UPDATE' and new.owner_settings is not distinct from old.owner_settings then
    return null;
  end if;
  if coalesce(current_setting('es.price_book_version_assigned', true), '') = 'on' then
    return null;
  end if;

  update public.price_book
     set version = version + 1,
         updated_at = now()
   where id = 1;

  perform set_config('es.price_book_version_assigned', 'on', true);
  return null;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_amount numeric(12,2);
  v_before numeric(12,2);
  v_after numeric(12,2);
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not private.user_can_access_job(auth.uid(), p_estimate_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_estimate_id is null or coalesce(p_revision,'') = '' or coalesce(p_tier,'') = '' then
    raise exception 'Estimate, revision, and tier are required' using errcode = '22023';
  end if;
  if coalesce(p_reason,'') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  v_before := round(p_before_total, 2);
  if v_before is null or v_before <= 0 then
    raise exception 'A positive selling total is required' using errcode = '22023';
  end if;
  if (p_amount is null) = (p_percent is null) then
    raise exception 'Send either an amount or a percent' using errcode = '22023';
  end if;
  if p_percent is not null then
    if p_percent <= 0 or p_percent >= 100 then
      raise exception 'Percent must be greater than 0 and less than 100' using errcode = '22023';
    end if;
    v_amount := round(v_before * p_percent / 100, 2);
  else
    v_amount := round(p_amount, 2);
  end if;
  if v_amount is null or v_amount <= 0 or v_amount >= v_before then
    raise exception 'Reduction must leave a selling total above zero' using errcode = '22023';
  end if;
  v_after := round(v_before - v_amount, 2);
  insert into public.discount_approvals (
    estimate_id, revision, tier, before_total, after_total, amount, percent, reason, requester_id, status
  ) values (
    p_estimate_id, p_revision, p_tier, v_before, v_after, v_amount, p_percent, left(p_reason, 500), auth.uid(), 'pending'
  ) returning id into v_id;
  return jsonb_build_object(
    'id', v_id, 'status', 'pending', 'amount', v_amount, 'beforeTotal', v_before, 'afterTotal', v_after, 'tier', p_tier, 'estimateId', p_estimate_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.share_token_hash(p_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$ select encode(pg_catalog.sha256(convert_to(p_token, 'UTF8')), 'hex'); $function$
;
CREATE OR REPLACE FUNCTION private.shared_estimate_payload(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  select to_jsonb(x) into v from public.get_shared_estimate(p_token) x;
  if v is null then return null; end if;
  if v ? 'get_shared_estimate' then v := v -> 'get_shared_estimate'; end if;
  if v is null or jsonb_typeof(v) <> 'object' or not (v ? 'estimate') then return null; end if;
  return v;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.staff_discount_approval(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.discount_approvals%rowtype;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v from public.discount_approvals where id = p_id;
  if not found then
    return null;
  end if;
  if not private.is_owner() and v.requester_id <> auth.uid() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'id', v.id, 'estimateId', v.estimate_id, 'revision', v.revision, 'tier', v.tier,
    'beforeTotal', v.before_total, 'afterTotal', v.after_total, 'amount', v.amount,
    'percent', v.percent, 'reason', v.reason, 'status', v.status, 'requestedAt', v.requested_at
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION private.staff_list_estimate_acceptances()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t."acceptedAt" desc), '[]'::jsonb) into v
  from (
    select a.id, a.estimate_number as "estimateNumber", a.customer_name as "customerName",
           a.accepted_name as "acceptedName", a.accepted_note as "acceptedNote", a.total, a.accepted_at as "acceptedAt"
    from public.estimate_acceptances a
    order by a.accepted_at desc
    limit 200
  ) t;
  return v;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.staff_list_my_discount_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t."requestedAt" desc), '[]'::jsonb) into v
  from (
    select d.id, d.estimate_id as "estimateId", j.job_number as "jobNumber", j.customer_label as "customer",
           d.tier, d.before_total as "beforeTotal", d.after_total as "afterTotal", d.amount, d.percent,
           d.reason, d.status, d.requested_at as "requestedAt", d.decided_at as "decidedAt"
    from public.discount_approvals d
    left join public.jobs j on j.id = d.estimate_id
    where d.requester_id = auth.uid()
    order by d.requested_at desc
    limit 100
  ) t;
  return v;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.staff_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role
    from public.profiles p
   where p.id = auth.uid()
     and p.active
$function$
;
CREATE OR REPLACE FUNCTION private.staff_safe_snapshot(s jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(s, '{}'::jsonb)
         - 'cost' - 'profit' - 'margin' - 'markup' - 'material' - 'mat' - 'tax' - 'labor'
         - 'equipment' - 'equip' - 'direct' - 'overhead' - 'overheadBase' - 'overheadItems'
         - 'contingency' - 'travelCost' - 'travel' - 'hours' - 'internal' - 'costs' - 'products'
$function$
;
CREATE OR REPLACE FUNCTION private.user_can_access_job(p_user uuid, p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
      from public.jobs j
      join public.profiles p on p.id = p_user and p.active
     where j.id = p_job
       and (p.role = 'owner' or j.created_by = p_user or p_user = any (j.assigned_staff))
  )
$function$
;
CREATE OR REPLACE FUNCTION private.user_staff_role(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.role from public.profiles p where p.id = p_user and p.active
$function$
;
CREATE OR REPLACE FUNCTION private.validate_price_book_payload(p_staff jsonb, p_owner jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_key text;
  v_pct numeric;
begin
  if p_staff is not null then
    if jsonb_typeof(p_staff) <> 'object' then
      raise exception 'staff settings must be a JSON object' using errcode = '22023';
    end if;
    for v_key in select jsonb_object_keys(p_staff) loop
      if v_key not in ('business','rates','pricingOptions','addOn','approvedAdjustment','catalog','notes') then
        raise exception 'Unknown or owner-only section "%" in staff price book', v_key using errcode = '22023';
      end if;
    end loop;
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
$function$
;
CREATE OR REPLACE FUNCTION public.accept_shared_estimate(p_token text, p_name text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
  v_est jsonb;
  v_hash text;
  v_name text;
  v_row public.estimate_acceptances%rowtype;
begin
  if p_token !~ '^est_[0-9a-f]{64}$' then
    raise exception 'Invalid link' using errcode = '22023';
  end if;
  v_name := left(btrim(coalesce(p_name, '')), 120);
  if v_name = '' then
    raise exception 'Please enter your name' using errcode = '22023';
  end if;
  v_hash := private.share_token_hash(p_token);
  select * into v_row from public.estimate_acceptances where token_hash = v_hash;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'accepted_at', v_row.accepted_at, 'accepted_name', v_row.accepted_name);
  end if;
  v_payload := private.shared_estimate_payload(p_token);
  if v_payload is null then
    raise exception 'This estimate link is invalid, expired or withdrawn' using errcode = 'P0002';
  end if;
  v_est := v_payload -> 'estimate';
  if coalesce((v_est ->> 'quoteReady')::boolean, false) is not true then
    raise exception 'This estimate is still pending and cannot be accepted yet' using errcode = '22023';
  end if;
  insert into public.estimate_acceptances (token_hash, estimate_number, customer_name, accepted_name, accepted_note, total, snapshot, user_agent)
  values (
    v_hash,
    v_est -> 'document' ->> 'number',
    v_est -> 'customer' ->> 'name',
    v_name,
    left(coalesce(p_note, ''), 1000),
    nullif(v_est -> 'totals' ->> 'total', '')::numeric,
    v_payload,
    left(coalesce(current_setting('request.headers', true)::jsonb ->> 'user-agent', ''), 300)
  )
  returning * into v_row;
  return jsonb_build_object('ok', true, 'already', false, 'accepted_at', v_row.accepted_at, 'accepted_name', v_row.accepted_name);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.bind_extra_discount(p_id, p_estimate_id, p_revision, p_tier, p_before_total, p_consume, p_mark_stale); $function$
;
CREATE OR REPLACE FUNCTION public.create_estimate_share(p_job_id uuid, p_valid_days integer DEFAULT 30)
 RETURNS TABLE(share_id uuid, token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job   public.jobs%rowtype;
  v_quote public.job_quotes%rowtype;
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if not private.can_access_job(p_job_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_valid_days is null or p_valid_days < 1 or p_valid_days > 180 then
    raise exception 'Link lifetime must be 1-180 days' using errcode = '22023';
  end if;

  select * into v_job from public.jobs where id = p_job_id;
  if v_job.status = 'archived' then
    raise exception 'Archived jobs cannot be shared' using errcode = '42501';
  end if;

  select * into v_quote
    from public.job_quotes q
   where q.job_id = p_job_id and q.job_version = v_job.version
   order by q.computed_at desc
   limit 1;
  if not found then
    raise exception 'Verify the quote on the server first (no server quote for the current job version)'
      using errcode = '55000';
  end if;
  if not v_quote.quote_ready then
    raise exception 'Quote is pending â€” starting prices are not configured; cannot issue a customer link'
      using errcode = '55000';
  end if;
  if v_quote.discount > v_quote.cap_amount
     and coalesce(private.user_staff_role(v_job.discount_set_by), 'employee') <> 'owner' then
    raise exception 'Discount exceeds the owner-approved adjustment limit' using errcode = '42501';
  end if;

  v_token := 'est_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_exp := now() + make_interval(days => p_valid_days);

  insert into public.estimate_shares (job_id, quote_id, token_hash, token_hint, created_by, expires_at)
  values (p_job_id, v_quote.id, sha256(convert_to(v_token, 'UTF8')), right(v_token, 6), auth.uid(), v_exp)
  returning id into v_id;

  perform set_config('es.trusted_job_write', 'on', true);
  update public.jobs set status = 'issued' where id = p_job_id and status in ('draft','quoted');
  perform set_config('es.trusted_job_write', '', true);

  return query select v_id, v_token, v_exp;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.decide_extra_discount(p_id, p_decision, p_amount, p_low_margin_exception, p_owner_note); $function$
;
CREATE OR REPLACE FUNCTION public.get_estimate_acceptance(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.estimate_acceptances%rowtype;
begin
  if p_token !~ '^est_[0-9a-f]{64}$' then return null; end if;
  select * into v_row from public.estimate_acceptances where token_hash = private.share_token_hash(p_token);
  if not found then return null; end if;
  return jsonb_build_object('accepted_at', v_row.accepted_at, 'accepted_name', v_row.accepted_name, 'total', v_row.total);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS TABLE(id uuid, email text, full_name text, role text, active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.email, p.full_name, p.role, p.active
    from public.profiles p
   where p.id = auth.uid()
$function$
;
CREATE OR REPLACE FUNCTION public.get_shared_estimate(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_share public.estimate_shares%rowtype;
  v_snap  jsonb;
begin
  if p_token is null or p_token !~ '^est_[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_share
    from public.estimate_shares s
   where s.token_hash = sha256(convert_to(p_token, 'UTF8'))
     and s.revoked_at is null
     and s.expires_at > now();
  if not found then
    return null;
  end if;

  select q.customer_snapshot into v_snap from public.job_quotes q where q.id = v_share.quote_id;

  update public.estimate_shares
     set view_count = view_count + 1, last_viewed_at = now()
   where id = v_share.id;

  return jsonb_build_object(
    'estimate', private.customer_safe_snapshot(v_snap),
    'issued_at', v_share.created_at,
    'expires_at', v_share.expires_at
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.list_estimate_shares(p_job_id uuid)
 RETURNS TABLE(share_id uuid, token_hint text, created_at timestamp with time zone, expires_at timestamp with time zone, revoked_at timestamp with time zone, view_count integer, last_viewed_at timestamp with time zone, quote_total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.can_access_job(p_job_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select s.id, s.token_hint, s.created_at, s.expires_at, s.revoked_at, s.view_count, s.last_viewed_at, q.total
      from public.estimate_shares s
      join public.job_quotes q on q.id = s.quote_id
     where s.job_id = p_job_id
     order by s.created_at desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_get_price_book()
 RETURNS TABLE(staff_settings jsonb, owner_settings jsonb, version integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can read the full price book' using errcode = '42501';
  end if;
  return query
    select pb.staff_settings, pbo.owner_settings, pb.version, greatest(pb.updated_at, pbo.updated_at)
      from public.price_book pb
      join public.price_book_owner pbo on pbo.id = pb.id
     where pb.id = 1;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_list_discount_requests(p_status text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.owner_list_discount_requests(p_status); $function$
;
CREATE OR REPLACE FUNCTION public.owner_list_staff()
 RETURNS TABLE(id uuid, email text, full_name text, role text, active boolean, created_at timestamp with time zone, disabled_at timestamp with time zone, disabled_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can manage staff' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.full_name, p.role, p.active, p.created_at, p.disabled_at, p.disabled_reason
      from public.profiles p
     order by p.role, p.email;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_price_book_audit(p_limit integer DEFAULT 100)
 RETURNS SETOF price_book_audit
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can read the price audit log' using errcode = '42501';
  end if;
  return query select * from public.price_book_audit order by id desc limit least(greatest(p_limit, 1), 1000);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_set_job_markup(p_job_id uuid, p_markup_pct numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not private.is_owner() then
    raise exception 'Only the owner can set markup' using errcode = '42501';
  end if;
  if p_markup_pct is null or p_markup_pct < 0 or p_markup_pct > 1000 then
    raise exception 'Markup must be between 0 and 1000 percent' using errcode = '22023';
  end if;
  if not exists (select 1 from public.jobs where id = p_job_id) then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  insert into public.job_owner_pricing (job_id, markup_pct, updated_at, updated_by)
  values (p_job_id, p_markup_pct, now(), auth.uid())
  on conflict (job_id) do update set markup_pct = excluded.markup_pct, updated_at = now(), updated_by = auth.uid();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_set_staff_access(p_user_id uuid, p_role text, p_active boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old public.profiles%rowtype;
  v_other_owners int;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change staff roles or access' using errcode = '42501';
  end if;
  if p_role not in ('owner','employee') then
    raise exception 'Invalid role %', p_role using errcode = '22023';
  end if;

  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'No profile for that user' using errcode = 'P0002';
  end if;

  if v_old.role = 'owner' and v_old.active and (p_role <> 'owner' or not p_active) then
    select count(*) into v_other_owners
      from public.profiles
     where role = 'owner' and active and id <> p_user_id;
    if v_other_owners = 0 then
      raise exception 'Cannot remove or disable the last active owner' using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set role = p_role,
         active = p_active,
         updated_at = now(),
         disabled_at = case when p_active then null else coalesce(disabled_at, now()) end,
         disabled_reason = case when p_active then null else left(coalesce(p_reason, 'disabled by owner'), 300) end
   where id = p_user_id;

  insert into public.staff_access_audit (actor, target, old_role, new_role, old_active, new_active, reason)
  values (auth.uid(), p_user_id, v_old.role, p_role, v_old.active, p_active, left(p_reason, 300));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.owner_update_price_book(p_staff_settings jsonb, p_owner_settings jsonb, p_expected_version integer, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current int;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can change product prices, rates, costs, markup or discount limits'
      using errcode = '42501';
  end if;

  perform private.validate_price_book_payload(p_staff_settings, p_owner_settings);

  select version into v_current from public.price_book where id = 1 for update;
  if p_expected_version is null or p_expected_version <> v_current then
    raise exception 'Price book changed since you loaded it (server version %, yours %). Reload and re-apply.',
      v_current, p_expected_version using errcode = '40001';
  end if;

  perform set_config('es.price_change_reason', coalesce(p_reason, ''), true);

  update public.price_book
     set staff_settings = coalesce(p_staff_settings, staff_settings),
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
$function$
;
CREATE OR REPLACE FUNCTION public.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.request_extra_discount(p_estimate_id, p_revision, p_tier, p_before_total, p_amount, p_percent, p_reason); $function$
;
CREATE OR REPLACE FUNCTION public.revoke_estimate_share(p_share_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_share public.estimate_shares%rowtype;
begin
  select * into v_share from public.estimate_shares where id = p_share_id;
  if not found
     or not private.can_access_job(v_share.job_id)
     or not (private.is_owner() or v_share.created_by = auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.estimate_shares
     set revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, auth.uid())
   where id = p_share_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.server_record_quote(p_job_id uuid, p_job_version integer, p_requested_by uuid, p_engine_version text, p_price_book_version integer, p_quote_ready boolean, p_quote_status text, p_total numeric, p_cap_base numeric, p_customer_snapshot jsonb, p_staff_snapshot jsonb, p_internal jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.staff_discount_approval(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.staff_discount_approval(p_id); $function$
;
CREATE OR REPLACE FUNCTION public.staff_list_estimate_acceptances()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.staff_list_estimate_acceptances(); $function$
;
CREATE OR REPLACE FUNCTION public.staff_list_my_discount_requests()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.staff_list_my_discount_requests(); $function$
;

-- Triggers

CREATE TRIGGER jobs_assign_number BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION private.jobs_assign_number();
CREATE TRIGGER jobs_guard_trg BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION private.jobs_guard();
CREATE CONSTRAINT TRIGGER price_book_apply_version_bump AFTER UPDATE OF staff_settings ON public.price_book DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.price_book_apply_version_bump();
CREATE TRIGGER price_book_audit_trg AFTER UPDATE ON public.price_book FOR EACH ROW EXECUTE FUNCTION private.audit_price_book_change();
CREATE TRIGGER price_book_note_version BEFORE UPDATE ON public.price_book FOR EACH ROW EXECUTE FUNCTION private.price_book_note_version();
CREATE TRIGGER price_book_audit_append_only BEFORE DELETE OR UPDATE ON public.price_book_audit FOR EACH ROW EXECUTE FUNCTION private.forbid_audit_mutation();
CREATE TRIGGER price_book_owner_audit_trg AFTER UPDATE ON public.price_book_owner FOR EACH ROW EXECUTE FUNCTION private.audit_price_book_change();
CREATE CONSTRAINT TRIGGER price_book_owner_bump_version AFTER UPDATE OF owner_settings ON public.price_book_owner DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.price_book_owner_bump_version();
CREATE TRIGGER staff_access_audit_append_only BEFORE DELETE OR UPDATE ON public.staff_access_audit FOR EACH ROW EXECUTE FUNCTION private.forbid_audit_mutation();

-- Row level security

alter table public.discount_approvals enable row level security;
alter table public.estimate_acceptances enable row level security;
alter table public.estimate_shares enable row level security;
alter table public.job_number_counters enable row level security;
alter table public.job_owner_pricing enable row level security;
alter table public.job_quote_internal enable row level security;
alter table public.job_quotes enable row level security;
alter table public.jobs enable row level security;
alter table public.price_book enable row level security;
alter table public.price_book_audit enable row level security;
alter table public.price_book_owner enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_access_audit enable row level security;

-- Policies

create policy discount_approvals_deny_authenticated on public.discount_approvals as restrictive for all to authenticated using (false) with check (false);
create policy estimate_acceptances_deny on public.estimate_acceptances as restrictive for all to anon, authenticated using (false) with check (false);
create policy job_owner_pricing_owner on public.job_owner_pricing as permissive for select to authenticated using (( SELECT private.is_owner() AS is_owner));
create policy job_quote_internal_owner on public.job_quote_internal as permissive for select to authenticated using (( SELECT private.is_owner() AS is_owner));
create policy job_quotes_staff_select on public.job_quotes as permissive for select to authenticated using (( SELECT private.can_access_job(job_quotes.job_id) AS can_access_job));
create policy jobs_delete_owner on public.jobs as permissive for delete to authenticated using (( SELECT private.is_owner() AS is_owner));
create policy jobs_insert on public.jobs as permissive for insert to authenticated with check ((( SELECT private.is_active_staff() AS is_active_staff) AND (created_by = ( SELECT auth.uid() AS uid))));
create policy jobs_select on public.jobs as permissive for select to authenticated using ((( SELECT private.is_owner() AS is_owner) OR (( SELECT private.is_active_staff() AS is_active_staff) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (assigned_staff))))));
create policy jobs_update on public.jobs as permissive for update to authenticated using ((( SELECT private.is_owner() AS is_owner) OR (( SELECT private.is_active_staff() AS is_active_staff) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (assigned_staff)))))) with check ((( SELECT private.is_owner() AS is_owner) OR (( SELECT private.is_active_staff() AS is_active_staff) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (( SELECT auth.uid() AS uid) = ANY (assigned_staff))))));
create policy price_book_staff_read on public.price_book as permissive for select to authenticated using (( SELECT private.is_active_staff() AS is_active_staff));
create policy price_book_audit_owner_read on public.price_book_audit as permissive for select to authenticated using (( SELECT private.is_owner() AS is_owner));
create policy price_book_owner_read on public.price_book_owner as permissive for select to authenticated using (( SELECT private.is_owner() AS is_owner));
create policy profiles_select_self_or_owner on public.profiles as permissive for select to authenticated using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_owner() AS is_owner)));
create policy staff_audit_owner_select on public.staff_access_audit as permissive for select to authenticated using (( SELECT private.is_owner() AS is_owner));

-- Schema grants

grant usage on schema private to authenticated;
grant usage on schema private to service_role;
grant usage on schema public to public;
grant create on schema public to pg_database_owner;
grant usage on schema public to pg_database_owner;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Table and sequence grants

revoke all on table public.discount_approvals from public, anon, authenticated, service_role;
revoke all on table public.estimate_acceptances from public, anon, authenticated, service_role;
revoke all on table public.estimate_shares from public, anon, authenticated, service_role;
grant delete on table public.estimate_shares to service_role;
grant insert on table public.estimate_shares to service_role;
grant maintain on table public.estimate_shares to service_role;
grant references on table public.estimate_shares to service_role;
grant select on table public.estimate_shares to service_role;
grant trigger on table public.estimate_shares to service_role;
grant truncate on table public.estimate_shares to service_role;
grant update on table public.estimate_shares to service_role;
revoke all on table public.job_number_counters from public, anon, authenticated, service_role;
grant delete on table public.job_number_counters to service_role;
grant insert on table public.job_number_counters to service_role;
grant maintain on table public.job_number_counters to service_role;
grant references on table public.job_number_counters to service_role;
grant select on table public.job_number_counters to service_role;
grant trigger on table public.job_number_counters to service_role;
grant truncate on table public.job_number_counters to service_role;
grant update on table public.job_number_counters to service_role;
revoke all on table public.job_owner_pricing from public, anon, authenticated, service_role;
grant delete on table public.job_owner_pricing to service_role;
grant insert on table public.job_owner_pricing to service_role;
grant maintain on table public.job_owner_pricing to service_role;
grant references on table public.job_owner_pricing to service_role;
grant select on table public.job_owner_pricing to authenticated;
grant select on table public.job_owner_pricing to service_role;
grant trigger on table public.job_owner_pricing to service_role;
grant truncate on table public.job_owner_pricing to service_role;
grant update on table public.job_owner_pricing to service_role;
revoke all on table public.job_quote_internal from public, anon, authenticated, service_role;
grant delete on table public.job_quote_internal to service_role;
grant insert on table public.job_quote_internal to service_role;
grant maintain on table public.job_quote_internal to service_role;
grant references on table public.job_quote_internal to service_role;
grant select on table public.job_quote_internal to authenticated;
grant select on table public.job_quote_internal to service_role;
grant trigger on table public.job_quote_internal to service_role;
grant truncate on table public.job_quote_internal to service_role;
grant update on table public.job_quote_internal to service_role;
revoke all on table public.job_quotes from public, anon, authenticated, service_role;
grant delete on table public.job_quotes to service_role;
grant insert on table public.job_quotes to service_role;
grant maintain on table public.job_quotes to service_role;
grant references on table public.job_quotes to service_role;
grant select on table public.job_quotes to authenticated;
grant select on table public.job_quotes to service_role;
grant trigger on table public.job_quotes to service_role;
grant truncate on table public.job_quotes to service_role;
grant update on table public.job_quotes to service_role;
revoke all on table public.jobs from public, anon, authenticated, service_role;
grant delete on table public.jobs to authenticated;
grant delete on table public.jobs to service_role;
grant insert on table public.jobs to authenticated;
grant insert on table public.jobs to service_role;
grant maintain on table public.jobs to service_role;
grant references on table public.jobs to service_role;
grant select on table public.jobs to authenticated;
grant select on table public.jobs to service_role;
grant trigger on table public.jobs to service_role;
grant truncate on table public.jobs to service_role;
grant update on table public.jobs to authenticated;
grant update on table public.jobs to service_role;
revoke all on table public.price_book from public, anon, authenticated, service_role;
grant delete on table public.price_book to service_role;
grant insert on table public.price_book to service_role;
grant maintain on table public.price_book to service_role;
grant references on table public.price_book to service_role;
grant select on table public.price_book to authenticated;
grant select on table public.price_book to service_role;
grant trigger on table public.price_book to service_role;
grant truncate on table public.price_book to service_role;
grant update on table public.price_book to service_role;
revoke all on table public.price_book_audit from public, anon, authenticated, service_role;
grant delete on table public.price_book_audit to service_role;
grant insert on table public.price_book_audit to service_role;
grant maintain on table public.price_book_audit to service_role;
grant references on table public.price_book_audit to service_role;
grant select on table public.price_book_audit to authenticated;
grant select on table public.price_book_audit to service_role;
grant trigger on table public.price_book_audit to service_role;
grant truncate on table public.price_book_audit to service_role;
grant update on table public.price_book_audit to service_role;
revoke all on table public.price_book_audit_id_seq from public, anon, authenticated, service_role;
grant select on table public.price_book_audit_id_seq to anon;
grant select on table public.price_book_audit_id_seq to authenticated;
grant select on table public.price_book_audit_id_seq to service_role;
grant update on table public.price_book_audit_id_seq to anon;
grant update on table public.price_book_audit_id_seq to authenticated;
grant update on table public.price_book_audit_id_seq to service_role;
grant usage on table public.price_book_audit_id_seq to anon;
grant usage on table public.price_book_audit_id_seq to authenticated;
grant usage on table public.price_book_audit_id_seq to service_role;
revoke all on table public.price_book_owner from public, anon, authenticated, service_role;
grant delete on table public.price_book_owner to service_role;
grant insert on table public.price_book_owner to service_role;
grant maintain on table public.price_book_owner to service_role;
grant references on table public.price_book_owner to service_role;
grant select on table public.price_book_owner to authenticated;
grant select on table public.price_book_owner to service_role;
grant trigger on table public.price_book_owner to service_role;
grant truncate on table public.price_book_owner to service_role;
grant update on table public.price_book_owner to service_role;
revoke all on table public.profiles from public, anon, authenticated, service_role;
grant delete on table public.profiles to service_role;
grant insert on table public.profiles to service_role;
grant maintain on table public.profiles to service_role;
grant references on table public.profiles to service_role;
grant select on table public.profiles to authenticated;
grant select on table public.profiles to service_role;
grant trigger on table public.profiles to service_role;
grant truncate on table public.profiles to service_role;
grant update on table public.profiles to service_role;
revoke all on table public.staff_access_audit from public, anon, authenticated, service_role;
grant delete on table public.staff_access_audit to service_role;
grant insert on table public.staff_access_audit to service_role;
grant maintain on table public.staff_access_audit to service_role;
grant references on table public.staff_access_audit to service_role;
grant select on table public.staff_access_audit to authenticated;
grant select on table public.staff_access_audit to service_role;
grant trigger on table public.staff_access_audit to service_role;
grant truncate on table public.staff_access_audit to service_role;
grant update on table public.staff_access_audit to service_role;
revoke all on table public.staff_access_audit_id_seq from public, anon, authenticated, service_role;
grant select on table public.staff_access_audit_id_seq to anon;
grant select on table public.staff_access_audit_id_seq to authenticated;
grant select on table public.staff_access_audit_id_seq to service_role;
grant update on table public.staff_access_audit_id_seq to anon;
grant update on table public.staff_access_audit_id_seq to authenticated;
grant update on table public.staff_access_audit_id_seq to service_role;
grant usage on table public.staff_access_audit_id_seq to anon;
grant usage on table public.staff_access_audit_id_seq to authenticated;
grant usage on table public.staff_access_audit_id_seq to service_role;

-- Function grants

revoke all on function private.audit_price_book_change() from public, anon, authenticated, service_role;
revoke all on function private.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean) from public, anon, authenticated, service_role;
grant execute on function private.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean) to authenticated;
revoke all on function private.bootstrap_first_owner(p_email text) from public, anon, authenticated, service_role;
revoke all on function private.can_access_job(p_job uuid) from public, anon, authenticated, service_role;
grant execute on function private.can_access_job(p_job uuid) to authenticated;
grant execute on function private.can_access_job(p_job uuid) to service_role;
revoke all on function private.can_touch_job_photo(p_name text) from public, anon, authenticated, service_role;
grant execute on function private.can_touch_job_photo(p_name text) to authenticated;
revoke all on function private.customer_safe_lines(p jsonb) from public, anon, authenticated, service_role;
revoke all on function private.customer_safe_payments(p jsonb) from public, anon, authenticated, service_role;
revoke all on function private.customer_safe_snapshot(s jsonb) from public, anon, authenticated, service_role;
revoke all on function private.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text) from public, anon, authenticated, service_role;
grant execute on function private.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text) to authenticated;
revoke all on function private.forbid_audit_mutation() from public, anon, authenticated, service_role;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function private.is_active_staff() from public, anon, authenticated, service_role;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.is_active_staff() to service_role;
revoke all on function private.is_owner() from public, anon, authenticated, service_role;
grant execute on function private.is_owner() to authenticated;
grant execute on function private.is_owner() to service_role;
revoke all on function private.jnum(p jsonb) from public, anon, authenticated, service_role;
grant execute on function private.jnum(p jsonb) to authenticated;
grant execute on function private.jnum(p jsonb) to service_role;
revoke all on function private.jobs_assign_number() from public, anon, authenticated, service_role;
grant execute on function private.jobs_assign_number() to public;
revoke all on function private.jobs_guard() from public, anon, authenticated, service_role;
revoke all on function private.next_job_number(p_day date) from public, anon, authenticated, service_role;
revoke all on function private.owner_list_discount_requests(p_status text) from public, anon, authenticated, service_role;
grant execute on function private.owner_list_discount_requests(p_status text) to authenticated;
revoke all on function private.price_book_apply_version_bump() from public, anon, authenticated, service_role;
revoke all on function private.price_book_note_version() from public, anon, authenticated, service_role;
revoke all on function private.price_book_owner_bump_version() from public, anon, authenticated, service_role;
revoke all on function private.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text) from public, anon, authenticated, service_role;
grant execute on function private.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text) to authenticated;
revoke all on function private.share_token_hash(p_token text) from public, anon, authenticated, service_role;
revoke all on function private.shared_estimate_payload(p_token text) from public, anon, authenticated, service_role;
revoke all on function private.staff_discount_approval(p_id uuid) from public, anon, authenticated, service_role;
grant execute on function private.staff_discount_approval(p_id uuid) to authenticated;
revoke all on function private.staff_list_estimate_acceptances() from public, anon, authenticated, service_role;
grant execute on function private.staff_list_estimate_acceptances() to authenticated;
revoke all on function private.staff_list_my_discount_requests() from public, anon, authenticated, service_role;
grant execute on function private.staff_list_my_discount_requests() to authenticated;
revoke all on function private.staff_role() from public, anon, authenticated, service_role;
grant execute on function private.staff_role() to authenticated;
grant execute on function private.staff_role() to service_role;
revoke all on function private.staff_safe_snapshot(s jsonb) from public, anon, authenticated, service_role;
revoke all on function private.user_can_access_job(p_user uuid, p_job uuid) from public, anon, authenticated, service_role;
grant execute on function private.user_can_access_job(p_user uuid, p_job uuid) to service_role;
revoke all on function private.user_staff_role(p_user uuid) from public, anon, authenticated, service_role;
grant execute on function private.user_staff_role(p_user uuid) to service_role;
revoke all on function private.validate_price_book_payload(p_staff jsonb, p_owner jsonb) from public, anon, authenticated, service_role;
revoke all on function public.accept_shared_estimate(p_token text, p_name text, p_note text) from public, anon, authenticated, service_role;
grant execute on function public.accept_shared_estimate(p_token text, p_name text, p_note text) to anon;
grant execute on function public.accept_shared_estimate(p_token text, p_name text, p_note text) to authenticated;
revoke all on function public.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean) from public, anon, authenticated, service_role;
grant execute on function public.bind_extra_discount(p_id uuid, p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_consume boolean, p_mark_stale boolean) to authenticated;
revoke all on function public.create_estimate_share(p_job_id uuid, p_valid_days integer) from public, anon, authenticated, service_role;
grant execute on function public.create_estimate_share(p_job_id uuid, p_valid_days integer) to authenticated;
grant execute on function public.create_estimate_share(p_job_id uuid, p_valid_days integer) to service_role;
revoke all on function public.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text) from public, anon, authenticated, service_role;
grant execute on function public.decide_extra_discount(p_id uuid, p_decision text, p_amount numeric, p_low_margin_exception boolean, p_owner_note text) to authenticated;
revoke all on function public.get_estimate_acceptance(p_token text) from public, anon, authenticated, service_role;
grant execute on function public.get_estimate_acceptance(p_token text) to anon;
grant execute on function public.get_estimate_acceptance(p_token text) to authenticated;
revoke all on function public.get_my_profile() from public, anon, authenticated, service_role;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.get_my_profile() to service_role;
revoke all on function public.get_shared_estimate(p_token text) from public, anon, authenticated, service_role;
grant execute on function public.get_shared_estimate(p_token text) to anon;
grant execute on function public.get_shared_estimate(p_token text) to authenticated;
grant execute on function public.get_shared_estimate(p_token text) to service_role;
revoke all on function public.list_estimate_shares(p_job_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_estimate_shares(p_job_id uuid) to authenticated;
grant execute on function public.list_estimate_shares(p_job_id uuid) to service_role;
revoke all on function public.owner_get_price_book() from public, anon, authenticated, service_role;
grant execute on function public.owner_get_price_book() to authenticated;
grant execute on function public.owner_get_price_book() to service_role;
revoke all on function public.owner_list_discount_requests(p_status text) from public, anon, authenticated, service_role;
grant execute on function public.owner_list_discount_requests(p_status text) to authenticated;
revoke all on function public.owner_list_staff() from public, anon, authenticated, service_role;
grant execute on function public.owner_list_staff() to authenticated;
grant execute on function public.owner_list_staff() to service_role;
revoke all on function public.owner_price_book_audit(p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.owner_price_book_audit(p_limit integer) to authenticated;
grant execute on function public.owner_price_book_audit(p_limit integer) to service_role;
revoke all on function public.owner_set_job_markup(p_job_id uuid, p_markup_pct numeric) from public, anon, authenticated, service_role;
grant execute on function public.owner_set_job_markup(p_job_id uuid, p_markup_pct numeric) to authenticated;
grant execute on function public.owner_set_job_markup(p_job_id uuid, p_markup_pct numeric) to service_role;
revoke all on function public.owner_set_staff_access(p_user_id uuid, p_role text, p_active boolean, p_reason text) from public, anon, authenticated, service_role;
grant execute on function public.owner_set_staff_access(p_user_id uuid, p_role text, p_active boolean, p_reason text) to authenticated;
grant execute on function public.owner_set_staff_access(p_user_id uuid, p_role text, p_active boolean, p_reason text) to service_role;
revoke all on function public.owner_update_price_book(p_staff_settings jsonb, p_owner_settings jsonb, p_expected_version integer, p_reason text) from public, anon, authenticated, service_role;
grant execute on function public.owner_update_price_book(p_staff_settings jsonb, p_owner_settings jsonb, p_expected_version integer, p_reason text) to authenticated;
grant execute on function public.owner_update_price_book(p_staff_settings jsonb, p_owner_settings jsonb, p_expected_version integer, p_reason text) to service_role;
revoke all on function public.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text) from public, anon, authenticated, service_role;
grant execute on function public.request_extra_discount(p_estimate_id uuid, p_revision text, p_tier text, p_before_total numeric, p_amount numeric, p_percent numeric, p_reason text) to authenticated;
revoke all on function public.revoke_estimate_share(p_share_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_estimate_share(p_share_id uuid) to authenticated;
grant execute on function public.revoke_estimate_share(p_share_id uuid) to service_role;
revoke all on function public.server_record_quote(p_job_id uuid, p_job_version integer, p_requested_by uuid, p_engine_version text, p_price_book_version integer, p_quote_ready boolean, p_quote_status text, p_total numeric, p_cap_base numeric, p_customer_snapshot jsonb, p_staff_snapshot jsonb, p_internal jsonb) from public, anon, authenticated, service_role;
grant execute on function public.server_record_quote(p_job_id uuid, p_job_version integer, p_requested_by uuid, p_engine_version text, p_price_book_version integer, p_quote_ready boolean, p_quote_status text, p_total numeric, p_cap_base numeric, p_customer_snapshot jsonb, p_staff_snapshot jsonb, p_internal jsonb) to service_role;
revoke all on function public.staff_discount_approval(p_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_discount_approval(p_id uuid) to authenticated;
revoke all on function public.staff_list_estimate_acceptances() from public, anon, authenticated, service_role;
grant execute on function public.staff_list_estimate_acceptances() to authenticated;
revoke all on function public.staff_list_my_discount_requests() from public, anon, authenticated, service_role;
grant execute on function public.staff_list_my_discount_requests() to authenticated;

-- Comments

comment on table public.profiles is 'Staff profiles. role/active are server-controlled; customers never get profiles with access.';
