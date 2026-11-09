-- =====================================================================
-- Exotic Splash Estimator v8 — material costbook + safer snapshot filters
-- Additive only. Does not alter earlier v7 migration files.
-- verified_unit_cost stays owner-only; customer_material_price is separate.
-- =====================================================================

create table if not exists public.material_costbook (
  id             smallint primary key default 1 check (id = 1),
  catalog        jsonb not null default '{"version":"8.0.0","items":[]}'::jsonb,
  version        integer not null default 1,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  constraint material_costbook_catalog_is_object check (jsonb_typeof(catalog) = 'object')
);

insert into public.material_costbook (id) values (1) on conflict (id) do nothing;

alter table public.material_costbook enable row level security;
revoke all on table public.material_costbook from public, anon, authenticated;
grant select on table public.material_costbook to authenticated; -- RLS: owner only for full catalog
grant all on table public.material_costbook to service_role;

drop policy if exists material_costbook_owner_read on public.material_costbook;
create policy material_costbook_owner_read on public.material_costbook
  for select to authenticated
  using ( (select private.is_owner()) );

-- Staff-safe catalog: strip verified_unit_cost / internal fields from every item
create or replace function public.staff_get_material_costbook()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cat jsonb;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_safe jsonb;
begin
  if not private.is_active_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select catalog into v_cat from public.material_costbook where id = 1;
  if v_cat is null then
    return jsonb_build_object('version','8.0.0','items','[]'::jsonb);
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(v_cat -> 'items', '[]'::jsonb))
  loop
    v_safe := jsonb_strip_nulls(jsonb_build_object(
      'id', v_item ->> 'id',
      'category', v_item ->> 'category',
      'product', v_item ->> 'product',
      'supplier', v_item ->> 'supplier',
      'unit_size', v_item ->> 'unit_size',
      'customer_material_price', v_item -> 'customer_material_price',
      'coverage', v_item ->> 'coverage',
      'consumable_type', v_item ->> 'consumable_type',
      'quote_required', v_item -> 'quote_required',
      'notes', left(coalesce(v_item ->> 'notes', ''), 400)
      -- intentionally NO verified_unit_cost, markup, cost, source wholesale
    ));
    v_items := v_items || jsonb_build_array(v_safe);
  end loop;
  return jsonb_build_object(
    'version', coalesce(v_cat ->> 'version', '8.0.0'),
    'items', v_items,
    'rules', jsonb_build_object(
      'sales_tax', 'EXCLUDED_ADD_WHEN_KNOWN',
      'payment_fees', 'EXCLUDED_ADD_WHEN_KNOWN',
      'labor', 'excluded',
      'disclaimer', 'Materials only — not an installed quote'
    )
  );
end;
$$;

create or replace function public.owner_get_material_costbook()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_cat jsonb; v_ver int;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can read the full material costbook' using errcode = '42501';
  end if;
  select catalog, version into v_cat, v_ver from public.material_costbook where id = 1;
  return jsonb_build_object('catalog', coalesce(v_cat, '{}'::jsonb), 'version', v_ver);
end;
$$;

