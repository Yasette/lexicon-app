-- Lexicon — database schema for Supabase (Postgres).
-- Run once in the SQL editor of a fresh project. Everything a person stores is
-- protected by Row Level Security: a row is readable and writable only by the
-- account that owns it, no matter what the client sends.

-- One row per progress key per person. value is the same JSON the app keeps
-- in localStorage (lexicon.srs.v2, lexicon.log.v2, lexicon.profile.v1,
-- lexicon.notes.v1, lexicon.mine.v1), so the app never has to translate.
create table if not exists public.user_data (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_data enable row level security;

drop policy if exists "own rows" on public.user_data;
create policy "own rows" on public.user_data
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Profile: one row per account, created automatically on sign-up. plan and
-- plan_until are for the freemium step later; only the server may change them.
create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text,
  lang         text,
  plan         text        not null default 'free',
  plan_until   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.protect_plan() returns trigger
language plpgsql as $$
begin
  if (new.plan is distinct from old.plan or new.plan_until is distinct from old.plan_until)
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'authenticated' then
    raise exception 'plan can only be changed by the server';
  end if;
  return new;
end $$;
drop trigger if exists protect_plan on public.profiles;
create trigger protect_plan before update on public.profiles
  for each row execute procedure public.protect_plan();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Account deletion from inside the app. Apple requires it for any app with
-- sign-in (App Store Review Guideline 5.1.1(v)). Cascades wipe the data rows.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Handy for you, not the app: how many people, how active.
create or replace view public.admin_activity as
  select date_trunc('day', updated_at) as day, count(distinct user_id) as active_people
  from public.user_data group by 1 order by 1 desc;
revoke all on public.admin_activity from anon, authenticated;
