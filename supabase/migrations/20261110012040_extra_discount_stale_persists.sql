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
  return jsonb_build_object('ok', true, 'id', v.id, 'status', case when coalesce(p_consume, false) then 'consumed' else 'approved' end, 'amount', v.amount, 'beforeTotal', v.before_total, 'afterTotal', v.after_total, 'estimateId', v.estimate_id, 'tier', v.tier);
end;
$$;
revoke all on function public.bind_extra_discount(uuid,uuid,text,text,numeric,boolean,boolean) from public, anon, service_role;
grant execute on function public.bind_extra_discount(uuid,uuid,text,text,numeric,boolean,boolean) to authenticated;