create or replace function public.owner_update_material_costbook(p_catalog jsonb, p_expected_version integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_ver int; v_new int;
begin
  if not private.is_owner() then
    raise exception 'Only the owner can update the material costbook' using errcode = '42501';
  end if;
  if p_catalog is null or jsonb_typeof(p_catalog) <> 'object' then
    raise exception 'catalog must be a JSON object' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select version into v_ver from public.material_costbook where id = 1 for update;
  if v_ver is distinct from p_expected_version then
    raise exception 'Material costbook changed (version %)', v_ver using errcode = '40001';
  end if;
  v_new := v_ver + 1;
  update public.material_costbook
     set catalog = p_catalog, version = v_new, updated_at = now(), updated_by = auth.uid()
   where id = 1;
  insert into public.price_book_audit (changed_by, book, section, old_value, new_value, reason, price_book_version)
  values (auth.uid(), 'owner', 'material_costbook',
          jsonb_build_object('version', v_ver),
          jsonb_build_object('version', v_new, 'itemCount', jsonb_array_length(coalesce(p_catalog -> 'items', '[]'::jsonb))),
          left(trim(p_reason), 500), v_new);
  return v_new;
end;
$$;

revoke all on function public.staff_get_material_costbook() from public, anon;
revoke all on function public.owner_get_material_costbook() from public, anon;
revoke all on function public.owner_update_material_costbook(jsonb, integer, text) from public, anon;
grant execute on function public.staff_get_material_costbook() to authenticated;
grant execute on function public.owner_get_material_costbook() to authenticated;
grant execute on function public.owner_update_material_costbook(jsonb, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- Harden staff_safe_snapshot: strip costbook internal keys if injected
-- ---------------------------------------------------------------------
create or replace function private.staff_safe_costbook(c jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when c is null or jsonb_typeof(c) <> 'object' then null else jsonb_strip_nulls(jsonb_build_object(
    'customer_material_total', c -> 'customer_material_total',
    'complete', c -> 'complete',
    'sales_tax', c ->> 'sales_tax',
    'payment_fees', c ->> 'payment_fees',
    'disclaimer', left(coalesce(c ->> 'disclaimer', ''), 500),
    'quoteRequiredUnresolved', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', q ->> 'id', 'product', q ->> 'product', 'qty', q -> 'qty', 'reason', 'quote_required')), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(c -> 'quoteRequiredUnresolved') = 'array'
                                     then c -> 'quoteRequiredUnresolved' else '[]'::jsonb end) q
    ),
    'lines', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', l ->> 'id', 'product', l ->> 'product', 'category', l ->> 'category',
        'qty', l -> 'qty', 'consumable_type', l ->> 'consumable_type',
        'unit_size', l ->> 'unit_size', 'included_in_burn', l -> 'included_in_burn',
        'sellAsProduct', l -> 'sellAsProduct',
        'customer_material_price', l -> 'customer_material_price',
        'customer_line_total', l -> 'customer_line_total',
        'quote_required', l -> 'quote_required'
        -- NO verified_unit_cost / internal_line_total
      ))), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(c -> 'lines') = 'array' then c -> 'lines' else '[]'::jsonb end) l
    ),
    'deposit', case when c -> 'deposit' is null then null else jsonb_strip_nulls(jsonb_build_object(
      'flag', c #>> '{deposit,flag}',
      'codes', c #> '{deposit,codes}',
      'acceptanceBlocked', c #> '{deposit,acceptanceBlocked}',
      'payment', c #> '{deposit,payment}',
      'customer_material_total', c #> '{deposit,customer_material_total}',
      'recommended_deposit', c #> '{deposit,recommended_deposit}'
      -- NO internal_material_total / minimum_deposit (equals internal)
    )) end
  )) end
$$;

create or replace function private.staff_safe_snapshot(s jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when s is null then '{}'::jsonb else
    (coalesce(s, '{}'::jsonb)
       - 'cost' - 'profit' - 'margin' - 'markup' - 'material' - 'mat' - 'tax' - 'labor'
       - 'equipment' - 'equip' - 'direct' - 'overhead' - 'overheadBase' - 'overheadItems'
       - 'contingency' - 'travelCost' - 'travel' - 'hours' - 'internal' - 'costs' - 'products'
       - 'internal_material_total' - 'verified_unit_cost')
    || jsonb_build_object(
         'costbook', private.staff_safe_costbook(s -> 'costbook')
       )
  end
$$;

-- Customer snapshot: allow materials-only charge (no costs / markup / +30%)
create or replace function private.customer_safe_material_charge(m jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when m is null or jsonb_typeof(m) <> 'object' then null
    when coalesce((m ->> 'shown')::boolean, false) = false then
      jsonb_build_object('shown', false, 'disclaimer', left(coalesce(m ->> 'disclaimer', ''), 400))
    else jsonb_strip_nulls(jsonb_build_object(
      'shown', true,
      'customer_material_total', m -> 'customer_material_total',
      'sales_tax', 'EXCLUDED_ADD_WHEN_KNOWN',
      'payment_fees', 'EXCLUDED_ADD_WHEN_KNOWN',
      'disclaimer', left(coalesce(m ->> 'disclaimer',
        'Materials only — excludes labor; not an installed quote.'), 500),
      'lines', (
        select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'product', l ->> 'product',
          'qty', l -> 'qty',
          'unit_size', l ->> 'unit_size',
          'customer_material_price', l -> 'customer_material_price',
          'customer_line_total', l -> 'customer_line_total'
        ))), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(m -> 'lines') = 'array' then m -> 'lines' else '[]'::jsonb end) l
      )
    ))
  end
$$;

create or replace function private.customer_safe_snapshot(s jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
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
    'jobNotes', left(s ->> 'jobNotes', 8000),
    'materialCharge', private.customer_safe_material_charge(s -> 'materialCharge'),
    'acceptanceBlocked', coalesce((s ->> 'acceptanceBlocked')::boolean, false)
  )) end
$$;

revoke all on function private.staff_safe_costbook(jsonb) from public, anon, authenticated;
revoke all on function private.customer_safe_material_charge(jsonb) from public, anon, authenticated;
