-- Backfill job_quotes.discount and jobs.discount_amount from saved snapshots.
-- NOT APPLIED.
--
-- Dry run: run the SELECT. It changes nothing.
-- Apply: run only after 20261110160000_record_approved_discount_columns.sql.
-- The job update uses the trusted flag that migration adds, so a later save
-- that still sends discount 0 does not clear the recorded amount, and the
-- approving owner stays on the row. That keeps the existing discount cap from
-- treating the amount as an employee discount.
--
-- Idempotent. A second apply changes nothing: both updates require the column
-- to still be 0, and they require the snapshot discount to be greater than 0.
-- Quotes and jobs that already have a discount are left alone.

-- Dry run. Shows the reporting column before and the snapshot amount after.
select
  q.id as quote_id,
  j.job_number,
  q.computed_at,
  q.discount as quote_discount_before,
  round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2) as quote_discount_after,
  q.total as quote_total,
  q.customer_snapshot #>> '{totals,total}' as snapshot_total,
  q.customer_snapshot #>> '{selected,key}' as snapshot_tier,
  j.discount_amount as job_discount_before,
  case
    when latest.job_id is not null and j.discount_amount = 0 and a.owner_id is not null then latest.amount
    else j.discount_amount
  end as job_discount_after,
  (a.owner_id is not null) as consumed_owner_present
from public.job_quotes q
join public.jobs j on j.id = q.job_id
left join lateral (
  select q2.job_id,
         round(coalesce(private.jnum(q2.customer_snapshot #> '{totals,discount}'), 0), 2) as amount
    from public.job_quotes q2
   where q2.job_id = q.job_id
     and q2.discount = 0
     and round(coalesce(private.jnum(q2.customer_snapshot #> '{totals,discount}'), 0), 2) > 0
   order by q2.computed_at desc
   limit 1
) latest on latest.job_id = q.job_id
  and latest.amount = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2)
left join public.discount_approvals a
  on a.estimate_id = q.job_id
 and a.status = 'consumed'
 and a.tier = coalesce(nullif(q.customer_snapshot #>> '{selected,key}', ''), 'regular')
 and a.amount = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2)
 and a.after_total = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,total}'), 0), 2)
where q.discount = 0
  and round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2) > 0
order by q.computed_at;

-- Apply. Leave this commented until the dry run has been reviewed.
/*
begin;

update public.job_quotes q
   set discount = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2)
 where q.discount = 0
   and round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2) > 0;

select set_config('es.trusted_job_write', 'on', true);

update public.jobs j
   set discount_amount = src.amount,
       discount_set_by = src.owner_id
  from (
    select distinct on (q.job_id)
           q.job_id,
           round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2) as amount,
           a.owner_id
      from public.job_quotes q
      join public.discount_approvals a
        on a.estimate_id = q.job_id
       and a.status = 'consumed'
       and a.tier = coalesce(nullif(q.customer_snapshot #>> '{selected,key}', ''), 'regular')
       and a.amount = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2)
       and a.after_total = round(coalesce(private.jnum(q.customer_snapshot #> '{totals,total}'), 0), 2)
     where round(coalesce(private.jnum(q.customer_snapshot #> '{totals,discount}'), 0), 2) > 0
     order by q.job_id, q.computed_at desc
  ) src
 where j.id = src.job_id
   and j.discount_amount = 0
   and src.amount > 0
   and src.owner_id is not null;

select set_config('es.trusted_job_write', '', true);

commit;
*/
