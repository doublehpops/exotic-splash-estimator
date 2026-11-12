-- Follow-up to 20261112053000_cost_model_owner_defaults.sql.
-- Not applied by the pull request that adds this file.
--
-- jsonb_set creates only the last key of a path. The earlier migration wrote
-- {products,flake} into owner_settings that had no products object, so that
-- write did not store the flake product. Create products first, then set
-- products.flake to the same object that migration used.
--
-- quote-job reads price_book.version and passes it to server_record_quote,
-- which reads the version again and rejects the quote if the two differ.
-- The browser does not send a price-book version on a quote. Bumping the
-- stored version by 1 (the live book is 7, so this makes it 8) matches the
-- increment owner_update_price_book already uses. An open tab that still
-- holds version 7 can reload; a quote in flight is not checked against that
-- tab's copy.
--
-- Idempotent: where id = 1. A second run does not write the flake object
-- again and does not bump a book that is no longer version 7 unless this
-- run is the run that changes the flake object. No rows are removed.

do $migration$
declare
  v_flake jsonb := jsonb_build_object(
    'label', 'Decorative flakes (40 lb box)',
    'size', 40,
    'price', 108,
    'coverage', 0,
    'unit', 'lb'
  );
  v_changed integer := 0;
begin
  -- If the version trigger from the next migration is already installed,
  -- it must not add a second increment on top of the update below.
  perform set_config('es.price_book_version_assigned', 'on', true);

  update public.price_book_owner p
     set owner_settings = jsonb_set(
           jsonb_set(
             coalesce(p.owner_settings, '{}'::jsonb),
             '{products}',
             coalesce(p.owner_settings->'products', '{}'::jsonb),
             true
           ),
           '{products,flake}',
           v_flake,
           true
         )
   where p.id = 1
     and (p.owner_settings #>'{products,flake}') is distinct from v_flake;
  get diagnostics v_changed = row_count;

  update public.price_book
     set version = version + 1,
         updated_at = now()
   where id = 1
     and (version = 7 or v_changed > 0);
end
$migration$;
