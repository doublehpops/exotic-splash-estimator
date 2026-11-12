-- Additive extra-discount approvals. Does not change price_book, jobs, or earlier migrations.
-- Direct table access is revoked. Role checks use private.staff_role(), which reads
-- public.profiles for auth.uid(). They do not read user-editable JWT metadata.

create table if not exists public.discount_approvals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  revision text not null,
  tier text not null,
  before_total numeric(12,2) not null,
  after_total numeric(12,2) not null,
  amount numeric(12,2) not null,
  percent numeric(8,4),
  reason text not null,
  requester_id uuid not null,
  requested_at timestamptz not null default now(),
  status text not null default 'pending',
  owner_id uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  owner_note text,
  low_margin_exception boolean not null default false,
  constraint discount_approvals_status check (status in ('pending','approved','rejected','stale','consumed')),
  constraint discount_approvals_amount check (amount > 0),
  constraint discount_approvals_after check (after_total > 0 and after_total < before_total)
);

alter table public.discount_approvals enable row level security;
revoke all on table public.discount_approvals from public, anon, authenticated, service_role;

drop policy if exists discount_approvals_deny_authenticated on public.discount_approvals;
create policy discount_approvals_deny_authenticated on public.discount_approvals
  as restrictive for all to authenticated
  using (false) with check (false);

create or replace function public.request_extra_discount(
  p_estimate_id uuid,
  p_revision text,
  p_tier text,
  p_before_total numeric,
  p_amount numeric,
  p_percent numeric,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.decide_extra_discount(
  p_id uuid,
  p_decision text,
  p_amount numeric,
  p_low_margin_exception boolean,
  p_owner_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.bind_extra_discount(
  p_id uuid,
  p_estimate_id uuid,
  p_revision text,
  p_tier text,
  p_before_total numeric,
  p_consume boolean,
  p_mark_stale boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception 'The estimate changed after approval' using errcode = '40001';
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
    'id', v.id, 'status', case when coalesce(p_consume, false) then 'consumed' else 'approved' end,
    'amount', v.amount, 'beforeTotal', v.before_total, 'afterTotal', v.after_total,
    'estimateId', v.estimate_id, 'tier', v.tier
  );
end;
$$;

create or replace function public.staff_discount_approval(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.request_extra_discount(uuid,text,text,numeric,numeric,numeric,text) from public, anon, service_role;
revoke all on function public.decide_extra_discount(uuid,text,numeric,boolean,text) from public, anon, service_role;
revoke all on function public.bind_extra_discount(uuid,uuid,text,text,numeric,boolean,boolean) from public, anon, service_role;
revoke all on function public.staff_discount_approval(uuid) from public, anon, service_role;
grant execute on function public.request_extra_discount(uuid,text,text,numeric,numeric,numeric,text) to authenticated;
grant execute on function public.decide_extra_discount(uuid,text,numeric,boolean,text) to authenticated;
grant execute on function public.bind_extra_discount(uuid,uuid,text,text,numeric,boolean,boolean) to authenticated;
grant execute on function public.staff_discount_approval(uuid) to authenticated;
