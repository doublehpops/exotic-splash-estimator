-- Bump price_book.version when staff_settings or owner_settings change, unless
-- this transaction already changes version. Not applied by the pull request
-- that adds this file. No rows are removed.
--
-- owner_update_price_book is not in these migrations (it is part of the
-- baseline). The app passes p_expected_version and stores the integer the
-- function returns, so that function already assigns the next version on the
-- price_book update. quote-job reads price_book.version and
-- server_record_quote reads it again
-- (20261110160000_record_approved_discount_columns.sql). Those two reads
-- must match. A second increment would also make the integer returned to
-- the browser one behind the stored row, and the next save would conflict.
--
-- The row trigger does not write a new version. It only remembers, for this
-- transaction, that staff_settings changed while version did not, or that
-- version did change. The bump itself is deferred to commit. By then a
-- version assignment from owner_update_price_book is visible, whether it
-- was in the same statement or a later one, and whether the owner book was
-- written first or second. A quote does not update either settings column,
-- so recording a quote does not bump the version it just checked.

create or replace function private.price_book_note_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.staff_settings is distinct from old.staff_settings
     and new.version is not distinct from old.version then
    perform set_config('es.price_book_staff_needs_bump', 'on', true);
  end if;

  if new.version is distinct from old.version then
    perform set_config('es.price_book_version_assigned', 'on', true);
  end if;

  return new;
end;
$function$;

revoke all on function private.price_book_note_version() from public, anon, authenticated;

drop trigger if exists price_book_note_version on public.price_book;
create trigger price_book_note_version
  before update on public.price_book
  for each row
  execute function private.price_book_note_version();

create or replace function private.price_book_apply_version_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(current_setting('es.price_book_version_assigned', true), '') = 'on' then
    return null;
  end if;
  if coalesce(current_setting('es.price_book_staff_needs_bump', true), '') <> 'on' then
    return null;
  end if;

  update public.price_book
     set version = version + 1,
         updated_at = now()
   where id = 1;

  perform set_config('es.price_book_version_assigned', 'on', true);
  perform set_config('es.price_book_staff_needs_bump', '', true);
  return null;
end;
$function$;

revoke all on function private.price_book_apply_version_bump() from public, anon, authenticated;

drop trigger if exists price_book_apply_version_bump on public.price_book;
create constraint trigger price_book_apply_version_bump
  after update of staff_settings on public.price_book
  deferrable initially deferred
  for each row
  execute function private.price_book_apply_version_bump();

create or replace function private.price_book_owner_bump_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.owner_settings is not distinct from old.owner_settings then
    return null;
  end if;
  if coalesce(current_setting('es.price_book_version_assigned', true), '') = 'on' then
    return null;
  end if;

  update public.price_book
     set version = version + 1,
         updated_at = now()
   where id = 1;

  perform set_config('es.price_book_version_assigned', 'on', true);
  return null;
end;
$function$;

revoke all on function private.price_book_owner_bump_version() from public, anon, authenticated;

drop trigger if exists price_book_owner_bump_version on public.price_book_owner;
create constraint trigger price_book_owner_bump_version
  after update of owner_settings on public.price_book_owner
  deferrable initially deferred
  for each row
  execute function private.price_book_owner_bump_version();
