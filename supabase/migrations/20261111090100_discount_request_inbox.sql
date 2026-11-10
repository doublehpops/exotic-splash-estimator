-- Discount request inbox. The owner lists requests by status (default pending) without
-- opening each job; an employee lists their own requests. Read-only: decisions still go
-- through decide_extra_discount via the quote-job function.

create or replace function private.owner_list_discount_requests(p_status text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.staff_list_my_discount_requests()
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
$$;

create or replace function public.owner_list_discount_requests(p_status text)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.owner_list_discount_requests(p_status); $$;

create or replace function public.staff_list_my_discount_requests()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_list_my_discount_requests(); $$;

revoke all on function private.owner_list_discount_requests(text) from public, anon, service_role;
revoke all on function private.staff_list_my_discount_requests() from public, anon, service_role;
revoke all on function public.owner_list_discount_requests(text) from public, anon, service_role;
revoke all on function public.staff_list_my_discount_requests() from public, anon, service_role;
grant execute on function private.owner_list_discount_requests(text) to authenticated;
grant execute on function private.staff_list_my_discount_requests() to authenticated;
grant execute on function public.owner_list_discount_requests(text) to authenticated;
grant execute on function public.staff_list_my_discount_requests() to authenticated;
