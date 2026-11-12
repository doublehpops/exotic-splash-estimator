-- Selling-price defaults for the package table, the small solid floor, and optional extras.
-- Not applied by the pull request that adds this file. No rows are removed.
-- Does not change the moisture primer rate or the self-leveling rate.
--
-- jsonb_set creates only the last key of a path, so each parent object is
-- created before its children. Existing per-size prep flats are kept; the
-- per-sqft schedule is added beside them when that value is already an object.
--
-- price_book.version increments by 1 in this statement. The version trigger,
-- if it is already installed, is told not to increment a second time.

do $migration$
declare
  v_packages jsonb := jsonb_build_object(
    'opt1', jsonb_build_object(
      'solid', jsonb_build_object('oneCar', 2600, 'twoCar', 3500, 'threeCar', 4400),
      'flake', jsonb_build_object('oneCar', 3100, 'twoCar', 4400, 'threeCar', 5750),
      'metallic', jsonb_build_object('oneCar', 3500, 'twoCar', 5200, 'threeCar', 6850)
    ),
    'opt2', jsonb_build_object(
      'solid', jsonb_build_object('oneCar', 2850, 'twoCar', 3800, 'threeCar', 4800),
      'flake', jsonb_build_object('oneCar', 3500, 'twoCar', 4950, 'threeCar', 6450),
      'metallic', jsonb_build_object('oneCar', 4150, 'twoCar', 6150, 'threeCar', 8100)
    ),
    'regular', jsonb_build_object(
      'solid', jsonb_build_object('oneCar', 3300, 'twoCar', 4450, 'threeCar', 5600),
      'flake', jsonb_build_object('oneCar', 3900, 'twoCar', 5500, 'threeCar', 7200),
      'metallic', jsonb_build_object('oneCar', 4750, 'twoCar', 7100, 'threeCar', 9350)
    )
  );
  v_extras jsonb := jsonb_build_object(
    'crackRepair', jsonb_build_object('flat', 250, 'includedLf', 10, 'perLf', 12),
    'coatingRemoval', jsonb_build_object('perSqft', 1.5, 'min', 650),
    'paintRemoval', jsonb_build_object('perSqft', 1.25, 'min', 250),
    'adhesiveRemoval', jsonb_build_object('perSqft', 1.5, 'min', 350),
    'poorSlab', jsonb_build_object('perSqft', 0.75, 'min', 400),
    'stairs', jsonb_build_object('solid', 85, 'flake', 110),
    'stemWall', jsonb_build_object('perLf', 9),
    'countertop', jsonb_build_object('solid', 45, 'metallic', 65, 'min', 900),
    'antiSlip', jsonb_build_object('perSqft', 0.35),
    'travelBeyond', jsonb_build_object('includedMiles', 25, 'perMile', 2.5),
    'moving', jsonb_build_object('perHour', 150),
    'rush', jsonb_build_object('withinDays', 7, 'pct', 10),
    'weekend', jsonb_build_object('pct', 15),
    'winterHeat', jsonb_build_object('perDay', 250),
    'consumables', jsonb_build_object('flat', 150),
    'fuelWear', jsonb_build_object('perMile', 0.65),
    'extraVisit', jsonb_build_object('flat', 125),
    'warranty', jsonb_build_object('includedYears', 1, 'extendedYears', 3, 'pct', 4)
  );
  v_staff jsonb;
  v_prep jsonb;
  v_cond jsonb;
  v_row public.price_book%rowtype;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);

  select * into v_row from public.price_book where id = 1;
  if found then
  v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
  v_staff := jsonb_set(v_staff, '{garage}', coalesce(v_staff->'garage', '{}'::jsonb), true);
  v_staff := jsonb_set(v_staff, '{rates}', coalesce(v_staff->'rates', '{}'::jsonb), true);
  v_staff := jsonb_set(v_staff, '{extras}', coalesce(v_staff->'extras', '{}'::jsonb) || v_extras, true);
  v_staff := jsonb_set(v_staff, '{garage,packages}', v_packages, true);
  v_staff := jsonb_set(v_staff, '{rates,smallSolidFloor}', jsonb_build_object('maxSqft', 500, 'min', 2750), true);
  v_staff := jsonb_set(v_staff, '{catalog}', coalesce(v_staff->'catalog', '{}'::jsonb), true);
  v_staff := jsonb_set(v_staff, '{catalog,garage}', coalesce(v_staff#>'{catalog,garage}', '{}'::jsonb), true);

  v_prep := coalesce(v_staff#>'{catalog,garage,prepAdj}', '{}'::jsonb);
  if jsonb_typeof(v_prep) <> 'object' then
    v_prep := '{}'::jsonb;
  end if;
  if jsonb_typeof(coalesce(v_prep->'coatingRemoval', '{}'::jsonb)) = 'object' then
    v_prep := jsonb_set(v_prep, '{coatingRemoval}', coalesce(v_prep->'coatingRemoval', '{}'::jsonb) || jsonb_build_object('perSqft', 1.5, 'min', 650), true);
  end if;
  if jsonb_typeof(coalesce(v_prep->'spalling', '{}'::jsonb)) = 'object' then
    v_prep := jsonb_set(v_prep, '{spalling}', coalesce(v_prep->'spalling', '{}'::jsonb) || jsonb_build_object('perSqft', 0.75, 'min', 400), true);
  end if;
  if jsonb_typeof(coalesce(v_prep->'cracks', '{}'::jsonb)) = 'object' then
    v_prep := jsonb_set(v_prep, '{cracks}', coalesce(v_prep->'cracks', '{}'::jsonb) || jsonb_build_object('flat', 250, 'includedLf', 10, 'perLf', 12), true);
  end if;
  v_staff := jsonb_set(v_staff, '{catalog,garage,prepAdj}', v_prep, true);

  v_cond := coalesce(v_staff#>'{catalog,garage,conditionAdj}', '{}'::jsonb);
  if jsonb_typeof(v_cond) <> 'object' then
    v_cond := '{}'::jsonb;
  end if;
  if jsonb_typeof(coalesce(v_cond->'paint', '{}'::jsonb)) = 'object' then
    v_cond := jsonb_set(v_cond, '{paint}', coalesce(v_cond->'paint', '{}'::jsonb) || jsonb_build_object('perSqft', 1.25, 'min', 250), true);
  end if;
  if jsonb_typeof(coalesce(v_cond->'adhesive', '{}'::jsonb)) = 'object' then
    v_cond := jsonb_set(v_cond, '{adhesive}', coalesce(v_cond->'adhesive', '{}'::jsonb) || jsonb_build_object('perSqft', 1.5, 'min', 350), true);
  end if;
  v_staff := jsonb_set(v_staff, '{catalog,garage,conditionAdj}', v_cond, true);

  update public.price_book
     set staff_settings = v_staff,
         version = version + 1,
         updated_at = now()
   where id = 1
     and staff_settings is distinct from v_staff;
  end if;
end
$migration$;
