-- Private Storage bucket for job photos. Objects live at <job uuid>/<photo id>.jpg.
-- Access follows the job: active staff who can access the job (private.user_can_access_job)
-- can read, upload, replace and delete its photos. Customers never see photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_touch_job_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  if not private.is_active_staff() then
    return false;
  end if;
  begin
    v_job := split_part(coalesce(p_name, ''), '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return private.user_can_access_job(auth.uid(), v_job);
end;
$$;
revoke all on function private.can_touch_job_photo(text) from public, anon;
-- Storage policies run as the signed-in role, so it needs to reach this one function.
grant usage on schema private to authenticated;
grant execute on function private.can_touch_job_photo(text) to authenticated;

drop policy if exists job_photos_select on storage.objects;
drop policy if exists job_photos_insert on storage.objects;
drop policy if exists job_photos_update on storage.objects;
drop policy if exists job_photos_delete on storage.objects;

create policy job_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and private.can_touch_job_photo(name));
create policy job_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and private.can_touch_job_photo(name));
create policy job_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'job-photos' and private.can_touch_job_photo(name))
  with check (bucket_id = 'job-photos' and private.can_touch_job_photo(name));
create policy job_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and private.can_touch_job_photo(name));
