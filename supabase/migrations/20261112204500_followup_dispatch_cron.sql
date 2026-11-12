-- Every 15 minutes, ask followup-dispatch to send due texts.
-- Not applied by the pull request that adds this file.
-- The job does not send anything until vault secrets project_url and
-- followup_dispatch_bearer are set, and the price-book switch followups.enabled
-- is true. dryRun still defaults to true inside the edge function.
-- No API keys are stored in this file.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_followup_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_bearer text;
begin
  begin
    select s.decrypted_secret into v_url
    from vault.decrypted_secrets s
    where s.name = 'project_url';
    select s.decrypted_secret into v_bearer
    from vault.decrypted_secrets s
    where s.name = 'followup_dispatch_bearer';
  exception
    when undefined_table or invalid_schema_name then
      v_url := null;
      v_bearer := null;
  end;

  if coalesce(v_url, '') = '' or coalesce(v_bearer, '') = '' then
    -- One note a day while the vault secrets are missing. A quiet quarter-hour does not add a row.
    if exists (
      select 1 from public.followup_events e
      where e.kind = 'cron_skipped'
        and e.at > now() - interval '1 day'
    ) then
      return;
    end if;
    insert into public.followup_events (kind, detail)
    values (
      'cron_skipped',
      jsonb_build_object(
        'reason', 'Set vault secrets project_url and followup_dispatch_bearer. Nothing was sent.'
      )
    );
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/followup-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 15000
  );
end;
$function$;

revoke all on function private.invoke_followup_dispatch() from public, anon, authenticated, service_role;

select cron.schedule(
  'followup-dispatch',
  '*/15 * * * *',
  $$select private.invoke_followup_dispatch();$$
);
