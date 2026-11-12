-- Polyaspartic topcoat rate.
-- Not applied by the pull request that adds this file. No rows are removed.
-- Does not change any other price.
--
-- The best topcoat is catalog.garage.topcoatAdj.premium. The quote multiplies
-- this dollars-per-sq-ft rate by the package size (250 / 450 / 650) or by the
-- measured floor. Measured floors use this same garage field. There is no
-- separate floor key.
--
-- jsonb_set creates only the last key of a path, so catalog, catalog.garage,
-- and catalog.garage.topcoatAdj are created before premium is set.
-- A missing or null rate becomes 1.00. A rate the owner already saved is kept.
--
-- price_book.version increments by 1 when the rate changes. The version
-- trigger, if it is already installed, is told not to increment a second time.

do $migration$
declare
  v_staff jsonb;
  v_top jsonb;
  v_row public.price_book%rowtype;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);

  select * into v_row from public.price_book where id = 1;
  if found then
    v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
    v_staff := jsonb_set(v_staff, '{catalog}', coalesce(v_staff->'catalog', '{}'::jsonb), true);
    v_staff := jsonb_set(v_staff, '{catalog,garage}', coalesce(v_staff#>'{catalog,garage}', '{}'::jsonb), true);
    v_staff := jsonb_set(v_staff, '{catalog,garage,topcoatAdj}', coalesce(v_staff#>'{catalog,garage,topcoatAdj}', '{}'::jsonb), true);

    v_top := v_staff#>'{catalog,garage,topcoatAdj}';
    if jsonb_typeof(v_top) <> 'object' then
      v_top := '{}'::jsonb;
      v_staff := jsonb_set(v_staff, '{catalog,garage,topcoatAdj}', v_top, true);
    end if;
    if v_top->'premium' is null then
      v_staff := jsonb_set(v_staff, '{catalog,garage,topcoatAdj,premium}', '1.00'::jsonb, true);
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
