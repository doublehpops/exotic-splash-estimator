-- Multi-color add-on rates.
-- Not applied by the pull request that adds this file. No rows are removed.
--
-- Metallic floors and packages include 1 or 2 colors. 3 or 4 colors add
-- metallicPerSqft. A stock flake blend is included. A custom flake blend adds
-- customFlakePerSqft. Both are dollars per sq ft on the area, or on the
-- package size plus overflow. Solid has no multi-color charge.
--
-- jsonb_set creates only the last key of a path, so extras and
-- extras.multiColor are created before the two rates.
-- A missing rate is filled. A rate the owner already saved is kept.
--
-- price_book.version increments by 1 when a rate is written. The version
-- trigger, if it is already installed, is told not to increment a second time.

do $migration$
declare
  v_staff jsonb;
  v_extra jsonb;
  v_color jsonb;
  v_row public.price_book%rowtype;
begin
  perform set_config('es.price_book_version_assigned', 'on', true);

  select * into v_row from public.price_book where id = 1;
  if found then
    v_staff := coalesce(v_row.staff_settings, '{}'::jsonb);
    v_staff := jsonb_set(v_staff, '{extras}', coalesce(v_staff->'extras', '{}'::jsonb), true);
    v_extra := v_staff->'extras';
    if jsonb_typeof(v_extra) <> 'object' then
      v_extra := '{}'::jsonb;
      v_staff := jsonb_set(v_staff, '{extras}', v_extra, true);
    end if;
    v_staff := jsonb_set(v_staff, '{extras,multiColor}', coalesce(v_staff#>'{extras,multiColor}', '{}'::jsonb), true);
    v_color := v_staff#>'{extras,multiColor}';
    if jsonb_typeof(v_color) <> 'object' then
      v_color := '{}'::jsonb;
      v_staff := jsonb_set(v_staff, '{extras,multiColor}', v_color, true);
    end if;
    if v_color->'metallicPerSqft' is null then
      v_staff := jsonb_set(v_staff, '{extras,multiColor,metallicPerSqft}', '1.50'::jsonb, true);
    end if;
    if v_color->'customFlakePerSqft' is null then
      v_staff := jsonb_set(v_staff, '{extras,multiColor,customFlakePerSqft}', '1.00'::jsonb, true);
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
