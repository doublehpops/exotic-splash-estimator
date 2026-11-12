-- Small solid floor ceiling.
-- Not applied by the pull request that adds this file. No rows are removed.
--
-- Solid sq ft under 500 uses the small-solid minimum (2,750 when that
-- amount is missing), or the per-sqft price when that is higher.
-- This does not install a 400–499 band, and it does not price that range
-- from the 2-car solid package.
--
-- If an earlier draft stored that package band and lowered the ceiling to
-- 400, this removes that band and puts the ceiling back to 500. Any other
-- band the owner saved is kept. A ceiling other than that draft's 400 is
-- left alone.
--
-- jsonb_set creates only the last key of a path, so rates and
-- rates.smallSolidFloor are created before min or maxSqft is written.
--
-- price_book.version increments by 1 only when staff_settings changes.
-- The version trigger, if it is already installed, is told not to increment
-- a second time.

do $migration$
declare
  v_staff jsonb;
  v_floor jsonb;
  v_bands jsonb;
  v_kept jsonb := '[]'::jsonb;
  v_band jsonb;
  v_removed boolean := false;
  v_row public.price_book%rowtype;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);

  select * into v_row from public.price_book where id = 1;
  if found then
    v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
    v_staff := jsonb_set(v_staff, '{rates}', coalesce(v_staff->'rates', '{}'::jsonb), true);
    v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor}', coalesce(v_staff#>'{rates,smallSolidFloor}', '{}'::jsonb), true);

    v_floor := v_staff#>'{rates,smallSolidFloor}';
    if jsonb_typeof(v_floor) <> 'object' then
      v_floor := '{}'::jsonb;
    end if;

    if coalesce(jsonb_typeof(v_floor->'min'),'null') = 'null' then
      v_floor := jsonb_set(v_floor, '{min}', '2750'::jsonb, true);
    end if;

    v_bands := v_floor->'bands';
    if jsonb_typeof(v_bands) = 'array' then
      for v_band in select value from jsonb_array_elements(v_bands)
      loop
        if coalesce(v_band->>'source', '') in ('package', 'garagePackage')
           and coalesce(v_band->>'system', 'solid') = 'solid'
           and coalesce(v_band->>'size', v_band->>'packageSize', '2') in ('2', '2car', 'twoCar')
           and coalesce(jsonb_typeof(v_band->'min'),'null') = 'null'
           and coalesce(jsonb_typeof(v_band->'amount'),'null') = 'null'
           and v_band->>'minSqft' = '400'
           and v_band->>'maxSqft' = '500'
        then
          v_removed := true;
          continue;
        end if;
        v_kept := v_kept || jsonb_build_array(v_band);
      end loop;
      v_floor := jsonb_set(v_floor, '{bands}', v_kept, true);
    end if;

    if coalesce(jsonb_typeof(v_floor->'maxSqft'),'null') = 'null' or (v_removed and v_floor->>'maxSqft' = '400') then
      v_floor := jsonb_set(v_floor, '{maxSqft}', '500'::jsonb, true);
    end if;

    v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor}', v_floor, true);

    update public.price_book
       set staff_settings = v_staff,
           version = version + 1,
           updated_at = now()
     where id = 1
       and staff_settings is distinct from v_staff;
  end if;
end
$migration$;
