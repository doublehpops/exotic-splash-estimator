-- Mid-size solid floor band.
-- Not applied by the pull request that adds this file. No rows are removed.
--
-- Solid sq ft under 400 keeps the small solid floor minimum.
-- From 400 sq ft up to (not including) 500 sq ft, the minimum is the selected
-- tier's 2-car solid package price when the band has no explicit amount.
-- 500 sq ft and above are unchanged. The quote shows one minimum line.
--
-- jsonb_set creates only the last key of a path, so rates and
-- rates.smallSolidFloor are created before the band is written.
--
-- price_book.version increments by 1 in this statement. The version trigger,
-- if it is already installed, is told not to increment a second time.
-- A second run does not replace a band the owner already saved, and it does
-- not change a small-floor ceiling other than the previous 500 sq ft default.

do $migration$
declare
  v_band jsonb := jsonb_build_object(
    'minSqft', 400,
    'maxSqft', 500,
    'source', 'package',
    'system', 'solid',
    'size', '2'
  );
  v_staff jsonb;
  v_floor jsonb;
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
      v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor}', v_floor, true);
    end if;

    if v_floor->'min' is null then
      v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor,min}', '2750'::jsonb, true);
    end if;
    if v_floor->'maxSqft' is null or v_floor->>'maxSqft' = '500' then
      v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor,maxSqft}', '400'::jsonb, true);
    end if;
    if v_floor->'bands' is null then
      v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor,bands}', jsonb_build_array(v_band), true);
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
