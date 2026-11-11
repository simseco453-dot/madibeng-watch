-- Madibeng Water & Power Watch: database setup
-- Run this once in Supabase: SQL Editor -> New query -> paste everything -> Run.

-- ---------- Public reports from residents ----------
create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  area       text not null check (char_length(area) between 2 and 40),
  section    text check (section is null or char_length(section) between 1 and 40),
  util       text not null check (util in ('water', 'power')),
  status     text not null check (status in ('out', 'low', 'on')),
  eta        text check (eta is null or eta ~ '^[0-2][0-9]:[0-5][0-9]$'),
  note       text check (note is null or char_length(note) <= 120),
  device     text not null check (char_length(device) between 8 and 40)
);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- ---------- Moderators (people allowed to post official notices) ----------
create table if not exists public.moderators (
  email text primary key
);
alter table public.moderators enable row level security;
-- No policies on purpose: the moderator list can't be read or changed from the website.

create or replace function public.is_moderator()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.moderators
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Official notices (moderators only) ----------
create table if not exists public.notices (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  area       text not null check (char_length(area) between 2 and 40),
  section    text check (section is null or char_length(section) between 1 and 40),
  util       text not null check (util in ('water', 'power')),
  kind       text not null check (kind in ('maintenance', 'outage', 'restored')),
  start_at   timestamptz,
  end_at     timestamptz,
  source     text not null check (char_length(source) between 3 and 140),
  check (end_at is null or start_at is null or end_at > start_at)
);

-- ---------- Server-side checks on new reports ----------
-- The server sets the time (so nobody can back-date a report) and
-- each phone can send at most one report every 30 seconds.
create or replace function public.reports_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.created_at := now();
  if exists (
    select 1 from public.reports
    where device = new.device and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Please wait 30 seconds before sending another report';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_before_insert on public.reports;
create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ---------- Who can do what ----------
alter table public.reports enable row level security;
alter table public.notices enable row level security;

drop policy if exists "Anyone can read recent reports" on public.reports;
create policy "Anyone can read recent reports" on public.reports
  for select to anon, authenticated
  using (created_at > now() - interval '48 hours');

drop policy if exists "Anyone can send a report" on public.reports;
create policy "Anyone can send a report" on public.reports
  for insert to anon, authenticated
  with check (true);

drop policy if exists "Moderators can remove reports" on public.reports;
create policy "Moderators can remove reports" on public.reports
  for delete to authenticated
  using (public.is_moderator());

drop policy if exists "Anyone can read notices" on public.notices;
create policy "Anyone can read notices" on public.notices
  for select to anon, authenticated
  using (true);

drop policy if exists "Moderators can post notices" on public.notices;
create policy "Moderators can post notices" on public.notices
  for insert to authenticated
  with check (public.is_moderator());

drop policy if exists "Moderators can remove notices" on public.notices;
create policy "Moderators can remove notices" on public.notices
  for delete to authenticated
  using (public.is_moderator());

grant select, insert on public.reports to anon, authenticated;
grant delete on public.reports to authenticated;
grant select on public.notices to anon, authenticated;
grant insert, delete on public.notices to authenticated;
grant execute on function public.is_moderator() to anon, authenticated;

-- ---------- Add yourself as a moderator ----------
-- 1. Supabase: Authentication -> Users -> Add user -> Create new user
--    (your email + a password, tick "Auto Confirm User").
-- 2. Then run this line with your own email:
-- insert into public.moderators (email) values ('you@example.com');
