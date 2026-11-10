-- Server-assigned job numbers: ES-YYYYMMDD-NN, unique per day across every staff account.
-- Fills jobs.job_number on insert when the client did not send one and mirrors it into
-- job_data.number so the app shows the same number everywhere. Once set, job_number is
-- immutable. Existing rows are left as they are.

create table if not exists public.job_number_counters (
  day date primary key,
  last_seq integer not null default 0
);
alter table public.job_number_counters enable row level security;
revoke all on table public.job_number_counters from public, anon, authenticated;

create or replace function private.next_job_number(p_day date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  insert into public.job_number_counters (day, last_seq) values (p_day, 1)
  on conflict (day) do update set last_seq = public.job_number_counters.last_seq + 1
  returning last_seq into v;
  return 'ES-' || to_char(p_day, 'YYYYMMDD') || '-' || lpad(v::text, 2, '0');
end;
$$;
revoke all on function private.next_job_number(date) from public, anon, authenticated;

create or replace function private.jobs_assign_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.job_number, '') = '' then
      new.job_number := private.next_job_number((timezone('America/Chicago', now()))::date);
    end if;
  elsif old.job_number is not null and new.job_number is distinct from old.job_number then
    new.job_number := old.job_number;
  end if;
  if new.job_number is not null then
    new.job_data := jsonb_set(coalesce(new.job_data, '{}'::jsonb), '{number}', to_jsonb(new.job_number), true);
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_assign_number on public.jobs;
create trigger jobs_assign_number
  before insert or update on public.jobs
  for each row execute function private.jobs_assign_number();
