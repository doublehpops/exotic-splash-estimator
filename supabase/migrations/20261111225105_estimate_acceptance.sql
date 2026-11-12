-- Customer acceptance of a shared estimate. The customer (anonymous) accepts through the
-- share link; the token is validated by the existing get_shared_estimate() so an expired,
-- revoked or unknown link cannot be accepted. One acceptance per link. The accepted
-- customer-safe snapshot and total are frozen at acceptance time. Nothing here changes
-- pricing, jobs or shares.

create table if not exists public.estimate_acceptances (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  estimate_number text,
  customer_name text,
  accepted_name text not null,
  accepted_note text,
  total numeric(12,2),
  snapshot jsonb not null,
  accepted_at timestamptz not null default now(),
  user_agent text
);
alter table public.estimate_acceptances enable row level security;
revoke all on table public.estimate_acceptances from public, anon, authenticated, service_role;
drop policy if exists estimate_acceptances_deny on public.estimate_acceptances;
create policy estimate_acceptances_deny on public.estimate_acceptances
  as restrictive for all to anon, authenticated using (false) with check (false);

create or replace function private.share_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(pg_catalog.sha256(convert_to(p_token, 'UTF8')), 'hex'); $$;
revoke all on function private.share_token_hash(text) from public, anon, authenticated;

-- Resolves a share token through get_shared_estimate() and normalises the result to
-- {estimate, issued_at, expires_at} whether that function returns jsonb or a row.
create or replace function private.shared_estimate_payload(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select to_jsonb(x) into v from public.get_shared_estimate(p_token) x;
  if v is null then return null; end if;
  if v ? 'get_shared_estimate' then v := v -> 'get_shared_estimate'; end if;
  if v is null or jsonb_typeof(v) <> 'object' or not (v ? 'estimate') then return null; end if;
  return v;
end;
$$;
revoke all on function private.shared_estimate_payload(text) from public, anon, authenticated;

create or replace function public.accept_shared_estimate(p_token text, p_name text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.get_estimate_acceptance(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.estimate_acceptances%rowtype;
begin
  if p_token !~ '^est_[0-9a-f]{64}$' then return null; end if;
  select * into v_row from public.estimate_acceptances where token_hash = private.share_token_hash(p_token);
  if not found then return null; end if;
  return jsonb_build_object('accepted_at', v_row.accepted_at, 'accepted_name', v_row.accepted_name, 'total', v_row.total);
end;
$$;

create or replace function private.staff_list_estimate_acceptances()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.staff_list_estimate_acceptances()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_list_estimate_acceptances(); $$;

revoke all on function public.accept_shared_estimate(text, text, text) from public, service_role;
revoke all on function public.get_estimate_acceptance(text) from public, service_role;
revoke all on function private.staff_list_estimate_acceptances() from public, anon, service_role;
revoke all on function public.staff_list_estimate_acceptances() from public, anon, service_role;
grant execute on function public.accept_shared_estimate(text, text, text) to anon, authenticated;
grant execute on function public.get_estimate_acceptance(text) to anon, authenticated;
grant execute on function private.staff_list_estimate_acceptances() to authenticated;
grant execute on function public.staff_list_estimate_acceptances() to authenticated;
